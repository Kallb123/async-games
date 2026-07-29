import TimedToken, { DeviceInfo, DeviceType, RegisteredDevice } from './TimedToken';

// Deliberately tiny user-agent parsing: enough to tell a player which of their
// devices a push token belongs to, not enough to warrant a dependency. Order
// matters — the first matching rule wins.
const OS_RULES: [RegExp, string][] = [
    [/iPhone/i, 'iPhone'],
    [/iPad/i, 'iPad'],
    [/Android/i, 'Android'],
    [/Windows/i, 'Windows'],
    [/CrOS/i, 'ChromeOS'],
    [/Mac OS X|Macintosh/i, 'Mac'],
    [/Linux/i, 'Linux'],
];

const BROWSER_RULES: [RegExp, string][] = [
    [/Edg[A-Z]?\//i, 'Edge'],
    [/OPR\/|Opera/i, 'Opera'],
    [/SamsungBrowser/i, 'Samsung Internet'],
    [/Firefox\/|FxiOS/i, 'Firefox'],
    [/Chrome\/|CriOS/i, 'Chrome'],
    [/Safari\//i, 'Safari'],
];

const GLYPHS: Record<DeviceType, string> = {
    // Tablets share the handheld glyph — the device name already says "iPad".
    mobile: '📱',
    tablet: '📱',
    desktop: '💻',
    unknown: '🔔',
};

function firstMatch(rules: [RegExp, string][], userAgent: string): string | undefined {
    return rules.find(([pattern]) => pattern.test(userAgent))?.[1];
}

function deviceType(userAgent: string, os: string | undefined): DeviceType {
    if (os === 'iPad' || /Tablet/i.test(userAgent)) return 'tablet';
    if (os === 'iPhone' || /Mobi/i.test(userAgent)) return 'mobile';
    if (os) return 'desktop';
    return 'unknown';
}

export function parseUserAgent(userAgent: string | null | undefined): DeviceInfo {
    if (!userAgent) {
        return { type: 'unknown' };
    }
    const os = firstMatch(OS_RULES, userAgent);
    return {
        type: deviceType(userAgent, os),
        os,
        browser: firstMatch(BROWSER_RULES, userAgent),
    };
}

/** Short, non-secret handle for a token — safe to send to the browser and use
 *  as the delete key. The client derives the same id from its own token to
 *  work out which row is "this device". */
export function deviceIdForToken(token: string): string {
    return token.slice(-12);
}

export function describeDevice(device: DeviceInfo | undefined): string {
    const parts = [device?.os, device?.browser].filter(Boolean);
    return parts.length ? parts.join(' · ') : 'Unknown device';
}

export function deviceGlyph(type: DeviceType): string {
    return GLYPHS[type] ?? GLYPHS.unknown;
}

/** A device that hasn't re-registered in this long is forgotten. Every visit
 *  refreshes `lastSeen`, so this only catches devices genuinely out of use. */
export const STALE_DEVICE_DAYS = 90;

/**
 * Returns the registrations still worth keeping. Pure so the registration
 * route and the nightly cron share one rule; pass `now` to make it
 * deterministic. Entries with an unreadable date are kept — dropping a
 * working device is worse than keeping a scruffy record, and the next
 * registration from that device repairs it.
 */
export function pruneStaleTokens(tokens: TimedToken[], now: number = Date.now()): TimedToken[] {
    const cutoff = now - STALE_DEVICE_DAYS * 24 * 60 * 60 * 1000;
    return tokens.filter((stored) => {
        const lastSeen = new Date(stored.lastSeen ?? stored.timestamp).getTime();
        return Number.isNaN(lastSeen) || lastSeen >= cutoff;
    });
}

/** One device we're about to push to. */
export interface PushTarget {
    userId: string;
    token: string;
}

/**
 * FCM error codes meaning the token is gone for good — the app was
 * uninstalled, notification permission was revoked, or the token rotated.
 * Everything else FCM can return (quota, network trouble, a malformed
 * payload of ours) is transient or our own fault, and must never cost a
 * player their device registration.
 */
const DEAD_TOKEN_CODES = new Set([
    'messaging/registration-token-not-registered',
    'messaging/invalid-registration-token'
]);

/**
 * Picks the dead tokens out of an FCM batch response, grouped by owner.
 * `results` lines up with `targets` by index — that's the contract
 * `sendEach` gives us, and the reason this is worth testing on its own.
 */
export function deadTokensByUser(
    targets: PushTarget[],
    results: { success: boolean; error?: { code: string } }[]
): Map<string, string[]> {
    const dead = new Map<string, string[]>();

    results.forEach((result, index) => {
        const target = targets[index];
        if (!target || result.success || !result.error) {
            return;
        }
        if (!DEAD_TOKEN_CODES.has(result.error.code)) {
            return;
        }
        dead.set(target.userId, [...(dead.get(target.userId) ?? []), target.token]);
    });

    return dead;
}

/** Strips the raw token off a stored registration for display. */
export function toRegisteredDevice(stored: TimedToken): RegisteredDevice {
    return {
        id: deviceIdForToken(stored.token),
        name: describeDevice(stored.device),
        type: stored.device?.type ?? 'unknown',
        registeredAt: stored.timestamp,
        lastSeenAt: stored.lastSeen ?? stored.timestamp,
    };
}
