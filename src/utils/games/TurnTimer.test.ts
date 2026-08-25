import { describe, expect, it } from 'vitest';
import { MAX_CONSECUTIVE_MISSED_TURNS, formatRemainingUntil, hasAbandonedGame } from './TurnTimer';

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
