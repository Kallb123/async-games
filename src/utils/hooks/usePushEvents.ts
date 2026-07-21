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

/**
 * Subscribe to a set of `window` events (the FCM pushes re-dispatched by
 * `FcmTokenComp`) and invoke `handler` whenever any of them fires. The handler
 * is held in a ref so callers can pass an inline function without needing to
 * memoise it, and the listeners are always cleaned up on unmount.
 */
export function usePushEvents(events: readonly string[], handler: () => void) {
    const handlerRef = useRef(handler);
    handlerRef.current = handler;

    useEffect(() => {
        const listener = () => handlerRef.current();
        events.forEach((event) => window.addEventListener(event, listener));
        return () => events.forEach((event) => window.removeEventListener(event, listener));
        // The event list is a stable module-level constant at every call site.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [events.join(',')]);
}
