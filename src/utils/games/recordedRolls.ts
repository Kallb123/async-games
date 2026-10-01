/**
 * Record-or-replay for a command that draws an unknown number of random
 * values (docs/new-game.md §7(b)). `roll` hands back the next value in
 * `recorded` while there is one — a replay reading the command back — and
 * otherwise draws a fresh one; either way it lands in `used`, which the
 * command stores as its `recorded…` field once it has run. The command route
 * strips that field from a request (stripRecordedRandomness), so only a
 * replay ever supplies one.
 */
export function recordedRolls<Args extends unknown[]>(
    recorded: readonly number[] | undefined,
    draw: (...args: Args) => number,
): { roll: (...args: Args) => number; used: number[] } {
    const used: number[] = [];
    const roll = (...args: Args) => {
        const value = recorded && used.length < recorded.length ? recorded[used.length] : draw(...args);
        used.push(value);
        return value;
    };
    return { roll, used };
}
