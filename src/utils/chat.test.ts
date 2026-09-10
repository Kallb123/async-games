import { describe, expect, it } from 'vitest';
import {
    MAX_MESSAGE_LENGTH, isAllowedGifMediaUrl, normaliseAttachment, normaliseGifRef,
    normaliseMessage, normaliseMessageBody, normaliseReadAt
} from './chat';

// `normaliseMessageBody` is the gate the composer and the POST route share, and
// `normaliseMessage` is the half of it that decides what a line of text becomes
// — every caller now arrives through the former, but the text rules are what
// actually get applied, so they earn a direct test: everything it rejects, the
// route rejects, and everything it reshapes is what gets stored. See
// docs/in-game-chat.md §4 and §12 (the checklist that names these cases).
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

// The GIF gates (docs/chat-gifs.md §4). These matter more than most validators
// in the app, because the design's whole security claim is that a player cannot
// choose what a GIF *is* — only which catalogue id to look up. Every test below
// is a way somebody might try to widen that.

/** A well-formed row, as the search route would have written it. */
function catalogueRow(overrides: Record<string, unknown> = {}) {
    return {
        provider: 'tenor',
        mediaId: 'abc123',
        url: 'https://media.tenor.com/abc123/cat.gif',
        stillUrl: 'https://media.tenor.com/abc123/cat.png',
        width: 320,
        height: 240,
        alt: 'a cat falling off a table',
        ...overrides,
    };
}

describe('normaliseGifRef', () => {
    it('keeps a well-formed reference', () => {
        expect(normaliseGifRef({ provider: 'tenor', mediaId: 'abc123' }))
            .toEqual({ provider: 'tenor', mediaId: 'abc123' });
    });

    it('drops anything else on the object — a ref is two fields, not a passthrough', () => {
        // The point of the whole design: a client that sends a URL alongside the
        // id doesn't get to influence what gets stored.
        expect(normaliseGifRef({
            provider: 'tenor',
            mediaId: 'abc123',
            url: 'https://evil.example/tracker.gif',
            width: 99999,
        })).toEqual({ provider: 'tenor', mediaId: 'abc123' });
    });

    it('rejects a non-object', () => {
        expect(normaliseGifRef(undefined)).toBeNull();
        expect(normaliseGifRef(null)).toBeNull();
        expect(normaliseGifRef('tenor:abc123')).toBeNull();
        expect(normaliseGifRef(42)).toBeNull();
        expect(normaliseGifRef([{ provider: 'tenor', mediaId: 'abc123' }])).toBeNull();
    });

    it('rejects an unknown provider', () => {
        expect(normaliseGifRef({ provider: 'giphy', mediaId: 'abc123' })).toBeNull();
        expect(normaliseGifRef({ provider: '', mediaId: 'abc123' })).toBeNull();
        expect(normaliseGifRef({ mediaId: 'abc123' })).toBeNull();
    });

    it('rejects a media id outside the inert charset', () => {
        // An id travels into a Mongo key and an upstream query string; anything
        // that could mean something in either is refused rather than escaped.
        expect(normaliseGifRef({ provider: 'tenor', mediaId: 'abc/../123' })).toBeNull();
        expect(normaliseGifRef({ provider: 'tenor', mediaId: 'abc 123' })).toBeNull();
        expect(normaliseGifRef({ provider: 'tenor', mediaId: 'abc&q=1' })).toBeNull();
        expect(normaliseGifRef({ provider: 'tenor', mediaId: '$ne' })).toBeNull();
    });

    it('rejects an empty, over-long or non-string media id', () => {
        expect(normaliseGifRef({ provider: 'tenor', mediaId: '' })).toBeNull();
        expect(normaliseGifRef({ provider: 'tenor', mediaId: 'a'.repeat(65) })).toBeNull();
        expect(normaliseGifRef({ provider: 'tenor', mediaId: 12345 })).toBeNull();
        expect(normaliseGifRef({ provider: 'tenor', mediaId: { $gt: '' } })).toBeNull();
    });
});

