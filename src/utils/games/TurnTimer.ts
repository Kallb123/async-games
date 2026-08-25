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

/**
 * The turn timers a game may be created with, in the order they are offered,
 * each with the label the player sees.
 *
 * The one ladder. `TurnTimerSelect` kept a second copy of it purely for the
 * labels, which meant the dropdown and the timers the server understands were
 * two hand-written lists that agreed by luck — and once the server started
 * rejecting timers it doesn't know (isValidTurnTimer below), a drifted option
 * would have been a dropdown entry that 400s on submit.
 */
export const TURN_TIMER_OPTIONS: { value: string, label: string }[] = [
    { value: '10m', label: '10 min' },
    { value: '30m', label: '30 min' },
    { value: '1h', label: '1 hour' },
    { value: '3h', label: '3 hours' },
    { value: '6h', label: '6 hours' },
    { value: '12h', label: '12 hours' },
    { value: '1d', label: '1 day' },
    { value: '3d', label: '3 days' },
    { value: '7d', label: '7 days' },
    { value: UNLIMITED_TURN_TIMER, label: 'Unlimited' },
];

/** Every turn timer a game may be created with — what the select offers, and
 *  the only values isValidTurnTimer below accepts. */
export const TURN_TIMER_VALUES: string[] = TURN_TIMER_OPTIONS.map(option => option.value);

/**
 * Whether `turnTimer` is one this app knows how to count.
 *
 * Server-side validation, and it matters more than it looks. `parseTurnTimerMs`
 * answers 0 for anything it doesn't recognise, and `isExpired` compares elapsed
 * time against that — so a game created with a turn timer of "2h" (plausible,
 * not on the list) has every turn expire the moment the timer cron next runs,
 * and is abandoned outright after MAX_CONSECUTIVE_MISSED_TURNS of them. The
 * value came straight off the request body into the document, so the only thing
 * that had ever stopped it was the client sending one of the options its own
 * dropdown offered.
 */
export function isValidTurnTimer(turnTimer: unknown): turnTimer is string {
    return typeof turnTimer === 'string' && TURN_TIMER_VALUES.includes(turnTimer);
}

export function parseTurnTimerMs(turnTimer: string): number {
    return TIMER_MS[turnTimer] ?? 0;
}

export function warningThresholdMs(turnTimer: string): number {
    const total = parseTurnTimerMs(turnTimer);
    return Math.max(total * WARNING_RATIO, WARNING_MIN_MS);
}

/**
 * The shortest time that can pass after a turn starts before *any* timer has
 * something to say about it — the smallest gap, across every timer, between a
 * turn starting and its warning threshold. Five minutes today: the 10-minute
 * timer's warning floor.
 *
 * The turntimer cron uses it to skip games it would only decide to leave
 * alone. Derived rather than written down so it can't drift from the ladder
 * above: adding a timer shorter than 10 minutes moves it on its own.
 */
export const SHORTEST_ACTIONABLE_ELAPSED_MS: number = Math.min(
    ...Object.keys(TIMER_MS).map(timer => parseTurnTimerMs(timer) - warningThresholdMs(timer))
);

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
