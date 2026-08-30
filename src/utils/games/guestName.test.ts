import { describe, expect, it } from 'vitest';
import { randomGuestName, uniqueGuestName } from './guestName';
import { MAX_DISPLAY_NAME_LENGTH, isValidDisplayName } from '@/utils/users/displayName';

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

    it('keeps a suffixed name inside the display-name rule', () => {
        // What it returns is stored as the guest's display name, so a guest
        // taking the longest allowed name must not be seated under one their
        // own profile editor would then refuse to save.
        const longest = 'a'.repeat(MAX_DISPLAY_NAME_LENGTH);
        const suffixed = uniqueGuestName(longest, [longest]);

        expect(suffixed).not.toBe(longest);
        expect(isValidDisplayName(suffixed)).toBe(true);
    });

    it('still counts up when the suffix has eaten into the name', () => {
        const longest = 'a'.repeat(MAX_DISPLAY_NAME_LENGTH);
        const taken = [longest, uniqueGuestName(longest, [longest])];

        const third = uniqueGuestName(longest, taken);
        expect(taken).not.toContain(third);
        expect(isValidDisplayName(third)).toBe(true);
    });
});

describe('randomGuestName', () => {
    it('always produces a valid display name', () => {
        for (let i = 0; i < 100; i++) {
            expect(isValidDisplayName(randomGuestName())).toBe(true);
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
