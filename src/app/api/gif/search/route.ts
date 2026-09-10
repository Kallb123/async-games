import { auth } from '@clerk/nextjs/server';
import { after, NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { GIF_CATALOGUE_TTL_MS, GifCatalogueModel } from '@/utils/mongodb/GifCatalogueData';
import { isDuplicateKeyError } from '@/utils/mongodb/duplicateKey';
import { IChatAttachment, MAX_GIF_QUERY_LENGTH, normaliseAttachment } from '@/utils/chat';
import { KLIPY_TIMEOUT_MS, klipyRequest } from '@/utils/gif/klipy';
import { clientIp, consumeRateLimit } from '@/utils/rateLimit';

// The picker's data: a proxied GIF search (docs/chat-gifs.md §5).
//
// It is a proxy for two reasons, and the second is the interesting one. The
// obvious one is that the provider's API key must not ship to the client. The
// other is that this route is the **moderation boundary** of the whole feature:
// it is the only thing that writes the GifCatalogue, and the chat POST will
// attach a GIF only if a row is there. So a player can send an item our own
// filtered search served to somebody — not merely a real KLIPY slug, which they
// could name directly from a query the filter would have blocked (§4b vs §4c).
//
// Everything that makes that true is pinned here rather than taken from the
// caller: the content filter, the media variants, the page size and the
// upstream host. The one thing the caller chooses is a search term.
//
// Not gated on membership of a game — looking for a GIF isn't a per-game act —
// which makes the rate limit the only thing between us and somebody using our
// key as their own free GIF API. See the limiter below.

/** What the picker renders, and exactly what a message stores. The same
 *  `IChatAttachment` on purpose: the picker draws a result with `ChatGif`, the
 *  same component the thread draws a sent one with, and the catalogue row this
 *  route writes *is* the object the chat POST copies onto a message. One shape,
 *  one validator (`normaliseAttachment`), three places. */
export interface IGifSearchResponse {
    success: boolean;
    results: IChatAttachment[];
    /** True when the provider couldn't be reached, or answered with something
     *  we couldn't read. The picker shows "GIFs unavailable" and the composer
     *  carries on — a wobble at KLIPY must not break chat (§5). */
    unavailable: boolean;
}

/** How many results a page of the picker holds. Ours, not the caller's — it is
 *  also how many catalogue rows one search writes (§5b), which is why it is
 *  applied to what comes *back* as well as to what we ask for. */
const GIF_SEARCH_PAGE_SIZE = 24;

/** Searches per window, per account and (separately) per IP. Generous, because
 *  a type-ahead picker is genuinely chatty; small enough that it is not worth
 *  anybody's while to farm accounts for it. */
const GIF_SEARCH_LIMIT = 60;
const GIF_SEARCH_WINDOW_MS = 5 * 60_000;

/**
 * The formats we ask for, and the only ones we render.
 *
 * `gif` is the animated file and `jpg` its first frame — which is what
 * `prefers-reduced-motion` shows and what a tap plays from (§6). KLIPY also
 * offers `webp`, `mp4` and `webm`; none of them is asked for, because a
 * variant we don't render is a variant we'd have to decide about later.
 *
 * Pinned here rather than accepted from the caller: `format_filter` decides
 * what URLs end up in the catalogue and therefore on a message, and
 * `content_filter` is the guarantee §9 rests on. A filter a client can relax is
 * not a filter.
 */
const KLIPY_FORMATS = ['gif', 'jpg'] as const;
const KLIPY_CONTENT_FILTER = 'high';

/**
 * The size tiers we will serve, in the order we'd rather have them.
 *
 * A chat row is ~250px wide and a picker cell narrower still, so `sm` first:
 * asking for the full-size GIF would be paying to shrink it in the browser.
 * `xs` and `md` are the fallback for an item that doesn't carry every tier, so
 * one thin result is one thin result rather than a dropped one.
 *
 * **`hd` is deliberately not in the list**, and that is a cap rather than a
 * preference. A URL that reaches the catalogue is one every player in the
 * thread downloads on every thread open, forever, and an `hd` animated GIF runs
 * to tens of megabytes — `normaliseAttachment`'s dimension cap bounds pixels,
 * not bytes. An item carrying only `hd` is dropped instead, which costs that
 * one result and nothing else.
 */
const KLIPY_QUALITY_ORDER = ['sm', 'xs', 'md'] as const;

/** One file of one item, in the shape we read. */
interface KlipyFile {
    url?: unknown;
    width?: unknown;
    height?: unknown;
}

/** KLIPY's answer, in the shape we read. Everything else it sends is dropped —
 *  the response is mapped down rather than passed through, so nothing of the
 *  provider's schema reaches our client (§5). */
interface KlipyItem {
    slug?: unknown;
    title?: unknown;
    /** `'gif'` for a result, `'ad'` for a sponsored slot — see the filter in
     *  `fetchFromProvider`. */
    type?: unknown;
    /** Tier (`sm`, `hd`, …) → format (`gif`, `jpg`, …) → the file. */
    file?: Record<string, Record<string, KlipyFile | undefined> | undefined>;
}

/**
 * Search the catalogue, or — with no `q` — whatever the provider is featuring.
 *
 * Trending is "no search term" rather than its own `?trending` flag: the picker
 * opens on it and then narrows as the player types, so it is the same request
 * with an empty box, and one code path covers both.
 */
export async function GET(request: NextRequest) {
    console.log(`GET ${request.nextUrl.pathname}`);

    const { userId } = await auth();
    if (!userId) {
        // 401, like every other polled endpoint, so a client whose Clerk cookie
        // is still refreshing retries rather than giving up (fetchWithSessionRetry).
        console.warn(`GET ${request.nextUrl.pathname} 401: no authenticated user`);
        return NextResponse.json({}, { status: 401, statusText: "Not signed in" });
    }

    // A picker that searches as you type is the chattiest thing in the app by an
    // order of magnitude, so it debounces hard on the client — but the client is
    // not what holds. This is. There is no game to key it on and no membership
    // below it, so this pair is the whole of what stands between a signed-in
    // stranger and our KLIPY key as their own free GIF API — and, through the
    // catalogue write below, our own collection as their scratch space.
    //
    // Two limiters, the way /api/unlock and /api/user/displayname already do it,
    // and for the reason those give: per-account alone is defeated by a pile of
    // signups, which cost an email address each. The per-account budget is the
    // generous one because a debounced type-ahead genuinely needs it; the per-IP
    // one is what stops that budget being multiplied by however many accounts
    // somebody cares to register. Both spent before the query is even read, so a
    // bad request costs the same as a good one.
    let withinLimit: boolean[];
    try {
        withinLimit = await Promise.all([
            consumeRateLimit('gifSearch-user', userId, GIF_SEARCH_LIMIT, GIF_SEARCH_WINDOW_MS),
            consumeRateLimit('gifSearch-ip', clientIp(request.headers), GIF_SEARCH_LIMIT, GIF_SEARCH_WINDOW_MS),
        ]);
    } catch (error) {
        // The limiter is a Mongo write, and its first act is `dbConnect` — which
        // on a cold instance or an Atlas failover can sit for the driver's
        // thirty-second server-selection timeout and then throw. Left bare that
        // is a route which gives itself a five-second deadline for the one call
        // it doesn't control and none at all for the one it does, and answers a
        // 500 to a player watching a type-ahead. So a limiter *failure* degrades
        // the same way a provider failure does — and, because the gate could not
        // be checked, without calling the provider. No quota spent, no 500.
        console.error('GIF search could not check its rate limit', error);
        return unavailable();
    }
    if (withinLimit.includes(false)) {
        // The same body as every other no-pictures answer, with the honest
        // status on it. This is the one refusal ordinary use reaches — a
        // type-ahead against a five-minute budget — so a picker that reads
        // `results` off the body must not find `undefined` there.
        return unavailable(429, "Too many searches");
    }

    const query = (request.nextUrl.searchParams.get('q') ?? '').trim().slice(0, MAX_GIF_QUERY_LENGTH);

    const results = await fetchFromProvider(query);
    if (results === null) {
        return unavailable();
    }

    // Bookkeeping, and nothing the searcher is waiting on — so it runs after the
    // response has flushed, the way the chat POST's push fan-out does (§5b).
    if (results.length) {
        after(() => rememberResults(results));
    }

    return NextResponse.json(
        { success: true, results, unavailable: false } satisfies IGifSearchResponse,
        {
            // The one endpoint in the app a shared cache is correct for,
            // precisely because it is not per-viewer: "cats" returns the same
            // list to everybody, so a CDN hit is a hit for all of them. It is
            // also what keeps the catalogue's write amplification honest — a
            // cached response never re-runs this route, so a popular query pays
            // for its upsert once (§5b).
            //
            // Worth being clear about what `public` means on an auth-gated
            // route: a cached page can be served to a request that never
            // reached `auth()`. That is acceptable here and nowhere else in
            // this app, because the body holds nothing about the viewer or
            // their games — it is a page of a public GIF catalogue. What the
            // gate above actually protects is our upstream quota, and a cache
            // hit spends none of it.
            //
            // What to check if this is ever in doubt is the envelope rather
            // than the body: this is the app's first dynamic response to carry
            // `public`, and everything from here passes back out through
            // `clerkMiddleware`. A CDN that stored a response carrying a
            // session-refresh `Set-Cookie` would hand the next anonymous caller
            // somebody's session. Vercel documents that it will not cache a
            // response with `Set-Cookie`, and Clerk 401s an API request rather
            // than handshaking it, so nothing here does that today — but it is
            // one `curl -sD- '<preview>/api/gif/search?q=cat'` to confirm on a
            // preview deployment, and the one way this header goes badly wrong.
            headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
        }
    );
}

/**
 * The "no pictures, but chat still works" answer.
 *
 * An empty list and a flag rather than a 5xx: the picker says "GIFs
 * unavailable" and the composer carries on, which is the same instinct as the
 * chat POST's "a push failure never undoes the message" (§5). Always
 * `no-store` — the one thing worse than a wobble is a wobble cached for an
 * hour, and that goes for a rate-limit refusal as much as for an outage.
 */
function unavailable(status = 200, statusText?: string) {
    return NextResponse.json(
        { success: status === 200, results: [], unavailable: true } satisfies IGifSearchResponse,
        { status, statusText, headers: { 'Cache-Control': 'no-store' } }
    );
}

/**
 * The provider's results, mapped down to what we render — or `null` if the
 * provider couldn't be reached, answered badly, or isn't configured.
 *
 * Never throws: every way this goes wrong is the same answer to the caller, and
 * that answer is a working composer with no pictures in it.
 */
async function fetchFromProvider(query: string): Promise<IChatAttachment[] | null> {
    const url = klipyRequest(query ? 'search' : 'trending', {
        page: '1',
        per_page: String(GIF_SEARCH_PAGE_SIZE),
        format_filter: KLIPY_FORMATS.join(','),
        content_filter: KLIPY_CONTENT_FILTER,
        ...(query ? { q: query } : {}),
    });
    if (!url) {
        // A deployment with no key configured is a misconfiguration, not a
        // client error — and it is silent from the player's side either way, so
        // it has to be loud from ours.
        console.error('GIF search is not configured: KLIPY_API_KEY is unset');
        return null;
    }

    let payload: { result?: unknown, data?: { data?: unknown } };
    try {
        const response = await fetch(url, {
            // Next caches `fetch` in a route handler by default; this response
            // is already cached at the edge by the header above, and caching it
            // again here would hold a page of results past the point the
            // catalogue rows behind them expire.
            cache: 'no-store',
            signal: AbortSignal.timeout(KLIPY_TIMEOUT_MS),
        });
        if (!response.ok) {
            // The status, never the body: an upstream error page is not
            // something to paste into our logs.
            console.error(`GIF search upstream answered ${response.status}`);
            return null;
        }
        payload = await response.json();
    } catch (error) {
        // A timeout, a DNS failure, a body that isn't JSON — all the same thing
        // from here.
        console.error('GIF search upstream failed', error);
        return null;
    }

    // KLIPY wraps every answer in `{ result, data }` and reports a refusal —
    // a bad app key, a quota — as `result: false`, sometimes *with* an ordinary
    // status on it. So the envelope is read before the payload rather than the
    // HTTP status being trusted to have said everything.
    if (payload?.result === false) {
        console.error('GIF search upstream refused the request');
        return null;
    }
    if (!Array.isArray(payload?.data?.data)) {
        console.error('GIF search upstream answered something that is not a result list');
        return null;
    }

    // Sliced, not just asked for: `per_page` above is a request, and §4d's whole
    // posture is that a provider's answer is asserted on rather than trusted.
    // An upstream that ignored it — a different endpoint paging differently, a
    // future API change — would otherwise hand the picker a response of
    // unbounded size and this route's `after()` an unbounded `bulkWrite`, on a
    // path that has already answered the caller.
    const page: KlipyItem[] = payload.data.data.slice(0, GIF_SEARCH_PAGE_SIZE);

    // KLIPY interleaves sponsored slots into a page of results and marks them
    // `type: 'ad'`. They are dropped here, before the counts below, because an
    // ad is not a result we failed to read — it is one we were never going to
    // render, and counting it as a failure would have a page of them look like
    // the schema change the loud branch is for. (It also means an ad can never
    // reach the catalogue, so nobody can send one as a message.)
    //
    // Note which way round the test is: everything that is **not** an ad is
    // considered, rather than only what says `type: 'gif'`. An allowlist reads
    // safer and is worse here, because it silently swallows the failure the
    // loud branch below exists to catch — a `type` that is renamed, dropped, or
    // simply absent from the `trending` endpoint (a different endpoint from
    // `search`, and the picker's opening screen) would leave `considered` empty,
    // and an empty `considered` takes the cacheable "no GIFs match" path with
    // no log line at all. The cost of the other way round is that renaming
    // `'ad'` would let an ad through, which is a monetisation problem rather
    // than a broken picker, and a visible one.
    const considered = page.filter(item => item?.type !== 'ad');

    // `flatMap` over `filter(Boolean)` so the nulls narrow out of the type, and
    // a dropped item is a dropped item rather than a failed search — an
    // upstream that starts serving one odd result should cost that result and
    // nothing else (§5).
    const mapped = considered.flatMap((item: KlipyItem) => {
        const attachment = toAttachment(item);
        return attachment ? [attachment] : [];
    });

    // Dropping *every* result the provider sent is not a search with no matches
    // — it is a provider we can no longer read: a renamed tier, a `file` that
    // stopped being nested that way, a key that lost `format_filter`. Told apart
    // because the two answers differ in every way that matters. "No matches" is
    // `unavailable: false` and cacheable, so a schema change would otherwise
    // show every player "no GIFs match" for every query, log nothing at all,
    // and be held at the edge for an hour fresh and a day stale — outliving the
    // fix. So it takes the unavailable + `no-store` branch instead, loudly.
    if (considered.length > 0 && mapped.length === 0) {
        console.error(`GIF search could not read any of the ${considered.length} results the provider sent`);
        return null;
    }
    // A partial drop is still worth a line: a mapping that has quietly decayed
    // to three results out of twenty-four is otherwise invisible until somebody
    // notices the picker looks thin.
    if (mapped.length < considered.length) {
        console.warn(`GIF search dropped ${considered.length - mapped.length} of ${considered.length} results`);
    }
    return mapped;
}

/**
 * The first tier of `format` an item carries, or `undefined`.
 *
 * The animated file and its still frame are looked up independently rather than
 * being pinned to one tier: an item missing `sm.jpg` but carrying `sm.gif` is
 * still perfectly renderable with a still frame from the next tier down, and
 * the two are drawn in the same box at the same aspect ratio either way.
 *
 * Only the tiers in `KLIPY_QUALITY_ORDER`, which is a cap as well as an order —
 * see the note there about `hd`.
 */
function pickFile(item: KlipyItem, format: typeof KLIPY_FORMATS[number]): KlipyFile | undefined {
    for (const tier of KLIPY_QUALITY_ORDER) {
        const file = item?.file?.[tier]?.[format];
        // A *usable* url, not merely a tier that exists: a placeholder
        // `{ }`, a `{ url: null }` or a bare string where an object was
        // expected would otherwise stop the walk at the preferred tier and
        // drop an item that carries a perfectly good one below it — which is
        // the opposite of what this fallback is for.
        if (typeof file?.url === 'string' && file.url.length > 0) {
            return file;
        }
    }
    return undefined;
}

/**
 * One of the provider's items as an attachment, or `null` if it isn't one we
 * will store.
 *
 * The checking is `normaliseAttachment`'s, not this function's: it is already
 * the thing that decides whether a set of these seven fields may be put in
 * front of a player, and it is already run again when a catalogue row is copied
 * onto a message and once more on the way out to the thread. Running it *here*
 * is what makes §4d's host assertion real — the point where a URL first crosses
 * from the provider into our data — and reusing it is why there is one host
 * list rather than one per gate.
 *
 * `mediaId` is the item's **slug** rather than its numeric `id`, because the
 * slug is what KLIPY's own share, items and report endpoints are keyed by — so
 * the thing we remember is the thing we can talk to them about later (§5, §9).
 */
function toAttachment(item: KlipyItem): IChatAttachment | null {
    const animated = pickFile(item, 'gif');
    const still = pickFile(item, 'jpg');
    return normaliseAttachment({
        provider: 'klipy',
        mediaId: item?.slug,
        url: animated?.url,
        stillUrl: still?.url,
        width: animated?.width,
        height: animated?.height,
        alt: item?.title,
    });
}

/**
 * Write what this search learned into the catalogue, so the chat POST can
 * resolve any of these ids without calling the provider (§4c).
 *
 * One `bulkWrite`, unordered, and wholly guarded: it is bookkeeping that runs
 * after the response has flushed, so the worst a failure here can do is cost
 * the player a "we don't know that GIF" on a send they may never make.
 */
async function rememberResults(results: IChatAttachment[]) {
    try {
        await dbConnect();
        const expiresAt = new Date(Date.now() + GIF_CATALOGUE_TTL_MS);
        await GifCatalogueModel.bulkWrite(results.map(item => ({
            updateOne: {
                filter: { provider: item.provider, mediaId: item.mediaId },
                // The whole row every time, not just the expiry: a URL the
                // provider has re-issued should replace the one we remembered,
                // and re-searching is the only thing that ever refreshes it.
                update: { $set: { ...item, expiresAt } },
                upsert: true,
            },
        })), { ordered: false });
    } catch (error) {
        // Two searches racing on the same id is what the unique index is *for*:
        // both upserts try to insert, one wins, the loser gets E11000 — and the
        // row it wanted is there either way. Anything else is worth a line.
        if (!isOnlyDuplicateKeyErrors(error)) {
            console.error('Failed to write the GIF catalogue', error);
        }
    }
}

/**
 * True if the only thing that went wrong was a duplicate key.
 *
 * A `bulkWrite` reports its failures in `writeErrors` rather than as one error
 * with a code, and an unordered one carries on past them — so the useful
 * question is not "was this a duplicate key" but "was *everything* that failed
 * one". A batch where one row lost a race and another hit a real write failure
 * still deserves the log line.
 */
function isOnlyDuplicateKeyErrors(error: unknown): boolean {
    const writeErrors = (error as { writeErrors?: unknown } | null)?.writeErrors;
    if (Array.isArray(writeErrors)) {
        // Walked, rather than read off the error's own `code` — because the
        // driver copies `writeErrors[0].code` up to the top level, so that field
        // says what the *first* failure was and never whether the rest were the
        // same. Trusting it would swallow a genuine write failure sitting behind
        // a duplicate, which is exactly the batch this log line is for. Each
        // entry exposes its code through a getter over an inner `err`, so both
        // spellings are accepted.
        return writeErrors.length > 0
            && writeErrors.every(one => isDuplicateKeyError(one) || isDuplicateKeyError((one as { err?: unknown })?.err));
    }
    return isDuplicateKeyError(error);
}
