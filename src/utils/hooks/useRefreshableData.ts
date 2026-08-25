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
export interface RefreshableData<T> {
    data: T | null;
    isLoading: boolean;
    isRefreshing: boolean;
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
    options: Pick<PushEventsOptions, 'pollWhileWatching'> = {}
): RefreshableData<T> {
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
        if (!isAuthorised) {
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
    }, [url, isAuthorised]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    usePushEvents(events, refresh, { refreshOnVisible: true, ...options });

    return { data, isLoading, isRefreshing, status, refresh };
}
