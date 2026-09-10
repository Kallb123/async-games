// The provider's side of the GIF feature: the one place its base URL, its keys
// and its "we shared this" ping are written.
//
// Two routes talk to Tenor and they want different things from it — the search
// route asks for results, the chat POST tells it a result was really sent
// (docs/chat-gifs.md §5) — so what they share is the request envelope rather
// than the request. Nothing here decides what a URL is allowed to be; that is
// `normaliseAttachment`'s job in src/utils/chat.ts, and it runs over whatever
// comes back.
//
// Server-only: it reads `process.env.TENOR_API_KEY`, which must never reach a
// browser. Nothing under src/components imports it, and the one hop that could
// change that is worth naming because it is a one-word edit: `GifPicker`
// imports `IGifSearchResponse` from the search route with `import type`, which
// the compiler erases. Dropping the `type` from that line would pull the route —
// and this module — into the client graph. (Next only inlines `NEXT_PUBLIC_*`,
// so the key still wouldn't ship; the picker would simply stop working. The
// framework's own `import 'server-only'` would make it a build error instead,
// but it resolves to a module that throws outside a React Server component
// condition, which is every test in this repo.)

import { IChatGifRef } from '@/utils/chat';

const TENOR_API = 'https://tenor.googleapis.com/v2/';

/** Tenor asks every integration to identify itself, so its analytics can tell
 *  one app's traffic from another's. Not a secret, and not the API key. */
const TENOR_CLIENT_KEY = 'asyncgames';

/** How long either call gets. Short, because the search is one a player is
 *  watching a type-ahead for, and the share ping is analytics nobody is waiting
 *  on at all — a slow answer to either is worth less than the socket. */
export const TENOR_TIMEOUT_MS = 5_000;

/** The endpoints this app calls. A closed set, not a `string`: `endpoint` is
 *  resolved against `TENOR_API`, and `new URL('//elsewhere.example/x', base)`
 *  resolves to *that* host — which, on a URL carrying the API key, is the one
 *  way this feature loses it. Both callers pass a literal today; the type is
 *  what keeps that true when a third arrives. */
type TenorEndpoint = 'search' | 'featured' | 'registershare';

/**
 * A request to one of the provider's endpoints, or `null` when there is no key
 * configured.
 *
 * `null` rather than a throw: a deployment with no key is a misconfiguration
 * every caller answers the same way (no pictures, chat unaffected), and it is
 * the caller that knows how loud that should be.
 *
 * Built with `URL`/`searchParams` and never by hand — one of these parameters
 * is a player's search term, which is exactly the sort of string that carries
 * an `&`.
 */
export function tenorRequest(endpoint: TenorEndpoint, params: Record<string, string>): URL | null {
    const key = process.env.TENOR_API_KEY?.trim();
    if (!key) {
        return null;
    }

    const url = new URL(endpoint, TENOR_API);
    for (const [name, value] of Object.entries(params)) {
        url.searchParams.set(name, value);
    }
    // Last, so nothing a caller passes can overwrite them. The search route
    // pins `contentfilter` in its own params for the same reason; these two are
    // pinned here because they identify *us* rather than the request, and a
    // `params` object that happened to carry a `key` would otherwise send
    // somebody else's.
    url.searchParams.set('key', key);
    url.searchParams.set('client_key', TENOR_CLIENT_KEY);
    return url;
}

/**
 * Tell the provider one of its items was actually sent.
 *
 * Tenor asks for this so its ranking knows which results people use, and it is
 * the only thing we give back for a free API. It is analytics: it runs in the
 * chat POST's `after()`, after the message has saved and the push has gone, and
 * it **never throws** — a message is not undone by a ping about it, the same way
 * a push failure never undoes one (docs/chat-gifs.md §5).
 *
 * Awaited by its caller rather than left dangling, because `after()` is the only
 * thing keeping the instance alive: a fetch nobody waits for is a fetch that may
 * never leave.
 */
export async function registerGifShare(ref: IChatGifRef): Promise<void> {
    // One provider today, and the ping is provider-specific — a second
    // catalogue would bring its own branch here rather than pretending this one
    // generalises.
    if (ref.provider !== 'tenor') {
        return;
    }

    // No key, no ping. Silent on purpose: the search route already says so
    // loudly, and a message that saved is not the place to say it again on every
    // send.
    const url = tenorRequest('registershare', { id: ref.mediaId });
    if (!url) {
        return;
    }

    try {
        const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(TENOR_TIMEOUT_MS) });
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
