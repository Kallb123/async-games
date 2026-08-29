import { UNKNOWN_PLAYER_NAME } from "@/utils/ui/players";

// The match-history log every game writes to `gameState.history`.
//
// History is persisted and read back forever, so a line must not bake in
// anything that can change — and a player's name can change. Every mention of a
// player is therefore stored as a `{{userId}}` token and resolved to a name on
// the way out, and the player whose action a line records is stored as an id
// beside the text rather than left to be guessed from the prose.

/** One stored line of a game's match history. */
export interface IHistoryEntry {
    /**
     * The line itself. As stored, every player mention is a `{{userId}}` token;
     * as sent to a client, those tokens have been swapped for names by
     * resolveHistory, so the text is ready to render.
     */
    text: string;
    /**
     * The player whose action this line records, when it records one. Absent
     * for the lines nobody made — setup notes, and the narrator lines a game
     * writes about the board itself.
     */
    actorId?: string;
}

/**
 * A history line as it comes back out of Mongo while the games are being
 * converted: an entry, or a plain string written before that game's conversion.
 *
 * Transitional — dropped once every game stores entries.
 */
export type StoredHistoryEntry = string | IHistoryEntry;

/**
 * The text of a line whichever shape it is stored in.
 *
 * Transitional, for the code that reads the log straight off a game document
 * while the games are being converted. Deleted with `StoredHistoryEntry`.
 */
export function historyText(entry: StoredHistoryEntry): string {
    return typeof entry === "string" ? entry : entry.text;
}

/**
 * The token to interpolate where a history line names a player.
 *
 *     history.unshift({ text: `${userToken(senderId)} rolled a ${roll}`, actorId: senderId })
 */
export function userToken(userId: string): string {
    return `{{${userId}}}`;
}

/**
 * A line about a player's own action: their mention, then the rest of the
 * sentence. The shape almost every history line has.
 *
 *     playerHistory(this.senderId, `rolled a ${roll}`)
 *     // { text: "{{user_2abc}} rolled a 4", actorId: "user_2abc" }
 */
export function playerHistory(userId: string, rest: string): IHistoryEntry {
    return { text: `${userToken(userId)} ${rest}`, actorId: userId };
}

// Deliberately not `[^]` — a token never spans lines, and refusing to match a
// brace keeps a malformed line from swallowing the rest of the text.
const USER_TOKEN = /\{\{([^{}\n]*)\}\}/g;

/**
 * Swaps every `{{userId}}` token for that player's name, ready to render.
 *
 * One pass per line: a name is never rescanned, so a player called "{{u1}}"
 * can't have their own name substituted a second time. An id the map doesn't
 * know falls back to UNKNOWN_PLAYER_NAME rather than leaking the raw id — a
 * guest swept seven days after their last game is exactly that case.
 */
export function resolveHistory(
    history: IHistoryEntry[],
    userIdNameMap: { [key: string]: string },
    fallback: string = UNKNOWN_PLAYER_NAME,
): IHistoryEntry[] {
    return history.map(entry => ({
        ...entry,
        text: entry.text.replace(USER_TOKEN, (_match, userId: string) => userIdNameMap[userId] || fallback),
    }));
}

/**
 * Resolves a history log that may still hold pre-conversion plain strings.
 *
 * Transitional, and the only place the two representations meet: an entry goes
 * through the token resolver, a bare string through the legacy raw-id one.
 * Deleted along with `replaceUserIds` once every game stores entries.
 */
export function resolveStoredHistory(
    history: StoredHistoryEntry[],
    userIdNameMap: { [key: string]: string },
): IHistoryEntry[] {
    const replaceUserIds = rawUserIdReplacer(userIdNameMap);
    return history.map(entry => (
        typeof entry === "string"
            ? { text: replaceUserIds(entry) }
            : resolveHistory([entry], userIdNameMap)[0]
    ));
}

// Escapes a value for literal use inside a RegExp. Clerk ids are alphanumeric
// today, but the resolver must not depend on that staying true.
function escapeForRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Builds the legacy resolver: swaps raw Clerk userIds appearing anywhere in a
 * line for the matching username.
 *
 * The predecessor of the token resolver above, kept only for the lines written
 * before a game was converted. Prefer `userToken` in new code — a delimited
 * token can be resolved without guessing where an id starts and ends.
 *
 * One pass over each line, so a substituted name is never itself rescanned: a
 * player whose name happened to contain another player's id would otherwise be
 * substituted twice. Longest id first, so an id that is a prefix of another
 * can't claim the match.
 */
export function rawUserIdReplacer(userIdNameMap: { [key: string]: string }): (text: string) => string {
    const userIds = Object.keys(userIdNameMap).filter(Boolean).sort((a, b) => b.length - a.length);
    if (!userIds.length) return text => text;

    const pattern = new RegExp(userIds.map(escapeForRegExp).join("|"), "g");
    return text => text.replace(pattern, match => userIdNameMap[match]);
}
