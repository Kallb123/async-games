import { ReactionModel } from "@/utils/mongodb/ReactionData";
import { IHistoryEntry } from "./history";
import { IHistoryEntryResponse } from "@/utils/apiModels/GameDataApi";

// Reactions are keyed to a command id (ReactionData.commandId), the same id
// runCommand stamps onto every history line it writes (see commandPipeline.ts
// and IHistoryEntry.commandId) — so looking a game's reactions up by the
// command ids its history already carries is a plain join, with no dependency
// on the recap engine's replay machinery.
async function reactionsByCommandId(gameId: string, commandIds: string[]): Promise<Map<string, string>> {
    if (commandIds.length === 0) {
        return new Map();
    }
    try {
        const reactions = await ReactionModel.find({ gameId, commandId: { $in: commandIds } }).exec();
        return new Map(reactions.map((reaction) => [reaction.commandId, reaction.reaction as string]));
    } catch (error) {
        // Decorates the response rather than being it — a hiccup here shouldn't
        // fail an otherwise-good move or page load, the same trade the recap
        // route's own unreadChatSince makes.
        console.error(`Failed to read history reactions for game ${gameId}`, error);
        return new Map();
    }
}

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
    const reactionByCommandId = await reactionsByCommandId(gameId, commandIds);
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
    const reactionByCommandId = await reactionsByCommandId(gameId, commandIds);
    return histories.map((history) => withReactions(history, reactionByCommandId));
}
