import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ActionableTurnBranch,
    ITurnTimerState,
    MAX_CONSECUTIVE_MISSED_TURNS,
    TURN_TIMER_OPTIONS,
    TURN_TIMER_VALUES,
    UNLIMITED_TURN_TIMER,
    actionableTurnFilter,
    formatRemainingUntil,
    hasAbandonedGame,
    isExpired,
    isValidTurnTimer,
    needsSweeping,
    parseTurnTimerMs,
    warningThresholdMs,
} from './TurnTimer';

describe('hasAbandonedGame', () => {
    it('does not abandon while under the threshold', () => {
        for (let n = 0; n < MAX_CONSECUTIVE_MISSED_TURNS; n++) {
            expect(hasAbandonedGame(n)).toBe(false);
        }
    });

    it('abandons once a player has missed the threshold number of turns in a row', () => {
        expect(hasAbandonedGame(MAX_CONSECUTIVE_MISSED_TURNS)).toBe(true);
        expect(hasAbandonedGame(MAX_CONSECUTIVE_MISSED_TURNS + 1)).toBe(true);
    });
});

describe('formatRemainingUntil', () => {
    const now = new Date('2026-08-25T12:00:00.000Z').getTime();
    const inMs = (ms: number) => new Date(now + ms).toISOString();

    it('reads in the coarsest unit that fits', () => {
        expect(formatRemainingUntil(inMs(3 * 24 * 60 * 60 * 1000), now)).toBe('3 days');
        expect(formatRemainingUntil(inMs(6 * 60 * 60 * 1000), now)).toBe('6 hours');
        expect(formatRemainingUntil(inMs(45 * 60 * 1000), now)).toBe('45 minutes');
    });

    it('singularises a lone unit', () => {
        expect(formatRemainingUntil(inMs(24 * 60 * 60 * 1000), now)).toBe('1 day');
        expect(formatRemainingUntil(inMs(60 * 60 * 1000), now)).toBe('1 hour');
        expect(formatRemainingUntil(inMs(60 * 1000), now)).toBe('1 minute');
    });

    it('never counts below zero, or reads as "0 minutes"', () => {
        expect(formatRemainingUntil(inMs(30 * 1000), now)).toBe('less than a minute');
        expect(formatRemainingUntil(inMs(-5 * 60 * 1000), now)).toBe('less than a minute');
    });

    it('has nothing to say before hydration', () => {
        expect(formatRemainingUntil(inMs(60 * 60 * 1000), null)).toBeNull();
    });
});

describe('isValidTurnTimer', () => {
    it('accepts every timer the app offers', () => {
        for (const timer of TURN_TIMER_VALUES) {
            expect(isValidTurnTimer(timer)).toBe(true);
        }
    });

    it('offers a labelled option for every timer, and no others', () => {
        // TURN_TIMER_OPTIONS is what the select renders and TURN_TIMER_VALUES
        // is what the server accepts, so they must be the same ladder — they
        // are, because the second is derived from the first.
        expect(TURN_TIMER_OPTIONS.map(o => o.value)).toEqual(TURN_TIMER_VALUES);
        expect(TURN_TIMER_OPTIONS.every(o => o.label.length > 0)).toBe(true);
    });

    it('refuses a plausible-looking timer that is not on the ladder', () => {
        // The one that mattered: parseTurnTimerMs answers 0 for an unknown
        // timer and isExpired compares against that, so a game created with
        // "2h" had every turn expire on the timer cron's first pass and was
        // abandoned three passes later.
        expect(isValidTurnTimer('2h')).toBe(false);
        expect(isExpired(new Date().toISOString(), '2h')).toBe(true);
    });

    it('refuses junk and non-strings', () => {
        expect(isValidTurnTimer('')).toBe(false);
        expect(isValidTurnTimer(undefined)).toBe(false);
        expect(isValidTurnTimer(null)).toBe(false);
        expect(isValidTurnTimer(600000)).toBe(false);
        expect(isValidTurnTimer({ toString: () => '1h' })).toBe(false);
    });
});

// A game whose current turn started `elapsedMs` ago — the only thing either of
// the two suites below varies, so they share the one builder.
const game = (turnTimer: string, elapsedMs: number, warned = false): ITurnTimerState => ({
    turnTimer,
    lastTurnTimestamp: new Date(Date.now() - elapsedMs).toISOString(),
    timerWarningNotificationSent: warned,
});

