// A tab returning to the foreground can fire a refetch (see usePushEvents'
// refreshOnVisible, or useTurnRecap's own visibilitychange refetch) before
// Clerk has finished refreshing the session cookie that expired while
// backgrounded, so the request briefly 401s even though the user is still
// signed in. `useAuthGuard` renews the session as the tab comes back and holds
// requests until it has (`holdRequestsUntil`), which closes that race before
// the request is sent; one short retry is still what clears it for anything
// that slips past (a token that lapses mid-visit, a renewal that timed out).
const AUTH_RETRY_DELAY_MS = 1000;

// The session renewal requests wait for before they are sent, while one is out:
// the one `useAuthGuard` starts as the tab returns to the foreground, before the
// screen's refetch goes. Never rejects. Null when none is out.
let renewal: Promise<void> | null = null;

/**
 * Holds every request that waits on the session (`fetchWithSessionRetry`, and
 * the POSTs through `untilSessionRenewed`) until `work` settles. `work` must be
 * bounded, as `useAuthGuard`'s renewals are: a request waits on it unconditionally.
 */
export function holdRequestsUntil(work: Promise<unknown>): void {
    const held: Promise<void> = work.then(() => {}, () => {}).finally(() => {
        if (renewal === held) renewal = null;
    });
    renewal = held;
}

/** Settles once no session renewal is out — at once when there is none. A request that can't use `fetchWithSessionRetry` awaits this before it is sent. */
export function untilSessionRenewed(): Promise<void> {
    return renewal ?? Promise.resolve();
}

// How long a request gets before it is treated as never coming back.
//
// Nothing here had a timeout, and `fetch` has no default one: a connection
// that opens and then stalls — a phone moving between cell and wifi, a proxy
// that accepts and holds — leaves a promise that never settles. Every caller
// waits on it forever, and a caller holding a guard flag (useSubmitCommand's
// `submitting`) never clears it, so the board stays locked until the player
// reloads the page.
//
// Generous, because the slowest legitimate response here is a cold serverless
// instance opening its first Mongo connection.
// Exported because it is the app's answer to "how long is too long", not this
// helper's: the POSTs that can't use this helper (it only does GETs) still have
// to time out, and a second number would drift from this one.
export const REQUEST_TIMEOUT_MS = 20000;

/**
 * Fetches `input`, retrying once if the response is a transient 401: it asks
 * `refreshSession` (see `useSessionRefresh`) to renew the session token, waits
 * a moment for the browser to have the new cookie, and asks again.
 *
 * Both halves are needed. The renewal is the active fix — an idle tab's token
 * expires and nothing asks Clerk for another one until something does — but the
 * cookie it writes belongs to the browser, not to us, and there is no
 * "it's landed" to await, so the short wait stays as the thing that makes the
 * second attempt worth making. A caller with nothing to renew with passes no
 * `refreshSession` and gets the wait alone, exactly as before.
 *
 * Returns null if the fetch throws or times out, or if `isCancelled()` reports
 * true once the retry delay has elapsed (the caller unmounted or superseded this
 * request in the meantime) — callers should treat null the same as any other
 * failure.
 *
 * A caller that reports its timings passes `timing` (`{ startedAt: 0 }`), which
 * is filled in as the request goes: which attempt the response came from, and what the retry cost.
 */
export async function fetchWithSessionRetry(
    input: string,
    isCancelled: () => boolean,
    refreshSession?: RefreshSession,
    timing?: SessionFetchTiming,
): Promise<Response | null> {
    // Only while a renewal is out: with none, the request goes in the same tick.
    if (renewal) await renewal;
    const first = performance.now();
    if (timing) timing.startedAt = first;
    const res = await attempt(input);
    if (res?.status !== 401) return res;

    const renewed = await refreshSession?.();
    if (timing && renewed) timing.renewal = renewed;
    await new Promise((resolve) => setTimeout(resolve, AUTH_RETRY_DELAY_MS));
    if (isCancelled()) return null;
    if (timing) {
        timing.startedAt = performance.now();
        timing.retryMs = timing.startedAt - first;
    }
    return attempt(input);
}

