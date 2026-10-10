// Fetching a game's board ahead of the tap that opens it — the intent half of
// docs/loading-performance-plan.md, Phase 1.4. A player's finger on a game row
// (or the pointer over it, or focus on it) is the best signal there is that
// the board is next, and the board's API call is the longest step of opening
// it, so it is started then: the board's own `useGameData` finds the answer
// already in the cache, or joins the request still out, instead of beginning
// one after the page has loaded.
//
// It is the *same* fetch as the board's, not a parallel implementation: it goes
// through `loadSharedResource`, the one request every cached screen shares.

import { isDataCacheOwner, isDataInFlight, loadSharedResource, readCachedData } from "./dataCache";

// Exported so the prefetch and the screen that reads it can't disagree on what
// they are talking about.
export const gameDataUrl = (gameId: string) => `/api/game/${gameId}`;

/**
 * How long the board a game opens with may be, in ms: what `useGameData` paints
 * from cache, and so what a prefetch need not repeat. 30 s is the plan's
 * starting figure, to be tuned from the checkpoint's hit rate.
 */
export const GAME_DATA_CACHE_MS = 30_000;

// At most one prefetch at a time. A pointer sweeping down a list of rows would
// otherwise ask for every board on it, and a burst of intent is one intent.
let prefetching = false;

/** Whether the browser asks apps to use less data (Chrome's Data Saver, a metered connection). */
function savingData(): boolean {
    return (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
}

/**
 * Starts fetching `gameId`'s board into the cache for `userId`, unless there
 * is a reason not to. Fire and forget; every reason below makes it a no-op:
 *
 * - **Not authorised.** `userId` is the viewer's id once they are signed in,
 *   unlocked and the session is confirmed (`useGamePrefetch` passes null
 *   otherwise), and the cache must belong to them.
 * - **Data Saver.** `navigator.connection.saveData`.
 * - **Already fresh.** The cache holds a board younger than `GAME_DATA_CACHE_MS`.
 * - **Already in flight.** For this board (the screen or an earlier prefetch
 *   asked), or any other prefetch.
 *
 * Reports `data_prefetch` (how long it took) so the next checkpoint can tell
 * whether the prefetches arrive before the taps. Never on page load or idle.
 */
export function prefetchGameData(userId: string | null | undefined, gameId: string, refreshSession?: () => Promise<void>): void {
    if (!isDataCacheOwner(userId) || prefetching || savingData()) return;
    const url = gameDataUrl(gameId);
    if (isDataInFlight(userId, url) || readCachedData(userId, url, GAME_DATA_CACHE_MS)) return;
    prefetching = true;
    const startedAt = performance.now();
    // The route the player was on when they showed intent: by the time the
    // answer is in they may be on the board itself.
    const pathname = window.location.pathname;
    void loadSharedResource(userId, url, { join: false, refreshSession }).result.then(({ response, parsed }) => {
        if (parsed && response?.ok) window.__agPerformanceMetric?.('data_prefetch', performance.now() - startedAt, pathname);
    }).finally(() => {
        prefetching = false;
    });
}

