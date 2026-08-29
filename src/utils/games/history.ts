// The match-history log every game writes to `gameState.history`.
//
// History is persisted, and a persisted string must not bake in anything that
// can change. Player mentions are therefore stored as `{{userId}}` tokens and
// resolved to names on the way out — see resolveHistory below.

// Escapes a value for literal use inside a RegExp. Clerk ids are alphanumeric
// today, but the resolver must not depend on that staying true.
function escapeForRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Swaps raw Clerk userIds appearing anywhere in a history line for the matching
 * username.
 *
 * A few games interpolate a userId into a history line rather than a name (see
 * World Domination's "drew a World Domination card"), so the id has to be
 * resolved at render time — the stored line is written once and read forever.
 *
 * One pass over each line, so a substituted name is never itself rescanned: a
 * player whose name happened to contain another player's id would otherwise be
 * substituted twice. Longest id first, so an id that is a prefix of another
 * can't claim the match.
 */
export function replaceHistoryUserIds(history: string[], userIdNameMap: { [key: string]: string }): string[] {
    const userIds = Object.keys(userIdNameMap).filter(Boolean).sort((a, b) => b.length - a.length);
    if (!userIds.length) return history.map(entry => entry);

    const pattern = new RegExp(userIds.map(escapeForRegExp).join("|"), "g");
    return history.map(entry => entry.replace(pattern, match => userIdNameMap[match]));
}
