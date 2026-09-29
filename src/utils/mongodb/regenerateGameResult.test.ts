// Working a finished game's stats out again from its moves — and the two
// times it mustn't: a game still being played, whose stats would read every
// hidden hand, and a replay that would now chart less than the result already
// does. Played out on a Settlements & Cities game, whose stats are the ones
// that needed regenerating.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettlementsAndCitiesGameResultModel, losesCharts, regenerateGameResultStats } from './GameResultData';
import type { GameResultAnyChart } from '@/utils/apiModels/GameDataApi';
import type { IGameData } from './GameData';
import { SettlementsAndCitiesGameType } from '@/games/SettlementsAndCities/SettlementsAndCitiesLogic';
import { SAC_REPLAYED_STATS, computeSettlementsAndCitiesResultStats } from '@/games/SettlementsAndCities/SettlementsAndCitiesModels';
import type { ISACGameResultStats, ISettlementsAndCitiesGameData } from '@/games/SettlementsAndCities/SettlementsAndCitiesModels';
import { makeGame, makeState, player, rollOf } from '@/games/SettlementsAndCities/testFixtures';
import { BOARD_TOPOLOGY } from '@/games/SettlementsAndCities/board';
import { runCommand } from '@/utils/games/commandPipeline';
import { computePerTurnInternalStats } from '@/utils/games/replay';

// u1 rolls on an empty board, has nothing to do, and the turn passes: a game
// the replay can follow, finished.
async function finishedGame(): Promise<ISettlementsAndCitiesGameData> {
    const gs = makeState({
        vertices: Array.from({ length: BOARD_TOPOLOGY.numVertices }, () => ({ building: null, owner: null })),
        edges: Array.from({ length: BOARD_TOPOLOGY.numEdges }, () => ({ hasRoad: false, owner: null })),
        hasRolled: false,
        lastRoll: null,
    });
    gs.playerStates.set('u1', player());
    gs.playerStates.set('u2', player());
    const game = makeGame(gs);
    expect((await runCommand(game as unknown as IGameData, new SettlementsAndCitiesGameType(), rollOf(5, 3))).outcome.validMove).toBe(true);
    game.complete = true;
    return game;
}

function storedResult(stats: ISACGameResultStats) {
    const result = { gameId: 'g', stats, set: vi.fn(), save: vi.fn(async () => undefined) };
    vi.spyOn(SettlementsAndCitiesGameResultModel, 'findOne').mockReturnValue({ exec: async () => result } as never);
    return result;
}

beforeEach(() => {
    vi.restoreAllMocks();
});

describe('regenerateGameResultStats', () => {
    it('rewrites the stats a replay that went wrong left behind', async () => {
        const game = await finishedGame();
        // As recorded when the replay couldn't follow it: no per-round charts.
        const result = storedResult(computeSettlementsAndCitiesResultStats(game));

        const outcome = await regenerateGameResultStats(game as unknown as IGameData);

        expect(outcome).toEqual({ regenerated: result });
        const [path, stats] = result.set.mock.calls[0];
        expect(path).toBe('stats');
        expect((stats as ISACGameResultStats).resourcesPerTurn).not.toEqual([]);
        expect(result.save).toHaveBeenCalled();
    });

    it('never works out a game still being played', async () => {
        const game = await finishedGame();
        game.complete = false;
        const findOne = vi.spyOn(SettlementsAndCitiesGameResultModel, 'findOne');

        expect(await regenerateGameResultStats(game as unknown as IGameData)).toEqual({ refused: 'nothing' });
        expect(findOne).not.toHaveBeenCalled();
    });

    it('keeps a result the moves would now chart less of', async () => {
        const game = await finishedGame();
        // Stored whole, from a replay that followed the game…
        const result = storedResult(computeSettlementsAndCitiesResultStats(game, await computePerTurnInternalStats(game as unknown as IGameData, SAC_REPLAYED_STATS)));
        expect(result.stats.resourcesPerTurn).not.toEqual([]);
        // …of a game the replay no longer ends on.
        game.specificGameState.playerStates.get('u2')!.resourcesGathered = 1;

        expect(await regenerateGameResultStats(game as unknown as IGameData)).toEqual({ refused: 'lossy' });
        expect(result.set).not.toHaveBeenCalled();
        expect(result.save).not.toHaveBeenCalled();
    });
});

describe('losesCharts', () => {
    const line = (title: string, rounds: number): GameResultAnyChart => ({ title, yLabel: '', rounds: Array.from({ length: rounds }, () => ({})) });
    const bar: GameResultAnyChart = { kind: 'bar', title: 'Dice roll frequency', yLabel: '', bars: [] };

    it('is fine with a result that charts as much or more', () => {
        expect(losesCharts([line('Points', 2), bar], [line('Points', 30), line('Resources', 30), bar])).toBe(false);
        expect(losesCharts([], [bar])).toBe(false);
    });

    it('catches a chart gone, or one with fewer rounds', () => {
        expect(losesCharts([line('Points', 30), bar], [bar])).toBe(true);
        expect(losesCharts([line('Points', 30)], [line('Points', 2)])).toBe(true);
    });
});
