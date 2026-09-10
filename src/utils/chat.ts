// Shared chat validation — the one module the composer and the POST route both
// import, so the client's limit and the server's gate cannot drift apart. It
// mirrors src/utils/reactions.ts, which does the same job for the recap
// reactions. See docs/in-game-chat.md §4 (messages) and §13.4 (the read
// marker).

export const MAX_MESSAGE_LENGTH = 500;

/**
 * The message as it will be stored, or `null` if it isn't a message.
 *
 * Trims, rejects a non-string, rejects empty, rejects anything over
 * MAX_MESSAGE_LENGTH after trimming, and collapses runs of blank lines so one
 * message can't be a screenful. This is input validation, not moderation: the
 * text itself is never inspected.
 */
export function normaliseMessage(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_MESSAGE_LENGTH) {
        return null;
    }

    // Collapse a run of blank lines (each possibly holding only whitespace) down
    // to a single blank line, so a wall of empty lines can't stretch one message
    // over a screenful. A single line break inside the message is left alone.
    return trimmed.replace(/(?:[ \t]*\n){2,}/g, '\n\n');
}

/**
 * The read marker as it will be stored, or `null` if it isn't one.
 *
 * Rejects a non-string and anything that doesn't parse as a date, then
 * canonicalises to ISO — the marker route applies it with `$max`, which on an
 * ISO string is a lexical comparison, so a value that parsed but wasn't
 * already in that format would compare wrong against the messages it is
 * meant to catch up to. See docs/in-game-chat.md §13.4.
 *
 * Also rejects a year outside the ordinary four-digit range: `Date` accepts
 * one (`new Date('+275760-09-13')` parses fine), but its ISO form gains a
 * sign and extra digits that sort lexically *before* every ordinary
 * timestamp — exactly backwards for a `$max` write and for the route's
 * clamp-to-now comparison, both of which are plain string comparisons.
 */
export function normaliseReadAt(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    const iso = parsed.toISOString();
    if (iso.length !== 24) {
        return null;
    }

    return iso;
}

// ---------------------------------------------------------------- GIFs

/**
 * The catalogues a GIF (or a meme — the same shape, see docs/chat-gifs.md
 * §12) can come from. A second one is additive — a new entry here, a new host
 * list below, and a branch in the search route — but the provider is always
 * named on the wire, because a bare id means nothing without it. See
 * docs/chat-gifs.md §4.
 *
 * `klipy-meme` is not a second vendor: it is KLIPY's `/static-memes/` category,
 * proxied by its own search route the same way `/gifs/` is. It gets its own
 * provider value rather than a flag alongside `klipy` because a provider is
 * already the unit this app resolves a catalogue row and a host list by, and
 * a meme's slug is drawn from a different KLIPY namespace than a GIF's.
 */
export const GIF_PROVIDERS = ['klipy', 'klipy-meme'] as const;
export type GifProvider = typeof GIF_PROVIDERS[number];

/**
 * The hosts each provider serves media from.
 *
 * This is deliberately *not* the gate on anything a player sends. The client
 * never sends a URL at all (§4): it sends a catalogue id, and the URLs stored
 * on a message are copied off the provider's own response by the search route.
 * This list is the assertion on *that* response — it catches a base URL
 * pointing somewhere unintended, or an upstream that has been spoofed or
 * compromised — and the cheap re-check when a catalogue row is copied onto a
 * message, since a row written by an earlier version of the code is not the
 * same trust level as one written by this one.
 *
 * Which means its failure mode is safe, and that is the whole reason the design
 * is shaped this way (§4d): getting a gate on client input wrong lets an
 * attacker put an `<img src>` of their choosing in every opponent's browser,
 * whereas getting *this* wrong refuses a legitimate GIF. If a real KLIPY URL
 * is ever turned away, this list is the thing to widen.
 *
 * Written out rather than matched with a pattern, and compared whole rather
 * than by suffix: `endsWith('.klipy.com')` is satisfied by
 * `static.klipy.com.example.com`, and a host allowlist is not the place to be
 * clever.
 */
const GIF_MEDIA_HOSTS: Record<GifProvider, readonly string[]> = {
    // KLIPY serves every media file — the animated GIF and its still frame
    // alike — from one CDN host, so this list is one entry rather than the
    // shard-per-number set the previous provider needed.
    klipy: [
        'static.klipy.com',
    ],
    // The meme category is served from the same CDN as the GIF one.
    'klipy-meme': [
        'static.klipy.com',
    ],
};

