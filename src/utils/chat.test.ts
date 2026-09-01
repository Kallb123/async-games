import { describe, expect, it } from 'vitest';
import { MAX_MESSAGE_LENGTH, normaliseMessage, normaliseReadAt } from './chat';

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

// normaliseReadAt is the marker route's gate (docs/in-game-chat.md §13.4):
// everything it rejects, the route rejects with a 400, and everything it
// returns is what actually gets applied with $max.
describe('normaliseReadAt', () => {
    it('keeps a valid ISO timestamp', () => {
        expect(normaliseReadAt('2026-09-01T12:00:00.000Z')).toBe('2026-09-01T12:00:00.000Z');
    });

    it('canonicalises a parseable but non-ISO date string', () => {
        expect(normaliseReadAt('2026-09-01')).toBe('2026-09-01T00:00:00.000Z');
    });

    it('rejects a non-string', () => {
        expect(normaliseReadAt(undefined)).toBeNull();
        expect(normaliseReadAt(null)).toBeNull();
        expect(normaliseReadAt(1_756_728_000_000)).toBeNull();
        expect(normaliseReadAt({ readAt: '2026-09-01T12:00:00.000Z' })).toBeNull();
        expect(normaliseReadAt(['2026-09-01T12:00:00.000Z'])).toBeNull();
    });

    it('rejects an empty string', () => {
        expect(normaliseReadAt('')).toBeNull();
    });

    it('rejects a string that does not parse as a date', () => {
        expect(normaliseReadAt('not a date')).toBeNull();
        expect(normaliseReadAt('gg wp')).toBeNull();
    });

    it('rejects a year outside the ordinary four-digit range', () => {
        // Date happily parses these, but toISOString() gives them a sign and
        // extra digits (the ECMA-262 "extended year" form), which sorts
        // lexically *before* every ordinary timestamp — backwards for both the
        // route's clamp-to-now compare and Mongo's $max. Reject rather than
        // canonicalise something the fixed-width form can't represent.
        expect(normaliseReadAt('10000-01-01')).toBeNull();
        expect(normaliseReadAt('-000001-01-01')).toBeNull();
    });
});
