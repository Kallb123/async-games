import { Document, Model, Schema, model, models } from "mongoose";
import type { IChatAttachment } from "../chat";

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
//   served. Not "a real Tenor item" (which a player could name directly, from a
//   query our filter would have blocked — see §4b) but one we offered.
// - The send path reads one indexed local row instead of calling the provider,
//   so posting a GIF doesn't depend on a third party being up.
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

export const GifCatalogueSchema = new Schema<IGifCatalogueDataDocument>({
    provider: String,
    mediaId: String,
    url: String,
    stillUrl: String,
    width: Number,
    height: Number,
    alt: String,
    expiresAt: Date,
});
// The index is the read: the one query the chat POST makes is "resolve this one
// id", and `unique` is also what makes the search route's upsert idempotent
// across the concurrent searches two players can run for the same GIF.
GifCatalogueSchema.index({ provider: 1, mediaId: 1 }, { unique: true });
// Reaped by Mongo, with no cron of its own — the same mechanism RateLimitData
// and InvitationData lean on.
GifCatalogueSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const GifCatalogueModel = models.GifCatalogue
    || model<IGifCatalogueDataDocument, IGifCatalogueDataModel>('GifCatalogue', GifCatalogueSchema);
