import { Document, Model, Schema, model, models } from "mongoose";
import type { IChatAttachment } from "../chat";
import { ChatAttachmentSchema } from "./ChatMessageData";

// Every GIF our own search route has served, keyed by the provider's id for it.
//
// This collection is what makes a GIF safe to attach to a message without the
// client ever sending a URL. The search route has already fetched the item and
// applied our content filter, so it writes down what it learned; the chat POST
// then takes nothing but `{ provider, mediaId }` and copies the rest from here.
// Two properties fall out of that, and both are the point (docs/chat-gifs.md
// §4c):
//
// - A message can only reference an item our *own filtered search* actually
//   served. Not "a real KLIPY item" (which a player could name directly, from a
//   query our filter would have blocked — see §4b) but one we offered.
// - The send path reads one indexed local row instead of calling the provider,
//   so posting a GIF doesn't depend on a third party being up.
//
// A row holds no player data — no userId, no gameId, just a public GIF and when
// to forget it — so account deletion has nothing to purge here, which is why
// this collection is absent from /api/user/delete while ChatMessage is not. A
// departing player's *copy* of a GIF is denormalised onto their messages and
// goes with them when the route deletes those. Same shape as RateLimitData,
// which is also keyed by user-derived strings, also reaped by TTL alone, and
// also not in the delete route.
//
// It is a **cache, not a ledger**: the TTL index below reaps a row nobody has
// browsed lately, exactly as RateLimitData and InvitationData already do.
// Eviction is safe by construction, because a message keeps its own copy of
// these fields forever — a reaped row can never break a GIF already sent. The
// only thing a miss costs is a fresh send of that GIF, which the search route
// re-populates on the next look.
export interface IGifCatalogueData extends IChatAttachment {
    /** When this row may be reaped. Read by the TTL index, nothing else. */
    expiresAt: Date;
}

/** How long a browsed GIF stays resolvable. Generous, because the whole window
 *  that matters is "a player searched, then tapped" — seconds — and a long TTL
 *  is what keeps a popular GIF from being re-fetched from the provider on every
 *  send. Short enough that the collection stays bounded by recent play. */
export const GIF_CATALOGUE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface IGifCatalogueDataDocument extends IGifCatalogueData, Document {
    // Instance methods
}

export interface IGifCatalogueDataModel extends Model<IGifCatalogueDataDocument> {
    // Static methods
}

// The seven GIF fields come from ChatAttachmentSchema rather than being written
// out again: a catalogue row and the attachment denormalised onto a message are
// the same object by design, and two copies of the field list is how that stops
// being true. `expiresAt` is the only thing a row has that a message doesn't.
export const GifCatalogueSchema = new Schema<IGifCatalogueDataDocument>({
    // Defaulted *and* required here rather than left to the call site. Mongo's
    // TTL monitor skips a document whose indexed field is missing or isn't a
    // Date (the behaviour InvitationData relies on deliberately), so a writer
    // that forgot this field wouldn't produce a short-lived row — it would
    // produce a permanent one, in a collection whose whole contract is that it
    // is a cache, with no symptom until it is enormous.
    expiresAt: { type: Date, required: true, default: () => new Date(Date.now() + GIF_CATALOGUE_TTL_MS) },
}).add(ChatAttachmentSchema);
// The index is the read: the one query the chat POST makes is "resolve this one
// id", and it is an exact match on the whole key. `unique` is what stops two
// concurrent searches for the same GIF leaving two rows — but it stops them by
// *raising* E11000 on the loser, not by quietly merging, so whoever writes the
// upsert has to treat a duplicate key as success (isDuplicateKeyError, the way
// rateLimit.ts and GameResultData already do) rather than as a failure that
// leaves no row behind.
GifCatalogueSchema.index({ provider: 1, mediaId: 1 }, { unique: true });
// Reaped by Mongo, with no cron of its own — the same mechanism RateLimitData
// and InvitationData lean on.
GifCatalogueSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const GifCatalogueModel = models.GifCatalogue
    || model<IGifCatalogueDataDocument, IGifCatalogueDataModel>('GifCatalogue', GifCatalogueSchema);
