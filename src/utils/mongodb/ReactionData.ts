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
