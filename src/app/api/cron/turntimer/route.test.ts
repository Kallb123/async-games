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
import { FIRST_COMMAND_VERSION } from '@/utils/ui/games';

const { recordGameResult } = vi.hoisted(() => ({ recordGameResult: vi.fn() }));

vi.mock('@clerk/nextjs/server', async () => (await import('@/utils/testing/apiRoute')).clerkStub());
// From afterStub rather than apiRoute — see the note in afterStub.ts.
vi.mock('next/server', async () => (await import('@/utils/testing/afterStub')).nextServerStub());
vi.mock('@/utils/mongodb/mongodb', async () => (await import('@/utils/testing/apiRoute')).mongodbStub());
vi.mock('@/utils/firebase/pushNotification', async () => (await import('@/utils/testing/apiRoute')).pushNotificationStub());
vi.mock('@/utils/mongodb/GameResultData', async () => (await import('@/utils/testing/apiRoute')).gameResultDataStub({ recordGameResult }));
// Watched, not replaced: the real runner still plays the turn, and the test
// sees what it was handed (or stands a result in for it).
vi.mock('@/utils/games/playComputerTurns', async importOriginal => {
    const actual = await importOriginal<typeof import('@/utils/games/playComputerTurns')>();
    return { ...actual, playComputerTurns: vi.fn(actual.playComputerTurns) };
});

import {
    ANN, BOB, get, resetApiRouteStubs, seedGame, seedSnakesAndLadders, sentPushes, storedGame, stubClerkUsers
} from '@/utils/testing/apiRoute';
import { baseState } from '@/games/FiresOut/testFixtures';
import { IS_REFUSED, STAYS_WITH_COMPUTER, registerFakeWarbands, warbandTurnsRun } from '@/utils/testing/computerTurnFixtures';
import { COMPUTER_TURN_SEAT } from '@/utils/games/computerTurns';
import { MAX_CONSECUTIVE_MISSED_TURNS } from '@/utils/games/TurnTimer';
import { playComputerTurns } from '@/utils/games/playComputerTurns';
import { GET, maxDuration } from './route';

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
 * Seeded rather than created: §1's solitaire play (fires-out-gdd.md §17.6
 * step 12) is the shape this stands in for, and POST /api/newgame/firesout
 * does now create it — but this test is about what the sweep does with such a
 * board, not about how one comes into existence. Outbreak's own
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

    describe('a player who has missed MAX_CONSECUTIVE_MISSED_TURNS in a row', () => {
        const CAT = { id: 'user_cat', username: 'cat' };

        /** Snakes & Ladders registers a dropout adapter: a three-seat race can lose one. */
        function seedThreeSeatRace(overrides: Record<string, unknown> = {}) {
            seedSnakesAndLadders({
                userIdList: [ANN.id, BOB.id, CAT.id],
                turnTimer: '10m',
                lastTurnTimestamp: STALE,
                gameState: { turnOrder: [ANN.id, BOB.id, CAT.id], history: [], commandHistory: [] },
                missedTurnCounts: { [ANN.id]: 2 },
                ...overrides,
            }, { [ANN.id]: 10, [BOB.id]: 20, [CAT.id]: 30 });
        }

        beforeEach(() => stubClerkUsers(ANN, BOB, CAT));

        it('is dropped, and the game carries on without them, when their game allows it', async () => {
            seedThreeSeatRace();

            const response = await GET(cronRequest());

            expect(await response.json()).toMatchObject({ processed: 1, dropped: 1, abandoned: 0 });
            const saved = storedGame('game_1')!;
            expect(saved.complete).toBe(false);
            expect(saved.currentTurn).toBe(BOB.id);
            const gameState = saved.gameState as { turnOrder: string[], droppedPlayers: string[], commandHistory: { className: string, senderId: string }[] };
            // The seat order is untouched; the seat is marked instead.
            expect(gameState.turnOrder).toEqual([ANN.id, BOB.id, CAT.id]);
            expect(gameState.droppedPlayers).toEqual([ANN.id]);
            // Recorded like any other command, so a replay drops them too.
            // Stamped with the game's current rules version, as the route stamps a player's own.
            expect(gameState.commandHistory.at(-1)).toMatchObject({ className: 'PlayerDropped', senderId: ANN.id, version: FIRST_COMMAND_VERSION });
            // Their ladder is spent rather than left to climb.
            expect(saved.missedTurnCounts).toEqual({});
            expect(saved.lastTurnTimestamp).not.toBe(STALE);
            expect(sentPushes.map(push => push.userIds)).toEqual([[BOB.id]]);
            expect(recordGameResult).not.toHaveBeenCalled();
        });

        it('is stepped over by the rotation from then on', async () => {
            seedThreeSeatRace({
                currentTurn: CAT.id,
                missedTurnCounts: {},
                gameState: { turnOrder: [ANN.id, BOB.id, CAT.id], history: [], commandHistory: [], droppedPlayers: [ANN.id] },
            });

            await GET(cronRequest());

            // Cat's turn expired; the seat after hers is Ann's, who has left.
            expect(storedGame('game_1')!.currentTurn).toBe(BOB.id);
        });

        it('abandons the game when dropping them would leave too few players', async () => {
            seedSnakesAndLadders({ turnTimer: '10m', lastTurnTimestamp: STALE, missedTurnCounts: { [ANN.id]: 2 } });

            const response = await GET(cronRequest());

            expect(await response.json()).toMatchObject({ processed: 1, abandoned: 1, dropped: 0 });
            const saved = storedGame('game_1')!;
            expect(saved.complete).toBe(true);
            expect(saved.endReason).toBe('abandoned');
            expect(saved.forfeitedBy).toBe(ANN.id);
        });
    });
});