describe('isAllowedGifMediaUrl', () => {
    it('accepts the provider\'s media hosts', () => {
        expect(isAllowedGifMediaUrl('https://media.tenor.com/x/cat.gif', 'tenor')).toBe(true);
        expect(isAllowedGifMediaUrl('https://media3.tenor.com/x/cat.gif', 'tenor')).toBe(true);
    });

    it('compares the whole host, not a suffix', () => {
        // `endsWith('.tenor.com')` says yes to all three of these.
        expect(isAllowedGifMediaUrl('https://media.tenor.com.example.com/x.gif', 'tenor')).toBe(false);
        expect(isAllowedGifMediaUrl('https://evil-media.tenor.com.co/x.gif', 'tenor')).toBe(false);
        expect(isAllowedGifMediaUrl('https://notmedia.tenor.com/x.gif', 'tenor')).toBe(false);
    });

    it('rejects a host that only looks right to a naive parse', () => {
        expect(isAllowedGifMediaUrl('https://evil.example/media.tenor.com/x.gif', 'tenor')).toBe(false);
        expect(isAllowedGifMediaUrl('https://evil.example/#media.tenor.com', 'tenor')).toBe(false);
        expect(isAllowedGifMediaUrl('https://evil.example/?host=media.tenor.com', 'tenor')).toBe(false);
    });

    it('rejects a non-https scheme', () => {
        expect(isAllowedGifMediaUrl('http://media.tenor.com/x/cat.gif', 'tenor')).toBe(false);
        expect(isAllowedGifMediaUrl('data:image/gif;base64,R0lGOD', 'tenor')).toBe(false);
        expect(isAllowedGifMediaUrl('javascript:alert(1)', 'tenor')).toBe(false);
        expect(isAllowedGifMediaUrl('//media.tenor.com/x/cat.gif', 'tenor')).toBe(false);
    });

    it('rejects credentials in the authority, which no CDN handed us', () => {
        // `https://media.tenor.com@evil.example/x.gif` has hostname
        // evil.example — the classic misread this check exists to survive.
        expect(isAllowedGifMediaUrl('https://media.tenor.com@evil.example/x.gif', 'tenor')).toBe(false);
        expect(isAllowedGifMediaUrl('https://user:pw@media.tenor.com/x.gif', 'tenor')).toBe(false);
    });

    it('rejects an explicit port', () => {
        expect(isAllowedGifMediaUrl('https://media.tenor.com:8443/x/cat.gif', 'tenor')).toBe(false);
    });

    it('answers false rather than throwing on something that is not a URL', () => {
        expect(isAllowedGifMediaUrl('not a url', 'tenor')).toBe(false);
        expect(isAllowedGifMediaUrl('', 'tenor')).toBe(false);
        expect(isAllowedGifMediaUrl(undefined, 'tenor')).toBe(false);
        expect(isAllowedGifMediaUrl(42, 'tenor')).toBe(false);
        expect(isAllowedGifMediaUrl(`https://media.tenor.com/${'a'.repeat(3000)}.gif`, 'tenor')).toBe(false);
    });
});

