// The match-history log every game writes to `gameState.history`.
//
// History is persisted, and a persisted string must not bake in anything that
// can change. Player mentions are therefore stored as `{{userId}}` tokens and
// resolved to names on the way out — see resolveHistory below.

/**
 * Swaps raw Clerk userIds appearing anywhere in a history line for the matching
 * username.
 *
 * A few games interpolate a userId into a history line rather than a name (see
 * World Domination's "drew a World Domination card"), so the id has to be
 * resolved at render time — the stored line is written once and read forever.
 */
export function replaceHistoryUserIds(history: string[], userIdNameMap: { [key: string]: string }): string[] {
    return history.map(entry => {
        let updated = entry;
        for (const [userId, username] of Object.entries(userIdNameMap)) {
            if (!userId) continue;
            updated = updated.split(userId).join(username);
        }
        return updated;
    });
}
