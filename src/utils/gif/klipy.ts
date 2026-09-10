// The provider's side of the GIF/meme feature: the one place its base URL, its
// key and its "we shared this" ping are written.
//
// Two search routes talk to KLIPY, one per content category (`gifs`,
// `static-memes` — docs/chat-gifs.md §12), and both want the same thing from
// it: an envelope
// built the same way, differing only in the category segment. The chat POST
// talks to it too, to say a result was really sent (§5). What all of them
// share is the request envelope rather than the request. Nothing here decides
// what a URL is allowed to be; that is `normaliseAttachment`'s job in
// src/utils/chat.ts, and it runs over whatever comes back.
//
// Why KLIPY and not Tenor: Google shut the Tenor API down on 30 June 2026, and
// stopped issuing keys in the January before it, so the provider this feature
// was designed against no longer exists to call. KLIPY is the migration path
// Tenor integrations were pointed at, and it is the one this app now uses.
// docs/chat-gifs.md §5a has the reasoning and the four real differences;
// nothing about the *design* moved, because §4c was always shaped so the
// provider sat behind our own catalogue.
//
// Server-only: it reads `process.env.KLIPY_API_KEY`, which must never reach a
// browser. Nothing under src/components imports it, and the one hop that could
// change that is worth naming because it is a one-word edit: `AttachmentPicker`
// imports each search route's response type (`IGifSearchResponse` /
// `IMemeSearchResponse`) with `import type`, which the compiler erases.
// Dropping the `type` from either line would pull that route — and this
// module — into the client graph. (Next only inlines `NEXT_PUBLIC_*`, so the
// key still wouldn't ship; the picker would simply stop working. The
// framework's own `import 'server-only'` would make it a build error instead,
// but it resolves to a module that throws outside a React Server component
// condition, which is every test in this repo.)

import { GifProvider, IChatGifRef, isInertGifMediaId } from '@/utils/chat';

/** Note the trailing slash and note that the key goes *after* it: KLIPY takes
 *  its app key as a path segment (`/api/v1/<key>/gifs/…`) rather than as a
 *  query parameter, which is the one structural difference from the API this
 *  module used to call. It is why `klipyRequest` builds an absolute string
 *  rather than resolving a relative reference against a base — see below. */
const KLIPY_API = 'https://api.klipy.com/api/v1/';

/** How long any call gets. Short, because the search is one a player is
 *  watching a type-ahead for, and the share ping is analytics nobody is waiting
 *  on at all — a slow answer to either is worth less than the socket. */
export const KLIPY_TIMEOUT_MS = 5_000;

/**
 * The content categories this app calls, each under its own `/<key>/<category>/`
 * segment — `gifs` for the animated picker, `static-memes` for the
 * static-image one beside it (docs/chat-gifs.md §12; KLIPY's own docs name it
 * `static-memes` rather than the `memes` the other three categories'
 * plural-of-the-noun naming would suggest — verified against a 404 before
 * this landed, not assumed). A closed set for the same reason `KlipyEndpoint`
 * is: a category is a path segment carrying our key, not a caller's choice.
 */
type KlipyCategory = 'gifs' | 'static-memes';

/**
 * The endpoints this app calls, under `/<key>/<category>/`. A closed set of
 * literals, not a `string` and not a template type, because the key is part of
 * the path now: a path that could start with `//` would resolve to *another
 * host*, on a URL that carries our key.
 *
 * `share` is the one that also needs an item, and it takes it as a separate
 * argument for exactly this reason — a `` `share/${string}` `` member would
 * type-check any string a future caller assembled, which is a gate the
 * compiler stops holding the moment somebody adds the report endpoint §9
 * anticipates.
 */
type KlipyEndpoint = 'search' | 'trending' | 'share';

/**
 * A request to one of the provider's endpoints, or `null` when there is no key
 * configured — or when `slug` isn't one we'd put in a URL.
 *
 * `null` rather than a throw: a deployment with no key is a misconfiguration
 * every caller answers the same way (no pictures, chat unaffected), and it is
 * the caller that knows how loud that should be.
 *
 * Built as one absolute string and then parsed, rather than as a relative
 * reference against a base: `new URL('//elsewhere.example/x', base)` resolves
 * to *that* host, and this URL carries the API key in its path. Starting from
 * the literal origin means nothing appended can move the authority, which is
 * the half of the guarantee that holds no matter what the arguments are;
 * `KlipyCategory` and `KlipyEndpoint`'s literals and the `slug` gate below are
 * what keep the *path* right too.
 *
 * The parameters go on with `searchParams` and never by hand — one of them is a
 * player's search term, which is exactly the sort of string that carries an
 * `&`.
 *
 * **Never log this URL.** The key is a path segment, and path segments are not
 * redacted the way query strings sometimes are, so a `console.error(msg, url)`
 * here writes the key into the runtime log. Every caller prints statuses only.
 */
