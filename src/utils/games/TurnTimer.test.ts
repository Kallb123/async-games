import { describe, expect, it } from 'vitest';
import { MAX_CONSECUTIVE_MISSED_TURNS, hasAbandonedGame } from './TurnTimer';

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
