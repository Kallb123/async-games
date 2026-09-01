import { describe, expect, it } from 'vitest';
import { MAX_MESSAGE_LENGTH, normaliseMessage } from './chat';

// normaliseMessage is the single gate the composer and the POST route share, so
// it earns a direct test: everything it rejects, the route rejects, and
// everything it reshapes is what actually gets stored. See docs/in-game-chat.md
// §4 and §12 (the checklist that names these cases).
describe('normaliseMessage', () => {
    it('keeps a plain message, trimmed', () => {
        expect(normaliseMessage('  gg wp  ')).toBe('gg wp');
    });

    it('rejects a non-string', () => {
        expect(normaliseMessage(undefined)).toBeNull();
        expect(normaliseMessage(null)).toBeNull();
        expect(normaliseMessage(42)).toBeNull();
        expect(normaliseMessage({ text: 'hi' })).toBeNull();
        expect(normaliseMessage(['hi'])).toBeNull();
    });

    it('rejects an empty message', () => {
        expect(normaliseMessage('')).toBeNull();
    });

    it('rejects a message that is only whitespace', () => {
        expect(normaliseMessage('   ')).toBeNull();
        expect(normaliseMessage('\n\n\t  \n')).toBeNull();
    });

    it('keeps a message exactly at the limit', () => {
        const atLimit = 'a'.repeat(MAX_MESSAGE_LENGTH);
        expect(normaliseMessage(atLimit)).toBe(atLimit);
    });

    it('rejects a message over the limit after trimming', () => {
        expect(normaliseMessage('a'.repeat(MAX_MESSAGE_LENGTH + 1))).toBeNull();
    });

    it('measures the length after trimming, not before', () => {
        const padded = `  ${'a'.repeat(MAX_MESSAGE_LENGTH)}  `;
        expect(normaliseMessage(padded)).toBe('a'.repeat(MAX_MESSAGE_LENGTH));
    });

    it('collapses a run of blank lines down to a single blank line', () => {
        expect(normaliseMessage('one\n\n\n\ntwo')).toBe('one\n\ntwo');
    });

    it('collapses blank lines even when they carry whitespace', () => {
        expect(normaliseMessage('one\n \n\t\ntwo')).toBe('one\n\ntwo');
    });

    it('leaves a single line break inside a message alone', () => {
        expect(normaliseMessage('one\ntwo')).toBe('one\ntwo');
    });
});
