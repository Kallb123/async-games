import { describe, expect, it } from 'vitest';
import { GAME_META, partySizeErrorMessage, partySizeRange } from './games';

describe('partySizeErrorMessage', () => {
    const meta = { name: 'Dice Cities', players: '2–6 players', minPlayers: 2, maxPlayers: 6 };

    it('accepts a party inside the bounds, at either edge', () => {
        expect(partySizeErrorMessage(meta, 2)).toBeNull();
        expect(partySizeErrorMessage(meta, 4)).toBeNull();
        expect(partySizeErrorMessage(meta, 6)).toBeNull();
    });

    it('rejects a party outside them, phrased for the player', () => {
        expect(partySizeErrorMessage(meta, 1)).toBe('Dice Cities supports 2–6 players');
        expect(partySizeErrorMessage(meta, 7)).toBe('Dice Cities supports 2–6 players');
    });

    it('takes a real GameMeta — the host plus one is a party of two', () => {
        expect(partySizeErrorMessage(GAME_META.dicecities, 2)).toBeNull();
    });
});

describe('partySizeRange', () => {
    it('reads the bounds off the numbers, not off the display copy', () => {
        // The two used to be the same string, so `players` was quoted directly.
        // They part company for a game with a mode that skips the invite flow:
        // Fires Out's card says "1–6 players" because you can play it alone,
        // while the crew game it invites you to is 2-6 — and quoting `players`
        // told a host of one that their party was supported while the button
        // refusing them said otherwise.
        expect(partySizeRange(GAME_META.firesout)).toBe('2–6 players');
        expect(GAME_META.firesout.players).toBe('1–6 players');
        expect(partySizeErrorMessage(GAME_META.firesout, 1)).toBe('Fires Out! supports 2–6 players');
    });

    it('says "1 player" rather than "1–1 players" for a game that only ever has one', () => {
        expect(partySizeRange(GAME_META.solitaire)).toBe('1 player');
    });

    it('matches the display copy for every game whose modes all go through the invite flow', () => {
        for (const [slug, meta] of Object.entries(GAME_META)) {
            if (slug === 'firesout') continue; // the one game the two deliberately differ for
            expect(partySizeRange(meta), slug).toBe(meta.players.replace('-', '–'));
        }
    });
});
