// The computer's turns played in the background (docs/games/realm-arena-hold-out.md
// §3): the real runner, command pipeline, game type and optimistic-concurrency
// save, against the test game store (utils/testing/apiRoute.ts). What a
// warband *does* is stood in for by a fake command that hands the turn on
// (computerTurnFixtures.ts) — the game's own rules are tested with the game.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { recordGameResult, judgeTurnEnd } = vi.hoisted(() => ({ recordGameResult: vi.fn(), judgeTurnEnd: vi.fn() }));

vi.mock('@clerk/nextjs/server', async () => (await import('@/utils/testing/apiRoute')).clerkStub());
vi.mock('next/server', async () => (await import('@/utils/testing/afterStub')).nextServerStub());
vi.mock('@/utils/mongodb/mongodb', async () => (await import('@/utils/testing/apiRoute')).mongodbStub());
vi.mock('@/utils/firebase/pushNotification', async () => (await import('@/utils/testing/apiRoute')).pushNotificationStub());
vi.mock('@/utils/mongodb/GameResultData', async () => (await import('@/utils/testing/apiRoute')).gameResultDataStub({ recordGameResult }));
// The judge is watched rather than replaced: it still runs, and the test sees
// that it was asked.
vi.mock('@/utils/games/awardAchievements', async importOriginal => {
    const actual = await importOriginal<typeof import('@/utils/games/awardAchievements')>();
    judgeTurnEnd.mockImplementation(actual.judgeTurnEnd);
    return { ...actual, judgeTurnEnd };
});

import { ANN, BOB, resetApiRouteStubs, seedSnakesAndLadders, sentPushes, storedGame, stubClerkUsers } from '@/utils/testing/apiRoute';
import { ENDS_THE_GAME, registerFakeWarbands, warbandHooks, warbandTurnsRun } from '@/utils/testing/computerTurnFixtures';
import { COMPUTER_TURN_BUDGET_MS, MAX_COMPUTER_TURN_CONFLICTS, playComputerTurns } from './playComputerTurns';

/** Plenty of time: nothing here is racing a deadline unless it says so. */
const finishBy = () => Date.now() + 60_000;

/** Ann has just ended her turn and handed it to the first of two warbands, with Bob to follow. */
function seedWarbandsDue(overrides: Record<string, unknown> = {}) {
    seedSnakesAndLadders({
        turnTimer: '10m',
        currentTurn: 'ai:0',
        lastTurnTimestamp: '2026-01-01T00:00:00.000Z',
        gameState: { turnOrder: [ANN.id, 'ai:0', BOB.id], history: [], commandHistory: [] },
        ...overrides,
    });
}

const handedTo = (userId: string) => sentPushes.filter(push => push.data.event === 'YourTurn' && push.userIds.includes(userId));

beforeEach(async () => {
    await resetApiRouteStubs();
    recordGameResult.mockReset();
    judgeTurnEnd.mockClear();
    stubClerkUsers(ANN, BOB);
    registerFakeWarbands({ 'ai:0': 'ai:1', 'ai:1': BOB.id });
});

