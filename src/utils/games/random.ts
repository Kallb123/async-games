/**
 * The one source of randomness for anything a player could gain by predicting:
 * dice, deck shuffles, the resource the robber steals, a Mastermind secret, a
 * lobby's join code.
 *
 * `Math.random()` is fine for a coin-flip but it is not unpredictable: V8 runs
 * an xorshift128+ generator whose 128-bit state can, in principle, be recovered
 * from enough observed output — and in a turn-based game every roll is observed
 * output, published to the whole table. These draw from the platform CSPRNG
 * instead, which has no recoverable state.
 *
 * Deliberately the Web Crypto global rather than `node:crypto`'s `randomInt`:
 * the game rules modules are imported by client components (a board screen
 * builds the same command classes the server executes), so a Node builtin here
 * would follow them into the browser bundle. `crypto.getRandomValues` is a
 * global in Node, the browser and the edge runtime alike.
 *
 * Cosmetic randomness — the dice faces that tumble on screen before the real
 * roll lands, a guest's suggested name — stays on `Math.random()`. Nothing is
 * decided by it, so it does not need to be unguessable.
 */

const UINT32_RANGE = 0x100000000;

/**
 * A uniformly distributed integer in `[0, maxExclusive)`.
 *
 * Rejection sampling rather than a plain modulo: 2³² is not a multiple of most
 * ranges, so the leftover short bucket at the top would make the low values
 * fractionally likelier. Redrawing on that bucket costs an occasional extra
 * draw and buys exact uniformity — worth it for a die that pays coins out.
 */
export function randomInt(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > UINT32_RANGE) {
        throw new RangeError(`randomInt needs an integer bound in [1, 2^32], got ${maxExclusive}`);
    }

    const buffer = new Uint32Array(1);
    const ceiling = UINT32_RANGE - (UINT32_RANGE % maxExclusive);
    let draw: number;
    do {
        crypto.getRandomValues(buffer);
        draw = buffer[0];
    } while (draw >= ceiling);

    return draw % maxExclusive;
}

/**
 * A float in `[0, 1)` — the drop-in for `Math.random()` where a caller wants
 * the raw draw rather than a bounded integer, which is how Settlements &
 * Cities records the discard shuffle for replay.
 *
 * Two words give the 53 bits a double can hold exactly, so the distribution
 * matches what `Math.random()` returns.
 */
export function randomFloat(): number {
    const buffer = new Uint32Array(2);
    crypto.getRandomValues(buffer);
    // 27 high bits + 26 low bits = the 53-bit mantissa, over 2^53.
    return ((buffer[0] >>> 5) * 0x4000000 + (buffer[1] >>> 6)) / 0x20000000000000;
}
