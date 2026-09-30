import { MongoBulkWriteError } from "mongodb";
import { Document, Model, Schema, model, models } from "mongoose";
import { isOnlyDuplicateKeyErrors } from "./duplicateKey";

// One player holding one achievement: a flat collection like ChatRead, one row
// per player per achievement. Not a discriminator, and not a field on GameData
// or GameResult — a GameResult belongs to one game and doesn't exist until it
// ends, an unlock belongs to one player and may be earned mid-game. See
// docs/achievements.md §5 for why it lives here rather than in Clerk metadata.
//
// The unlock links to the game that earned it; the achievement itself doesn't
// (an achievement is a definition, the same for everyone). That link is what
// lets the results page list everything a game unlocked and a profile row say
// "in a game of Dice Cities".
export interface IAchievementUnlockData {
    userId: string,        // Clerk userId
    achievementId: string, // "dicecities.mine-baron"
    unlockedAt: string,    // ISO
    // The game that earned it. Absent only for a career unlock that was
    // already true before achievements existed (docs/achievements.md §4.3),
    // which has no game to point at.
    gameId?: string,
    // That game's GAME_META slug, copied onto the row rather than looked up
    // later: when any player at a table deletes their account the game's
    // result goes with it, and "in a game of Dice Cities" shouldn't vanish too.
    url?: string
}

export interface IAchievementUnlockDataDocument extends IAchievementUnlockData, Document {
    // Instance methods
}

export interface IAchievementUnlockDataModel extends Model<IAchievementUnlockDataDocument> {
    // Static methods
}

export var AchievementUnlockSchema = new Schema<IAchievementUnlockDataDocument>({
    userId: String,
    achievementId: String,
    unlockedAt: String,
    gameId: String,
    url: String
});
// One index, two jobs. Unique on the pair, because a player holds each
// achievement at most once and recordUnlocks' upsert relies on the constraint
// to make two racing judging passes leave one row. And its `userId` prefix is
// every read this collection gets: the profile and the toaster's recent
// unlocks, judging's "what do they hold", account deletion, the viewer's
// unlocks on the game response ({ userId, gameId }) and the results page
// ({ userId: { $in: playerIds }, gameId } — deliberately not a bare { gameId },
// which no index would serve).
//
// It has to exist before the first write. The repo relies on Mongoose's
// autoIndex, and a bulkWrite doesn't wait for an index build: if two upserts of
// the same pair landed first, both would insert, the build would then fail on
// the duplicate, and uniqueness would be gone for good. So nothing writes here
// until a deploy that only loads this model has built it (docs/achievements.md
// §5.2 and §13).
AchievementUnlockSchema.index({ userId: 1, achievementId: 1 }, { unique: true });
export var AchievementUnlockModel = models.AchievementUnlock || model<IAchievementUnlockDataDocument, IAchievementUnlockDataModel>('AchievementUnlock', AchievementUnlockSchema);

/** One unlock to record: who, which achievement, and the game that earned it
 *  (absent for a backfilled career unlock). `unlockedAt` is the same for the
 *  whole batch, so it is passed once beside the rows. */
export type UnlockToRecord = Pick<IAchievementUnlockData, "userId" | "achievementId" | "gameId" | "url">;

/**
 * Store a batch of unlocks, and answer which of them were *new*.
 *
 * Upserts, not inserts, and only the rows that really were inserted come back,
 * because the caller celebrates exactly those — the toast, the push, the line
 * on the results page — and two judging passes can decide the same player has
 * just earned the same thing: two turn ends whose `after()`s overlap, or two of
 * a player's games finishing at once, both deciding "Win 5". Both upsert, one
 * inserts, and only that one's caller hears "new". A plain `insertMany`, or a
 * batch that stored everything and reported everything, would have both passes
 * announce it (docs/achievements.md §5.2).
 *
 * The new rows are the ones whose position in the batch appears in the result's
 * `upsertedIds` — a `{ [index of the operation]: _id }` map.
 *
 * Usually the server settles the race itself, retrying the loser as a quiet
 * update. When it doesn't, the loser comes back as an E11000 inside a
 * MongoBulkWriteError, which is caught here, and only when *every* write error
 * is a duplicate key (the same walk the GIF catalogue's write does, since an
 * unordered batch carries on past a failure and one row losing a race can sit
 * beside another that genuinely failed). The error's own result still says
 * which rows were inserted, so those are the new ones and the duplicates are
 * "already held". Anything else is rethrown: a real write failure, a driver
 * error, a write-concern error, or a row that failed Mongoose's casting. This
 * is why the caller can't wrap the write in `isDuplicateKeyError`, which only
 * reads the top-level code — the first failure's, copied up — and would
 * swallow the answer to "which are new".
 *
 * It doesn't connect: every caller is a route that has already called
 * `dbConnect`, like `recordGameResult`.
 */
export async function recordUnlocks(unlocks: UnlockToRecord[], unlockedAt: string): Promise<UnlockToRecord[]> {
    if (unlocks.length === 0) {
        return [];
    }

    let upsertedIds: Record<number, unknown>;
    try {
        const result = await AchievementUnlockModel.bulkWrite(unlocks.map(({ userId, achievementId, gameId, url }) => ({
            updateOne: {
                filter: { userId, achievementId },
                // Not the filter's own fields: an upsert copies those in by
                // itself, and setting them again would stop the server retrying
                // the race described above. gameId and url are left out when
                // absent rather than passed as undefined, so what is stored
                // doesn't depend on how Mongoose casts one.
                update: { $setOnInsert: { unlockedAt, ...(gameId !== undefined && { gameId }), ...(url !== undefined && { url }) } },
                upsert: true,
            },
        })), {
            ordered: false,
            // `upsertedIds` is indexed by position in the batch, and with
            // ordered: false Mongoose drops any operation that fails casting
            // *before* sending the rest — so the driver's indexes would then
            // count the survivors, and every row after a dropped one would be
            // taken for its neighbour's. The two fields are strings, so nothing
            // should fail casting; but if one ever did, the answer has to be a
            // throw rather than a quietly wrong "new" list. (Mongoose still
            // sends the operations that did cast before it throws — a bug
            // loud enough to be noticed, not a batch that is rolled back.)
            throwOnValidationError: true,
        });
        upsertedIds = result.upsertedIds;
    } catch (err) {
        // Checked by class, not by shape: only the driver's own error carries
        // the result that says which rows went in, so anything else that
        // happens to hold code 11000 has no answer to give and is rethrown.
        if (!(err instanceof MongoBulkWriteError) || !isOnlyDuplicateKeyErrors(err)) {
            throw err;
        }
        upsertedIds = err.upsertedIds;
    }
    return unlocks.filter((_, index) => index in upsertedIds);
}
