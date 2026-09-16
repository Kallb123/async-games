// A tab returning to the foreground can fire a refetch (see usePushEvents'
// refreshOnVisible, or useTurnRecap's own visibilitychange refetch) before
// Clerk has finished refreshing the session cookie that expired while
// backgrounded, so the request briefly 401s even though the user is still
// signed in. One short retry clears that race.
const AUTH_RETRY_DELAY_MS = 1000;

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
 */
export async function fetchWithSessionRetry(
    input: string,
    isCancelled: () => boolean,
    refreshSession?: () => Promise<void>,
    isRetry = false,
): Promise<Response | null> {
    let res: Response;
    try {
        res = await fetch(input, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (error) {
        console.error(`fetchWithSessionRetry: ${input} failed`, error);
        return null;
    }

    if (res.status === 401 && !isRetry) {
        await refreshSession?.();
        await new Promise((resolve) => setTimeout(resolve, AUTH_RETRY_DELAY_MS));
        if (isCancelled()) return null;
        return fetchWithSessionRetry(input, isCancelled, refreshSession, true);
    }

    return res;
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
 * Only a *document* request passes through `clerkMiddleware`, and only the
 * middleware can answer an expired cookie with Clerk's handshake and set a
 * fresh one. An in-app navigation is an RSC request, so it cannot: a player in
 * this state gets nowhere by being sent to another screen, which is why
 * "just refresh the page" is what has always fixed it by hand.
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
