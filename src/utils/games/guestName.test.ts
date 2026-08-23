import { describe, expect, it } from 'vitest';
import { MAX_GUEST_NAME_LENGTH, isValidGuestName, uniqueGuestName } from './guestName';

describe('isValidGuestName', () => {
    it('accepts an ordinary name', () => {
        expect(isValidGuestName('Dave')).toBe(true);
    });

    it('accepts letters, digits, spaces and name punctuation', () => {
        for (const name of ["O'Brien", 'Anne-Marie', 'Player 2', 'José', 'ダン']) {
            expect(isValidGuestName(name)).toBe(true);
        }
    });

    it('rejects an empty name', () => {
        expect(isValidGuestName('')).toBe(false);
    });

    it('rejects a name over the length limit', () => {
        expect(isValidGuestName('a'.repeat(MAX_GUEST_NAME_LENGTH))).toBe(true);
        expect(isValidGuestName('a'.repeat(MAX_GUEST_NAME_LENGTH + 1))).toBe(false);
    });

    it('rejects markup-shaped or control characters', () => {
        for (const name of ['<script>', 'Dave;drop', 'Dave\n', 'Dave\t', 'a/b']) {
            expect(isValidGuestName(name)).toBe(false);
        }
    });
});

describe('uniqueGuestName', () => {
    it('leaves a name alone when nobody else has it', () => {
        expect(uniqueGuestName('Dave', ['Amy'])).toBe('Dave');
    });

    it('suffixes a second claim of the same name', () => {
        expect(uniqueGuestName('Dave', ['Dave'])).toBe('Dave (2)');
    });

    it('keeps counting up past a taken suffix', () => {
        expect(uniqueGuestName('Dave', ['Dave', 'Dave (2)'])).toBe('Dave (3)');
    });

    it('is empty-list safe', () => {
        expect(uniqueGuestName('Dave', [])).toBe('Dave');
    });
});
