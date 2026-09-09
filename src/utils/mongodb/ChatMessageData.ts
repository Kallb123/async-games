import { Document, Model, Schema, model, models } from "mongoose";
import type { uuidString } from "../apiModels/GameDataApi";
import type { IChatAttachment } from "../chat";

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
// A message's optional GIF, denormalised. `IChatAttachment` lives in
// ../chat.ts, beside the validator that produces one, so the client can hold
// the same type without importing this model — the arrangement IReactionSummary
// already uses. The fields are *copied* off the GifCatalogue row rather than
// referenced into it, which keeps the chat GET the single indexed read its
// route comment promises (no join per message) and means a catalogue row
// expiring can't break a GIF that has already been sent. See docs/chat-gifs.md
// §3 and §4c.
export interface IChatMessageData {
    messageId: uuidString,   // v4 UUID — a stable React key and an idempotency handle
    gameId: string,
    senderId: string,        // Clerk userId
    text: string,            // as typed, trimmed; rendered as text, never HTML. '' when `attachment` carries the message.
    attachment?: IChatAttachment,  // absent on a plain message, and on every message written before GIFs shipped
    timestamp: string        // ISO
}

export interface IChatMessageDataDocument extends IChatMessageData, Document {
    // Instance methods
}

export interface IChatMessageDataModel extends Model<IChatMessageDataDocument> {
    // Static methods
}

// A real nested Schema, not Schema.Types.Mixed: Mixed stores whatever it is
// handed, which is the one property you do not want on the field a GIF arrives
// through. `_id: false` because a subdocument nobody addresses doesn't need one.
const ChatAttachmentSchema = new Schema<IChatAttachment>({
    provider: String,
    mediaId: String,
    url: String,
    stillUrl: String,
    width: Number,
    height: Number,
    alt: String
}, { _id: false });

export var ChatMessageSchema = new Schema<IChatMessageDataDocument>({
    messageId: Schema.Types.UUID,
    gameId: String,
    senderId: String,
    text: String,
    attachment: ChatAttachmentSchema,
    timestamp: String
});
// The index is the read: the one query chat makes is the newest N messages in a
// game — find({ gameId }).sort({ timestamp: -1 }).limit(N) — served entirely by
// this compound index.
ChatMessageSchema.index({ gameId: 1, timestamp: -1 });
export var ChatMessageModel = models.ChatMessage || model<IChatMessageDataDocument, IChatMessageDataModel>('ChatMessage', ChatMessageSchema);
