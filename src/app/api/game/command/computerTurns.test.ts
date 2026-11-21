// What the command route does with an End turn that hands the turn to the
// computer (docs/games/realm-arena-hold-out.md §3): it answers at once, and the
// warbands' turns run in `after()` — with nobody pushed and nothing judged until
// the turn reaches a player, since pushes follow the turn. The real route,
// runner and pipeline, with the warbands' own turn faked (computerTurnFixtures.ts).

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { recordGameResult, judgeTurnEnd } = vi.hoisted(() => ({ recordGameResult: vi.fn(), judgeTurnEnd: vi.fn() }));

vi.mock('@clerk/nextjs/server', async () => (await import('@/utils/testing/apiRoute')).clerkStub());
vi.mock('next/server', async () => (await import('@/utils/testing/afterStub')).nextServerStub());
vi.mock('@/utils/mongodb/mongodb', async () => (await import('@/utils/testing/apiRoute')).mongodbStub());
vi.mock('@/utils/firebase/pushNotification', async () => (await import('@/utils/testing/apiRoute')).pushNotificationStub());
vi.mock('@/utils/mongodb/GameResultData', async () => (await import('@/utils/testing/apiRoute')).gameResultDataStub({ recordGameResult }));
vi.mock('@/utils/games/DiceRoll', () => ({ DiceRoll: () => 3 }));
// The judge is watched rather than replaced: it still runs, and the test sees
// how often it was asked.
vi.mock('@/utils/games/awardAchievements', async importOriginal => {
    const actual = await importOriginal<typeof import('@/utils/games/awardAchievements')>();
    judgeTurnEnd.mockImplementation(actual.judgeTurnEnd);
    return { ...actual, judgeTurnEnd };
});

import { runAfterCallbacks } from '@/utils/testing/afterStub';
import { ANN, BOB, commandPost, resetApiRouteStubs, seedSnakesAndLadders, sentPushes, signIn, storedGame, stubClerkUsers } from '@/utils/testing/apiRoute';
import { registerFakeWarbands, warbandHooks, warbandTurnsRun } from '@/utils/testing/computerTurnFixtures';
import { maxDuration, POST as command } from './route';

/** Ann's roll, which ends her turn: a three is never a six, so nobody rolls again. */
function roll() {
    return commandPost({
        gameId: 'game_1', senderId: ANN.id, senderUsername: 'ann', className: 'SnakesAndLaddersRequestDiceRoll',
    });
}

const yourTurnPushes = () => sentPushes.filter(push => push.data.event === 'YourTurn');

beforeEach(async () => {
    await resetApiRouteStubs();
    recordGameResult.mockReset();
    judgeTurnEnd.mockClear();
    stubClerkUsers(ANN, BOB);
    signIn(ANN);
    registerFakeWarbands({ 'ai:0': BOB.id });
});

describe('POST /api/game/command, an End turn', () => {
    it('is given a minute, because the warbands play in its after()', () => {
        expect(maxDuration).toBe(60);
    });

    it('pushes the next player and judges the turn end, as ever, when the turn passes to a player', async () => {
        seedSnakesAndLadders();

        const response = await command(roll());

        expect(response.status).toBe(200);
        expect(storedGame('game_1')!.currentTurn).toBe(BOB.id);
        await runAfterCallbacks();
        expect(yourTurnPushes().map(push => push.userIds)).toEqual([[BOB.id]]);
        expect(judgeTurnEnd).toHaveBeenCalledTimes(1);
        expect(warbandTurnsRun.count).toBe(0);
    });

    it('answers with the turn on the warband, and plays it in after() without pushing or judging first', async () => {
        seedSnakesAndLadders({ gameState: { turnOrder: [ANN.id, 'ai:0', BOB.id], history: [], commandHistory: [] } });

        const response = await command(roll());

        expect(response.status).toBe(200);
        const saved = storedGame('game_1')!;
        // Saved on the warband's seat, its turn not yet played: the player's
        // request is not kept waiting on it.
        expect(saved.currentTurn).toBe('ai:0');
        expect(warbandTurnsRun.count).toBe(0);
        expect(sentPushes).toEqual([]);

        // One piece of post-response work, and it is the runner's: it plays the
        // warband's turn, then tells Bob and judges, once, as the turn reaches him.
        expect(await runAfterCallbacks()).toBe(1);
        expect(storedGame('game_1')!.currentTurn).toBe(BOB.id);
        expect(warbandTurnsRun.count).toBe(1);
        expect(yourTurnPushes().map(push => push.userIds)).toEqual([[BOB.id]]);
        expect(judgeTurnEnd).toHaveBeenCalledTimes(1);
    });

    it('hands a solo battle to the warbands and back without a push, judging the turn end', async () => {
        seedSnakesAndLadders({
            userIdList: [ANN.id],
            gameState: { turnOrder: [ANN.id, 'ai:0'], history: [], commandHistory: [] },
        }, { [ANN.id]: 10 });
        registerFakeWarbands({ 'ai:0': ANN.id });

        const response = await command(roll());
        expect(response.status).toBe(200);
        expect(storedGame('game_1')!.currentTurn).toBe('ai:0');

        await runAfterCallbacks();

        expect(storedGame('game_1')!.currentTurn).toBe(ANN.id);
        expect(sentPushes).toEqual([]);
        expect(judgeTurnEnd).toHaveBeenCalledTimes(1);
    });

    it('logs, and does not throw, when the warbands cannot be played, leaving the cron to try', async () => {
        seedSnakesAndLadders({ gameState: { turnOrder: [ANN.id, 'ai:0', BOB.id], history: [], commandHistory: [] } });
        warbandHooks.onTurn = () => { throw new Error('the planner fell over'); };
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});

        const response = await command(roll());
        expect(response.status).toBe(200);
        await expect(runAfterCallbacks()).resolves.toBe(1);

        expect(error).toHaveBeenCalled();
        expect(storedGame('game_1')!.currentTurn).toBe('ai:0');
        expect(sentPushes).toEqual([]);
        error.mockRestore();
    });
});
