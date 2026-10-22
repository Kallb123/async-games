import { Schema, model, models } from "mongoose";

// The shared tier of the player-directory cache (docs/loading-performance-plan.md,
// "Cache the player directory on the server"): how other players are shown,
// kept where every serverless instance can read it, because nearly every first
// request of a screen lands on an instance whose own memory is empty and would
// otherwise wait ~250 ms on Clerk for names it was told a minute ago. Read and
// written only by utils/users/sharedDirectory.ts, which says how.
//
// One document per player, and the display fields are the whole of what it may
// hold: the same four things `DirectoryRecord` (directoryCache.ts) carries, and
// never the Clerk user they came from, so no email address, no private
// metadata and no real name can be stored here by accident. The rest of the
// fields only keep the row honest:
//
// - `fetchedAt`: when Clerk last answered for this player, which is how old the
//   copy is. The reader decides what each age is good for.
// - `invalidatedAt`: set by a rename or a claim, with the display fields
//   removed. A row with no `name` is a miss for reading; the timestamp stays so
//   a Clerk lookup that began before the change can't write its answer (from
//   before the change) back over it.
// - `missingAt`: when Clerk last said it has no user for this id (a deleted
//   account, in practice a swept guest still named on finished games). Such a
//   row holds no display field at all, and is believed for a day, so a cold
//   instance doesn't ask Clerk again for an account that is gone.
// - `expiresAt`: when the TTL index reaps the row. `fetchedAt` plus the
//   retention for a copy, so a player nobody looks up any more is not kept for
//   ever; an hour ahead for an invalidation marker, which has no use once any
//   lookup it could have raced is over; a day ahead for a `missingAt` marker.
export interface IPlayerDirectoryData {
    userId: string;
    /** The name they are shown under, before any collision tag. Absent on an invalidated row. */
    name?: string;
    /** The handle that tells two of the same name apart; null for a guest. */
    handle?: string | null;
    /** Their real picture, or null for none. */
    imageUrl?: string | null;
    fetchedAt?: Date;
    invalidatedAt?: Date;
    missingAt?: Date;
    expiresAt: Date;
}

const PlayerDirectorySchema = new Schema<IPlayerDirectoryData>({
    // Clerk's id: unique, so a player is one row however many instances upsert
    // it at once (a lost race is a duplicate-key error, which the writer reads
    // as "someone else got there"), and the index the lookup by id runs on.
    userId: { type: String, required: true, unique: true },
    name: String,
    handle: String,
    imageUrl: String,
    fetchedAt: Date,
    invalidatedAt: Date,
    missingAt: Date,
    expiresAt: { type: Date, required: true },
});
// Reaped by the TTL monitor once `expiresAt` has passed, with no cron of its
// own (the same mechanism RateLimitData leans on). Built by `npm run db:indexes`
// at deploy, not by the app.
PlayerDirectorySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PlayerDirectoryModel = models.PlayerDirectory || model<IPlayerDirectoryData>('PlayerDirectory', PlayerDirectorySchema);
