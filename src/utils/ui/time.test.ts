import { describe, expect, it } from 'vitest';
import { ACTIVE_WINDOW_MS, isRecentlyActive } from './time';

// The green dot on the friends list is this predicate and nothing else, so the
// edges of the window are what's worth pinning down — including the two that
// aren't about elapsed time at all: a clock the reader doesn't have yet, and a
// friend who has never taken a turn.
describe('isRecentlyActive', () => {
    const now = Date.parse('2026-09-02T12:00:00.000Z');
    const ago = (ms: number) => new Date(now - ms).toISOString();

    it('is active for an action inside the window', () => {
        expect(isRecentlyActive(ago(0), now)).toBe(true);
        expect(isRecentlyActive(ago(ACTIVE_WINDOW_MS - 1000), now)).toBe(true);
    });

    it('is not active once the window has passed', () => {
        expect(isRecentlyActive(ago(ACTIVE_WINDOW_MS), now)).toBe(false);
        expect(isRecentlyActive(ago(60 * 60 * 1000), now)).toBe(false);
    });

    // The stamp is the server's clock and `now` is the reader's; a browser
    // running slow shouldn't hide the dot on the friend who just moved.
    it('is active for a timestamp slightly ahead of the reader', () => {
        expect(isRecentlyActive(new Date(now + 30 * 1000).toISOString(), now)).toBe(true);
    });

    it('is not active without a friend to judge or a clock to judge by', () => {
        expect(isRecentlyActive(null, now)).toBe(false);
        expect(isRecentlyActive(undefined, now)).toBe(false);
        expect(isRecentlyActive('not a timestamp', now)).toBe(false);
        expect(isRecentlyActive(ago(0), null)).toBe(false);
    });
});
