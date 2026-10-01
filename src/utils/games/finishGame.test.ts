// The one way a game ends, exercised the way a route uses it: a real Mongoose
// document from the test game store, the real optimistic-concurrency save, and
// the push transport recorded rather than sent (see utils/testing/apiRoute.ts).
//
// What these guard is the shared outcome a co-op game needs — a table that wins
// or loses as one — and the two things every ending has to leave behind
// whatever route asked for it: a game nobody can play on, and one result record.
// Announcing it then judges its achievements between the two halves that were
// already there, so where that sits is pinned here too. What the judge itself
// decides is awardAchievements.test.ts's business, and the routes' own cases in
// gameRoutes.test.ts run the real one; here it is a stand-in that can be made to
// stall or fail.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { recordGameResult, judgeGameEnd } = vi.hoisted(() => ({ recordGameResult: vi.fn(), judgeGameEnd: vi.fn() }));

vi.mock('@clerk/nextjs/server', async () => (await import('@/utils/testing/apiRoute')).clerkStub());
vi.mock('@/utils/mongodb/mongodb', async () => (await import('@/utils/testing/apiRoute')).mongodbStub());
vi.mock('@/utils/firebase/pushNotification', async () => (await import('@/utils/testing/apiRoute')).pushNotificationStub());
vi.mock('@/utils/mongodb/GameResultData', async () => (await import('@/utils/testing/apiRoute')).gameResultDataStub({ recordGameResult }));
vi.mock('@/utils/games/awardAchievements', async importOriginal => ({
    ...(await importOriginal<typeof import('@/utils/games/awardAchievements')>()),
    judgeGameEnd,
}));

import { ANN, BOB, resetApiRouteStubs, seedSnakesAndLadders, sentPushes, storedGame, stubClerkUsers } from '@/utils/testing/apiRoute';
import { sendPushToUsers } from '@/utils/firebase/pushNotification';
import { GameDataModel, IGameDataDocument } from '@/utils/mongodb/GameData';
import type { IGameData } from '@/utils/mongodb/GameData';
import { GAME_END_BUDGET_MS, NO_UNLOCKS } from './awardAchievements';
import { finishGame, judgingBudget, MIN_JUDGING_MS, PUSH_RESERVE_MS } from './finishGame';
import { platform } from '@/utils/testing/achievementFixtures';

/** The game as a route would hold it: a fresh document out of the store. */
async function liveGame(): Promise<IGameDataDocument> {
    const game = await GameDataModel.findOne({ gameId: 'game_1' }).exec();
    if (!game) throw new Error('The seeded game went missing');
    return game;
}

beforeEach(async () => {
    await resetApiRouteStubs();
    recordGameResult.mockReset();
    judgeGameEnd.mockReset();
    judgeGameEnd.mockResolvedValue(NO_UNLOCKS);
    // A call count that carries over from test to test can't say what came first.
    vi.mocked(sendPushToUsers).mockClear();
    stubClerkUsers(ANN, BOB);
    seedSnakesAndLadders();
});

afterEach(() => {
    vi.useRealTimers();
});

