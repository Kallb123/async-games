import { describe, expect, it } from 'vitest';
import { GAME_META } from './games';
import { WHATS_NEW, WHATS_NEW_FEATURED } from './whatsNew';

// The cap AGENTS.md asks an author to keep: drop the oldest line once a group
// runs past ten. It used to enforce itself — an eleventh full row was a visible
// wall of paragraphs — but the compact tail makes an over-long group quiet, so
// the rule needs a test rather than an author noticing.
const MAX_ITEMS_PER_GROUP = 10;

describe('WHATS_NEW', () => {
    it('has groups to check', () => {
        expect(WHATS_NEW.length).toBeGreaterThan(0);
        expect(WHATS_NEW.every(group => group.items.length > 0)).toBe(true);
    });

    it('keeps every group inside the cap', () => {
        for (const group of WHATS_NEW) {
            expect(
                group.items.length,
                `"${group.label}" has ${group.items.length} lines — drop the oldest`,
            ).toBeLessThanOrEqual(MAX_ITEMS_PER_GROUP);
        }
    });

    it('names a game the library actually has', () => {
        for (const group of WHATS_NEW) {
            for (const item of group.items) {
                if (item.game !== undefined) {
                    expect(GAME_META[item.game], `"${item.title}" → ${item.game}`).toBeDefined();
                }
            }
        }
    });

    it('features fewer items than a group holds, so the compact tier is reachable', () => {
        expect(WHATS_NEW_FEATURED).toBeGreaterThan(0);
        expect(WHATS_NEW_FEATURED).toBeLessThan(MAX_ITEMS_PER_GROUP);
    });
});
