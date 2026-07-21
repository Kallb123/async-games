'use client'
import { useEffect, useRef } from 'react';

/**
 * Push events (re-dispatched onto `window` by `FcmTokenComp`) that mean the
 * active turn has moved on and any turn-aware screen should re-fetch:
 *
 * - `TurnTaken`   — an opponent completed their turn (`/api/game/command`).
 * - `TurnExpired` — the turn timer advanced the turn (`/api/cron/turntimer`).
 * - `YourTurn`    — it is now this player's turn (sent by both of the above).
 *
 * Historically only `TurnTaken` was listened for, so timer-driven turn
 * changes never refreshed the UI until a manual reload.
 */
export const TURN_ADVANCED_EVENTS = ['TurnTaken', 'TurnExpired', 'YourTurn'] as const;

interface PushEventsOptions {
    /**
     * Also re-run `handler` whenever the tab returns to the foreground. FCM only
     * fires `onMessage` (and therefore re-dispatches these window events) while
     * the tab is visible; a push that arrives while the tab is backgrounded goes
     * to the service worker instead, so the tab would otherwise show stale state
     * until a manual refresh. Re-fetching on `visibilitychange` closes that gap
     * when switching between tabs. Defaults to `false`.
     */
    refreshOnVisible?: boolean;
}

/**
 * Subscribe to a set of `window` events (the FCM pushes re-dispatched by
 * `FcmTokenComp`) and invoke `handler` whenever any of them fires. The handler
 * is held in a ref so callers can pass an inline function without needing to
 * memoise it, and the listeners are always cleaned up on unmount.
 *
 * Pass `{ refreshOnVisible: true }` for screens that must also re-sync when the
 * tab is brought back to the foreground (see `PushEventsOptions`).
 */
export function usePushEvents(
    events: readonly string[],
    handler: () => void,
    options: PushEventsOptions = {},
) {
    const { refreshOnVisible = false } = options;
    const handlerRef = useRef(handler);
    handlerRef.current = handler;

    useEffect(() => {
        const listener = () => handlerRef.current();
        events.forEach((event) => window.addEventListener(event, listener));

        const onVisibility = () => {
            if (document.visibilityState === 'visible') {
                handlerRef.current();
            }
        };
        if (refreshOnVisible) {
            document.addEventListener('visibilitychange', onVisibility);
        }

        return () => {
            events.forEach((event) => window.removeEventListener(event, listener));
            if (refreshOnVisible) {
                document.removeEventListener('visibilitychange', onVisibility);
            }
        };
        // The event list is a stable module-level constant at every call site.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [events.join(','), refreshOnVisible]);
}
