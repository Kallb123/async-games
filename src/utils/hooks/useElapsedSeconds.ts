import { useSyncExternalStore } from "react";

// One shared ticker drives every elapsed-time readout on screen, so they all
// advance on the same beat instead of each owning a timer.
const listeners = new Set<() => void>();
let ticker: ReturnType<typeof setInterval> | null = null;

function subscribe(onStoreChange: () => void) {
    listeners.add(onStoreChange);
    if (ticker === null) {
        ticker = setInterval(() => listeners.forEach((notify) => notify()), 1000);
    }
    return () => {
        listeners.delete(onStoreChange);
        if (listeners.size === 0 && ticker !== null) {
            clearInterval(ticker);
            ticker = null;
        }
    };
}

// Whole seconds, so the snapshot stays stable between ticks — useSyncExternalStore
// re-reads it during render and loops if the value never settles.
const getSnapshot = () => Math.floor(Date.now() / 1000);

// The server has no clock reading that would still be true by the time the
// client paints, so it renders zero and the real figure arrives on hydration.
const getServerSnapshot = () => 0;

// Seconds between `startedAt` and now, re-read once a second.
//
// Reading `Date.now()` during render is impure (react-hooks/purity): the value
// changes on every render for reasons React can't see, and disagrees across the
// hydration boundary. The wall clock is an external source, so this reads it as
// one — which also makes the readouts tick live rather than only when something
// else happens to re-render them.
export function useElapsedSeconds(startedAt: string | null | undefined): number {
    const nowSeconds = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    if (!startedAt) return 0;
    const startedSeconds = new Date(startedAt).getTime() / 1000;
    if (!Number.isFinite(startedSeconds)) return 0;
    return Math.max(0, Math.round(nowSeconds - startedSeconds));
}
