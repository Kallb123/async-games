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

// The relative time on an invite, a friend request or a finished match:
// "just now", "5 minutes ago", "3 hours ago", "yesterday", "12 days ago",
// "last month", "4 months ago", "last year". Wordier than formatRelativeTime
// ("14h ago") because it sits in a sentence of its own ("Sent 5 minutes ago",
// "wants to be friends · yesterday") rather than a cramped log row.
//
// It stands in for what Moment's fromNow() used to say, with the same cut-offs
// (under 45 seconds is "just now", 45 minutes is "1 hour", 22 hours is "1 day",
// 26 days is "1 month", 320 days is "1 year") so nothing flips sooner or later
// than it did. `now` defaults to the wall clock, as fromNow() did; pass one to
// pin it (the tests do). English by design: the copy around every call site is.
// A bad timestamp reads as `""`, like formatRelativeTime. One a little ahead of
// `now` (the stamp is the server's clock, `now` the reader's) reads as "just now".
const AGO = new Intl.RelativeTimeFormat("en", { numeric: "always" });
const AGO_PLAIN = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function formatTimeAgo(when: string | number | Date, now: number = Date.now()): string {
    const then = new Date(when).getTime();
    if (Number.isNaN(then)) return "";

    const seconds = Math.round((now - then) / 1000);
    if (seconds < 45) return "just now";

    const minutes = Math.round(seconds / 60);
    if (minutes < 45) return AGO.format(-minutes, "minute");

    const hours = Math.round(minutes / 60);
    if (hours < 22) return AGO.format(-hours, "hour");

    const days = Math.round(hours / 24);
    // numeric: "auto" turns a single day, month or year into "yesterday",
    // "last month" and "last year"; a single hour or minute stays numeric.
    if (days < 26) return AGO_PLAIN.format(-days, "day");

    const months = Math.round(days / 30.4375);
    if (days < 320) return AGO_PLAIN.format(-Math.max(months, 1), "month");

    return AGO_PLAIN.format(-Math.max(Math.round(days / 365.25), 1), "year");
}

// A calendar day as "5 Oct": the day, then the short month name. Built from
// parts rather than a locale's own pattern because "en-GB" spells September
// "Sept" and a US locale puts the month first; this reads one way everywhere.
// Local time zone, like the Moment format("D MMM") it replaces.
const DAY_MONTH = new Intl.DateTimeFormat("en", { day: "numeric", month: "short" });

export function formatDayMonth(when: string | number | Date): string {
    const date = new Date(when);
    if (Number.isNaN(date.getTime())) return "";

    const parts = DAY_MONTH.formatToParts(date);
    const day = parts.find(part => part.type === "day")?.value ?? "";
    const month = parts.find(part => part.type === "month")?.value ?? "";
    return `${day} ${month}`;
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

// How recently someone has to have moved to count as "active now" — the green
// dot beside a friend on the profile screen. Five minutes is long enough to
// cover a player still thinking about the turn they are halfway through, and
// short enough that the dot means "they are here", not "they were here today".
export const ACTIVE_WINDOW_MS = 5 * 60 * 1000;

// True if `iso` — a friend's last action across their games — falls inside the
// active window ending at `now`.
//
// Pure for the same reason as formatRelativeTime: `now` is supplied by the
// caller (`useNowToTheMinute()` in a component), and is null until hydration,
// when there is no honest clock reading to judge against — so nobody reads as
// active until there is one.
//
// A timestamp *after* `now` counts as active rather than as nonsense: the
// stamp is the server's clock and `now` is the reader's, so a browser running a
// little slow would otherwise hide the dot on the friend who just moved.
export function isRecentlyActive(iso: string | null | undefined, now: number | null): boolean {
    if (!iso || now === null) return false;

    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return false;

    return now - then < ACTIVE_WINDOW_MS;
}
