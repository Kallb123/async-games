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
): IHistoryEntry[] {
    return history.map(entry => {
        const text = entry.text.replace(USER_TOKEN, (_match, userId: string) => userIdNameMap[userId] || UNKNOWN_PLAYER_NAME);
        // Field by field, never `{ ...entry }`. These entries come off a live
        // Mongoose document, and spreading a subdocument copies its internals
        // rather than its fields — including `$__parent`, the whole game
        // document, hidden state and all, straight into the response.
        return entry.actorId ? { text, actorId: entry.actorId } : { text };
    });
}