describe('playComputerTurns', () => {
    it('plays one computer turn after another, saving each, then hands to the player with one push', async () => {
        seedWarbandsDue();

        expect(await playComputerTurns('game_1', { finishBy: finishBy() })).toBe('handedBack');

        const saved = storedGame('game_1')!;
        expect(saved.currentTurn).toBe(BOB.id);
        expect(warbandTurnsRun.count).toBe(2);
        // Each warband turn is on the record, as its own stamped command.
        const history = (saved.gameState as { commandHistory: { className: string, senderId: string, version: number, id: string }[] }).commandHistory;
        expect(history.map(command => [command.className, command.senderId])).toEqual([['FakeWarbandTurn', 'ai:0'], ['FakeWarbandTurn', 'ai:1']]);
        expect(new Set(history.map(command => command.id)).size).toBe(2);
        expect(history.every(command => typeof command.version === 'number')).toBe(true);
        // One save per turn, and the timer restarted at the hand-off to a player.
        expect(saved.__v).toBe(2);
        expect(saved.timerWarningNotificationSent).toBe(false);
        expect(saved.lastTurnTimestamp).not.toBe('2026-01-01T00:00:00.000Z');
        // The player now on turn is told once; the turn end is judged once.
        expect(handedTo(BOB.id)).toHaveLength(1);
        expect(sentPushes).toHaveLength(1);
        expect(judgeTurnEnd).toHaveBeenCalledTimes(1);
    });

    it('sends no push in a solo battle, but still judges the turn end', async () => {
        seedWarbandsDue({
            userIdList: [ANN.id],
            gameState: { turnOrder: [ANN.id, 'ai:0'], history: [], commandHistory: [] },
        });
        registerFakeWarbands({ 'ai:0': ANN.id });

        expect(await playComputerTurns('game_1', { finishBy: finishBy() })).toBe('handedBack');

        expect(storedGame('game_1')!.currentTurn).toBe(ANN.id);
        expect(sentPushes).toEqual([]);
        expect(judgeTurnEnd).toHaveBeenCalledTimes(1);
    });

    it('stops before a turn it has no time for, leaving the game as it was, and a later call finishes it', async () => {
        seedWarbandsDue();

        expect(await playComputerTurns('game_1', { finishBy: Date.now() + COMPUTER_TURN_BUDGET_MS - 1000 })).toBe('stopped');

        const untouched = storedGame('game_1')!;
        expect(untouched.currentTurn).toBe('ai:0');
        expect(untouched.__v).toBe(0);
        expect(warbandTurnsRun.count).toBe(0);
        expect(sentPushes).toEqual([]);

        expect(await playComputerTurns('game_1', { finishBy: finishBy() })).toBe('handedBack');
        expect(storedGame('game_1')!.currentTurn).toBe(BOB.id);
    });

    it('keeps what it saved when it runs out of time part-way, for the next run to carry on from', async () => {
        seedWarbandsDue();
        // The clock jumps past the budget while the first warband plays.
        let now = Date.now();
        const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
        warbandHooks.onTurn = () => { now += 50_000; };
        try {
            expect(await playComputerTurns('game_1', { finishBy: now + 60_000 })).toBe('stopped');
        } finally {
            clock.mockRestore();
        }

        expect(storedGame('game_1')!.currentTurn).toBe('ai:1');
        expect(sentPushes).toEqual([]);
        delete warbandHooks.onTurn;

        expect(await playComputerTurns('game_1', { finishBy: finishBy() })).toBe('handedBack');
        expect(handedTo(BOB.id)).toHaveLength(1);
    });

    it('finishes a game the computer ends, and announces it rather than a turn', async () => {
        seedWarbandsDue();
        registerFakeWarbands({ 'ai:0': ENDS_THE_GAME });

        expect(await playComputerTurns('game_1', { finishBy: finishBy() })).toBe('gameOver');

        const saved = storedGame('game_1')!;
        expect(saved.complete).toBe(true);
        expect(recordGameResult).toHaveBeenCalledTimes(1);
        expect(judgeTurnEnd).not.toHaveBeenCalled();
        expect(sentPushes.map(push => push.data.event)).not.toContain('YourTurn');
    });

    it('does nothing for a game that is not on a computer seat', async () => {
        seedSnakesAndLadders();

        expect(await playComputerTurns('game_1', { finishBy: finishBy() })).toBe('skipped');
        expect(storedGame('game_1')!.__v).toBe(0);
    });

    it('does nothing for a game that has gone or finished', async () => {
        expect(await playComputerTurns('nope', { finishBy: finishBy() })).toBe('skipped');
        seedWarbandsDue({ complete: true });
        expect(await playComputerTurns('game_1', { finishBy: finishBy() })).toBe('skipped');
    });

    it('refuses, saving nothing, when the game has no turn to play for the seat', async () => {
        seedWarbandsDue();
        registerFakeWarbands({});
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});

        expect(await playComputerTurns('game_1', { finishBy: finishBy() })).toBe('refused');

        expect(error).toHaveBeenCalled();
        expect(storedGame('game_1')!.__v).toBe(0);
        error.mockRestore();
    });

    describe('when another runner is playing the same turn', () => {
        it('reloads after a lost save and plays the turn once', async () => {
            seedWarbandsDue();
            registerFakeWarbands({ 'ai:0': BOB.id });
            // A rival's save lands while the first attempt is mid-turn: the
            // version it loaded is stale by the time it saves.
            warbandHooks.onTurn = turn => { if (turn === 1) storedGame('game_1')!.__v++; };

            expect(await playComputerTurns('game_1', { finishBy: finishBy() })).toBe('handedBack');

            expect(warbandTurnsRun.count).toBe(2);
            const history = (storedGame('game_1')!.gameState as { commandHistory: unknown[] }).commandHistory;
            expect(history).toHaveLength(1);
            expect(handedTo(BOB.id)).toHaveLength(1);
        });

        it('leaves, announcing nothing, when the rival has already moved the turn on', async () => {
            seedWarbandsDue();
            registerFakeWarbands({ 'ai:0': 'ai:1', 'ai:1': BOB.id });
            warbandHooks.onTurn = () => {
                const stored = storedGame('game_1')!;
                stored.__v++;
                stored.currentTurn = BOB.id;
            };

            expect(await playComputerTurns('game_1', { finishBy: finishBy() })).toBe('skipped');

            expect(warbandTurnsRun.count).toBe(1);
            expect(sentPushes).toEqual([]);
            expect(judgeTurnEnd).not.toHaveBeenCalled();
        });

        it('gives up rather than loop when it keeps losing its saves', async () => {
            seedWarbandsDue();
            warbandHooks.onTurn = () => { storedGame('game_1')!.__v++; };

            expect(await playComputerTurns('game_1', { finishBy: finishBy() })).toBe('skipped');

            expect(warbandTurnsRun.count).toBe(MAX_COMPUTER_TURN_CONFLICTS + 1);
            expect(sentPushes).toEqual([]);
        });

        it('is harmless to run twice', async () => {
            seedWarbandsDue();

            expect(await playComputerTurns('game_1', { finishBy: finishBy() })).toBe('handedBack');
            expect(await playComputerTurns('game_1', { finishBy: finishBy() })).toBe('skipped');

            expect(warbandTurnsRun.count).toBe(2);
            expect(handedTo(BOB.id)).toHaveLength(1);
        });
    });
});
