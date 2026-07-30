import { useNow } from "@/utils/hooks/useNow";

// Seconds between `startedAt` and now, re-read once a second while `running`.
//
// The clock comes from `useNow` rather than a `Date.now()` call in render — see
// that hook for why. Before hydration there is no reading yet, so the count
// starts at zero and the real figure arrives with the first client render.
//
// Pass `running: false` once the count is over. Note that the games API has no
// "finished at" timestamp, so a stopped count is still measured against the
// current clock; it just stops advancing on its own.
export function useElapsedSeconds(startedAt: string | null | undefined, running: boolean = true): number {
    const now = useNow(running);
    if (!startedAt || now === null) return 0;
    const startedAtMs = new Date(startedAt).getTime();
    if (!Number.isFinite(startedAtMs)) return 0;
    return Math.max(0, Math.round((now - startedAtMs) / 1000));
}