// The ladder without the unlimited timer: the timers that actually count, and
// so the only ones with a boundary to sit on.
const COUNTED_TIMERS = TURN_TIMER_VALUES.filter(timer => timer !== UNLIMITED_TURN_TIMER);

describe('needsSweeping', () => {
    it('has nothing to do for a turn that has only just started', () => {
        expect(needsSweeping(game('1h', 60 * 1000))).toBe(false);
    });

    it('warns once and then leaves the turn alone until it expires', () => {
        // The 1-hour timer warns with 12 minutes left (its 20% ratio).
        expect(needsSweeping(game('1h', 50 * 60 * 1000))).toBe(true);
        expect(needsSweeping(game('1h', 50 * 60 * 1000, true))).toBe(false);
    });

    it('acts on an expired turn even once the warning has been sent', () => {
        expect(needsSweeping(game('1h', 61 * 60 * 1000, true))).toBe(true);
    });

    it('has nothing to do for an unlimited timer, however long the turn runs', () => {
        expect(needsSweeping(game(UNLIMITED_TURN_TIMER, 30 * 24 * 60 * 60 * 1000))).toBe(false);
    });
});

describe('actionableTurnFilter', () => {
    // The cron's candidate read hands this to Mongo; this is the same
    // comparison Mongo would make of it — one $or branch per timer, each an
    // equality on turnTimer and an upper bound on lastTurnTimestamp.
    const matches = (branches: ActionableTurnBranch[], game: ITurnTimerState): boolean =>
        branches.some(branch =>
            branch.turnTimer === game.turnTimer
            && game.lastTurnTimestamp <= branch.lastTurnTimestamp.$lte);


    // The clock is frozen because the cases below sit exactly on the timers'
    // boundaries: the filter's bounds and needsSweeping each read the clock
    // for themselves, so on a live clock a game right on a boundary answers
    // one way to the first and the other way to the second. In the cron that
    // costs a game one tick's wait; here it would make the assertions a
    // coin toss.
    beforeEach(() => vi.useFakeTimers({ now: new Date('2026-08-25T12:00:00.000Z') }));
    afterEach(() => vi.useRealTimers());

    it('asks for every timer on the ladder, and never for an unlimited game', () => {
        const asked = actionableTurnFilter().$or.map(branch => branch.turnTimer);
        expect(asked.sort()).toEqual([...COUNTED_TIMERS].sort());
    });

    it('never leaves out a game the sweep would have acted on', () => {
        // The whole point of the filter: it may be looser than needsSweeping —
        // that only costs a candidate the loop then skips — but it must never
        // be tighter, or a game that needed warning or expiring is never read.
        const branches = actionableTurnFilter().$or;

        for (const turnTimer of TURN_TIMER_VALUES) {
            const total = parseTurnTimerMs(turnTimer);
            const warning = warningThresholdMs(turnTimer);
            const elapsedCases = [
                0, 1000, total - warning - 1000, total - warning, total - warning + 1000,
                total - 1000, total, total + 1000, total * 3,
            ];

            for (const elapsedMs of elapsedCases) {
                for (const warned of [false, true]) {
                    const candidate = game(turnTimer, elapsedMs, warned);
                    if (needsSweeping(candidate)) {
                        expect(matches(branches, candidate), `${turnTimer} at ${elapsedMs}ms was left out`).toBe(true);
                    }
                }
            }
        }
    });

    it('leaves out a turn too young for its own timer to have anything to say', () => {
        // What the per-timer bounds buy over the one cutoff this replaced: a
        // 7-day game whose turn started an hour ago is no longer even read,
        // where before it was read in full every tick.
        const branches = actionableTurnFilter().$or;

        for (const turnTimer of COUNTED_TIMERS) {
            const tooYoung = game(turnTimer, parseTurnTimerMs(turnTimer) - warningThresholdMs(turnTimer) - 1000);
            expect(needsSweeping(tooYoung), `${turnTimer} was actionable too early`).toBe(false);
            expect(matches(branches, tooYoung), `${turnTimer} was read too early`).toBe(false);
        }
    });
});