/**
 * A catalogue id: long enough for any provider's, short enough to be a key.
 *
 * KLIPY's id is a *slug* — words and a discriminator, not a number — so this is
 * roomier than the sixty-four characters the numeric ids of the previous
 * provider needed. It is a sanity bound rather than a format: the charset gate
 * below is what makes an id inert, and the length is only here so nothing can
 * post a novel as a Mongo key.
 */
const MAX_GIF_MEDIA_ID_LENGTH = 128;

/**
 * The longest search term the picker will send and the search route will pass
 * upstream. A query is a word or two; this is generous for that and small
 * enough that nobody is smuggling a payload through it.
 *
 * Here rather than in the route for the reason MAX_MESSAGE_LENGTH is: the
 * picker's `maxLength` and the route's cap are the same number, and two copies
 * of it drift.
 */
export const MAX_GIF_QUERY_LENGTH = 100;

/**
 * The charset a media id may use. Not an attempt to match KLIPY's exact format
 * — theirs is a hyphenated slug today and that is not a promise — but a
 * restriction to characters that are inert in the three places an id travels: a
 * Mongo key, an upstream query string, and (since the share ping is keyed by
 * slug) an upstream URL *path*. Anything outside it is refused rather than
 * escaped.
 */
const GIF_MEDIA_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * True if `value` is a media id inert everywhere one travels.
 *
 * Exported because it has a second caller, and that caller is the reason this
 * is a named function rather than two lines inside `normaliseGifRef`:
 * `klipyRequest` puts an id into an upstream URL **path**, where the
 * interesting characters are not the ones `encodeURIComponent` escapes (it
 * leaves `.` alone, so `..` survives it and a path segment of `..` walks up to
 * a different endpoint — one still carrying our API key). What actually stops
 * that is this charset, so the provider module asserts it for itself rather
 * than trusting every present and future caller to have run it first.
 */
export function isInertGifMediaId(value: unknown): value is string {
    return typeof value === 'string'
        && value.length > 0 && value.length <= MAX_GIF_MEDIA_ID_LENGTH
        && GIF_MEDIA_ID_PATTERN.test(value);
}

/** A GIF can be tall or wide, but not implausibly either — see §6's max-height. */
const MAX_GIF_DIMENSION = 4096;

/** The provider's own content description, as an `alt`. */
const MAX_GIF_ALT_LENGTH = 200;

/** What the client sends to attach a GIF: a catalogue, and an id within it. */
export interface IChatGifRef {
    provider: GifProvider;
    mediaId: string;
}

/**
 * A GIF as it is stored on a message and sent to the client.
 *
 * Every field but `provider`/`mediaId` is copied off the provider's response by
 * the server; none of it is ever read out of a request body. The dimensions
 * earn their place by being needed *before* the image loads — the thread
 * reserves the row's box from them, which is what stops an arriving GIF from
 * reading as a scroll glitch (docs/chat-gifs.md §7).
 */
export interface IChatAttachment extends IChatGifRef {
    /** The animated file. */
    url: string;
    /** Its first frame — reduced-motion, and tap-to-play. */
    stillUrl: string;
    width: number;
    height: number;
    alt: string;
}

function isGifProvider(value: unknown): value is GifProvider {
    return typeof value === 'string' && (GIF_PROVIDERS as readonly string[]).includes(value);
}

/**
 * True if `value` is an https URL on one of `provider`'s media hosts.
 *
 * Whole-host comparison, no credentials and no port — a URL carrying either is
 * not one a CDN handed us. Anything that doesn't parse as a URL at all is
 * false rather than a throw, because every caller wants the same answer.
 */
export function isAllowedGifMediaUrl(value: unknown, provider: GifProvider): value is string {
    if (typeof value !== 'string' || value.length === 0 || value.length > 2048) {
        return false;
    }
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return false;
    }
    return url.protocol === 'https:'
        && url.username === '' && url.password === '' && url.port === ''
        // `?? []` so a provider from outside the union refuses rather than
        // throwing. Unreachable from here today — every caller passes a
        // normaliseGifRef'd provider — but the search route is where a provider
        // string will arrive from config or a query, and a TypeError there
        // would be a 500 where a refusal is wanted.
        && (GIF_MEDIA_HOSTS[provider] ?? []).includes(url.hostname);
}

/**
 * The canonical form of an allowed media URL, or `null`.
 *
 * Store what you checked: `isAllowedGifMediaUrl` validates the *parsed* URL, so
 * returning the raw string would store something that merely parses to what was
 * approved — `" https://static.klipy.com/a.gif "` with the spaces still on it,
 * or a backslash where a slash was meant. Nothing today can be exploited by
 * that, because a browser runs the same parser and reaches the same host; it
 * goes wrong the first time a second consumer treats the field as a string
 * rather than a URL (a CSP `img-src` comparison, a server-side fetch, or §5's
 * share ping built by concatenation).
 */