describe('finishGame', () => {
    it('leaves a won game complete, with nobody to play it', async () => {
        const finished = await finishGame(await liveGame(), { winner: ANN.id, endReason: 'win' });

        expect(finished.saved).toBe(true);
        const saved = storedGame('game_1')!;
        expect(saved.complete).toBe(true);
        expect(saved.winner).toBe(ANN.id);
        expect(saved.endReason).toBe('win');
        expect(saved.currentTurn).toBe('');

        await finished.announce();
        expect(recordGameResult).toHaveBeenCalledTimes(1);
        expect(sentPushes.map(push => push.userIds)).toEqual([[ANN.id], [BOB.id]]);
    });

    it('tells a co-op table it won, all of it, with no winner recorded', async () => {
        const finished = await finishGame(await liveGame(), { endReason: 'teamwin' });
        await finished.announce();

        const saved = storedGame('game_1')!;
        expect(saved.endReason).toBe('teamwin');
        // The whole point of the team reasons: nobody won it on their own.
        expect(saved.winner).toBe('');

        // One push each, all saying the same thing: each is its own so that one
        // seat's unlocks never land on a teammate's lock screen.
        expect(sentPushes.map(push => push.userIds)).toEqual([[ANN.id], [BOB.id]]);
        expect(sentPushes.every(push => push.notification.title.includes('Your team won'))).toBe(true);
        expect(sentPushes.every(push => push.options?.channel === 'gameOver')).toBe(true);
    });

    it('tells a co-op table it lost, rather than splitting it into a winner and losers', async () => {
        const finished = await finishGame(await liveGame(), { endReason: 'teamloss' });
        await finished.announce();

        expect(storedGame('game_1')!.endReason).toBe('teamloss');
        expect(sentPushes.map(push => push.userIds)).toEqual([[ANN.id], [BOB.id]]);
        expect(sentPushes.every(push => push.notification.title.includes('Your team lost'))).toBe(true);
    });

    it('records who went quiet when the timer abandons a game', async () => {
        const finished = await finishGame(await liveGame(), { endReason: 'abandoned', forfeitedBy: BOB.id });
        await finished.announce();

        const saved = storedGame('game_1')!;
        expect(saved.endReason).toBe('abandoned');
        expect(saved.forfeitedBy).toBe(BOB.id);
        // No winner to congratulate, so the same "it's over" goes to everyone.
        expect(sentPushes.map(push => push.userIds)).toEqual([[ANN.id], [BOB.id]]);
    });

    it('still tells the table when the result record cannot be written', async () => {
        // The game is already saved and unplayable by this point, so a wobble
        // on the stats write must not swallow the pushes as well — the table
        // would be left waiting on a turn that is never coming.
        recordGameResult.mockRejectedValueOnce(new Error('Mongo said no'));

        const finished = await finishGame(await liveGame(), { winner: ANN.id, endReason: 'win' });
        await expect(finished.announce()).resolves.toBeUndefined();

        expect(sentPushes.map(push => push.userIds)).toEqual([[ANN.id], [BOB.id]]);
    });

    it('leaves the game alone when somebody moved while it was finishing', async () => {
        // Two requests holding the same game, as two real ones would: the
        // second is deciding the game is over against a version the first has
        // already moved past.
        const stale = await liveGame();
        const mover = await liveGame();
        mover.currentTurn = BOB.id;
        await mover.save();

        const finished = await finishGame(stale, { winner: ANN.id, endReason: 'win' });

        expect(finished.saved).toBe(false);
        const saved = storedGame('game_1')!;
        expect(saved.complete).toBe(false);
        expect(saved.currentTurn).toBe(BOB.id);
        // Nothing announced, so no result is written for a game still being played.
        expect(recordGameResult).not.toHaveBeenCalled();
        expect(sentPushes).toHaveLength(0);
    });
});

