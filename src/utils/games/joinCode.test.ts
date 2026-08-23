import { describe, expect, it } from 'vitest';
import { JOIN_CODE_ALPHABET, buildJoinHref, generateJoinCode, normaliseJoinCode, readJoinCode } from './joinCode';

describe('JOIN_CODE_ALPHABET', () => {
    it('excludes every ambiguous glyph', () => {
        for (const glyph of ['I', 'O', '0', '1']) {
            expect(JOIN_CODE_ALPHABET).not.toContain(glyph);
        }
    });

    it('has no duplicate symbols', () => {
        expect(new Set(JOIN_CODE_ALPHABET).size).toBe(JOIN_CODE_ALPHABET.length);
    });

    it('is all uppercase', () => {
        expect(JOIN_CODE_ALPHABET).toBe(JOIN_CODE_ALPHABET.toUpperCase());
    });
});

describe('normaliseJoinCode', () => {
    it('uppercases lowercase input', () => {
        expect(normaliseJoinCode('plum')).toBe('PLUM');
    });

    it('strips internal and surrounding whitespace', () => {
        expect(normaliseJoinCode('pl um')).toBe('PLUM');
        expect(normaliseJoinCode(' PLUM ')).toBe('PLUM');
    });

    it('is idempotent', () => {
        for (const input of ['plum', 'pl um', ' PLUM ', 'PlUm']) {
            const once = normaliseJoinCode(input);
            expect(normaliseJoinCode(once)).toBe(once);
        }
    });
});

describe('generateJoinCode', () => {
    it('always normalises to itself', () => {
        for (let i = 0; i < 50; i++) {
            const code = generateJoinCode();
            expect(normaliseJoinCode(code)).toBe(code);
        }
    });

    it('only uses symbols from the alphabet', () => {
        for (let i = 0; i < 50; i++) {
            for (const char of generateJoinCode()) {
                expect(JOIN_CODE_ALPHABET).toContain(char);
            }
        }
    });
});

describe('the join link', () => {
    it('round-trips a generated code', () => {
        for (let i = 0; i < 50; i++) {
            const code = generateJoinCode();
            const href = buildJoinHref(code);
            expect(readJoinCode(new URLSearchParams(href.split('?')[1]))).toBe(code);
        }
    });

    it('points at the /join screen', () => {
        expect(buildJoinHref('PLUM')).toBe('/join?code=PLUM');
    });

    it('normalises the code it reads, so a hand-typed link still works', () => {
        expect(readJoinCode(new URLSearchParams('code=plum'))).toBe('PLUM');
        expect(readJoinCode(new URLSearchParams('code=pl+um'))).toBe('PLUM');
    });

    it('reads an empty code when the link carries none', () => {
        expect(readJoinCode(new URLSearchParams(''))).toBe('');
        expect(readJoinCode(new URLSearchParams('code='))).toBe('');
    });
});
