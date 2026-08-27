import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbConnect = vi.hoisted(() => vi.fn());
const findOneAndUpdate = vi.hoisted(() => vi.fn((_filter: { key: string }) => ({
    exec: async () => ({ count: 1 }),
})));
const findOne = vi.hoisted(() => vi.fn((_filter: { key: string }) => ({
    exec: async (): Promise<{ count: number } | null> => null,
})));

vi.mock('@/utils/mongodb/mongodb', () => ({ dbConnect }));
vi.mock('@/utils/mongodb/RateLimitData', () => ({ RateLimitModel: { findOneAndUpdate, findOne } }));

// Safe as a plain import: vitest hoists the vi.mock calls above it.
import { clientIp, consumeRateLimit, peekRateLimit } from './rateLimit';

describe('consumeRateLimit', () => {
    beforeEach(() => {
        dbConnect.mockClear();
        findOneAndUpdate.mockClear();
        findOne.mockClear();
    });

    // The regression this guards: the throttle is usually a request's first
    // act, so on a cold instance it is the first thing to touch Mongo. Issued
    // before anything has connected, the query doesn't fail — it sits in
    // mongoose's buffer for ten seconds and then throws, which took /join's
    // link preview (and with it the whole page) down with a 500.
    it('connects before it queries', async () => {
        await consumeRateLimit('scope', '1.2.3.4', 5, 1000);

        expect(dbConnect).toHaveBeenCalledBefore(findOneAndUpdate);
    });

    it('allows a call inside the limit', async () => {
        expect(await consumeRateLimit('scope', '1.2.3.4', 5, 1000)).toBe(true);
    });

    it('refuses one past it', async () => {
        findOneAndUpdate.mockReturnValueOnce({ exec: async () => ({ count: 6 }) });

        expect(await consumeRateLimit('scope', '1.2.3.4', 5, 1000)).toBe(false);
    });

    it('buckets by scope, identifier and window, so two endpoints never share a counter', async () => {
        await consumeRateLimit('lobby-unfurl', '1.2.3.4', 5, 1000);
        const [{ key }] = findOneAndUpdate.mock.calls[0];

        expect(key).toMatch(/^lobby-unfurl:1\.2\.3\.4:\d+$/);
    });
});

describe('peekRateLimit', () => {
    beforeEach(() => {
        dbConnect.mockClear();
        findOne.mockClear();
        findOneAndUpdate.mockClear();
    });

    // The regression this exists to prevent: a caller (the unlock route) that
    // wants to gate on the limit without charging it for an outcome that
    // shouldn't count — this must never write, only read.
    it('does not increment the counter', async () => {
        await peekRateLimit('scope', '1.2.3.4', 5, 1000);

        expect(findOneAndUpdate).not.toHaveBeenCalled();
        expect(findOne).toHaveBeenCalledOnce();
    });

    it('allows a bucket with no document yet', async () => {
        expect(await peekRateLimit('scope', '1.2.3.4', 5, 1000)).toBe(true);
    });

    it('allows a count still under the limit', async () => {
        findOne.mockReturnValueOnce({ exec: async () => ({ count: 4 }) });

        expect(await peekRateLimit('scope', '1.2.3.4', 5, 1000)).toBe(true);
    });

    it('refuses a count already at the limit', async () => {
        findOne.mockReturnValueOnce({ exec: async () => ({ count: 5 }) });

        expect(await peekRateLimit('scope', '1.2.3.4', 5, 1000)).toBe(false);
    });

    it('reads the same key consumeRateLimit would write', async () => {
        await peekRateLimit('unlock-user', 'user_123', 10, 1000);
        const [{ key }] = findOne.mock.calls[0];

        expect(key).toMatch(/^unlock-user:user_123:\d+$/);
    });
});

describe('clientIp', () => {
    const headers = (values: Record<string, string>) => ({ get: (name: string) => values[name] ?? null });

    it('takes the client from the front of x-forwarded-for, not the proxies behind it', () => {
        expect(clientIp(headers({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1, 10.0.0.2' }))).toBe('1.2.3.4');
    });

    it('falls back to x-real-ip, then to a placeholder', () => {
        expect(clientIp(headers({ 'x-real-ip': '5.6.7.8' }))).toBe('5.6.7.8');
        expect(clientIp(headers({}))).toBe('unknown');
    });
});
