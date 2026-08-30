import { describe, expect, it } from 'vitest';
import { MAX_USERNAME_LENGTH, MIN_USERNAME_LENGTH, isValidUsername, slugifyUsername } from './username';

describe('isValidUsername', () => {
    it('accepts an ordinary handle', () => {
        expect(isValidUsername('dave')).toBe(true);
    });

    it('accepts letters, digits, underscores and hyphens', () => {
        for (const handle of ['Dave99', 'dave_smith', 'anne-marie', '____']) {
            expect(isValidUsername(handle)).toBe(true);
        }
    });

    it('rejects an empty handle', () => {
        expect(isValidUsername('')).toBe(false);
    });

    it('holds Clerk to its length bounds at both ends', () => {
        expect(isValidUsername('a'.repeat(MIN_USERNAME_LENGTH - 1))).toBe(false);
        expect(isValidUsername('a'.repeat(MIN_USERNAME_LENGTH))).toBe(true);
        expect(isValidUsername('a'.repeat(MAX_USERNAME_LENGTH))).toBe(true);
        expect(isValidUsername('a'.repeat(MAX_USERNAME_LENGTH + 1))).toBe(false);
    });

    it('rejects what a display name allows but a handle does not', () => {
        // isValidDisplayName takes all of these; a Clerk handle takes none of
        // them, which is why the two validators are separate rules.
        for (const handle of ['Dave Smith', "O'Brien", 'dave.smith', 'ダンダン']) {
            expect(isValidUsername(handle)).toBe(false);
        }
    });

    it('rejects markup-shaped or control characters', () => {
        for (const handle of ['<script>', 'dave;drop', 'dave\n', 'dave\t', 'a/bc']) {
            expect(isValidUsername(handle)).toBe(false);
        }
    });
});

describe('slugifyUsername', () => {
    it('lowercases and joins a typed name on underscores', () => {
        expect(slugifyUsername('Dave Smith')).toBe('dave_smith');
    });

    it('drops the punctuation a real name carries', () => {
        expect(slugifyUsername("O'Brien")).toBe('o_brien');
    });

    it('trims the underscores a leading or trailing run would leave', () => {
        expect(slugifyUsername('  Dave!  ')).toBe('dave');
    });

    it('gives back nothing for a name with no usable characters', () => {
        // availableUsernameFrom falls back to "player" on this — the slug
        // itself has nothing to offer.
        expect(slugifyUsername('ダン')).toBe('');
    });

    it('caps a very long name at the handle limit', () => {
        expect(slugifyUsername('a'.repeat(MAX_USERNAME_LENGTH + 20))).toHaveLength(MAX_USERNAME_LENGTH);
    });

    it('produces something isValidUsername accepts, once padded', () => {
        const slug = slugifyUsername('Jo');
        expect(isValidUsername(slug.padEnd(MIN_USERNAME_LENGTH, '0'))).toBe(true);
    });
});
