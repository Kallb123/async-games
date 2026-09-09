import { describe, expect, it } from 'vitest';
import { NOTIFICATION_MISS_LINE, notificationBlocker, notificationBlockerLine, type NotificationBlocker } from './notifications';

const BLOCKERS: NotificationBlocker[] = ['unsupported', 'unasked', 'blocked', 'unregistered'];

describe('notificationBlockerLine', () => {
    it('says something specific for every blocker', () => {
        // The footer and the declined-prompt popup both render whichever line
        // comes back, so a blocker with no copy would be an empty warning.
        for (const blocker of BLOCKERS) {
            expect(notificationBlockerLine(blocker).length).toBeGreaterThan(20);
        }
        expect(new Set(BLOCKERS.map(notificationBlockerLine)).size).toBe(BLOCKERS.length);
    });

    it('names the settings a blocked browser has to be fixed from', () => {
        // Outside the native shell this is the browser's own site settings —
        // nothing the app can offer a button for.
        expect(notificationBlockerLine('blocked')).toContain('site settings');
    });
});

describe('NOTIFICATION_MISS_LINE', () => {
    it('leads with the consequence rather than the setting', () => {
        expect(NOTIFICATION_MISS_LINE).toContain("your turn");
    });
});

describe('notificationBlocker', () => {
    it('says nothing to a visitor with no account', () => {
        // No games, so no turns to miss — and no reason to warn someone who is
        // still deciding whether to sign up.
        expect(notificationBlocker(false, 'denied', 'idle')).toBeNull();
        expect(notificationBlocker(false, 'default', 'idle')).toBeNull();
    });

    it('says nothing while the answer is still unknown', () => {
        // What the server renders, and what the native shell reports until the
        // Capacitor bridge answers. Warning here would flash at a device that
        // is about to say it's fine.
        expect(notificationBlocker(true, 'checking', 'registering')).toBeNull();
    });

    it('names the missing precondition', () => {
        expect(notificationBlocker(true, 'unsupported', 'idle')).toBe('unsupported');
        expect(notificationBlocker(true, 'default', 'idle')).toBe('unasked');
        expect(notificationBlocker(true, 'denied', 'idle')).toBe('blocked');
    });

    it('treats a granted permission with no registration as a blocker of its own', () => {
        // The whole reason this is not just a permission read: a device that
        // was allowed to show notifications and never got a token looks fine
        // and hears nothing.
        expect(notificationBlocker(true, 'granted', 'no-token')).toBe('unregistered');
        expect(notificationBlocker(true, 'granted', 'not-saved')).toBe('unregistered');
    });

    it('is happy once permission is granted and the device registered', () => {
        expect(notificationBlocker(true, 'granted', 'registered')).toBeNull();
        // Still trying is not a failure — a warning here would appear on every
        // load and then vanish.
        expect(notificationBlocker(true, 'granted', 'registering')).toBeNull();
    });
});
