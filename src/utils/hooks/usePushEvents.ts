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
 * Push events that change which game invitations a player can see — a new invite
 * arriving, someone accepting, the sender cancelling, or the game finally
 * starting once everyone's in. Any invite-aware screen (the home dashboard's
 * incoming/outgoing invite lists) should re-fetch when one fires.
 */
export const INVITE_EVENTS = ['NewInvite', 'InviteAccepted', 'InviteCancelled', 'GameStart'] as const;

/**
 * Push events that change a player's friends / friend-requests — a request
 * arriving, being accepted, or a friendship/request being removed (decline,
 * cancel, or unfriend). The profile screen re-fetches when one fires.
 */
export const FRIEND_EVENTS = ['FriendInvite', 'FriendAccepted', 'FriendRemoved'] as const;

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
 * How long (ms) to collapse a burst of triggers into a single `handler` call.
 * A turn change delivers two pushes back-to-back (`TurnTaken` + `YourTurn`),
 * and a foreground return can coincide with an arriving push — all of which map
 * to the same "refetch latest state" action, so we fire it once per burst
 * rather than once per trigger. Small enough to stay imperceptible.
 */
const COALESCE_MS = 200;

/**
 * Subscribe to a set of `window` events (the FCM pushes re-dispatched by
 * `FcmTokenComp`) and invoke `handler` whenever any of them fires. The handler
 * is held in a ref so callers can pass an inline function without needing to
 * memoise it, and the listeners are always cleaned up on unmount.
 *
 * Triggers are coalesced (see `COALESCE_MS`): any number of events (plus a
 * foreground return) within the window result in a single `handler` call, so a
 * screen refetches once per burst instead of once per push. This is safe
 * because the handler always fetches current state.
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
        let timer: ReturnType<typeof setTimeout> | null = null;
        // Schedule a single trailing call; further triggers while one is pending
        // are absorbed into it rather than queuing extra refetches.
        const schedule = () => {
            if (timer !== null) {
                return;
            }
            timer = setTimeout(() => {
                timer = null;
                handlerRef.current();
            }, COALESCE_MS);
        };

        events.forEach((event) => window.addEventListener(event, schedule));

        const onVisibility = () => {
            if (document.visibilityState === 'visible') {
                schedule();
            }
        };
        if (refreshOnVisible) {
            document.addEventListener('visibilitychange', onVisibility);
        }

        return () => {
            if (timer !== null) {
                clearTimeout(timer);
            }
            events.forEach((event) => window.removeEventListener(event, schedule));
            if (refreshOnVisible) {
                document.removeEventListener('visibilitychange', onVisibility);
            }
        };
        // The event list is a stable module-level constant at every call site.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [events.join(','), refreshOnVisible]);
}
