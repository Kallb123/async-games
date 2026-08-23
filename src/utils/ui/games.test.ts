import { describe, expect, it } from 'vitest';
import { GAME_META, partySizeErrorMessage } from './games';

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