// A computer's turn (computerTurns.ts) is never a player's to run out of. The
// command route plays it in the background; the sweep plays what a stopped
// runner left (§3.2), and is otherwise blind to it: no timeout, no warning, no
// missed turn, no drop, no abandon.
describe('GET /api/cron/turntimer, a computer\'s turn', () => {
    const MINUTES_AGO = (minutes: number) => new Date(Date.now() - minutes * 60 * 1000).toISOString();

    function seedWarbandsDue(overrides: Record<string, unknown> = {}) {
        seedSnakesAndLadders({
            turnTimer: '10m',
            currentTurn: COMPUTER_TURN_SEAT,
            lastTurnTimestamp: STALE,
            timerWarningNotificationSent: false,
            gameState: { turnOrder: [ANN.id, COMPUTER_TURN_SEAT, BOB.id], history: [], commandHistory: [] },
            ...overrides,
        });
    }

    beforeEach(() => registerFakeWarbands([BOB.id]));

    it('plays a turn that has stood too long, and tells the player it reaches', async () => {
        seedWarbandsDue();

        const response = await GET(cronRequest());

        expect(await response.json()).toMatchObject({ processed: 1, computer: 1, expired: 0, warned: 0, abandoned: 0, dropped: 0, failed: 0 });
        const saved = storedGame('game_1')!;
        expect(saved.currentTurn).toBe(BOB.id);
        expect(saved.complete).toBe(false);
        // Nothing was counted against anybody: not the computer, not Ann who ended her turn.
        expect(saved.missedTurnCounts ?? {}).toEqual({});
        expect(sentPushes.map(push => [push.data.event, push.userIds])).toEqual([['YourTurn', [BOB.id]]]);
    });

    it('plays it in a game with no timer at all', async () => {
        seedWarbandsDue({ turnTimer: 'unlimited' });

        const response = await GET(cronRequest());

        expect(await response.json()).toMatchObject({ computer: 1 });
        expect(storedGame('game_1')!.currentTurn).toBe(BOB.id);
    });

    it('leaves a turn alone while its own runner may still be playing it', async () => {
        seedWarbandsDue({ lastTurnTimestamp: MINUTES_AGO(1), turnTimer: 'unlimited' });

        const response = await GET(cronRequest());

        expect(await response.json()).toMatchObject({ processed: 0, computer: 0 });
        expect(storedGame('game_1')!.currentTurn).toBe(COMPUTER_TURN_SEAT);
        expect(warbandTurnsRun.count).toBe(0);
    });

    it("hands the runner the run's own deadline, not the platform's hard stop", async () => {
        seedWarbandsDue();
        const before = Date.now();

        await GET(cronRequest());

        const { finishBy } = vi.mocked(playComputerTurns).mock.calls.at(-1)![1];
        // Fifty seconds from the request's start: the sweep's budget, ten short of maxDuration.
        expect(maxDuration).toBe(60);
        expect(finishBy).toBeGreaterThanOrEqual(before + 50_000 - 1000);
        expect(finishBy).toBeLessThanOrEqual(Date.now() + 50_000);
    });

    it('never times it out, warns about it or counts a missed turn against a player, even when it cannot be played', async () => {
        seedWarbandsDue({ missedTurnCounts: { [ANN.id]: 2 } });
        // The game has nothing to play for the seat, so the runner refuses.
        registerFakeWarbands([]);
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});

        const response = await GET(cronRequest());

        // Tallied as what it was: a turn that could not be played, not one played.
        expect(await response.json()).toMatchObject({ processed: 1, computer: 0, stuck: 1, expired: 0, warned: 0, abandoned: 0, dropped: 0, declined: 0 });
        const saved = storedGame('game_1')!;
        expect(saved.currentTurn).toBe(COMPUTER_TURN_SEAT);
        expect(saved.complete).toBe(false);
        // Ann's count is untouched; the failure is the computer's, counted once.
        expect(saved.missedTurnCounts).toEqual({ [ANN.id]: 2, [COMPUTER_TURN_SEAT]: 1 });
        expect(sentPushes).toEqual([]);
        error.mockRestore();
    });

    it('is not a candidate again until it has stood stale again, and is abandoned on the third failure', async () => {
        seedWarbandsDue();
        registerFakeWarbands([IS_REFUSED]);
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});

        for (let tick = 1; tick < MAX_CONSECUTIVE_MISSED_TURNS; tick++) {
            expect(await (await GET(cronRequest())).json()).toMatchObject({ stuck: 1, abandoned: 0 });
            // Bumped, so the very next tick doesn't meet it.
            expect(await (await GET(cronRequest())).json()).toMatchObject({ processed: 0 });
            storedGame('game_1')!.lastTurnTimestamp = STALE;
        }

        expect(await (await GET(cronRequest())).json()).toMatchObject({ processed: 1, abandoned: 1, stuck: 0, failed: 0 });
        const saved = storedGame('game_1')!;
        expect(saved.complete).toBe(true);
        expect(saved.endReason).toBe('abandoned');
        expect(saved.forfeitedBy).toBeUndefined();
        expect(recordGameResult).toHaveBeenCalledTimes(1);
        error.mockRestore();
    });

    it('tallies a run that had no time for the turn as stopped, and one that lost it to another runner as skipped', async () => {
        seedWarbandsDue();
        vi.mocked(playComputerTurns).mockResolvedValueOnce('stopped');
        expect(await (await GET(cronRequest())).json()).toMatchObject({ processed: 1, stopped: 1, computer: 0, skipped: 0 });

        vi.mocked(playComputerTurns).mockResolvedValueOnce('skipped');
        expect(await (await GET(cronRequest())).json()).toMatchObject({ processed: 1, stopped: 0, computer: 0, skipped: 1 });
    });

    it('tallies a turn that kept the computer on its seat as played, not as stuck', async () => {
        seedWarbandsDue();
        registerFakeWarbands([STAYS_WITH_COMPUTER, BOB.id]);

        expect(await (await GET(cronRequest())).json()).toMatchObject({ computer: 1, stuck: 0, stopped: 0 });
    });

    it('plays the warbands when a timed-out End turn hands the turn to them', async () => {
        seedWarbandsDue({ currentTurn: ANN.id });

        const response = await GET(cronRequest());

        expect(await response.json()).toMatchObject({ processed: 1, expired: 1, failed: 0 });
        const saved = storedGame('game_1')!;
        expect(saved.currentTurn).toBe(BOB.id);
        expect(saved.missedTurnCounts).toEqual({ [ANN.id]: 1 });
        // The warband's turn is on the record, and Bob is told once, by the runner.
        expect((saved.gameState as { commandHistory: { className: string }[] }).commandHistory.map(c => c.className)).toEqual(['FakeWarbandTurn']);
        expect(sentPushes.map(push => push.userIds)).toEqual([[BOB.id]]);
    });
});

