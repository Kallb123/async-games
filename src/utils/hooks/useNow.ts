import { useSyncExternalStore } from "react";

// One shared ticker drives every clock reading on screen, so they all advance on
// the same beat instead of each owning a timer.
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

// Snapshots are rounded down to a whole step so they stay stable between ticks —
// useSyncExternalStore re-reads during render and loops if the value never
// settles, and an unchanged snapshot means the tick causes no re-render at all.
const secondSnapshot = (): number | null => Math.floor(Date.now() / 1000) * 1000;
const minuteSnapshot = (): number | null => Math.floor(Date.now() / 60000) * 60000;

// The server has no clock reading that would still be true by the time the client
// paints, so there is no honest "now" to render with until hydration.
const noSnapshot = (): number | null => null;

// Nothing left to count, so it doesn't join the ticker.
const subscribeNever = () => () => {};

/**
 * The current time in epoch ms, re-read once a second, or null before hydration.
 *
 * Reading `Date.now()` during render is impure (react-hooks/purity): the value
 * changes on every render for reasons React can't see, and disagrees across the
 * hydration boundary. The wall clock is an external source, so this reads it as
 * one — which also makes readouts tick live rather than only when something else
 * happens to re-render them.
 *
 * Pass the result into pure formatters (`formatRelativeTime`,
 * `formatRemainingTimeShort`) rather than letting them read the clock, and pass
 * `running: false` once a readout has nothing left to count.
 */
export function useNow(running: boolean = true): number | null {
    return useSyncExternalStore<number | null>(running ? subscribe : subscribeNever, secondSnapshot, noSnapshot);
}

/**
 * Like `useNow`, but only moves once a minute. Use it for labels that read in
 * minutes or coarser ("14h ago", "1h left"): they share the same ticker, but an
 * unchanged snapshot means a list of them doesn't re-render every second.
 */
export function useNowToTheMinute(running: boolean = true): number | null {
    return useSyncExternalStore<number | null>(running ? subscribe : subscribeNever, minuteSnapshot, noSnapshot);
}
