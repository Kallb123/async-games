import { useEffect, useRef } from "react";

/**
 * The slice of the Close Watcher API we use. Declared here rather than relied
 * on from `lib.dom`: TypeScript 5.4 doesn't know the type yet, and reaching for
 * the constructor off `window` keeps the feature detection and the typing in
 * one place instead of adding a global that a later TS upgrade would clash with.
 */
interface CloseWatcherLike {
    onclose: (() => void) | null;
    destroy(): void;
}

type CloseWatcherConstructor = new () => CloseWatcherLike;

/**
 * Close the topmost thing on screen when the platform asks for it — Escape on a
 * keyboard, the **Android back gesture** in the installed app.
 *
 * The app is installed `display: "standalone"` (`src/app/manifest.ts`), so there
 * is no browser back button and the system gesture is a player's only "back".
 * Without this, swiping back with a sheet or menu open doesn't close the sheet:
 * it leaves the game screen, or exits the app if the game page was what the
 * player launched into. Android's predictive back makes that worse rather than
 * better, since the gesture now previews the screen the player is about to lose.
 *
 * `CloseWatcher` is the web platform's answer to exactly this — one signal for
 * "the user asked to close something", whatever it arrived as — and Chromium
 * spends the back gesture on it instead of navigating. It is Chromium-only for
 * now (Firefox still navigates back), so where it is missing this falls back to
 * the Escape key alone, which is what the app did everywhere before.
 *
 * Note there is deliberately no `history.pushState` sentinel here. Parking a
 * fake entry in the history stack to catch `popstate` is the old trick for this,
 * and the Close Watcher explainer argues against it: it corrupts the router's
 * idea of where the player is, which in a Next app means the back arrow in our
 * own top bar starts lying.
 *
 * @param active Whether the thing is on screen right now. Only an active
 *   watcher answers a close request, and only one watcher — the most recently
 *   created — answers each one, so a menu opened over a sheet closes first.
 * @param onClose What closing means here. Re-reading it from a ref on every
 *   request keeps a new inline arrow from tearing the watcher down and building
 *   a fresh one each render: a `CloseWatcher` built without a user gesture
 *   spends the one free slot the browser allows before it starts grouping
 *   watchers together to stop pages trapping the back button.
 */
export function useCloseRequest(active: boolean, onClose: () => void) {
    const handler = useRef(onClose);

    useEffect(() => {
        handler.current = onClose;
    }, [onClose]);

    useEffect(() => {
        if (!active) return;

        const close = () => handler.current();
        const CloseWatcherCtor = (window as unknown as { CloseWatcher?: CloseWatcherConstructor }).CloseWatcher;

        if (CloseWatcherCtor) {
            // A watcher handles Escape itself, so the fallback listener below
            // would close two layers at once if both were registered.
            const watcher = new CloseWatcherCtor();
            watcher.onclose = close;
            return () => watcher.destroy();
        }

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') close();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [active]);
}
