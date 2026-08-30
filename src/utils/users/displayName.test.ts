import { describe, expect, it } from 'vitest';
import { MAX_DISPLAY_NAME_LENGTH, isValidDisplayName } from './displayName';

describe('isValidDisplayName', () => {
    it('accepts an ordinary name', () => {
        expect(isValidDisplayName('Dave')).toBe(true);
    });

    it('accepts letters, digits, spaces and name punctuation', () => {
        for (const name of ["O'Brien", 'Anne-Marie', 'Player 2', 'José', 'ダン']) {
            expect(isValidDisplayName(name)).toBe(true);
        }
    });

    it('rejects an empty name', () => {
        expect(isValidDisplayName('')).toBe(false);
    });

    it('rejects a name over the length limit', () => {
        expect(isValidDisplayName('a'.repeat(MAX_DISPLAY_NAME_LENGTH))).toBe(true);
        expect(isValidDisplayName('a'.repeat(MAX_DISPLAY_NAME_LENGTH + 1))).toBe(false);
    });

    it('rejects markup-shaped or control characters', () => {
        for (const name of ['<script>', 'Dave;drop', 'Dave\n', 'Dave\t', 'a/b']) {
            expect(isValidDisplayName(name)).toBe(false);
        }
    });
});
