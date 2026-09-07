import { Document, Model, Schema, model, models } from "mongoose";
import { IReactionSummary } from "@/utils/reactions";

// One reaction dropped on a recap action, by one player. `eventId` is the
// recap event's own id (see IGameEvent in utils/games/recap.ts) — unique per
// game. Each player may drop their own reaction on the same action — that's
// the { gameId, eventId, actorId } rule the index below enforces — so an
// action can end up with several of these, one per reacting player.
// `recipientId` is the action's original actor, who gets notified.
//
// `actorUsername` is the sender's name captured when they reacted, used for the
// push notification sent then. The reactions page resolves the sender's name
// live from `actorId` instead (see /api/reactions), so a rename shows through;
// the stored copy is kept only as a fallback for a sender Clerk no longer knows.
export interface IReactionData {
    reactionId: `${string}-${string}-${string}-${string}-${string}`,
    gameId: string,
    eventId: string,
    commandId: string,
    actorId: string,
    actorUsername: string,
    recipientId: string,
    reaction: string,
    timestamp: string
}

export interface IReactionDataDocument extends IReactionData, Document {
    // Instance methods
}

export interface IReactionDataModel extends Model<IReactionDataDocument> {
    // Static methods
}

export var ReactionSchema = new Schema<IReactionDataDocument>({
    reactionId: Schema.Types.UUID,
    gameId: String,
    eventId: String,
    commandId: String,
    actorId: String,
    actorUsername: String,
    recipientId: String,
    reaction: String,
    timestamp: String
});
// "One reaction per player per action" was only ever a lookup before an
// insert, which two taps from the same player landing together both pass.
// This is what actually enforces it. The route still does the lookup first,
// because "you already reacted to this" is a better answer than a
// duplicate-key error; this catches the pair that race.
ReactionSchema.index({ gameId: 1, eventId: 1, actorId: 1 }, { unique: true });
// reactionMapBy's other lookup — a game's whole match-history log joins its
// reactions by commandId, on every board load and every move (see
// utils/games/historyReactions.ts) — so it gets the same treatment as the
// eventId read above rather than falling back to a collection scan.
ReactionSchema.index({ gameId: 1, commandId: 1 });
export var ReactionModel = models.Reaction || model<IReactionDataDocument, IReactionDataModel>('Reaction', ReactionSchema);

/**
 * Every reaction on each of a game's events — one entry per player who
 * reacted, since each may now drop their own — keyed by whichever id they're
 * being looked up by: `eventId` for the recap screen's own window, or
 * `commandId` for the match-history log's full-game join (see
 * utils/games/historyReactions.ts) — the two ids every ReactionData doc
 * already carries.
 *
 * A lookup failure only decorates whatever it's attached to (a recap, a
 * history line), so it's swallowed to "nothing found" rather than failing an
 * otherwise-good response — the same trade the recap route's own
 * unreadChatSince makes for unread chat counts.
 */
export async function reactionMapBy(gameId: string, field: 'eventId' | 'commandId', ids: string[]): Promise<Map<string, IReactionSummary[]>> {
    // Deduped once here rather than by every caller — attachHistoryReactionsToEach
    // in particular hands over one id per line per snapshot, the same handful
    // of ids repeated once per step through the timeline.
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) {
        return new Map();
    }
    try {
        const reactions = await ReactionModel.find({ gameId, [field]: { $in: uniqueIds } }).exec();
        const byId = new Map<string, IReactionSummary[]>();
        for (const reaction of reactions) {
            const id = reaction[field] as string;
            const summary: IReactionSummary = {
                reaction: reaction.reaction,
                actorId: reaction.actorId,
                actorUsername: reaction.actorUsername,
            };
            byId.set(id, [...(byId.get(id) ?? []), summary]);
        }
        return byId;
    } catch (error) {
        console.error(`Failed to read reactions for game ${gameId}`, error);
        return new Map();
    }
}
