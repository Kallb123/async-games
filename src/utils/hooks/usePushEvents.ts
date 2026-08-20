'use client'
import { useEffect, useRef } from 'react';

/**
 * Push events (re-dispatched onto `window` by `FcmTokenComp`) that mean the
 * active turn has moved on and any turn-aware screen should re-fetch.
 *
 * Just `YourTurn` — it is now this player's turn, sent by `/api/game/command`,
 * `/api/game/taketurn`, `/api/cron/turntimer` when the timer advances the turn,
 * and `/api/invite/accept` to whoever moves first in a game that has just
 * started.
 *
 * There were once two more, `TurnTaken` and `TurnExpired`, sent to every player
 * with no notification attached purely to drive this refetch. WebKit revokes a
 * push subscription after three pushes that display nothing, so on iOS they
 * cost players their notifications entirely within a few turns. They are gone;
 * what they covered is now covered without push — `refreshOnVisible` for a tab
 * coming back, and `pollWhileVisible` for a board being watched live.
 */
export const TURN_ADVANCED_EVENTS = ['YourTurn'] as const;

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

/**
 * Push events that move a game into a player's finished list — currently just
 * `GameOver`, sent to every player when a game ends.
 */
export const COMPLETED_GAME_EVENTS = ['GameOver'] as const;

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
    /**
     * Re-run `handler` every `POLL_MS` while the tab is in the foreground.
     * Ticks in a hidden tab are skipped, so a backgrounded tab makes no
     * requests. Unlike the other options this one is read live, so it can be
     * flipped as often as the caller likes without disturbing the listeners.
     *
     * This is what covers the one case push no longer does: a player sitting on
     * a screen watching someone else's turn go by. `visibilitychange` never
     * fires there because the tab never left. Callers should pass a condition
     * narrow enough that the polling stops as soon as there is nothing to wait
     * for — see `useGameData`. Defaults to `false`.
     */
    pollWhileVisible?: boolean;
}

/**
 * How often `pollWhileVisible` re-runs the handler. Async games move at
 * human speed, so this only has to be faster than a player notices, not
 * real-time — and every tick is a request per watching player.
 */
const POLL_MS = 15000;

/**
 * How long (ms) to collapse a burst of triggers into a single `handler` call.
 * A foreground return can coincide with an arriving push, and a poll tick can
 * land next to either — all of which map to the same "refetch latest state"
 * action, so we fire it once per burst rather than once per trigger. Small
 * enough to stay imperceptible.
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
    const { refreshOnVisible = false, pollWhileVisible = false } = options;
    const handlerRef = useRef(handler);
    // Whether polling is wanted flips as often as the turn does, so it is read
    // through a ref for the same reason the handler is: as a dependency it
    // would tear down and rebuild every listener on every turn change, and the
    // teardown would discard a refetch already coalesced and waiting.
    const pollRef = useRef(pollWhileVisible);
    // Kept current after each render rather than during it — writing a ref while
    // rendering is a side effect (react-hooks/refs). Both are only ever read
    // from a timer callback, long after the commit.
    useEffect(() => {
        handlerRef.current = handler;
        pollRef.current = pollWhileVisible;
    });

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

        // The tick checks visibility rather than being subscribed to it: a timer
        // that wakes to do nothing in a hidden tab is free (browsers throttle
        // background timers anyway), and the request it would have made is what
        // actually costs something. Ticks go through `schedule`, so a poll
        // landing next to a push still refetches once.
        const poll = setInterval(() => {
            if (pollRef.current && document.visibilityState === 'visible') {
                schedule();
            }
        }, POLL_MS);

        return () => {
            if (timer !== null) {
                clearTimeout(timer);
            }
            clearInterval(poll);
            events.forEach((event) => window.removeEventListener(event, schedule));
            if (refreshOnVisible) {
                document.removeEventListener('visibilitychange', onVisibility);
            }
        };
        // The event list is a stable module-level constant at every call site.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [events.join(','), refreshOnVisible]);
}