/** What `fetchWithSessionRetry` did on the way to its answer, for the performance report. */
export interface SessionFetchTiming {
    /** `performance.now()` as the attempt that produced the response began: the browser's record of it starts after. */
    startedAt: number;
    /** Set only when the session had to be renewed: how long the refused attempt, the renewal and the wait cost. */
    retryMs?: number;
    /** Set only when the renewal said how it went: Clerk's part of `retryMs`, which is neither the refused attempt nor the fixed wait. */
    renewal?: TokenAsk;
}

/**
 * How one ask of Clerk for a session token went: whether it answered, ran to
 * its deadline or failed, and how long it took — null when the page was hidden
 * for some of it, as a throttled timer makes that time meaningless.
 */
export interface TokenAsk { outcome: 'answered' | 'timeout' | 'failed'; tookMs: number | null }

/** Renews the session before a retry, saying how the ask went where it can (`useSessionRefresh` does). */
export type RefreshSession = () => Promise<TokenAsk | void>;

async function attempt(input: string): Promise<Response | null> {
    try {
        return await fetch(input, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (error) {
        console.error(`fetchWithSessionRetry: ${input} failed`, error);
        return null;
    }
}

/**
 * Where a tab records that it has already reloaded itself to renew a session,
 * so that it cannot do it twice and spin.
 *
 * `sessionStorage`, and so not the `localStorage` that `useStoredValue` owns
 * for the whole app: this is a fact about *this tab's* current page. It means
 * nothing in another tab and nothing at all once the tab is closed, which is
 * exactly the lifetime `sessionStorage` has and `localStorage` doesn't.
 */
const RELOAD_MARKER_KEY = 'ag-session-reload';

// Whether this document has already fired its reload. `location.reload()` does
// not stop the page it is replacing: in-flight fetches land and pending retry
// timers fire while the new document is still being fetched, and one of them
// succeeding would otherwise hand back — via `clearStaleSessionReload` — the
// very reload the tab is in the middle of taking. The page that came back would
// then find no marker and be free to reload again. A document that has fired
// its one reload is done deciding, whatever else lands in that window.
let reloadFired = false;

/**
 * Reloads the page, once, to renew a session cookie that nothing on the client
 * can fix — and reports whether it did.
 *
 * A page load starts Clerk afresh in the browser, and Clerk then mints a new
 * session cookie from the signed-in client it still holds, which a fetch from a
 * long-running tab doesn't always manage. (The middleware no longer has a hand
 * in it: it only runs on the API, so a document request gets no handshake.) An
 * in-app navigation doesn't start Clerk afresh, so a player in this state gets
 * nowhere by being sent to another screen, which is why "just refresh the page"
 * is what has always fixed it by hand.
 *
 * Strictly once per tab per stale session, guarded twice over: a marker written
 * *before* the reload, which survives it and is given back only by a fetch that
 * then succeeds (`clearStaleSessionReload`), and `reloadFired`, which settles
 * the outgoing document's answer for good so that nothing landing during the
 * reload can reopen it. A session that is genuinely dead — signed out
 * elsewhere, revoked — therefore reloads exactly one time and then answers
 * false, leaving the caller to handle the failure its own way.
 *
 * It also answers false when there is no storage to remember the attempt with
 * (private mode, blocked site data): with no way to stop a second reload, don't
 * take the first. A duplicated tab inherits the marker with the rest of the
 * source tab's `sessionStorage`, so it can inherit a spent one and skip
 * straight to the caller's own handling — a repair not taken, which is the side
 * to err on.
 */
export function reloadForStaleSession(): boolean {
    if (reloadFired) {
        return false;
    }
    try {
        if (window.sessionStorage.getItem(RELOAD_MARKER_KEY) !== null) {
            return false;
        }
        window.sessionStorage.setItem(RELOAD_MARKER_KEY, new Date().toISOString());
    } catch {
        return false;
    }
    reloadFired = true;
    console.warn('Session looks stale with nothing loaded — reloading once to renew it');
    window.location.reload();
    return true;
}

/**
 * Gives this tab its one reload back, because something loaded: whatever the
 * session was, it works now. Called by every successful fetch, so the next time
 * a token really does expire the recovery above is available again.
 */
export function clearStaleSessionReload(): void {
    // A fetch that succeeds while the reload this document asked for is still
    // being fetched must not give that reload back.
    if (reloadFired) {
        return;
    }
    try {
        window.sessionStorage.removeItem(RELOAD_MARKER_KEY);
    } catch {
        // Nothing stored it in the first place; nothing to give back.
    }
}
