import { describe, expect, it } from 'vitest';
import { deviceIdForToken, describeDevice, parseUserAgent, pruneStaleTokens, STALE_DEVICE_DAYS, toRegisteredDevice } from './deviceInfo';
import TimedToken from './TimedToken';

describe('parseUserAgent', () => {
    it('recognises an iPhone on Safari', () => {
        const device = parseUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1');
        expect(device).toEqual({ type: 'mobile', os: 'iPhone', browser: 'Safari' });
    });

    it('recognises an Android phone on Chrome', () => {
        const device = parseUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36');
        expect(device).toEqual({ type: 'mobile', os: 'Android', browser: 'Chrome' });
    });

    it('names the native Android shell rather than the Chrome it embeds', () => {
        const device = parseUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UQ1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36');
        expect(device).toEqual({ type: 'mobile', os: 'Android', browser: 'Async Games app' });
    });

    it('recognises an iPad as a tablet', () => {
        const device = parseUserAgent('Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/604.1');
        expect(device.type).toBe('tablet');
        expect(device.os).toBe('iPad');
    });

    it('prefers Edge over the Chrome token it also carries', () => {
        const device = parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0');
        expect(device).toEqual({ type: 'desktop', os: 'Windows', browser: 'Edge' });
    });

    it('falls back to unknown without a user agent', () => {
        expect(parseUserAgent(null)).toEqual({ type: 'unknown' });
        expect(describeDevice(parseUserAgent(null))).toBe('Unknown device');
    });
});

describe('pruneStaleTokens', () => {
    const now = Date.parse('2026-07-01T00:00:00.000Z');
    const daysAgo = (days: number) => new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
    const token = (id: string, overrides: Partial<TimedToken> = {}): TimedToken => ({
        token: id,
        timestamp: daysAgo(400),
        lastSeen: daysAgo(1),
        ...overrides
    });

    it('keeps devices seen inside the window', () => {
        const tokens = [token('fresh', { lastSeen: daysAgo(STALE_DEVICE_DAYS - 1) })];
        expect(pruneStaleTokens(tokens, now)).toEqual(tokens);
    });

    it('drops devices unused for longer than the window', () => {
        const kept = token('fresh');
        const result = pruneStaleTokens([kept, token('old', { lastSeen: daysAgo(STALE_DEVICE_DAYS + 1) })], now);
        expect(result).toEqual([kept]);
    });

    it('falls back to the registration time for tokens with no lastSeen', () => {
        const legacy = token('legacy', { lastSeen: undefined, timestamp: daysAgo(STALE_DEVICE_DAYS + 1) });
        const recent = token('recent', { lastSeen: undefined, timestamp: daysAgo(2) });
        expect(pruneStaleTokens([legacy, recent], now)).toEqual([recent]);
    });

    it('keeps tokens with an unreadable date rather than dropping a live device', () => {
        const broken = token('broken', { lastSeen: 'not-a-date', timestamp: 'nonsense' });
        expect(pruneStaleTokens([broken], now)).toEqual([broken]);
    });
});

describe('toRegisteredDevice', () => {
    it('hides the raw token and falls back to the registration time', () => {
        const device = toRegisteredDevice({
            token: 'abcdefghijklmnopqrstuvwxyz',
            timestamp: '2026-01-01T00:00:00.000Z'
        });

        expect(device).toEqual({
            id: deviceIdForToken('abcdefghijklmnopqrstuvwxyz'),
            name: 'Unknown device',
            type: 'unknown',
            registeredAt: '2026-01-01T00:00:00.000Z',
            lastSeenAt: '2026-01-01T00:00:00.000Z'
        });
        expect(JSON.stringify(device)).not.toContain('abcdefghijklmnopqrstuvwxyz');
    });

    it('reports the last seen time when the device has checked back in', () => {
        const device = toRegisteredDevice({
            token: 'token-value-1234567890',
            timestamp: '2026-01-01T00:00:00.000Z',
            lastSeen: '2026-02-01T00:00:00.000Z',
            device: { type: 'desktop', os: 'Mac', browser: 'Chrome' }
        });

        expect(device.name).toBe('Mac · Chrome');
        expect(device.lastSeenAt).toBe('2026-02-01T00:00:00.000Z');
    });
});
