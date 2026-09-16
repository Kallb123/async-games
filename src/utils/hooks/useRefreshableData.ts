'use client'
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { fetchWithSessionRetry } from "./fetchWithSessionRetry";
import { usePushEvents } from "./usePushEvents";
import { useIsAuthorised } from "./useAuthGuard";

/**
 * A JSON endpoint the UI keeps in sync with push notifications.
 *
 * The important part is the two loading flags. Screens used to have a single
 * `isLoading` that a push-driven refetch flipped back to true, which swapped
 * live content out for a skeleton and made everything below it jump:
 *
 * - `isLoading` is true only until the *first* answer the hook is going to act
 *   on — a response, or a failure it has stopped retrying (see
 *   `retryDelayMs`). It is the only thing that should ever put a skeleton on
 *   screen.
 * - `isRefreshing` is true while a later refetch is in flight. The content that
 *   is already on screen stays exactly where it is; render it inside a
 *   `Refreshable` (the `ag-refreshing` shimmer) instead.
 *
 * A failed refresh keeps the last good `data` for the same reason — losing the
 * list because one fetch 500'd is worse than showing slightly stale rows.
 */
/**
 * The two loading flags on their own, for a presentational component handed
 * data someone else fetched. Declared once here rather than per screen: a list
 * rendered on the dashboard and again on its own full-history page wants the
 * same pair either way.
 */
export interface RefreshableState {
    isLoading: boolean;
    isRefreshing: boolean;
}

export interface RefreshableData<T> extends RefreshableState {
    data: T | null;
    /** HTTP status of the last completed attempt *for the current `url`* (null
     *  before one finishes, on a network error, and again the moment the url
     *  changes — a screen that acts on a status must not act on the last
     *  screen's, see `useGameData`'s redirects). */
    status: number | null;
    refresh: () => Promise<void>;
    /**
     * Writes the body locally, for a caller that has just been handed a newer
     * one than a fetch could bring back — the game state a command's own
     * response carries, or the optimistic patch that puts a reaction on screen
     * before the POST lands. It supersedes any fetch already in flight (see
     * `generationRef`), so the two can't race.
     *
     * Most screens want nothing to do with this: a second source of truth for
     * the same rows is how a list ends up rendering everything twice. Reach for
     * it only where the server has already answered with the new state.
     */
    setData: Dispatch<SetStateAction<T | null>>;
}

const NO_EVENTS: readonly string[] = [];

/**
 * How long to wait before trying again after a failed attempt, one entry per
 * retry. A blip is over in seconds — a phone moving between cell and wifi, a
 * cold instance timing out, a session cookie Clerk hasn't finished refreshing —
 * so the first retry is quick and the last covers a slower recovery. Bounded,
 * because a screen that pretends to load forever is its own kind of broken:
 * once these are spent the screen shows what it has (its empty state, if that
 * is all it has) and waits for the next push, foreground return or poll tick.
 */
const RETRY_DELAYS_MS = [1000, 3000, 9000];

/**
 * How long to wait before retry number `attempt` (0-based), or null to stop
 * trying: the answer was definitive, or we have asked enough.
 *
 * A null `status` is a network error or a timeout — the most transient failure
 * there is. A 5xx is the server having a bad moment, a 401 is a session cookie
 * mid-refresh (`fetchWithSessionRetry` has already had one go at that one), and
 * 408/429 ask in as many words to try again. Everything else in the 4xx range
 * is an answer — a 403 from a game you aren't in, a 404 for a lobby that's gone
 * — and asking again only wastes a request and delays the screen acting on it.
 *
 * Exported for its test; nothing else should need it.
 */
export function retryDelayMs(status: number | null, attempt: number): number | null {
    if (attempt >= RETRY_DELAYS_MS.length) {
        return null;
    }
    const worthRetrying = status === null
        || status >= 500
        || status === 401
        || status === 408
        || status === 429;
    return worthRetrying ? RETRY_DELAYS_MS[attempt] : null;
}

/**
 * Fetches `url` once the viewer is signed in and unlocked (see `useIsAuthorised`),
 * then re-fetches whenever one of `events` fires or the tab returns to the
 * foreground (see `usePushEvents`). Overlapping refreshes are dropped — a burst
 * of pushes results in one request, not one per push.
 *
 * A failed attempt is retried on a short backoff (see `retryDelayMs`) rather
 * than left for whatever happens to ask next. Nothing above this hook should
 * treat one failed fetch as a verdict: the blip that fails it is usually over
 * before the player notices, and a screen that empties itself — or sends the
 * player somewhere else — over one is the bug this exists to prevent.
 *
 * Pass `{ pollWhileWatching: true }` for a screen whose whole job is waiting for
 * something to change while the player sits and looks at it — the lobby filling
 * up. Nothing pushes for those (see `usePushEvents`) and the tab never leaves,
 * so `refreshOnVisible` never fires either. A screen that only waits some of the
 * time passes a predicate on the last body instead: a hook can't see its own
 * result before it calls this, so the board's "is an opponent moving?" arrives
 * as a question about the data rather than an answer the caller worked out
 * first (see `useGameData`).
 *
 * `T` is the whole JSON body; callers pick the field they need, which keeps the
 * hook agnostic about response shapes.
 */
