import { Document, Model, Schema, model, models } from "mongoose";
import type { uuidString } from "../apiModels/GameDataApi";

// One message in a game's chat thread. Modelled on ReactionData: a flat
// collection keyed by `gameId`, kept beside the game rather than as a field on
// GameData. See docs/in-game-chat.md §3 for why it lives here and not on the
// game document — a message must never race a turn through GameData's optimistic
// concurrency, and the command route that loads the whole game on every move
// has no reason to drag an unbounded chat log along with it.
//
// No `senderUsername`: a message stores who sent it, never what they were
// called. The name is put back on by the client from the roster the board
// already holds, so a player who renames renames everywhere, including in
// messages they sent last week (ARCHITECTURE.md §5, docs/dynamic-names.md).
export interface IChatMessageData {
    messageId: uuidString,   // v4 UUID — a stable React key and an idempotency handle
    gameId: string,
    senderId: string,        // Clerk userId
    text: string,            // as typed, trimmed; rendered as text, never HTML
    timestamp: string        // ISO
}

export interface IChatMessageDataDocument extends IChatMessageData, Document {
    // Instance methods
}

export interface IChatMessageDataModel extends Model<IChatMessageDataDocument> {
    // Static methods
}

export var ChatMessageSchema = new Schema<IChatMessageDataDocument>({
    messageId: Schema.Types.UUID,
    gameId: String,
    senderId: String,
    text: String,
    timestamp: String
});
// The index is the read: the one query chat makes is the newest N messages in a
// game — find({ gameId }).sort({ timestamp: -1 }).limit(N) — served entirely by
// this compound index.
ChatMessageSchema.index({ gameId: 1, timestamp: -1 });
export var ChatMessageModel = models.ChatMessage || model<IChatMessageDataDocument, IChatMessageDataModel>('ChatMessage', ChatMessageSchema);
