import { Document, Model, Schema, model, models } from "mongoose";

// One reaction dropped on a recap action. `eventId` is the recap event's own
// id (see IGameEvent in utils/games/recap.ts) — unique per game, which is what
// the "one reaction per action" rule is enforced on (see the index below).
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
// "One reaction per action" was only ever a lookup before an insert, which two
// taps landing together both pass. This is what actually enforces it — and it
// is the index the recap route's { gameId, eventId } read wants anyway. The
// route still does the lookup first, because "you already reacted to this" is
// a better answer than a duplicate-key error; this catches the pair that race.
ReactionSchema.index({ gameId: 1, eventId: 1 }, { unique: true });
export var ReactionModel = models.Reaction || model<IReactionDataDocument, IReactionDataModel>('Reaction', ReactionSchema);

/**
 * The reaction (if any) on each of a game's events, keyed by whichever id
 * they're being looked up by: `eventId` for the recap screen's own window, or
 * `commandId` for the match-history log's full-game join (see
 * utils/games/historyReactions.ts) — the two ids every ReactionData doc
 * already carries.
 *
 * A lookup failure only decorates whatever it's attached to (a recap, a
 * history line), so it's swallowed to "nothing found" rather than failing an
 * otherwise-good response — the same trade the recap route's own
 * unreadChatSince makes for unread chat counts.
 */
export async function reactionMapBy(gameId: string, field: 'eventId' | 'commandId', ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) {
        return new Map();
    }
    try {
        const reactions = await ReactionModel.find({ gameId, [field]: { $in: ids } }).exec();
        return new Map(reactions.map((reaction) => [reaction[field], reaction.reaction as string]));
    } catch (error) {
        console.error(`Failed to read reactions for game ${gameId}`, error);
        return new Map();
    }
}
