'use client'
import { useEffect, useRef } from 'react';

/**
 * Every event below is dispatched by `FcmTokenComp` from a push that *also*
 * showed the player a notification, and that is not a coincidence.
 *
 * A push with no notification attached displays nothing on arrival, and WebKit
 * revokes a push subscription after three of those — so a handful of silent
 * refresh pushes cost an iOS player their notifications entirely. This app used
 * to send seven kinds (`TurnTaken`, `TurnExpired`, `GameStart`,
 * `InviteAccepted`, `InviteCancelled`, `FriendRemoved`, and a `NewInvite` back
 * at the sender's own devices); every one of them is gone, and
 * `sendPushToUsers` now requires a notification so no more can be added.
 *
 * What they covered is covered without push: `refreshOnVisible` for a tab
 * coming back, and `pollWhileWatching` for a screen somebody is sitting on
 * waiting for something to change.
 *
 * The other half of that invariant is the service worker's, and it used not to
 * hold: the Firebase SDK shows nothing at all while any window of the app is
 * visible, so a push arriving to an open app displayed nothing however good its
 * notification was. `firebase-messaging-sw.js` now displays every push itself,
 * app open or not — so an event reaching a listener below really does mean the
 * player was told.
 */

/**
 * Push events that mean the active turn has moved on and any turn-aware screen
 * should re-fetch.
 *
 * Just `YourTurn` — it is now this player's turn, sent by `/api/game/command`,
 * `/api/game/taketurn`, `/api/cron/turntimer` when the timer advances the turn,
 * and `startGameFromInvitation` to whoever moves first in a game that has just
 * started.
 */
export const TURN_ADVANCED_EVENTS = ['YourTurn'] as const;

/**
 * Push events that change which game invitations a player can see. Just
 * `NewInvite`: an invite arriving is the only one of these worth a notification,
 * and so the only one still sent. A cancelled invite, an accepted seat and a
 * started game all reach the screen through `refreshOnVisible` (and, on the
 * lobby, `pollWhileWatching`) instead.
 */
export const INVITE_EVENTS = ['NewInvite'] as const;

/**
 * Push events that change a player's friends / friend-requests — a request
 * arriving, or being accepted. A removal (decline, cancel, unfriend) sends no
 * push: it isn't worth a notification, so the profile picks it up on its next
 * foreground.
 */
export const FRIEND_EVENTS = ['FriendInvite', 'FriendAccepted'] as const;

/**
 * Push events that move a game into a player's finished list — just `GameOver`,
 * sent to every player when a game ends.
 */
export const COMPLETED_GAME_EVENTS = ['GameOver'] as const;

/**
 * Everything that changes the home screen: an invite arriving, the turn moving,
 * a game finishing. One set because the dashboard is now one read — see
 * `buildDashboard` for why its five lists are no longer five subscriptions.
 */
export const DASHBOARD_EVENTS = [
    ...INVITE_EVENTS,
    ...TURN_ADVANCED_EVENTS,
    ...COMPLETED_GAME_EVENTS
] as const;

export interface PushEventsOptions {
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
     * Re-run `handler` every `POLL_MS` for as long as the viewer is watching
     * (see `isWatching`). Unlike the other options this one is read live, so it
     * can be flipped as often as the caller likes without disturbing the
     * listeners.
     *
     * This is what covers the cases push does not: a player sitting on a screen
     * watching someone else's turn go by (`visibilitychange` never fires there,
     * because the tab never left), a turn that changes the board without ending
     * — a re-roll, several builds — which sends no push at all, and any viewer
     * who has no working push to begin with. Callers should pass a condition
     * narrow enough that the polling stops as soon as there is nothing to wait
     * for — see `useGameData`. Defaults to `false`.
     */
    pollWhileWatching?: boolean;
}

/**
 * How often `pollWhileWatching` re-runs the handler. Async games move at
 * human speed, so this only has to be faster than a player notices, not
 * real-time — and every tick is a request per watching player.
 */
const POLL_MS = 10000;

/**
 * How long the viewer can go without interacting before polling stops. A board
 * left open in a foreground tab would otherwise poll for as long as the browser
 * runs; ten minutes is far longer than anyone spends actually watching a turn.
 * Any interaction resumes it, so wandering off and coming back costs at most
 * one `POLL_MS`.
 */
const IDLE_LIMIT_MS = 10 * 60 * 1000;

// When the viewer last did anything. Tracked once for the whole app rather than
// per hook instance: every screen mounts at least one `usePushEvents`, and the
// dashboard mounts five, which would otherwise each register their own copy of
// these listeners for one shared answer.
let lastActivityAt = Date.now();

if (typeof window !== 'undefined') {
    // `focus` covers returning to the window without touching anything yet.
    // `visibilitychange` is what catches a return in an installed PWA, where
    // window `focus` is unreliable coming back through the app switcher.
    // Captured because `scroll`, `focus` and `visibilitychange` don't bubble to
    // window on their own: without it, scrolling inside a board's own scroll
    // container would read as idle. Passive because these only read the clock
    // and must never delay a scroll.
    (['pointerdown', 'keydown', 'scroll', 'focus', 'visibilitychange'] as const).forEach((event) => {
        window.addEventListener(event, () => { lastActivityAt = Date.now(); }, { capture: true, passive: true });
    });
}

function isVisible(): boolean {
    return document.visibilityState === 'visible';
}

/**
 * Whether the viewer is actually watching the app, as opposed to having it open
 * behind something else or having walked away from it. App-global: it answers
 * for the tab, not for any one screen.
 */
function isWatching(): boolean {
    return isVisible() && Date.now() - lastActivityAt < IDLE_LIMIT_MS;
}

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
    const { refreshOnVisible = false, pollWhileWatching = false } = options;
    const handlerRef = useRef(handler);
    // Whether polling is wanted flips as often as the turn does, so it is read
    // through a ref for the same reason the handler is: as a dependency it
    // would tear down and rebuild every listener on every turn change, and the
    // teardown would discard a refetch already coalesced and waiting.
    const pollRef = useRef(pollWhileWatching);
    // Kept current after each render rather than during it — writing a ref while
    // rendering is a side effect (react-hooks/refs). Both are only ever read
    // from a timer callback, long after the commit.
    useEffect(() => {
        handlerRef.current = handler;
        pollRef.current = pollWhileWatching;
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
            if (isVisible()) {
                schedule();
            }
        };
        if (refreshOnVisible) {
            document.addEventListener('visibilitychange', onVisibility);
        }

        // The tick tests the conditions itself rather than being subscribed to
        // them: waking to compare two booleans costs nothing next to the request
        // it skips, which is the part worth gating. Ticks go through `schedule`,
        // so a poll landing next to a push still refetches once.
        const poll = setInterval(() => {
            if (pollRef.current && isWatching()) {
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
