import { describe, expect, it } from 'vitest';
import {
    MAX_CONSECUTIVE_MISSED_TURNS,
    SHORTEST_ACTIONABLE_ELAPSED_MS,
    TURN_TIMER_OPTIONS,
    TURN_TIMER_VALUES,
    formatRemainingUntil,
    hasAbandonedGame,
    isExpired,
    isValidTurnTimer,
    isWarningThreshold,
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

describe('SHORTEST_ACTIONABLE_ELAPSED_MS', () => {
    it('is short enough that no timer has anything to say before it', () => {
        // The turntimer cron skips games whose turn started more recently than
        // this, so it must be under every timer's expiry *and* its warning.
        const justUnder = new Date(Date.now() - SHORTEST_ACTIONABLE_ELAPSED_MS + 1000).toISOString();
        for (const timer of TURN_TIMER_VALUES) {
            expect(isExpired(justUnder, timer), `${timer} expired too early`).toBe(false);
            expect(isWarningThreshold(justUnder, timer), `${timer} warned too early`).toBe(false);
        }
    });
});
