import { Document, Model, Schema, model, models } from "mongoose";

// How far one player has read into one game's chat thread. A second small flat
// collection beside ChatMessageData, one row per player per game, kept private
// (§13.2): the only marker a response ever carries is the viewer's own, so
// this model never needs a redaction pass the way ChatMessage's does. See
// docs/in-game-chat.md §13.3 for why this is its own row rather than a
// readBy array on ChatMessage or a field on GameData.
export interface IChatReadData {
    gameId: string,
    userId: string,   // Clerk userId
    readAt: string     // ISO — the newest message this player has seen
}

export interface IChatReadDataDocument extends IChatReadData, Document {
    // Instance methods
}

export interface IChatReadDataModel extends Model<IChatReadDataDocument> {
    // Static methods
}

export var ChatReadSchema = new Schema<IChatReadDataDocument>({
    gameId: String,
    userId: String,
    readAt: String
});
// Two indexes because there are two reads, asked from opposite ends: the board
// asks "this player, in this game" (the unique index, which also enforces one
// row per seat), and the dashboard asks "every marker this player has" (one
// query for the whole home screen).
ChatReadSchema.index({ gameId: 1, userId: 1 }, { unique: true });
ChatReadSchema.index({ userId: 1 });
export var ChatReadModel = models.ChatRead || model<IChatReadDataDocument, IChatReadDataModel>('ChatRead', ChatReadSchema);
