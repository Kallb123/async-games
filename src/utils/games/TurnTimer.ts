import { pluralize } from "@/utils/ui/text";

export const UNLIMITED_TURN_TIMER = 'unlimited';

const TIMER_MS: Record<string, number> = {
    '10m': 10 * 60 * 1000,
    '30m': 30 * 60 * 1000,
    '1h':  1 * 60 * 60 * 1000,
    '3h':  3 * 60 * 60 * 1000,
    '6h':  6 * 60 * 60 * 1000,
    '12h': 12 * 60 * 60 * 1000,
    '1d':  1 * 24 * 60 * 60 * 1000,
    '3d':  3 * 24 * 60 * 60 * 1000,
    '7d':  7 * 24 * 60 * 60 * 1000,
};

const WARNING_RATIO = 0.2;
const WARNING_MIN_MS = 5 * 60 * 1000; // 5 minutes (matches external cron granularity)

// A player whose turn expires this many times in a row (never taking a turn
// of their own in between) is treated as having dropped out. Reaching this
// abandons the whole game rather than rotating past them again — see the
// turntimer cron.
export const MAX_CONSECUTIVE_MISSED_TURNS = 3;

export function hasAbandonedGame(missedTurnCount: number): boolean {
    return missedTurnCount >= MAX_CONSECUTIVE_MISSED_TURNS;
}

export function isUnlimitedTurnTimer(turnTimer: string): boolean {
    return turnTimer === UNLIMITED_TURN_TIMER;
}

export function parseTurnTimerMs(turnTimer: string): number {
    return TIMER_MS[turnTimer] ?? 0;
}

export function warningThresholdMs(turnTimer: string): number {
    const total = parseTurnTimerMs(turnTimer);
    return Math.max(total * WARNING_RATIO, WARNING_MIN_MS);
}

export function isExpired(lastTurnTimestamp: string, turnTimer: string): boolean {
    // Unlimited timers never expire, so the cron notifier must never skip their turn.
    if (isUnlimitedTurnTimer(turnTimer)) return false;
    const elapsed = Date.now() - new Date(lastTurnTimestamp).getTime();
    return elapsed >= parseTurnTimerMs(turnTimer);
}

export function isWarningThreshold(lastTurnTimestamp: string, turnTimer: string): boolean {
    // Unlimited timers never run out, so there is nothing to warn about.
    if (isUnlimitedTurnTimer(turnTimer)) return false;
    const total = parseTurnTimerMs(turnTimer);
    const elapsed = Date.now() - new Date(lastTurnTimestamp).getTime();
    const remaining = total - elapsed;
    return remaining <= warningThresholdMs(turnTimer) && remaining > 0;
}

type DurationParts = { days: number, hours: number, minutes: number };

// A span of time as the three units the labels below choose between, never
// negative. Shared by the remaining-time and elapsed-time readouts so a
// duration is cut into days/hours/minutes in exactly one place.
function durationParts(ms: number): DurationParts {
    const span = Math.max(ms, 0);

    return {
        days: Math.floor(span / (24 * 60 * 60 * 1000)),
        hours: Math.floor(span / (60 * 60 * 1000)),
        minutes: Math.floor(span / (60 * 1000)),
    };
}

// The one "3 hours" / "45 minutes" ladder every long-form duration label in
// the app reads from — only what a sub-minute span is worth calling differs
// between them, so that is the argument.
function coarseLabel(parts: DurationParts, underAMinute: string): string {
    const { days, hours, minutes } = parts;

    if (days >= 1) return pluralize(days, 'day');
    if (hours >= 1) return pluralize(hours, 'hour');
    if (minutes >= 1) return pluralize(minutes, 'minute');
    return underAMinute;
}

// `now` is always supplied so this never reads the wall clock on behalf of a
// render — see `useNow`. Server-side callers pass their own `Date.now()`.
function remainingParts(lastTurnTimestamp: string, turnTimer: string, now: number): DurationParts | null {
    if (isUnlimitedTurnTimer(turnTimer)) return null;
    const deadline = new Date(lastTurnTimestamp).getTime() + parseTurnTimerMs(turnTimer);
    return durationParts(deadline - now);
}

export function formatRemainingTime(lastTurnTimestamp: string, turnTimer: string): string {
    const parts = remainingParts(lastTurnTimestamp, turnTimer, Date.now());
    if (!parts) return 'unlimited';
    return coarseLabel(parts, 'less than a minute');
}

/**
 * "3 hours" style label for how long until `deadline` — the same wording as
 * formatRemainingTime, for a deadline that is already a moment in time rather
 * than a timer running from a turn (a lobby's `expiresAt`, see `lobbyTtlMs`).
 * Null before hydration, for the same reason formatRemainingTimeShort is: pass
 * `useNowToTheMinute()` rather than letting this read the clock.
 */
export function formatRemainingUntil(deadline: string, now: number | null): string | null {
    if (now === null) return null;
    return coarseLabel(durationParts(new Date(deadline).getTime() - now), 'less than a minute');
}

/**
 * "3 hours" style label for how long ago `timestamp` was — the mirror of
 * formatRemainingTime, used for "they've been waiting 3 hours" copy. Anything
 * under a minute reads as "a moment" rather than "0 minutes".
 */
export function formatElapsedTime(timestamp: string): string {
    return coarseLabel(durationParts(Date.now() - new Date(timestamp).getTime()), 'a moment');
}

/**
 * Short "1h left" style label for game lists. Null for unlimited timers, and for
 * a null `now` — pass `useNowToTheMinute()`, which has no clock reading until
 * hydration, so the badge simply appears with the first client render.
 */
export function formatRemainingTimeShort(lastTurnTimestamp: string, turnTimer: string, now: number | null): string | null {
    if (now === null) return null;
    const parts = remainingParts(lastTurnTimestamp, turnTimer, now);
    if (!parts) return null;
    const { days, hours, minutes } = parts;

    if (days >= 1) return `${days}d left`;
    if (hours >= 1) return `${hours}h left`;
    if (minutes >= 1) return `${minutes}m left`;
    return `<1m left`;
}
