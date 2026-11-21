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
import { ENDS_THE_GAME, IS_REFUSED, STAYS_WITH_COMPUTER, THROWS, registerFakeWarbands, warbandHooks, warbandTurnsRun } from '@/utils/testing/computerTurnFixtures';
import { COMPUTER_TURN_SEAT } from './computerTurns';
import { MAX_CONSECUTIVE_MISSED_TURNS } from './TurnTimer';
import { COMPUTER_TURN_BUDGET_MS, COMPUTER_TURN_LONG_WAIT_MS, MAX_COMPUTER_TURN_CONFLICTS, playComputerTurns } from './playComputerTurns';

/** Plenty of time: nothing here is racing a deadline unless it says so. */
const finishBy = () => Date.now() + 60_000;

/** Ann has just ended her turn and handed it to the computer, with Bob to follow. */
function seedWarbandsDue(overrides: Record<string, unknown> = {}) {
    seedSnakesAndLadders({
        turnTimer: '10m',
        currentTurn: COMPUTER_TURN_SEAT,
        lastTurnTimestamp: '2026-01-01T00:00:00.000Z',
        gameState: { turnOrder: [ANN.id, COMPUTER_TURN_SEAT, BOB.id], history: [], commandHistory: [] },
        ...overrides,
    });
}

const handedTo = (userId: string) => sentPushes.filter(push => push.data.event === 'YourTurn' && push.userIds.includes(userId));

