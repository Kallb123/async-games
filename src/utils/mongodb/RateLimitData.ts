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
