import mongoose, { Document, Model, Schema, model, models } from "mongoose";
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
 * error, a write-concern error, or a row that failed Mongoose's casting, alone
 * or beside a lost race (beside one, the error's `upsertedIds` count the rows
 * that were sent rather than the batch, so they can't be read by its
 * positions). This is why the caller can't wrap the write in
 * `isDuplicateKeyError`, which only reads the top-level code — the first
 * failure's, copied up — and would swallow the answer to "which are new".
 *
 * A row that isn't a well-formed unlock is refused before anything is written.
 *
 * It doesn't connect: every caller is a route that has already called
 * `dbConnect`, like `recordGameResult`.
 */
export async function recordUnlocks(unlocks: UnlockToRecord[], unlockedAt: string): Promise<UnlockToRecord[]> {
    if (unlocks.length === 0) {
        return [];
    }

    // Refused up front rather than left to the types, because the failure is
    // quiet: a blank key would upsert a row with a blank key, which the unique
    // index then allows once per achievement (this repo uses '' as "nobody"
    // elsewhere, e.g. `currentTurn`), and a filter value that isn't a string
    // could be an operator object — Mongoose lets one through a String path and
    // `sanitizeFilter` isn't set. gameId and url are held to it too: a
    // non-string there would fail casting, which the option below backstops.
    unlocks.forEach(({ userId, achievementId, gameId, url }, index) => {
        const isKey = (value: unknown) => typeof value === "string" && value !== "";
        const isOptionalText = (value: unknown) => value === undefined || typeof value === "string";
        if (!isKey(userId) || !isKey(achievementId) || !isOptionalText(gameId) || !isOptionalText(url)) {
            throw new TypeError(`recordUnlocks was given a malformed unlock at index ${index}`);
        }
    });

    // The unique index is the only thing that makes two racing passes leave one
    // row, and a bulkWrite doesn't wait for autoIndex to finish building it (see
    // the note on the schema). `init()` hands back Mongoose's cached promise, so
    // this costs nothing after the first call — and if the build failed it
    // throws, here, instead of the write going ahead without uniqueness
    // (docs/achievements.md §5.2).
    await AchievementUnlockModel.init();

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
            // taken for its neighbour's. The fields are strings and the check
            // above keeps them so, meaning nothing should fail casting; but if
            // one ever did, the answer has to be a throw rather than a quietly
            // wrong "new" list. (Mongoose still sends the operations that did
            // cast before it throws — a bug loud enough to be noticed, not a
            // batch that is rolled back. And it throws this only once the
            // driver call has succeeded; the catch below takes the one that
            // didn't.)
            throwOnValidationError: true,
        });
        upsertedIds = result.upsertedIds;
    } catch (err) {
        // Checked by class, not by shape: only the driver's own error carries
        // the result that says which rows went in, so anything else that
        // happens to hold code 11000 has no answer to give and is rethrown.
        //
        // The class is Mongoose's own copy of the driver (`mongoose.mongo`),
        // not an import of "mongodb". Mongoose pins its driver (~7.2) while
        // package.json only asks for ^7, so a later bump of the root package
        // can leave two copies installed, and every error Mongoose throws would
        // then fail `instanceof` against ours — sending the lost-race path to a
        // rethrow while tests that build their errors from the same root import
        // stay green.
        if (!(err instanceof mongoose.mongo.MongoBulkWriteError) || !isOnlyDuplicateKeyErrors(err)) {
            throw err;
        }
        // A row that failed casting beside a lost race comes out here as the
        // driver's error, not Mongoose's: it rethrows that before its own
        // `throwOnValidationError` branch runs, so the option above never
        // fires. What it does first is decorate the error with what it dropped
        // (`err.mongoose.validationErrors`, see its decorateBulkWriteResult),
        // and while anything was dropped this error's `upsertedIds` count the
        // surviving rows, not the batch — the misattribution that option is
        // for, so it is a throw here as well.
        if ((err as { mongoose?: { validationErrors?: unknown[] } }).mongoose?.validationErrors?.length) {
            throw err;
        }
        upsertedIds = err.upsertedIds;
    }
    return unlocks.filter((_, index) => index in upsertedIds);
}