describe('normaliseAttachment', () => {
    it('keeps a well-formed catalogue row', () => {
        expect(normaliseAttachment(catalogueRow())).toEqual(catalogueRow());
    });

    it('reads fields rather than enumerating them, so a document works too', () => {
        // The route hands it a Mongoose document, whose fields come off getters
        // and which carries plenty besides.
        const { url, ...rest } = catalogueRow();
        const document = Object.assign(Object.create({ url }), rest);
        expect(Object.hasOwn(document, 'url')).toBe(false);
        expect(normaliseAttachment(document)?.url).toBe(url);
    });

    it('refuses a row whose media URL is off-host', () => {
        // A row written by an older version of the search route, or one whose
        // host list has since been narrowed, is refused at the point it would
        // reach a browser rather than trusted because it is ours.
        expect(normaliseAttachment(catalogueRow({ url: 'https://evil.example/x.gif' }))).toBeNull();
        expect(normaliseAttachment(catalogueRow({ stillUrl: 'https://evil.example/x.png' }))).toBeNull();
    });

    it('refuses a row with no usable dimensions', () => {
        // Without these the thread can't reserve the row's box, and an arriving
        // GIF reads as a scroll glitch (docs/chat-gifs.md §7).
        expect(normaliseAttachment(catalogueRow({ width: 0 }))).toBeNull();
        expect(normaliseAttachment(catalogueRow({ height: -1 }))).toBeNull();
        expect(normaliseAttachment(catalogueRow({ width: 1.5 }))).toBeNull();
        expect(normaliseAttachment(catalogueRow({ height: 99999 }))).toBeNull();
        expect(normaliseAttachment(catalogueRow({ width: '320' }))).toBeNull();
        expect(normaliseAttachment(catalogueRow({ width: undefined }))).toBeNull();
        expect(normaliseAttachment(catalogueRow({ height: NaN }))).toBeNull();
    });

    it('refuses a row that is not a valid reference in the first place', () => {
        expect(normaliseAttachment(catalogueRow({ provider: 'giphy' }))).toBeNull();
        expect(normaliseAttachment(catalogueRow({ mediaId: '' }))).toBeNull();
        expect(normaliseAttachment(null)).toBeNull();
        expect(normaliseAttachment('a gif')).toBeNull();
    });

    it('degrades a missing or over-long description rather than refusing the GIF', () => {
        // An absent alt is a less accessible image; refusing the message over it
        // would be the worse trade.
        expect(normaliseAttachment(catalogueRow({ alt: undefined }))?.alt).toBe('');
        expect(normaliseAttachment(catalogueRow({ alt: 42 }))?.alt).toBe('');
        expect(normaliseAttachment(catalogueRow({ alt: '  spaced  ' }))?.alt).toBe('spaced');
        expect(normaliseAttachment(catalogueRow({ alt: 'a'.repeat(500) }))?.alt).toHaveLength(200);
    });
});

describe('normaliseMessageBody', () => {
    const gif = { provider: 'tenor', mediaId: 'abc123' };

    it('keeps a plain text message, with no GIF', () => {
        expect(normaliseMessageBody({ text: '  gg wp  ' })).toEqual({ text: 'gg wp', gif: null });
    });

    it('keeps a GIF with no caption', () => {
        expect(normaliseMessageBody({ gif })).toEqual({ text: '', gif });
    });

    it('keeps a GIF with a caption', () => {
        expect(normaliseMessageBody({ text: 'this is you', gif })).toEqual({ text: 'this is you', gif });
    });

    it('treats absent, null or blank text as no caption', () => {
        expect(normaliseMessageBody({ gif })).toEqual({ text: '', gif });
        expect(normaliseMessageBody({ text: null, gif })).toEqual({ text: '', gif });
        expect(normaliseMessageBody({ text: '   \n ', gif })).toEqual({ text: '', gif });
    });

    it('rejects a message that is neither text nor a GIF', () => {
        expect(normaliseMessageBody({})).toBeNull();
        expect(normaliseMessageBody({ text: '' })).toBeNull();
        expect(normaliseMessageBody({ text: '   ' })).toBeNull();
        expect(normaliseMessageBody({ text: '', gif: null })).toBeNull();
    });

    it('rejects an invalid GIF rather than dropping it and sending the text', () => {
        // Silently posting the caption of a GIF that failed validation would
        // hide the failure from the player and from us.
        expect(normaliseMessageBody({ text: 'look', gif: { provider: 'giphy', mediaId: 'x' } })).toBeNull();
        expect(normaliseMessageBody({ text: 'look', gif: 'https://evil.example/x.gif' })).toBeNull();
        expect(normaliseMessageBody({ gif: {} })).toBeNull();
    });

    it('rejects a caption that fails the text rules, GIF or not', () => {
        const tooLong = 'a'.repeat(MAX_MESSAGE_LENGTH + 1);
        expect(normaliseMessageBody({ text: tooLong })).toBeNull();
        expect(normaliseMessageBody({ text: tooLong, gif })).toBeNull();
        expect(normaliseMessageBody({ text: 42, gif })).toBeNull();
        expect(normaliseMessageBody({ text: { toString: () => 'hi' }, gif })).toBeNull();
    });

    it('reshapes a caption exactly as a plain message is reshaped', () => {
        expect(normaliseMessageBody({ text: 'one\n\n\n\ntwo', gif })).toEqual({ text: 'one\n\ntwo', gif });
    });
});
