import { reactionMapBy } from "@/utils/mongodb/ReactionData";
import { IReactionSummary } from "@/utils/reactions";
import { IHistoryEntry } from "./history";
import { IHistoryEntryResponse } from "@/utils/apiModels/GameDataApi";

/** One history array, with each entry's reactions (if any) attached — every
 *  player who reacted, not just one. */
function withReactions(history: IHistoryEntry[], reactionsByCommandId: Map<string, IReactionSummary[]>): IHistoryEntryResponse[] {
    return history.map((entry) => ({
        ...entry,
        reactions: entry.commandId ? reactionsByCommandId.get(entry.commandId) ?? [] : [],
    }));
}

/**
 * Attaches each line's reactions to a single already-resolved history array —
 * what a game's live board data response sends the client.
 */
export async function attachHistoryReactions(gameId: string, history: IHistoryEntry[]): Promise<IHistoryEntryResponse[]> {
    const commandIds = history.map((entry) => entry.commandId).filter((id): id is string => !!id);
    const reactionsByCommandId = await reactionMapBy(gameId, 'commandId', commandIds);
    return withReactions(history, reactionsByCommandId);
}

/**
 * Attaches reactions across several history arrays at once — one query for
 * every command id across all of them — for the reconstructed timeline's
 * one-history-per-snapshot response, where stepping back through the game
 * shouldn't mean a reaction disappears from a line it already landed on.
 */
export async function attachHistoryReactionsToEach(gameId: string, histories: IHistoryEntry[][]): Promise<IHistoryEntryResponse[][]> {
    const commandIds = histories.flatMap((history) => history.map((entry) => entry.commandId))
        .filter((id): id is string => !!id);
    const reactionsByCommandId = await reactionMapBy(gameId, 'commandId', commandIds);
    return histories.map((history) => withReactions(history, reactionsByCommandId));
}
