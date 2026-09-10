// The shared proxy-search machinery behind every KLIPY category this app
// offers — the animated GIF picker (`/api/gif/search`) and the meme picker
// beside it (`/api/meme/search`, docs/chat-gifs.md §12). What tells the two
// apart is which KLIPY endpoint they ask, which formats they request and
// which provider their results are catalogued under; everything about *how*
// a search is proxied — the auth gate, the two-limiter budget, the envelope
// parsing, the ad filter, the tier fallback, the catalogue write and the
// cache headers (docs/chat-gifs.md §5/§5b) — is the same design once, here,
// rather than copied per category. A route file supplies a `ProviderSearchConfig`
// and nothing else.

import { auth } from '@clerk/nextjs/server';
import { after, NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { GIF_CATALOGUE_TTL_MS, GifCatalogueModel } from '@/utils/mongodb/GifCatalogueData';
import { isDuplicateKeyError } from '@/utils/mongodb/duplicateKey';
import { IChatAttachment, MAX_GIF_QUERY_LENGTH } from '@/utils/chat';
import { KLIPY_TIMEOUT_MS, klipyRequest } from '@/utils/gif/klipy';
import { clientIp, consumeRateLimit } from '@/utils/rateLimit';

/** What a picker renders, and exactly what a message stores. The same
 *  `IChatAttachment` on purpose: a picker draws a result with `ChatGif`, the
 *  same component the thread draws a sent one with, and the catalogue row a
 *  route writes *is* the object the chat POST copies onto a message. One
 *  shape, one validator (`normaliseAttachment`), reused by every category. */
export interface IProviderSearchResponse {
    success: boolean;
    results: IChatAttachment[];
    /** True when the provider couldn't be reached, or answered with something
     *  we couldn't read. The picker shows "<kind> unavailable" and the
     *  composer carries on — a wobble at KLIPY must not break chat (§5). */
    unavailable: boolean;
}

/** One file of one item, in the shape every KLIPY category answers with. */
export interface KlipyFile {
    url?: unknown;
    width?: unknown;
    height?: unknown;
}

/** One of the provider's items, in the shape every category answers with.
 *  Everything else KLIPY sends is dropped — the response is mapped down
 *  rather than passed through, so nothing of the provider's schema reaches
 *  our client (§5). */
export interface KlipyItem {
    slug?: unknown;
    title?: unknown;
    /** `'gif'` (or a category's own value) for a result, `'ad'` for a
     *  sponsored slot — see the filter below. */
    type?: unknown;
    /** Tier (`sm`, `hd`, …) → format (`gif`, `jpg`, …) → the file. */
    file?: Record<string, Record<string, KlipyFile | undefined> | undefined>;
}

/**
 * The size tiers we will serve, in the order we'd rather have them.
 *
 * A chat row is ~250px wide and a picker cell narrower still, so `sm` first:
 * asking for the full-size file would be paying to shrink it in the browser.
 * `xs` and `md` are the fallback for an item that doesn't carry every tier, so
 * one thin result is one thin result rather than a dropped one.
 *
 * **`hd` is deliberately not in the list**, and that is a cap rather than a
 * preference. A URL that reaches the catalogue is one every player in the
 * thread downloads on every thread open, forever — `normaliseAttachment`'s
 * dimension cap bounds pixels, not bytes. An item carrying only `hd` is
 * dropped instead, which costs that one result and nothing else.
 */
export const KLIPY_QUALITY_ORDER = ['sm', 'xs', 'md'] as const;

/**
 * The first tier of `format` an item carries, or `undefined`.
 *
 * Looked up independently per format rather than pinned to one tier: an item
 * missing `sm.jpg` but carrying `sm.gif` is still perfectly renderable, and
 * both are drawn in the same box at the same aspect ratio either way.
 *
 * Only the tiers in `KLIPY_QUALITY_ORDER`, which is a cap as well as an order.
 */
export function pickFile(item: KlipyItem, format: string): KlipyFile | undefined {
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

/** What one KLIPY category's route needs to say about itself; everything else
 *  in `runProviderSearch` is shared. */
export interface ProviderSearchConfig {
    /** KLIPY's own category segment — `/api/v1/<key>/<category>/…`. */
    category: 'gifs' | 'static-memes';
    /** Rate-limit key prefix, kept distinct per surface (`gifSearch`,
     *  `memeSearch`, …) so a busy meme picker can't spend the GIF picker's
     *  budget, or the other way round. */
    limiterPrefix: string;
    /** A human name for this category's search, for log lines only —
     *  never sent upstream and never on the wire. */
    logLabel: string;
    /** Formats requested from KLIPY, comma-joined into `format_filter`. Pinned
     *  here rather than accepted from the caller for the same reason the GIF
     *  route always pinned it: a filter a client can relax is not a filter. */
    formats: readonly string[];
    contentFilter: string;
    /** How many results a page holds — also how many catalogue rows one
     *  search writes, so it bounds what comes back as well as what is asked
     *  for. */
    pageSize: number;
    /** Searches per window, per account and (separately) per IP. */
    limit: number;
    windowMs: number;
    /** Maps one raw item down to an attachment, or `null` to drop it. */
    toAttachment: (item: KlipyItem) => IChatAttachment | null;
}

/**
 * Search one KLIPY category, or — with no `q` — whatever it is featuring.
 *
 * Trending is "no search term" rather than its own flag: a picker opens on it
 * and then narrows as the player types, so it is the same request with an
 * empty box, and one code path covers both (docs/chat-gifs.md §5).
 *
 * Not gated on membership of a game — looking for a picture isn't a per-game
 * act — which makes the rate limit the only thing between us and somebody
 * using our key as their own free media API.
 */
export async function runProviderSearch(request: NextRequest, config: ProviderSearchConfig): Promise<NextResponse> {
    console.log(`GET ${request.nextUrl.pathname}`);

    const { userId } = await auth();
    if (!userId) {
        // 401, like every other polled endpoint, so a client whose Clerk cookie
        // is still refreshing retries rather than giving up (fetchWithSessionRetry).
        console.warn(`GET ${request.nextUrl.pathname} 401: no authenticated user`);
        return NextResponse.json({}, { status: 401, statusText: "Not signed in" });
    }

    // Two limiters, the way /api/unlock and /api/user/displayname already do
    // it: per-account alone is defeated by a pile of signups, so the per-IP
    // one is what stops that budget being multiplied by however many accounts
    // somebody cares to register. Both spent before the query is even read, so
    // a bad request costs the same as a good one.
    let withinLimit: boolean[];
    try {
        withinLimit = await Promise.all([
            consumeRateLimit(`${config.limiterPrefix}-user`, userId, config.limit, config.windowMs),
            consumeRateLimit(`${config.limiterPrefix}-ip`, clientIp(request.headers), config.limit, config.windowMs),
        ]);
    } catch (error) {
        // The limiter is a Mongo write, and its first act is `dbConnect` —
        // which on a cold instance or an Atlas failover can sit for the
        // driver's server-selection timeout and then throw. So a limiter
        // *failure* degrades the same way a provider failure does — and,
        // because the gate could not be checked, without calling the provider.
        console.error(`${config.logLabel} could not check its rate limit`, error);
        return unavailable();
    }
    if (withinLimit.includes(false)) {
        return unavailable(429, "Too many searches");
    }

    const query = (request.nextUrl.searchParams.get('q') ?? '').trim().slice(0, MAX_GIF_QUERY_LENGTH);

    const results = await fetchFromProvider(query, config);
    if (results === null) {
        return unavailable();
    }

    // Bookkeeping, and nothing the searcher is waiting on — so it runs after
    // the response has flushed (§5b).
    if (results.length) {
        after(() => rememberResults(results));
    }

    return NextResponse.json(
        { success: true, results, unavailable: false } satisfies IProviderSearchResponse,
        {
            // The one kind of endpoint in the app a shared cache is correct
            // for, because it is not per-viewer: a page of results is the
            // same for everybody, so a CDN hit is a hit for all of them — see
            // the note on this header in the GIF route for why `public` is
            // safe on an auth-gated route here specifically.
            headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
        }
    );
}

/**
 * The "no pictures, but chat still works" answer.
 *
 * An empty list and a flag rather than a 5xx: the picker says "<kind>
 * unavailable" and the composer carries on. Always `no-store` — the one thing
 * worse than a wobble is a wobble cached for an hour, and that goes for a
 * rate-limit refusal as much as for an outage.
 */
function unavailable(status = 200, statusText?: string): NextResponse {
    return NextResponse.json(
        { success: status === 200, results: [], unavailable: true } satisfies IProviderSearchResponse,
        { status, statusText, headers: { 'Cache-Control': 'no-store' } }
    );
}

/**
 * The provider's results, mapped down to what we render — or `null` if the
 * provider couldn't be reached, answered badly, or isn't configured.
 *
 * Never throws: every way this goes wrong is the same answer to the caller,
 * and that answer is a working composer with no pictures in it.
 */
async function fetchFromProvider(query: string, config: ProviderSearchConfig): Promise<IChatAttachment[] | null> {
    const url = klipyRequest(config.category, query ? 'search' : 'trending', {
        page: '1',
        per_page: String(config.pageSize),
        format_filter: config.formats.join(','),
        content_filter: config.contentFilter,
        ...(query ? { q: query } : {}),
    });
    if (!url) {
        // A deployment with no key configured is a misconfiguration, not a
        // client error — and it is silent from the player's side either way,
        // so it has to be loud from ours.
        console.error(`${config.logLabel} is not configured: KLIPY_API_KEY is unset`);
        return null;
    }

    let payload: { result?: unknown, data?: { data?: unknown } };
    try {
        const response = await fetch(url, {
            // Next caches `fetch` in a route handler by default; this response
            // is already cached at the edge by the header above, and caching
            // it again here would hold a page of results past the point the
            // catalogue rows behind them expire.
            cache: 'no-store',
            signal: AbortSignal.timeout(KLIPY_TIMEOUT_MS),
        });
        if (!response.ok) {
            // The status, never the body: an upstream error page is not
            // something to paste into our logs.
            console.error(`${config.logLabel} upstream answered ${response.status}`);
            return null;
        }
        payload = await response.json();
    } catch (error) {
        // A timeout, a DNS failure, a body that isn't JSON — all the same
        // thing from here.
        console.error(`${config.logLabel} upstream failed`, error);
        return null;
    }

    // KLIPY wraps every answer in `{ result, data }` and reports a refusal —
    // a bad app key, a quota — as `result: false`, sometimes *with* an
    // ordinary status on it. So the envelope is read before the payload
    // rather than the HTTP status being trusted to have said everything.
    if (payload?.result === false) {
        console.error(`${config.logLabel} upstream refused the request`);
        return null;
    }
    if (!Array.isArray(payload?.data?.data)) {
        console.error(`${config.logLabel} upstream answered something that is not a result list`);
        return null;
    }

    // Sliced, not just asked for: `per_page` above is a request, and a
    // provider's answer is asserted on rather than trusted. An upstream that
    // ignored it would otherwise hand the picker a response of unbounded size
    // and the `after()` below an unbounded `bulkWrite`, on a path that has
    // already answered the caller.
    const page: KlipyItem[] = payload.data.data.slice(0, config.pageSize);

    // KLIPY interleaves sponsored slots into a page of results and marks them
    // `type: 'ad'`. They are dropped here, before the counts below, because
    // an ad is not a result we failed to read — it is one we were never going
    // to render, and counting it as a failure would have a page of them look
    // like the schema change the loud branch is for. (It also means an ad can
    // never reach the catalogue, so nobody can send one as a message.)
    //
    // Note which way round the test is: everything that is **not** an ad is
    // considered, rather than only what says a specific `type`. An allowlist
    // reads safer and is worse here, because it silently swallows the failure
    // the loud branch below exists to catch — a `type` that is renamed,
    // dropped, or simply absent from the `trending` endpoint would leave
    // `considered` empty, and an empty `considered` takes the cacheable
    // "nothing matches" path with no log line at all.
    const considered = page.filter(item => item?.type !== 'ad');

    // `flatMap` over `filter(Boolean)` so the nulls narrow out of the type,
    // and a dropped item is a dropped item rather than a failed search — an
    // upstream that starts serving one odd result should cost that result and
    // nothing else (§5).
    const mapped = considered.flatMap((item: KlipyItem) => {
        const attachment = config.toAttachment(item);
        return attachment ? [attachment] : [];
    });

    // Dropping *every* result the provider sent is not a search with no
    // matches — it is a provider we can no longer read: a renamed tier, a
    // `file` that stopped being nested that way, a key that lost
    // `format_filter`. Told apart because the two answers differ in every way
    // that matters — "no matches" is `unavailable: false` and cacheable, so a
    // schema change would otherwise show every player "nothing matches" for
    // every query, log nothing at all, and be held at the edge for an hour
    // fresh and a day stale — outliving the fix.
    if (considered.length > 0 && mapped.length === 0) {
        console.error(`${config.logLabel} could not read any of the ${considered.length} results the provider sent`);
        return null;
    }
    // A partial drop is still worth a line: a mapping that has quietly
    // decayed to three results out of twenty-four is otherwise invisible
    // until somebody notices the picker looks thin.
    if (mapped.length < considered.length) {
        console.warn(`${config.logLabel} dropped ${considered.length - mapped.length} of ${considered.length} results`);
    }
    return mapped;
}

/**
 * Write what this search learned into the catalogue, so the chat POST can
 * resolve any of these ids without calling the provider (§4c).
 *
 * One `bulkWrite`, unordered, and wholly guarded: it is bookkeeping that runs
 * after the response has flushed, so the worst a failure here can do is cost
 * the player a "we don't know that item" on a send they may never make.
 *
 * Shared by every category, because it is one collection keyed by
 * `{provider, mediaId}` regardless of what put a row there — a meme and a GIF
 * are both just `IChatAttachment`s to this table.
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
        // Two searches racing on the same id is what the unique index is
        // *for*: both upserts try to insert, one wins, the loser gets E11000
        // — and the row it wanted is there either way. Anything else is
        // worth a line.
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
 * question is not "was this a duplicate key" but "was *everything* that
 * failed one". A batch where one row lost a race and another hit a real write
 * failure still deserves the log line.
 */
function isOnlyDuplicateKeyErrors(error: unknown): boolean {
    const writeErrors = (error as { writeErrors?: unknown } | null)?.writeErrors;
    if (Array.isArray(writeErrors)) {
        // Walked, rather than read off the error's own `code` — because the
        // driver copies `writeErrors[0].code` up to the top level, so that
        // field says what the *first* failure was and never whether the rest
        // were the same. Each entry exposes its code through a getter over an
        // inner `err`, so both spellings are accepted.
        return writeErrors.length > 0
            && writeErrors.every(one => isDuplicateKeyError(one) || isDuplicateKeyError((one as { err?: unknown })?.err));
    }
    return isDuplicateKeyError(error);
}
