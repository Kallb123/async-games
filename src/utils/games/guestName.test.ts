import { describe, expect, it } from 'vitest';
import { MAX_GUEST_NAME_LENGTH, isValidGuestName, randomGuestName, uniqueGuestName } from './guestName';

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

describe('randomGuestName', () => {
    it('always produces a valid guest name', () => {
        for (let i = 0; i < 100; i++) {
            expect(isValidGuestName(randomGuestName())).toBe(true);
        }
    });

    it('is an Adjective+Animal pairing (two capitalised words run together)', () => {
        for (let i = 0; i < 100; i++) {
            expect(randomGuestName()).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+$/);
        }
    });

    it('prefers alliteration', () => {
        let alliterative = 0;
        const attempts = 200;
        for (let i = 0; i < attempts; i++) {
            const name = randomGuestName();
            const secondCapital = name.slice(1).search(/[A-Z]/) + 1;
            if (name[0] === name[secondCapital]) {
                alliterative++;
            }
        }
        // Every animal in the list has at least one matching-letter
        // adjective, so alliteration should dominate, not just edge out chance.
        expect(alliterative / attempts).toBeGreaterThan(0.8);
    });

    it('avoids names already in the exclude list', () => {
        const seen = new Set<string>();
        for (let i = 0; i < 30; i++) {
            const name = randomGuestName([...seen]);
            expect(seen.has(name)).toBe(false);
            seen.add(name);
        }
    });
});
