import { Document, Model, Schema, model, models } from "mongoose";

// One reaction dropped on a recap action. `eventId` is the recap event's own
// id (see IGameEvent in utils/games/recap.ts) — unique per game, enforcing
// the "one reaction per action" rule via a lookup before insert. `recipientId`
// is the action's original actor, who gets notified. This store is
// write-and-notify only for now; a later user page will read it back out.
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
export var ReactionModel = models.Reaction || model<IReactionDataDocument, IReactionDataModel>('Reaction', ReactionSchema);