describe('finishGame judging achievements', () => {
    /** When the nth call to a mock happened, relative to every other mock's calls. */
    const order = (mock: { mock: { invocationCallOrder: number[] } }, call = 0) => mock.mock.invocationCallOrder[call];

    it('judges the finished game after its result is recorded and before anybody is told', async () => {
        const finished = await finishGame(await liveGame(), { winner: ANN.id, endReason: 'win' });
        await finished.announce();

        expect(judgeGameEnd).toHaveBeenCalledTimes(1);
        const [judged, roster, context] = judgeGameEnd.mock.calls[0] as [IGameData, { id: string }[], { recorded: boolean }];
        expect(judged.gameId).toBe('game_1');
        expect(judged.complete).toBe(true);
        expect(roster.map(user => user.id)).toEqual([ANN.id, BOB.id]);
        expect(context).toEqual({ recorded: true });

        // Recorded first, because career reads the record; judged before the
        // pushes, so a push can name what it unlocked and the toaster's refresh
        // finds the rows already written.
        expect(order(recordGameResult)).toBeLessThan(order(judgeGameEnd));
        expect(order(judgeGameEnd)).toBeLessThan(order(vi.mocked(sendPushToUsers)));
        expect(sentPushes.map(push => push.userIds)).toEqual([[ANN.id], [BOB.id]]);
    });

    it('says the result was not recorded when it could not be, and judges anyway', async () => {
        recordGameResult.mockRejectedValueOnce(new Error('Mongo said no'));

        const finished = await finishGame(await liveGame(), { winner: ANN.id, endReason: 'win' });
        await finished.announce();

        expect(judgeGameEnd).toHaveBeenCalledTimes(1);
        expect(judgeGameEnd.mock.calls[0][2]).toEqual({ recorded: false });
        expect(sentPushes.map(push => push.userIds)).toEqual([[ANN.id], [BOB.id]]);
    });

    it('still tells the table when the judge fails', async () => {
        judgeGameEnd.mockRejectedValueOnce(new Error('Mongo said no'));

        const finished = await finishGame(await liveGame(), { winner: ANN.id, endReason: 'win' });
        await expect(finished.announce()).resolves.toBeUndefined();

        expect(sentPushes.map(push => push.userIds)).toEqual([[ANN.id], [BOB.id]]);
    });

    it('stops waiting on a judge that stalls once its budget is spent, and then tells the table', async () => {
        // The cron awaits this inline, with ten seconds of headroom for the last
        // game it starts.
        judgeGameEnd.mockReturnValue(new Promise(() => { }));
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => { });
        const finished = await finishGame(await liveGame(), { winner: ANN.id, endReason: 'win' });
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

        const announced = finished.announce();
        await vi.advanceTimersByTimeAsync(GAME_END_BUDGET_MS - 1);
        expect(sentPushes).toEqual([]);

        await vi.advanceTimersByTimeAsync(1);
        await announced;
        expect(sentPushes.map(push => push.userIds)).toEqual([[ANN.id], [BOB.id]]);
        // Giving up on it is said out loud, since nothing else records a judge
        // that was only slow.
        expect(warn).toHaveBeenCalledWith(`Judging achievements for game_1 still running after ${GAME_END_BUDGET_MS}ms; not waiting for it`);
        warn.mockRestore();
    });

    it("names what the ending unlocked in each player's own push, and only theirs", async () => {
        judgeGameEnd.mockResolvedValue([{ userId: ANN.id, achievement: platform('platform.first-win', record => record.won, 1) }]);
        const finished = await finishGame(await liveGame(), { winner: ANN.id, endReason: 'win' });

        await finished.announce();

        const bodies = Object.fromEntries(sentPushes.map(push => [push.userIds[0], push.notification.body]));
        expect(bodies[ANN.id]).toMatch(/🏆 Unlocked platform\.first-win$/);
        expect(bodies[BOB.id]).not.toContain('Unlocked');
    });

    it("keeps one teammate's unlock off the other's push at a co-op table, which is told one result", async () => {
        judgeGameEnd.mockResolvedValue([{ userId: ANN.id, achievement: platform('platform.first-win', record => record.won, 1) }]);
        const finished = await finishGame(await liveGame(), { endReason: 'teamwin' });

        await finished.announce();

        const bodies = Object.fromEntries(sentPushes.map(push => [push.userIds[0], push.notification.body]));
        expect(bodies[ANN.id]).toMatch(/🏆 Unlocked platform\.first-win$/);
        expect(bodies[BOB.id]).not.toContain('Unlocked');
        expect(sentPushes.every(push => push.notification.title.includes('Your team won'))).toBe(true);
    });

    it("judges only in the time a deadline leaves the pushes, and not at all when there is none to spare", async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => { });
        const finished = await finishGame(await liveGame(), { winner: ANN.id, endReason: 'win' });

        // The cron's last game, with its run about to be stopped.
        await finished.announce({ finishBy: Date.now() + PUSH_RESERVE_MS });

        expect(judgeGameEnd).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledWith("Not judging achievements for game_1: too close to the run's deadline to leave the pushes time");
        expect(sentPushes.map(push => push.userIds)).toEqual([[ANN.id], [BOB.id]]);
        warn.mockRestore();
    });
});

describe('judgingBudget', () => {
    it('is the usual budget with no deadline, or with one far enough off', () => {
        expect(judgingBudget(undefined, 0)).toBe(GAME_END_BUDGET_MS);
        expect(judgingBudget(60_000, 0)).toBe(GAME_END_BUDGET_MS);
    });

    it('shrinks to what the deadline leaves once the pushes have their reserve', () => {
        expect(judgingBudget(PUSH_RESERVE_MS + 1_000, 0)).toBe(1_000);
    });

    it('is nothing when what is left is too little to be worth starting a judge in', () => {
        expect(judgingBudget(PUSH_RESERVE_MS + MIN_JUDGING_MS - 1, 0)).toBe(0);
        expect(judgingBudget(PUSH_RESERVE_MS - 1_000, 0)).toBe(0);
    });
});
