import { reactionMapBy } from "@/utils/mongodb/ReactionData";
import { IHistoryEntry } from "./history";
import { IHistoryEntryResponse } from "@/utils/apiModels/GameDataApi";

/** One history array, with each entry's reaction (if any) attached. */
function withReactions(history: IHistoryEntry[], reactionByCommandId: Map<string, string>): IHistoryEntryResponse[] {
    return history.map((entry) => ({
        ...entry,
        reaction: entry.commandId ? reactionByCommandId.get(entry.commandId) ?? null : null,
    }));
}

/**
 * Attaches each line's reaction to a single already-resolved history array —
 * what a game's live board data response sends the client.
 */
export async function attachHistoryReactions(gameId: string, history: IHistoryEntry[]): Promise<IHistoryEntryResponse[]> {
    const commandIds = history.map((entry) => entry.commandId).filter((id): id is string => !!id);
    const reactionByCommandId = await reactionMapBy(gameId, 'commandId', commandIds);
    return withReactions(history, reactionByCommandId);
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
    const reactionByCommandId = await reactionMapBy(gameId, 'commandId', commandIds);
    return histories.map((history) => withReactions(history, reactionByCommandId));
}
