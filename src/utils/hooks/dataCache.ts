// The tab's short memory of what it has fetched for the signed-in player — the
// authenticated in-memory resource cache of docs/loading-performance-plan.md,
// Phase 1.3. `useRefreshableData` reads and writes it for the screens that opt
// in (`cacheFor`), and `prefetchGameData` fills it ahead of a tap.
//
// What it holds are *authorised response bodies*: a game's board is viewer-
// specific (the viewer's hand, the viewer's view of a fogged map), the
// dashboard is the viewer's lists. So the rules are the plan's guardrails, and
// each is enforced here rather than left to the callers:
//
// - **One owner.** The cache belongs to one signed-in player. `setDataCacheOwner`
//   empties it whenever that changes — sign-out, a locked account, another
//   account in the same tab (`useDataCacheOwner`, mounted once in `Providers`)
//   — and every read and write names the player it is for, so a body kept for
//   one can't be handed to another even in the instant before that runs.
// - **Memory only.** A module-level Map: gone with the tab, never in
//   `localStorage`, Cache Storage or the service worker.
// - **Successes only.** A failed request, a 401 or a body that doesn't parse is
//   never stored; a 403/404 (the game is not yours, or is gone) drops what was.
// - **Bounded.** At most `DATA_CACHE_MAX_ENTRIES` bodies, least recently used
//   out first; and a body is only *used* while it is younger than the age the
//   reader asks for (`readCachedData`).
//
// A cached body is a provisional paint (plan guardrail 4): the screen that
// paints it fetches again at once, and `isDataUnconfirmed` tells a command that
// it was built on a board the server hasn't confirmed (see `useSubmitCommand`).
//
// Pure TypeScript with no React in it, so it can be tested without a browser.

import { fetchWithSessionRetry, type RefreshSession, type SessionFetchTiming } from "./fetchWithSessionRetry";

/** How many bodies one tab keeps. A board is 13–32 KB, so this is well under a megabyte. */
export const DATA_CACHE_MAX_ENTRIES = 20;

interface Entry {
    body: unknown;
    /** `Date.now()` when the body was fetched, or written locally (a command's own response). */
    fetchedAt: number;
    /** When it was written, on `tick`: a request started before this may be answering an older question. */
    writtenAt: number;
    /** Whether a prefetch fetched it, rather than a screen: what the performance report splits hits by. */
    prefetched: boolean;
}

/** What one request came back with. `response` is null for a network error or a timeout. */
export interface ResourceResult {
    response: Response | null;
    /** The parsed JSON, when `parsed`. */
    body: unknown;
    /** False for a response that wasn't a 2xx with a JSON body. */
    parsed: boolean;
    parseError?: unknown;
    timing: SessionFetchTiming;
}

interface InFlight {
    result: Promise<ResourceResult>;
    startedAt: number;
}

// Who the entries belong to; null before anyone is signed in.
let owner: string | null = null;
// A counter that only goes up, so "was this written after that request began?"
// has an answer that doesn't depend on the clock.
let tick = 0;
// A Map iterates in insertion order, so the first key is the least recently
// used one provided every use re-inserts: see `touch`.
const entries = new Map<string, Entry>();
const inFlight = new Map<string, InFlight>();
// The keys whose on-screen body came from `entries` and hasn't been answered
// by a request since: see `isDataUnconfirmed`.
const unconfirmed = new Set<string>();

// The player in the key as well as in `owner`: the purge is what frees the
// memory, but this is what makes a cross-user hit impossible.
const keyOf = (userId: string, url: string) => `${userId}\n${url}`;

function touch(key: string, entry: Entry) {
    entries.delete(key);
    entries.set(key, entry);
}

/**
 * Names the player the cache is for, emptying it if that is someone new — or no
 * one: pass null on sign-out and for a locked account. Requests already in
 * flight finish, but their answers are no longer kept (a write names its
 * player, and that player is no longer the owner).
 */
export function setDataCacheOwner(userId: string | null | undefined): void {
    const next = userId ?? null;
    if (next === owner) return;
    owner = next;
    entries.clear();
    inFlight.clear();
    unconfirmed.clear();
}

/** Whether `userId` is the player the cache is for — and so whether anything it holds is theirs. */
export function isDataCacheOwner(userId: string | null | undefined): userId is string {
    return !!userId && userId === owner;
}

/**
 * The body kept for `url`, if it is younger than `maxAgeMs`, with its age. A
 * read counts as a use for the LRU. Null for anyone but the owner, whatever is
 * kept; an entry that looks to be from the future (the clock moved) is treated
 * as stale.
 */
export function readCachedData<T>(userId: string | null | undefined, url: string, maxAgeMs: number): { body: T; ageMs: number; prefetched: boolean } | null {
    if (!isDataCacheOwner(userId)) return null;
    const key = keyOf(userId, url);
    const entry = entries.get(key);
    if (!entry) return null;
    const ageMs = Date.now() - entry.fetchedAt;
    if (ageMs < 0 || ageMs >= maxAgeMs) return null;
    touch(key, entry);
    return { body: entry.body as T, ageMs, prefetched: entry.prefetched };
}

/**
 * Keeps `body` for `url`. Returns whether it was kept: not for anyone but the
 * owner, and not when `startedAt` (the `tick` the request that brought it began
 * at) is older than what is already there — a newer fetch or a local write has
 * landed since, and this answer may predate it. A local write passes no
 * `startedAt` and always lands. `prefetched` marks a body a prefetch brought.
 */
