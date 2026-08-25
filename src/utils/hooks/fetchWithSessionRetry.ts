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
const REQUEST_TIMEOUT_MS = 20000;

/**
 * Fetches `input`, retrying once after a short delay if the response is a
 * transient 401. Returns null if the fetch throws or times out, or if `isCancelled()`
 * reports true once the retry delay has elapsed (the caller unmounted or
 * superseded this request in the meantime) — callers should treat null the
 * same as any other failure.
 */
export async function fetchWithSessionRetry(
    input: string,
    isCancelled: () => boolean,
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
        await new Promise((resolve) => setTimeout(resolve, AUTH_RETRY_DELAY_MS));
        if (isCancelled()) return null;
        return fetchWithSessionRetry(input, isCancelled, true);
    }

    return res;
}
