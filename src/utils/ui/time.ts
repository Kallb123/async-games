// Compact, human relative time for recap/log timestamps: "just now", "14h ago",
// "yesterday", "3d ago", or a short date for anything older than a week. Pure so
// it can be reused and unit-tested; pass `now` to make it deterministic.
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
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
