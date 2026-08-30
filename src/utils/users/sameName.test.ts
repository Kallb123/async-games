import { describe, expect, it } from 'vitest';
import { sameName } from './sameName';

/** Reads better than comparing two keys by hand. */
const same = (a: string, b: string) => sameName(a) === sameName(b);

describe('sameName', () => {
    it('is the same name in a different case', () => {
        expect(same('Dave', 'dave')).toBe(true);
        expect(same('DAVE', 'Dave')).toBe(true);
    });

    it('is the same name spaced or punctuated differently', () => {
        expect(same('Dave', 'D a v e')).toBe(true);
        expect(same('Dave', 'D.a.v.e')).toBe(true);
        expect(same('Anne-Marie', 'Anne Marie')).toBe(true);
        expect(same('Dave ', ' Dave')).toBe(true);
    });

    it('is the same name with the accents taken off', () => {
        expect(same('José', 'Jose')).toBe(true);
    });

    it('is the same name drawn in another script', () => {
        // The attack this exists for: a Cyrillic "а" (U+0430) renders as a
        // Latin one, so "Dаve" and "Dave" are one name to every reader.
        expect(same('Dave', 'Dаve')).toBe(true);
        expect(same('Dave', 'ԁаᴠе')).toBe(true);
        // Greek ο, ρ and α for o, p and a.
        expect(same('Popa', 'Pορα')).toBe(true);
    });

    it('is the same name in a compatibility form', () => {
        // Full-width letters, which render wider but read the same.
        expect(same('Dave', 'Ｄａｖｅ')).toBe(true);
    });

    it('keeps genuinely different names apart', () => {
        expect(same('Dave', 'Amy')).toBe(false);
        expect(same('Dave', 'Daves')).toBe(false);
        expect(same('Dave', 'Dav')).toBe(false);
    });

    it('keeps a lobby-suffixed name apart from the one it was suffixed from', () => {
        // The digit survives the fold, so the lobby's own uniquifying is not
        // undone by it — "Dave (2)" is a different name from "Dave".
        expect(same('Dave', 'Dave (2)')).toBe(false);
        expect(same('Dave (2)', 'Dave (3)')).toBe(false);
    });

    it('leaves a name in a script of its own alone', () => {
        expect(same('ダンダン', 'ダンダン')).toBe(true);
        expect(same('ダンダン', 'Dave')).toBe(false);
    });
});
