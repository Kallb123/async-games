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

export function formatRemainingTime(lastTurnTimestamp: string, turnTimer: string): string {
    if (isUnlimitedTurnTimer(turnTimer)) return 'unlimited';
    const total = parseTurnTimerMs(turnTimer);
    const elapsed = Date.now() - new Date(lastTurnTimestamp).getTime();
    const remainingMs = Math.max(total - elapsed, 0);

    const minutes = Math.floor(remainingMs / (60 * 1000));
    const hours = Math.floor(remainingMs / (60 * 60 * 1000));
    const days = Math.floor(remainingMs / (24 * 60 * 60 * 1000));

    if (days >= 1) return `${days} day${days !== 1 ? 's' : ''}`;
    if (hours >= 1) return `${hours} hour${hours !== 1 ? 's' : ''}`;
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
}

/** Short "1h left" style label for game lists. Null for unlimited timers. */
export function formatRemainingTimeShort(lastTurnTimestamp: string, turnTimer: string): string | null {
    if (isUnlimitedTurnTimer(turnTimer)) return null;
    const total = parseTurnTimerMs(turnTimer);
    const elapsed = Date.now() - new Date(lastTurnTimestamp).getTime();
    const remainingMs = Math.max(total - elapsed, 0);

    const minutes = Math.floor(remainingMs / (60 * 1000));
    const hours = Math.floor(remainingMs / (60 * 60 * 1000));
    const days = Math.floor(remainingMs / (24 * 60 * 60 * 1000));

    if (days >= 1) return `${days}d left`;
    if (hours >= 1) return `${hours}h left`;
    if (minutes >= 1) return `${minutes}m left`;
    return `<1m left`;
}
