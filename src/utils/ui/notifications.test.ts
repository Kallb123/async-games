import { describe, expect, it } from 'vitest';
import { NOTIFICATION_MISS_LINE, notificationBlockerLine, type NotificationBlocker } from './notifications';

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