function canonicalGifMediaUrl(value: unknown, provider: GifProvider): string | null {
    return isAllowedGifMediaUrl(value, provider) ? new URL(value).href : null;
}

/**
 * The reference as it will be looked up, or `null` if it isn't one.
 *
 * **This is the entire client-supplied surface of the GIF feature** — a
 * provider from a fixed set and an id from a restricted charset. Everything
 * else about a GIF is resolved server-side from the catalogue the search route
 * populated (docs/chat-gifs.md §4c), so there is no URL, no dimension and no
 * caption here for a player to choose.
 */
export function normaliseGifRef(value: unknown): IChatGifRef | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    const { provider, mediaId } = value as { provider?: unknown, mediaId?: unknown };
    if (!isGifProvider(provider) || !isInertGifMediaId(mediaId)) {
        return null;
    }

    return { provider, mediaId };
}

/**
 * A catalogue row reduced to what a message stores, or `null` if the row can't
 * be trusted to render.
 *
 * Applied when a row is copied onto a message rather than when it is written,
 * so a row left behind by an older version of the search route — or one whose
 * host list has since been narrowed — is refused at the point it would reach a
 * player's browser. Reads its fields rather than enumerating them, so a
 * Mongoose document is as acceptable an input as a plain object.
 */
export function normaliseAttachment(value: unknown): IChatAttachment | null {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const row = value as Partial<IChatAttachment>;
    // normaliseGifRef reads only `provider` and `mediaId` and builds a fresh
    // object from them, so the row can go straight in — no need to pick the two
    // fields out first, and no second copy of the charset rules.
    const ref = normaliseGifRef(row);
    if (ref === null) {
        return null;
    }

    const url = canonicalGifMediaUrl(row.url, ref.provider);
    const stillUrl = canonicalGifMediaUrl(row.stillUrl, ref.provider);
    if (url === null || stillUrl === null) {
        return null;
    }

    const { width, height } = row;
    if (!isSaneDimension(width) || !isSaneDimension(height)) {
        return null;
    }

    // An absent description is a GIF with no `alt`, not a rejected one: a
    // missing caption is a degraded image, and refusing the message over it
    // would be the wrong trade. Over-long is trimmed for the same reason.
    const alt = typeof row.alt === 'string' ? row.alt.trim().slice(0, MAX_GIF_ALT_LENGTH) : '';

    return { ...ref, url, stillUrl, width, height, alt };
}

function isSaneDimension(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= MAX_GIF_DIMENSION;
}

/** A chat POST's body, checked: the text to store, and the GIF to resolve. */
export interface IChatMessageBody {
    /** `''` for a GIF sent with no caption — never empty without one. */
    text: string;
    gif: IChatGifRef | null;
}

/**
 * The whole of what a chat POST may carry, or `null` if it isn't a message.
 *
 * One function rather than two checks at the route, because the rule that
 * matters is a rule about the *pair*: a message needs text or a GIF, and either
 * one alone is a message. That invariant is relied on downstream — the push
 * copy reads an empty `text` as "there must be a GIF" (notificationContent.ts)
 * — so it belongs in the module the composer and the route share, next to the
 * limit they already share, and not spelled out twice.
 *
 * Text is optional but not lax: absent, null or blank is `''`, and anything
 * else has to pass `normaliseMessage` — so an over-long caption is a 400
 * rather than a silently dropped one.
 */
export function normaliseMessageBody(body: { text?: unknown, gif?: unknown }): IChatMessageBody | null {
    let gif: IChatGifRef | null = null;
    if (body.gif !== undefined && body.gif !== null) {
        gif = normaliseGifRef(body.gif);
        if (gif === null) {
            return null;
        }
    }

    // Absent or null is "no caption"; blank is the same thing. Anything else
    // has to pass normaliseMessage, so an over-long caption is a 400 rather
    // than a silently dropped one — and a non-string is a 400 rather than a
    // caption of "42".
    const raw = body.text ?? '';
    if (typeof raw !== 'string') {
        return null;
    }
    const text = raw.trim() === '' ? '' : normaliseMessage(raw);
    if (text === null) {
        return null;
    }

    // Neither a line nor a picture is not a message.
    if (text === '' && gif === null) {
        return null;
    }

    return { text, gif };
}
