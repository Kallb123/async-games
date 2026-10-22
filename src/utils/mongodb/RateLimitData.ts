import { Schema, model, models } from "mongoose";

// A fixed-window request counter, one document per (scope, identifier,
// window) bucket — keyed so a new window is always a fresh document rather
// than a read-modify-write on a shared row, and its own TTL index (the same
// mechanism InvitationSchema's expiresAt already leans on) reaps it once the
// window is over, with no cron of its own. Backing this with Mongo rather
// than an in-memory map is what makes it work across the separate
// serverless instances a single deployment runs behind.
export interface IRateLimitData {
    key: string;
    count: number;
    expiresAt: Date;
}

const RateLimitSchema = new Schema<IRateLimitData>({
    key: { type: String, unique: true },
    count: Number,
    expiresAt: Date,
});
RateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RateLimitModel = models.RateLimit || model<IRateLimitData>('RateLimit', RateLimitSchema);

/**
 * Clears the rows that would stop this collection's indexes being built, for
 * `npm run db:indexes` to run before it builds them.
 *
 * Both indexes have to exist before the first counter is written. Without the
 * unique `key`, two requests opening the same window both insert, and from then
 * on the unique index can't be built over the duplicates. Without the TTL on
 * `expiresAt`, nothing ever reaps a row, so the duplicates stay. Under
 * Mongoose's autoIndex that failure was silent and permanent: the e2e database
 * ran for weeks without either index (its rows from 2026-10-18 were still there
 * on the 22nd).
 *
 * A counter is disposable, so the clean-up deletes. Every row whose window is
 * over goes, which is exactly what the TTL index would have done. Then every
 * row of a key that is held more than once goes too. That only resets a limit
 * in a window still open, which costs nothing: a key that is held twice has
 * been counting each request in one of the two rows, not both. On a database
 * whose indexes are in place there are no duplicates, and the expired rows are
 * the few the TTL monitor (once a minute) hasn't reached yet.
 *
 * Says what it deleted, for the sync's log, or nothing when it deleted nothing.
 */
export async function clearRateLimitsForIndexing(now = new Date()): Promise<string | undefined> {
    const expired = await RateLimitModel.deleteMany({ $or: [{ expiresAt: { $lte: now } }, { expiresAt: { $exists: false } }] }).exec();
    const duplicated: { _id: string }[] = await RateLimitModel.aggregate([
        { $group: { _id: '$key', rows: { $sum: 1 } } },
        { $match: { rows: { $gt: 1 } } },
        { $project: { _id: 1 } },
    ]).exec();
    const duplicates = duplicated.length > 0
        ? await RateLimitModel.deleteMany({ key: { $in: duplicated.map(group => group._id) } }).exec()
        : { deletedCount: 0 };
    if (expired.deletedCount === 0 && duplicates.deletedCount === 0) return undefined;
    return `cleared ${expired.deletedCount} expired and ${duplicates.deletedCount} duplicated counters`;
}
