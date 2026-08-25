import { timingSafeEqual } from 'crypto';

/**
 * Compares two secrets in constant time.
 *
 * A `!==` on a secret leaks it a character at a time: the comparison returns
 * at the first byte that differs, so how long it took says how much of the
 * guess was right. Both places the app checks a shared secret — the invite
 * gate's password and the cron bearer token — go through here.
 *
 * Length is not secret, and an early return on a mismatched length leaks only
 * that, which is why the buffers can be compared for length first (and must
 * be: timingSafeEqual throws on differing lengths).
 */
export function timingSafeStringEqual(presented: string, expected: string): boolean {
    const a = Buffer.from(presented);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
}