export function writeCachedData(userId: string | null | undefined, url: string, body: unknown, { startedAt, prefetched = false }: { startedAt?: number; prefetched?: boolean } = {}): boolean {
    if (!isDataCacheOwner(userId)) return false;
    const key = keyOf(userId, url);
    const existing = entries.get(key);
    if (startedAt !== undefined && existing && existing.writtenAt > startedAt) return false;
    entries.delete(key);
    entries.set(key, { body, fetchedAt: Date.now(), writtenAt: ++tick, prefetched });
    while (entries.size > DATA_CACHE_MAX_ENTRIES) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
        unconfirmed.delete(oldest);
    }
    return true;
}

/** Drops what is kept for `url`: the server says it is not (or no longer) the player's to see. */
export function forgetCachedData(userId: string | null | undefined, url: string): void {
    if (!isDataCacheOwner(userId)) return;
    const key = keyOf(userId, url);
    entries.delete(key);
    unconfirmed.delete(key);
}

/**
 * Notes that the body on screen for `url` came from the cache and hasn't been
 * confirmed by a request since. A command built on such a board names the board
 * it was built on, so the server can refuse it if the game has moved
 * (`useSubmitCommand`, `expectedCommandCount`).
 */
export function markDataUnconfirmed(userId: string | null | undefined, url: string): void {
    if (isDataCacheOwner(userId)) unconfirmed.add(keyOf(userId, url));
}

/** A request for `url` has answered: what is on screen is the server's. */
export function confirmData(userId: string | null | undefined, url: string): void {
    if (userId) unconfirmed.delete(keyOf(userId, url));
}

/** See `markDataUnconfirmed`. */
export function isDataUnconfirmed(userId: string | null | undefined, url: string): boolean {
    return !!userId && unconfirmed.has(keyOf(userId, url));
}

/**
 * One GET of `url` and its JSON, with the session-renewal retry every fetch in
 * the app gets (`fetchWithSessionRetry`). Never throws: a failure is a
 * `ResourceResult` that isn't `parsed`.
 */
export async function fetchResource(url: string, isCancelled: () => boolean, refreshSession?: RefreshSession): Promise<ResourceResult> {
    const timing: SessionFetchTiming = { startedAt: 0 };
    let response: Response | null;
    try {
        response = await fetchWithSessionRetry(url, isCancelled, refreshSession, timing);
    } catch (error) {
        // Nothing in the ladder is meant to throw, but a request that is shared
        // must not be able to: its key stays "in flight" until it settles, and
        // a rejection would leave every later screen joining a dead promise.
        console.error(`fetchResource: ${url} failed`, error);
        response = null;
    }
    if (!response || !response.ok) {
        return { response, body: undefined, parsed: false, timing };
    }
    try {
        return { response, body: await response.json(), parsed: true, timing };
    } catch (parseError) {
        // A 200 that isn't JSON — a proxy's error page, a truncated body.
        return { response, body: undefined, parsed: false, parseError, timing };
    }
}

/** A response that says the thing is not (or no longer) the viewer's to read: what was kept for it goes. */
const isGoneAnswer = (status: number | undefined) => status === 403 || status === 404 || status === 410;

/**
 * `fetchResource` through the cache, for the owner: the request every cached
 * screen and every prefetch share.
 *
 * - **One request per key.** With `join`, a request already in flight for this
 *   key is joined rather than repeated — but only one that began after the last
 *   write to the key, so a local write can't be answered by an older body.
 *   Only a screen's *entry* fetch should join: a refresh asked for by a push
 *   must be a request that starts after the push, not one already out.
 * - **The answer is kept**, if it is a success and nothing newer has landed
 *   (`writeCachedData`), whether or not anyone is still waiting on it: that is
 *   what lets a prefetch be picked up by a screen that opens a moment later.
 * - Nothing here cancels: the request outlives whoever started it, because
 *   someone else may have joined.
 *
 * Resolves to the starter's `ResourceResult` for a joiner too, `joined` saying
 * which it was.
 */
export function loadSharedResource(userId: string, url: string, options: { join: boolean; prefetch?: boolean; refreshSession?: RefreshSession }): { result: Promise<ResourceResult>; joined: boolean } {
    const key = keyOf(userId, url);
    const existing = joinable(key);
    if (options.join && existing) {
        return { result: existing.result, joined: true };
    }
    const startedAt = ++tick;
    const flight: InFlight = {
        startedAt,
        result: fetchResource(url, () => false, options.refreshSession).then((result) => {
            if (inFlight.get(key) === flight) inFlight.delete(key);
            if (result.parsed) {
                writeCachedData(userId, url, result.body, { startedAt, prefetched: options.prefetch });
            } else if (isGoneAnswer(result.response?.status)) {
                forgetCachedData(userId, url);
            }
            return result;
        }),
    };
    inFlight.set(key, flight);
    return { result: flight.result, joined: false };
}

/** The request out for `key` that a screen's entry fetch may join: one that began after the last write to it. */
function joinable(key: string): InFlight | undefined {
    const existing = inFlight.get(key);
    return existing && existing.startedAt > (entries.get(key)?.writtenAt ?? 0) ? existing : undefined;
}

/** Whether an entry fetch for `url` would join a request already out (`loadSharedResource` with `join`), rather than start one. */
export function isDataJoinable(userId: string | null | undefined, url: string): boolean {
    return !!userId && joinable(keyOf(userId, url)) !== undefined;
}

/** Whether a request for `url` is out for `userId` right now. */
export function isDataInFlight(userId: string | null | undefined, url: string): boolean {
    return !!userId && inFlight.has(keyOf(userId, url));
}
