import { describe, expect, it } from 'vitest';
import { ACTIVE_WINDOW_MS, formatDayMonth, formatTimeAgo, isRecentlyActive } from './time';

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

// Stands in for Moment's fromNow() on invites, friend requests and results, so
// the cut-offs where the wording changes are what's worth pinning down.
describe('formatTimeAgo', () => {
    const now = Date.parse('2026-09-02T12:00:00.000Z');
    const SECOND = 1000;
    const MINUTE = 60 * SECOND;
    const HOUR = 60 * MINUTE;
    const DAY = 24 * HOUR;
    const ago = (ms: number) => new Date(now - ms).toISOString();

    it('reads anything under 45 seconds as just now', () => {
        expect(formatTimeAgo(ago(0), now)).toBe('just now');
        expect(formatTimeAgo(ago(44 * SECOND), now)).toBe('just now');
    });

    it('reads a clock slightly ahead of the reader as just now', () => {
        expect(formatTimeAgo(new Date(now + 30 * SECOND).toISOString(), now)).toBe('just now');
    });

    it('counts minutes up to 45 of them', () => {
        expect(formatTimeAgo(ago(45 * SECOND), now)).toBe('1 minute ago');
        expect(formatTimeAgo(ago(5 * MINUTE), now)).toBe('5 minutes ago');
        expect(formatTimeAgo(ago(44 * MINUTE), now)).toBe('44 minutes ago');
    });

    it('counts hours from 45 minutes to 21 hours', () => {
        expect(formatTimeAgo(ago(45 * MINUTE), now)).toBe('1 hour ago');
        expect(formatTimeAgo(ago(3 * HOUR), now)).toBe('3 hours ago');
        expect(formatTimeAgo(ago(21 * HOUR), now)).toBe('21 hours ago');
    });

    it('says yesterday for a day, then counts days', () => {
        expect(formatTimeAgo(ago(22 * HOUR), now)).toBe('yesterday');
        expect(formatTimeAgo(ago(30 * HOUR), now)).toBe('yesterday');
        expect(formatTimeAgo(ago(3 * DAY), now)).toBe('3 days ago');
        expect(formatTimeAgo(ago(25 * DAY), now)).toBe('25 days ago');
    });

    it('moves on to months and then years', () => {
        expect(formatTimeAgo(ago(26 * DAY), now)).toBe('last month');
        expect(formatTimeAgo(ago(90 * DAY), now)).toBe('3 months ago');
        expect(formatTimeAgo(ago(319 * DAY), now)).toBe('10 months ago');
        expect(formatTimeAgo(ago(320 * DAY), now)).toBe('last year');
        expect(formatTimeAgo(ago(3 * 365 * DAY), now)).toBe('3 years ago');
    });

    it('accepts a number or a Date as well as an ISO string', () => {
        expect(formatTimeAgo(now - 2 * HOUR, now)).toBe('2 hours ago');
        expect(formatTimeAgo(new Date(now - 2 * HOUR), now)).toBe('2 hours ago');
    });

    it('reads an unparseable timestamp as empty', () => {
        expect(formatTimeAgo('not a date', now)).toBe('');
    });
});

describe('formatDayMonth', () => {
    it('writes the day then the short month, however the locale would', () => {
        // Local noon, so the calendar day is the same in every time zone.
        expect(formatDayMonth(new Date(2026, 9, 5, 12))).toBe('5 Oct');
        expect(formatDayMonth(new Date(2026, 8, 17, 12))).toBe('17 Sep');
    });

    it('reads an unparseable timestamp as empty', () => {
        expect(formatDayMonth('nope')).toBe('');
    });
});
