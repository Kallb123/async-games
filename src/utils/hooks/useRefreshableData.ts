'use client'
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWithSessionRetry } from "./fetchWithSessionRetry";
import { usePushEvents, PushEventsOptions } from "./usePushEvents";
import { useIsAuthorised } from "./useAuthGuard";

/**
 * A JSON endpoint the UI keeps in sync with push notifications.
 *
 * The important part is the two loading flags. Screens used to have a single
 * `isLoading` that a push-driven refetch flipped back to true, which swapped
 * live content out for a skeleton and made everything below it jump:
 *
 * - `isLoading` is true only until the *first* response lands. It is the only
 *   thing that should ever put a skeleton on screen.
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
    /** HTTP status of the last completed attempt (null before one finishes, or on a network error). */
    status: number | null;
    refresh: () => Promise<void>;
}

const NO_EVENTS: readonly string[] = [];

/**
 * Fetches `url` once the viewer is signed in and unlocked (see `useIsAuthorised`),
 * then re-fetches whenever one of `events` fires or the tab returns to the
 * foreground (see `usePushEvents`). Overlapping refreshes are dropped — a burst
 * of pushes results in one request, not one per push.
 *
 * Pass `{ pollWhileWatching: true }` for a screen whose whole job is waiting for
 * something to change while the player sits and looks at it — the lobby filling
 * up. Nothing pushes for those (see `usePushEvents`) and the tab never leaves,
 * so `refreshOnVisible` never fires either.
 *
 * `T` is the whole JSON body; callers pick the field they need, which keeps the
 * hook agnostic about response shapes.
 */
export function useRefreshableData<T>(
    url: string,
    events: readonly string[] = NO_EVENTS,
    options: Pick<PushEventsOptions, 'pollWhileWatching'> & {
        /** Skip fetching entirely while false — for a hook that mounts before it
         *  has an endpoint worth reading (the chat shell on a single-seat game,
         *  which has no thread). `data` stays null and `isLoading` stays true, so
         *  a caller that only renders once enabled never sees a stale flag. */
        enabled?: boolean;
    } = {}
): RefreshableData<T> {
    const { pollWhileWatching, enabled = true } = options;
    const { isAuthorised } = useIsAuthorised();
    const [data, setData] = useState<T | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [status, setStatus] = useState<number | null>(null);

    const mountedRef = useRef(true);
    const loadedRef = useRef(false);
    const inFlightRef = useRef(false);
    // A refresh asked for while one is already running (e.g. accepting an invite
    // just as a push lands). The in-flight response predates the change that
    // prompted it, so we re-run once rather than dropping the request.
    const rerunRef = useRef(false);

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    const refresh = useCallback(async () => {
        if (!isAuthorised || !enabled) {
            return;
        }
        if (inFlightRef.current) {
            rerunRef.current = true;
            return;
        }
        inFlightRef.current = true;
        if (loadedRef.current) {
            setIsRefreshing(true);
        }

        try {
            do {
                rerunRef.current = false;
                const response = await fetchWithSessionRetry(url, () => !mountedRef.current);
                if (!mountedRef.current) {
                    return;
                }
                setStatus(response?.status ?? null);
                if (!response || !response.ok) {
                    console.error(`Failed to load ${url}: ${response?.status ?? "network error"}`);
                    continue;
                }
                try {
                    setData(await response.json() as T);
                } catch (error) {
                    console.error(`Failed to parse ${url}`, error);
                }
            } while (rerunRef.current && mountedRef.current);
        } finally {
            inFlightRef.current = false;
            loadedRef.current = true;
            if (mountedRef.current) {
                setIsLoading(false);
                setIsRefreshing(false);
            }
        }
    }, [url, isAuthorised, enabled]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    usePushEvents(events, refresh, { refreshOnVisible: true, pollWhileWatching });

    return { data, isLoading, isRefreshing, status, refresh };
}