export function useRefreshableData<T>(
    url: string,
    events: readonly string[] = NO_EVENTS,
    options: {
        /** True, or a question asked of the last body. See above. */
        pollWhileWatching?: boolean | ((data: T | null) => boolean);
        /** Skip fetching entirely while false — for a hook that mounts before it
         *  has an endpoint worth reading (the chat shell on a single-seat game,
         *  which has no thread). `data` stays null and `isLoading` stays true, so
         *  a caller that only renders once enabled never sees a stale flag. */
        enabled?: boolean;
    } = {}
): RefreshableData<T> {
    const { pollWhileWatching = false, enabled = true } = options;
    const { isAuthorised } = useIsAuthorised();
    const [data, setDataState] = useState<T | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [status, setStatus] = useState<number | null>(null);
    // Which url `status` is the answer for. A screen can swap one url for
    // another without remounting — the rail's game switcher moving between two
    // boards of the same game, a profile for another player — and until the new
    // url's first attempt lands, `status` is the old one's. A caller that acts
    // on a status (`useGameData` sends a 404 to the result page) would then act
    // on it for the wrong thing. Compared during render rather than reset from
    // an effect, which is the cascading render `react-hooks/set-state-in-effect`
    // exists to stop — the same way `useGameChat` resets its older pages.
    const [statusUrl, setStatusUrl] = useState(url);
    if (url !== statusUrl) {
        setStatusUrl(url);
        setStatus(null);
    }

    const mountedRef = useRef(true);
    const loadedRef = useRef(false);
    const inFlightRef = useRef(false);
    // A refresh asked for while one is already running (e.g. accepting an invite
    // just as a push lands). The in-flight response predates the change that
    // prompted it, so we re-run once rather than dropping the request.
    const rerunRef = useRef(false);
    // Consecutive failures since the last success, which is what `retryDelayMs`
    // counts off.
    const attemptsRef = useRef(0);
    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Bumped by every local write (see `setData`). A fetch that was already out
    // when one landed is answering a question about a state that has since moved
    // on, so its body is dropped rather than overwriting the newer one. Without
    // this the two are simply last-write-wins, and a poll dispatched a moment
    // before a move lands after it and puts the board back as it was.
    //
    // It sequences this client's writes against the fetches this client
    // dispatched, which is all it can do: a fetch *started* after a write can
    // still bring back a body the server hadn't applied that write to yet (an
    // optimistic patch whose own POST is still in flight). The caller's own
    // re-fetch after that POST settles it, so the worst of that one is a
    // flicker rather than a lost write.
    const generationRef = useRef(0);
    // The retry timer fires long after the render that scheduled it, by which
    // time `refresh` may have been rebuilt around a new url — so it calls the
    // current one rather than the one it closed over.
    const refreshRef = useRef<() => void>(() => {});

    const clearRetry = useCallback(() => {
        if (retryTimerRef.current !== null) {
            clearTimeout(retryTimerRef.current);
            retryTimerRef.current = null;
        }
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            clearRetry();
        };
    }, [clearRetry]);

    const setData = useCallback<Dispatch<SetStateAction<T | null>>>((update) => {
        generationRef.current += 1;
        setDataState(update);
    }, []);

    const refresh = useCallback(async () => {
        if (!isAuthorised || !enabled) {
            return;
        }
        if (inFlightRef.current) {
            rerunRef.current = true;
            return;
        }
        // Whatever asked for this supersedes a retry still on the clock — it is
        // about to make the same request.
        clearRetry();
        inFlightRef.current = true;
        if (loadedRef.current) {
            setIsRefreshing(true);
        }

        // How long until the next attempt, decided by the last time round the
        // loop; null when there is nothing left to retry.
        let retryIn: number | null = null;
        try {
            do {
                rerunRef.current = false;
                // Read before the await, compared after it: see `generationRef`.
                const generation = generationRef.current;
                const response = await fetchWithSessionRetry(url, () => !mountedRef.current);
                if (!mountedRef.current) {
                    return;
                }
                const responseStatus = response?.status ?? null;
                setStatus(responseStatus);
                if (!response || !response.ok) {
                    console.error(`Failed to load ${url}: ${responseStatus ?? "network error"}`);
                    retryIn = retryDelayMs(responseStatus, attemptsRef.current);
                    continue;
                }
                let body: T;
                try {
                    body = await response.json() as T;
                } catch (error) {
                    // A 200 that isn't JSON — a proxy's error page, a truncated
                    // body — is as transient as a network error, and as worth
                    // asking again about.
                    console.error(`Failed to parse ${url}`, error);
                    retryIn = retryDelayMs(null, attemptsRef.current);
                    continue;
                }
                retryIn = null;
                attemptsRef.current = 0;
                if (generationRef.current === generation) {
                    setDataState(body);
                }
            } while (rerunRef.current && mountedRef.current);
        } finally {
            inFlightRef.current = false;
            if (mountedRef.current) {
                setIsRefreshing(false);
                if (retryIn === null) {
                    // Nothing more to try: what is on screen now *is* the
                    // answer, so stop holding skeletons over it.
                    loadedRef.current = true;
                    setIsLoading(false);
                } else {
                    attemptsRef.current += 1;
                    retryTimerRef.current = setTimeout(() => {
                        retryTimerRef.current = null;
                        refreshRef.current();
                    }, retryIn);
                }
            }
        }
    }, [url, isAuthorised, enabled, clearRetry]);

    useEffect(() => {
        refreshRef.current = refresh;
    });

    useEffect(() => {
        // A different endpoint (or a viewer who has just become authorised) gets
        // its own budget of retries — the last one's failures say nothing about
        // this one.
        attemptsRef.current = 0;
        refresh();
    }, [refresh]);

    usePushEvents(events, refresh, {
        refreshOnVisible: true,
        pollWhileWatching: typeof pollWhileWatching === 'function' ? pollWhileWatching(data) : pollWhileWatching,
    });

    return { data, setData, isLoading, isRefreshing, status, refresh };
}