export function klipyRequest(category: KlipyCategory, endpoint: KlipyEndpoint, params: Record<string, string> = {}, slug?: string): URL | null {
    const key = process.env.KLIPY_API_KEY?.trim();
    if (!key) {
        return null;
    }

    // Asserted here rather than assumed of the caller. `encodeURIComponent`
    // would *not* save us: it leaves `.` alone, so a slug of `..` survives it
    // and `new URL` then normalises the segment away — a POST carrying our key
    // to whatever endpoint sits one level up. The charset is what stops that,
    // and `isInertGifMediaId` is the one place it is written.
    if (slug !== undefined && !isInertGifMediaId(slug)) {
        return null;
    }

    // Encoded even though a key is a hex-ish token: it is a path segment now,
    // and a path segment built from an environment variable is one a stray
    // `/` in a mis-pasted value would otherwise re-point.
    const path = slug === undefined ? endpoint : `${endpoint}/${encodeURIComponent(slug)}`;
    const url = new URL(`${KLIPY_API}${encodeURIComponent(key)}/${category}/${path}`);
    for (const [name, value] of Object.entries(params)) {
        url.searchParams.set(name, value);
    }
    // Deliberately *not* sent: KLIPY's optional `customer_id`, a stable
    // per-viewer id it uses to personalise and de-duplicate. It would mean
    // handing a third party a per-player identifier to go with every search
    // term, for a feature whose whole design (§4) is that the provider learns
    // nothing about who is playing. A worse picker is the right trade.
    return url;
}

/**
 * Tell the provider one of its items was actually sent.
 *
 * KLIPY asks for this so its ranking knows which results people use, and it is
 * the only thing we give back for a free API. It is analytics: it runs in the
 * chat POST's `after()`, after the message has saved and the push has gone, and
 * it **never throws** — a message is not undone by a ping about it, the same way
 * a push failure never undoes one (docs/chat-gifs.md §5).
 *
 * Awaited by its caller rather than left dangling, because `after()` is the only
 * thing keeping the instance alive: a fetch nobody waits for is a fetch that may
 * never leave.
 */
/** Which KLIPY category's `/share` a provider's items are pinged through.
 *  Every `GifProvider` is KLIPY today, so this is the whole of what tells them
 *  apart here — a genuinely different vendor would need its own branch rather
 *  than a wider map. */
const SHARE_CATEGORY: Record<GifProvider, KlipyCategory> = {
    klipy: 'gifs',
    'klipy-meme': 'static-memes',
};

export async function registerGifShare(ref: IChatGifRef): Promise<void> {
    // No key, no ping. Silent on purpose: the search route already says so
    // loudly, and a message that saved is not the place to say it again on every
    // send.
    //
    // `mediaId` is the item's slug, which is what KLIPY's share, items and
    // report endpoints are all keyed by. It is handed over as the `slug`
    // argument rather than pasted into a path, so the charset gate runs inside
    // `klipyRequest` — a `null` back here is that gate refusing, and answers
    // the same way a missing key does.
    //
    // If this ping ever starts answering 404 while search is plainly working,
    // the thing to suspect is *which* identifier it wants: KLIPY gives an item
    // both a slug and a numeric `id`, and the slug is the one its own docs and
    // SDKs key this endpoint by. The catalogue only stores the slug, so
    // changing that is a search-route change too, not a one-liner here.
    const url = klipyRequest(SHARE_CATEGORY[ref.provider], 'share', {}, ref.mediaId);
    if (!url) {
        return;
    }

    try {
        // A POST, unlike the search: the share trigger records something.
        const response = await fetch(url, { method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(KLIPY_TIMEOUT_MS) });
        if (!response.ok) {
            // The status, never the body: an upstream error page is not
            // something to paste into our logs.
            console.warn(`GIF share ping answered ${response.status}`);
        }
    } catch (error) {
        // A timeout, a DNS failure, an upstream that has gone away — all the
        // same nothing from here. `warn`, not `error`: the player got their GIF
        // and only somebody else's ranking is poorer for it.
        console.warn('GIF share ping failed', error);
    }
}
