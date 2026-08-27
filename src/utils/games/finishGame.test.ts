// The one way a game ends, exercised the way a route uses it: a real Mongoose
// document from the test game store, the real optimistic-concurrency save, and
// the push transport recorded rather than sent (see utils/testing/apiRoute.ts).
//
// What these guard is the shared outcome a co-op game needs — a table that wins
// or loses as one — and the two things every ending has to leave behind
// whatever route asked for it: a game nobody can play on, and one result record.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { recordGameResult } = vi.hoisted(() => ({ recordGameResult: vi.fn() }));

vi.mock('@clerk/nextjs/server', async () => (await import('@/utils/testing/apiRoute')).clerkStub());
vi.mock('@/utils/mongodb/mongodb', async () => (await import('@/utils/testing/apiRoute')).mongodbStub());
vi.mock('@/utils/firebase/pushNotification', async () => (await import('@/utils/testing/apiRoute')).pushNotificationStub());
vi.mock('@/utils/mongodb/GameResultData', () => ({ recordGameResult }));

import { ANN, BOB, resetApiRouteStubs, seedGame, sentPushes, storedGame, stubClerkUsers } from '@/utils/testing/apiRoute';
import { GameDataModel, IGameDataDocument } from '@/utils/mongodb/GameData';
import { finishGame } from './finishGame';

/** A game in progress, for Ann and Bob, that something is about to finish. */
function seedLiveGame() {
    seedGame({
        gameId: 'game_1',
        gameType: {
            gameId: 'gametype_1', gameType: 'SnakesAndLadders', friendlyName: 'Snakes and Ladders',
            icon: '', url: 'snakesandladders', className: 'SnakesAndLaddersGameType'
        },
        kind: 'SnakesAndLaddersGameData',
        userIdList: [ANN.id, BOB.id],
        turnTimer: '1 day',
        currentTurn: ANN.id,
        lastTurnTimestamp: '2026-01-01T00:00:00.000Z',
        gameState: { turnOrder: [ANN.id, BOB.id], history: [], commandHistory: [] },
        complete: false,
        winner: '',
        specificGameState: {
            playerPositions: { [ANN.id]: { position: 10, laddersClimbed: 0, snakesHit: 0 } },
            hasRolled: false,
            reRollOnSix: false
        },
    });
}

/** The game as a route would hold it: a fresh document out of the store. */
async function liveGame(): Promise<IGameDataDocument> {
    const game = await GameDataModel.findOne({ gameId: 'game_1' }).exec();
    if (!game) throw new Error('The seeded game went missing');
    return game;
}

beforeEach(async () => {
    await resetApiRouteStubs();
    recordGameResult.mockReset();
    stubClerkUsers(ANN, BOB);
    seedLiveGame();
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

        expect(sentPushes).toHaveLength(1);
        expect(sentPushes[0].userIds).toEqual([ANN.id, BOB.id]);
        expect(sentPushes[0].notification.title).toContain('Your team won');
        expect(sentPushes[0].options?.channel).toBe('gameOver');
    });

    it('tells a co-op table it lost, rather than splitting it into a winner and losers', async () => {
        const finished = await finishGame(await liveGame(), { endReason: 'teamloss' });
        await finished.announce();

        expect(storedGame('game_1')!.endReason).toBe('teamloss');
        expect(sentPushes).toHaveLength(1);
        expect(sentPushes[0].userIds).toEqual([ANN.id, BOB.id]);
        expect(sentPushes[0].notification.title).toContain('Your team lost');
    });

    it('records who went quiet when the timer abandons a game', async () => {
        const finished = await finishGame(await liveGame(), { endReason: 'abandoned', forfeitedBy: BOB.id });
        await finished.announce();

        const saved = storedGame('game_1')!;
        expect(saved.endReason).toBe('abandoned');
        expect(saved.forfeitedBy).toBe(BOB.id);
        // No winner to congratulate, so the same "it's over" goes to everyone.
        expect(sentPushes.map(push => push.userIds)).toEqual([[ANN.id, BOB.id]]);
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
