// The turn-timer sweep, exercised the way the scheduler calls it: the real
// handler, the real candidate query (against the test game store), real
// Mongoose documents and the real optimistic-concurrency save. Only Clerk, the
// connection, the push transport and the result read-model are stubbed (see
// utils/testing/apiRoute.ts).
//
// What these guard is the third of the three things a sweep can decide. An
// expired turn that the game can pass on, and a player who has missed enough
// of them to have gone for good, both already end with a save. The turn a
// game's own timeout adapter *declines* — Fires Out's solitaire board, where
// every figure belongs to the stalled player, so no number of endTurns reaches
// anybody else — used to end with none: the missed turn was counted in memory
// and dropped, every tick, so the game was neither played on nor ever
// abandoned. (The engine-side half of that distinction, and the adapter that
// gets stuck *after* running commands, are in
// src/utils/games/turnTimeout.test.ts.)

import { beforeEach, afterAll, describe, expect, it, vi } from 'vitest';

const { recordGameResult } = vi.hoisted(() => ({ recordGameResult: vi.fn() }));

vi.mock('@clerk/nextjs/server', async () => (await import('@/utils/testing/apiRoute')).clerkStub());
// From afterStub rather than apiRoute — see the note in afterStub.ts.
vi.mock('next/server', async () => (await import('@/utils/testing/afterStub')).nextServerStub());
vi.mock('@/utils/mongodb/mongodb', async () => (await import('@/utils/testing/apiRoute')).mongodbStub());
vi.mock('@/utils/firebase/pushNotification', async () => (await import('@/utils/testing/apiRoute')).pushNotificationStub());
vi.mock('@/utils/mongodb/GameResultData', () => ({ recordGameResult }));

import {
    ANN, BOB, get, resetApiRouteStubs, seedGame, seedSnakesAndLadders, sentPushes, storedGame, stubClerkUsers
} from '@/utils/testing/apiRoute';
import { baseState } from '@/games/FiresOut/testFixtures';
import { GET } from './route';

const SECRET = 'cron-s3cret';

/** The scheduler's request: a GET with the bearer token isAuthorisedCron wants. */
function cronRequest() {
    return get('/api/cron/turntimer', { authorization: `Bearer ${SECRET}` });
}

/** Long enough ago that a 10-minute turn timer has expired. */
const STALE = new Date(Date.now() - 60 * 60 * 1000).toISOString();

/**
 * A Fires Out game whose stalled turn its own rules decline to play: both
 * figures on the board are Ann's, so `buildTimeoutCommand` has nobody to hand
 * the turn to and `resolveStalledTurn` reports 'declined'.
 *
 * Seeded rather than created, because no route makes this game yet — every
 * seat holds one figure until §1's solitaire play lands (fires-out-gdd.md
 * §17.6 step 12), which is the shape this is standing in for. Outbreak's own
 * adapter declines for real today, on a currentTurn missing from its player
 * map, but a Fires Out board says what a declined turn *is* far more clearly.
 */
function seedStuckFiresOut(overrides: Record<string, unknown> = {}) {
    seedGame({
        gameId: 'game_1',
        gameType: {
            gameId: 'gametype_1', gameType: 'FiresOut', friendlyName: 'Fires Out!',
            icon: '', url: 'firesout', className: 'FiresOutGameType'
        },
        kind: 'FiresOutGameData',
        userIdList: [ANN.id],
        turnTimer: '10m',
        currentTurn: ANN.id,
        lastTurnTimestamp: STALE,
        timerWarningNotificationSent: true,
        gameState: { turnOrder: [ANN.id], history: [], commandHistory: [] },
        complete: false,
        winner: '',
        specificGameState: baseState([ANN.id, ANN.id]),
        ...overrides
    });
}

const originalSecret = process.env.CRON_SECRET;
beforeEach(async () => {
    await resetApiRouteStubs();
    recordGameResult.mockReset();
    stubClerkUsers(ANN, BOB);
    process.env.CRON_SECRET = SECRET;
});
afterAll(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
});

describe('GET /api/cron/turntimer', () => {
    it('refuses a caller without the cron secret', async () => {
        const response = await GET(get('/api/cron/turntimer'));
        expect(response.status).toBe(401);
    });

    it('passes an expired turn on to the next player', async () => {
        seedSnakesAndLadders({ turnTimer: '10m', lastTurnTimestamp: STALE });

        const response = await GET(cronRequest());

        expect(await response.json()).toMatchObject({ processed: 1, expired: 1, declined: 0, stuck: 0 });
        const saved = storedGame('game_1')!;
        expect(saved.currentTurn).toBe(BOB.id);
        expect(saved.missedTurnCounts).toEqual({ [ANN.id]: 1 });
        expect(sentPushes.map(push => push.userIds)).toEqual([[BOB.id]]);
    });

    it('banks the missed turn when the game declines its own stalled turn', async () => {
        seedStuckFiresOut();

        const response = await GET(cronRequest());

        expect(await response.json()).toMatchObject({ processed: 1, declined: 1, stuck: 0, skipped: 0, expired: 0 });
        const saved = storedGame('game_1')!;
        // The increment used to be thrown away with the document, so this
        // stayed empty for as long as the game lived.
        expect(saved.missedTurnCounts).toEqual({ [ANN.id]: 1 });
        // Nothing else moved: the turn is still Ann's, and the board is
        // untouched because the adapter never built a command to run.
        expect(saved.currentTurn).toBe(ANN.id);
        expect(saved.complete).toBe(false);
        expect((saved.gameState as { commandHistory: unknown[] }).commandHistory).toEqual([]);
        // Their timer starts again, so the next rung of the ladder is a whole
        // turn away rather than one ~15-minute tick, and they get another
        // expiry warning before it.
        expect(saved.lastTurnTimestamp).not.toBe(STALE);
        expect(saved.timerWarningNotificationSent).toBe(false);
        // Nobody new to tell — it is still the same player's turn.
        expect(sentPushes).toEqual([]);
    });

    it('abandons a game whose stalled turn has gone unresolved MAX_CONSECUTIVE_MISSED_TURNS times', async () => {
        seedStuckFiresOut({ missedTurnCounts: { [ANN.id]: 2 } });

        const response = await GET(cronRequest());

        expect(await response.json()).toMatchObject({ processed: 1, abandoned: 1, declined: 0 });
        const saved = storedGame('game_1')!;
        expect(saved.complete).toBe(true);
        expect(saved.endReason).toBe('abandoned');
        expect(saved.forfeitedBy).toBe(ANN.id);
        expect(recordGameResult).toHaveBeenCalledTimes(1);
    });
});