beforeEach(async () => {
    await resetApiRouteStubs();
    recordGameResult.mockReset();
    judgeTurnEnd.mockClear();
    stubClerkUsers(ANN, BOB);
    registerFakeWarbands([STAYS_WITH_COMPUTER, BOB.id]);
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
        expect(history.map(command => [command.className, command.senderId])).toEqual([['FakeWarbandTurn', COMPUTER_TURN_SEAT], ['FakeWarbandTurn', COMPUTER_TURN_SEAT]]);
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
            gameState: { turnOrder: [ANN.id, COMPUTER_TURN_SEAT], history: [], commandHistory: [] },
        });
        registerFakeWarbands([ANN.id]);

        expect(await playComputerTurns('game_1', { finishBy: finishBy() })).toBe('handedBack');

        expect(storedGame('game_1')!.currentTurn).toBe(ANN.id);
        expect(sentPushes).toEqual([]);
        expect(judgeTurnEnd).toHaveBeenCalledTimes(1);
    });

    it('stops before a turn it has no time for, leaving the game as it was, and a later call finishes it', async () => {
        seedWarbandsDue();

        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(await playComputerTurns('game_1', { finishBy: Date.now() + COMPUTER_TURN_BUDGET_MS - 1000 })).toBe('stopped');
        // Logged with the game's id, so a game left for the backstop can be found.
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('game_1'));
        warn.mockRestore();

        const untouched = storedGame('game_1')!;
        expect(untouched.currentTurn).toBe(COMPUTER_TURN_SEAT);
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

        expect(storedGame('game_1')!.currentTurn).toBe(COMPUTER_TURN_SEAT);
        expect(sentPushes).toEqual([]);
        delete warbandHooks.onTurn;

        expect(await playComputerTurns('game_1', { finishBy: finishBy() })).toBe('handedBack');
        expect(handedTo(BOB.id)).toHaveLength(1);
    });

    it('finishes a game the computer ends, and announces it rather than a turn', async () => {
        seedWarbandsDue();
        registerFakeWarbands([ENDS_THE_GAME]);

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

    it('pushes a solo player when the warbands kept them waiting, and not when they did not', async () => {
        const solo = { userIdList: [ANN.id], gameState: { turnOrder: [ANN.id, COMPUTER_TURN_SEAT], history: [], commandHistory: [] } };
        registerFakeWarbands([ANN.id]);

        // Found stale, as the backstop finds a turn its runner left.
        seedWarbandsDue({ ...solo, lastTurnTimestamp: new Date(Date.now() - COMPUTER_TURN_LONG_WAIT_MS - 1000).toISOString() });
        expect(await playComputerTurns('game_1', { finishBy: finishBy() })).toBe('handedBack');
        expect(handedTo(ANN.id)).toHaveLength(1);

        await resetApiRouteStubs();
        stubClerkUsers(ANN, BOB);
        seedWarbandsDue({ ...solo, lastTurnTimestamp: new Date(Date.now() - 5_000).toISOString() });
        expect(await playComputerTurns('game_1', { finishBy: finishBy() })).toBe('handedBack');
        expect(sentPushes).toEqual([]);
    });

    describe('a turn that cannot be played', () => {
        const error = () => vi.spyOn(console, 'error').mockImplementation(() => {});
        const failures = () => storedGame('game_1')!.missedTurnCounts as unknown as Record<string, number> | undefined;

        for (const [why, hand] of [['has no command to build', undefined], ['is refused', IS_REFUSED], ['throws', THROWS]] as const) {
            it(`counts one that ${why}, restarts its clock and saves it`, async () => {
                seedWarbandsDue();
                registerFakeWarbands(hand === undefined ? [] : [hand]);
                const spy = error();

                expect(await playComputerTurns('game_1', { finishBy: finishBy() })).toBe('refused');

                expect(spy).toHaveBeenCalled();
                const saved = storedGame('game_1')!;
                expect(failures()).toEqual({ [COMPUTER_TURN_SEAT]: 1 });
                // No longer a sweep candidate until it has stood stale again, and
                // nothing the failed turn half-did was kept.
                expect(saved.lastTurnTimestamp).not.toBe('2026-01-01T00:00:00.000Z');
                expect(saved.currentTurn).toBe(COMPUTER_TURN_SEAT);
                expect(saved.complete).toBe(false);
                expect((saved.gameState as { commandHistory: unknown[] }).commandHistory).toEqual([]);
                expect(sentPushes).toEqual([]);
                spy.mockRestore();
            });
        }

        it('abandons the game on the third failure, blaming nobody, and tells the table', async () => {
            seedWarbandsDue({ missedTurnCounts: { [COMPUTER_TURN_SEAT]: MAX_CONSECUTIVE_MISSED_TURNS - 1 } });
            registerFakeWarbands([IS_REFUSED]);
            const spy = error();

            expect(await playComputerTurns('game_1', { finishBy: finishBy() })).toBe('abandoned');

            const saved = storedGame('game_1')!;
            expect(saved.complete).toBe(true);
            expect(saved.endReason).toBe('abandoned');
            expect(saved.forfeitedBy).toBeUndefined();
            expect(saved.currentTurn).toBe('');
            expect(recordGameResult).toHaveBeenCalledTimes(1);
            expect(sentPushes.map(push => push.data.event)).toEqual(['GameOver', 'GameOver']);
            expect(spy).toHaveBeenCalledWith(expect.stringContaining('abandoned'));
            spy.mockRestore();
        });

        it('takes three failed runs to abandon a game', async () => {
            seedWarbandsDue();
            registerFakeWarbands([THROWS]);
            const spy = error();

            const results = [];
            for (let run = 0; run < MAX_CONSECUTIVE_MISSED_TURNS; run++) {
                results.push(await playComputerTurns('game_1', { finishBy: finishBy() }));
            }

            expect(results).toEqual(['refused', 'refused', 'abandoned']);
            spy.mockRestore();
        });

        it('forgets the failures once a turn is played', async () => {
            seedWarbandsDue({ missedTurnCounts: { [COMPUTER_TURN_SEAT]: MAX_CONSECUTIVE_MISSED_TURNS - 1 } });
            registerFakeWarbands([BOB.id]);

            expect(await playComputerTurns('game_1', { finishBy: finishBy() })).toBe('handedBack');

            expect(failures()?.[COMPUTER_TURN_SEAT]).toBeUndefined();
        });

        it('leaves it alone when the game moved on while it was failing', async () => {
            seedWarbandsDue();
            registerFakeWarbands([IS_REFUSED]);
            warbandHooks.onTurn = () => {
                const stored = storedGame('game_1')!;
                stored.__v++;
                stored.currentTurn = BOB.id;
            };
            const spy = error();

            expect(await playComputerTurns('game_1', { finishBy: finishBy() })).toBe('skipped');

            expect(failures()).toBeUndefined();
            spy.mockRestore();
        });
    });

    describe('when another runner is playing the same turn', () => {
        it('reloads after a lost save and plays the turn once', async () => {
            seedWarbandsDue();
            registerFakeWarbands([BOB.id]);
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
            registerFakeWarbands([STAYS_WITH_COMPUTER, BOB.id]);
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
