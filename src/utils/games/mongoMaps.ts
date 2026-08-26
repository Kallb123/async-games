/**
 * Reading a Mongoose `Map` back out — the two things that bite every game that
 * stores one, in one place rather than once per game.
 *
 * - **The map may not be a Map.** Mongoose hands back a real Map on a live
 *   document and a plain object once the state has been through JSON. Every
 *   read of a stored map goes through `mongoMap` first.
 * - **A subdocument is not plain data.** Its fields sit behind getters, so
 *   `{ ...ps }` copies none of them. That is how Train Time's reviewed turns
 *   came to show every score as NaN (#338) — the clone looked complete and was
 *   empty of everything the schema declared. `clonePlayerStates` takes each
 *   game's own clone, which is expected to name every field rather than spread.
 */

/** A stored map however Mongoose handed it over: a Map, or a plain object. */
export function mongoMap<T>(map: Map<string, T> | Record<string, T>): Map<string, T> {
    return map instanceof Map ? map : new Map(Object.entries(map));
}

/**
 * A fresh map of independent player states, rebuilt in `order` — replay
 * iterates it, and a game that iterated differently could deal, discard or
 * break a tie the other way round from the original. Players missing from the
 * source are skipped, so an id that never took a seat can't conjure an empty
 * state.
 */
export function clonePlayerStates<T>(
    playerStates: Map<string, T> | Record<string, T>,
    order: string[],
    clone: (ps: T) => T,
): Map<string, T> {
    const source = mongoMap(playerStates);
    const cloned = new Map<string, T>();
    for (const userId of order) {
        const ps = source.get(userId);
        if (ps) cloned.set(userId, clone(ps));
    }
    return cloned;
}
