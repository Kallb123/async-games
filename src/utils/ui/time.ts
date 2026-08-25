// Compact, human relative time for recap/log timestamps: "just now", "14h ago",
// "yesterday", "3d ago", or a short date for anything older than a week.
//
// Pure by design: `now` is always supplied by the caller so this never reads the
// wall clock during render. In components that means `useNowToTheMinute()`, which
// has no reading before hydration — hence the `null` now, answered with a `null`
// label that callers guard on so a prefix or separator doesn't dangle without it.
// An unparseable timestamp still reads as `""`, which keeps it out of a template
// literal a caller has already decided to render.
export function formatRelativeTime(iso: string, now: number | null): string | null {
    if (now === null) return null;

    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return "";

    const seconds = Math.round((now - then) / 1000);
    if (seconds < 45) return "just now";

    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.round(hours / 24);
    if (days === 1) return "yesterday";
    if (days < 7) return `${days}d ago`;

    return new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// The build stamp beside the version number on Settings: "25 Aug 2026, 14:32",
// in the reader's own locale and time zone.
//
// The server and the browser format this differently — different time zone,
// different locale — so callers render it only once hydrated (`useHydrated`).
export function formatBuildTime(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}
