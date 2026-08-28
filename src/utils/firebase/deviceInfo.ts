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
    // The native shell, which is a WebView and says so: Android appends `wv`
    // to the platform token for one. It carries a Chrome version too, so this
    // has to win over the Chrome rule below, or every player on the app reads
    // as another Chrome in their own device list.
    [/;\s*wv\)/i, 'Async Games app'],
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
    const live = tokens.filter((stored) => {
        const lastSeen = new Date(stored.lastSeen ?? stored.timestamp).getTime();
        return Number.isNaN(lastSeen) || lastSeen >= cutoff;
    });
    return capDevices(live);
}

// The most devices one account may have registered at once.
//
// The list lives in Clerk private metadata, which is capped at 8KB for the
// whole object. A registration is a ~160-character FCM token plus its device
// description, so somewhere north of thirty of them the metadata write starts
// failing — and it fails on the *write*, so the symptom is not "your oldest
// phone stopped getting pushes" but "this device can never register at all",
// for good. Ninety days is a long time to accumulate: a browser in private
// mode mints a fresh token every session.
//
// Twenty is far more devices than anyone plays on and far short of the ceiling.
export const MAX_DEVICES_PER_USER = 20;

/**
 * Keeps the MAX_DEVICES_PER_USER most recently seen registrations.
 *
 * Least-recently-seen goes first because `lastSeen` is refreshed on every
 * visit, so the ones this drops are the ones nothing has come from in the
 * longest — and if one of them was a real phone, its next visit re-registers
 * it. Entries with an unreadable date sort as oldest but are only ever dropped
 * if the list is over the cap anyway.
 */
function capDevices(tokens: TimedToken[]): TimedToken[] {
    if (tokens.length <= MAX_DEVICES_PER_USER) {
        return tokens;
    }
    const seenAt = (stored: TimedToken) => {
        const at = new Date(stored.lastSeen ?? stored.timestamp).getTime();
        return Number.isNaN(at) ? 0 : at;
    };
    return [...tokens].sort((a, b) => seenAt(b) - seenAt(a)).slice(0, MAX_DEVICES_PER_USER);
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
