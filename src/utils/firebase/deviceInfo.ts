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
