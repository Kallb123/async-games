// The player directory's second tier: display records kept in the database, so
// that a serverless instance with nothing in memory (nearly every first request
// of a screen) can still answer names without waiting ~250 ms on Clerk. Memory
// stays the first tier (directoryCache.ts) and Clerk the last (clerk.ts); this
// is the middle one, shared by every instance, and it is only ever a cache.
//
// Server-only, like clerk.ts, which is its one reader. What a row may hold, and
// why nothing else can be stored in it, is PlayerDirectoryData.ts; the display
// fields come in as `DirectoryRecord`s already stripped of the Clerk user.
//
// Nothing here may make a name lookup worse than it was without this tier, so
// every call below is bounded and none of them throws: a read that fails or is
// slow answers "nothing shared" and the caller carries on to Clerk, and a write
// that fails is logged and forgotten (the record is still in memory, and the
// next lookup writes it again).
import { PlayerDirectoryModel } from '@/utils/mongodb/PlayerDirectoryData';
import { isDuplicateKeyError, isOnlyDuplicateKeyErrors } from '@/utils/mongodb/duplicateKey';
import { withTimeout } from '@/utils/withTimeout';
import type { DirectoryRecord } from '@/utils/users/directoryCache';

/**
 * How old a shared record may be and still be served, while it is refreshed
 * from Clerk behind the response. A week, because that is the gap an
 * asynchronous game has between visits (a turn timer can be days), and what a
 * long absence would otherwise cost is exactly the wait on Clerk this tier
 * exists to remove. It bounds only how old the *first* view after a long
 * absence can be, not how long a wrong name lives: the response that serves a
 * stale record schedules its refresh, so the next request has the new one; a
 * rename or a claim invalidates the row at once (`forgetSharedUser`); and the
 * only thing that really ages is a picture changed through Clerk directly. Past
 * a week a record is not trusted and Clerk is waited on, as before.
 */
export const SHARED_DIRECTORY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * How long a row is kept after Clerk last answered for it, before the TTL index
 * reaps it. Longer than the age it is served to, so a record that is past
 * serving can still be told apart from one that was never stored; short enough
 * that someone who stops playing is not kept here for long. Every lookup that
 * goes back to Clerk writes the row again, which restarts this.
 */
export const SHARED_DIRECTORY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * How long a "known missing" marker is believed, and kept before the TTL index
 * reaps it. The marker says Clerk has no user for an id: a deleted account, in
 * practice a guest swept a week after their last game, who stays on every
 * finished game they played. Without it each of those sends the whole lookup
 * back to Clerk on every cold instance, which is the cost this tier exists to
 * remove, so most dashboards would still wait ~250 ms.
 *
 * Memory believes the same thing for only 30 seconds (DIRECTORY_MISS_TTL_MS),
 * because an id that missed a moment ago may only have been Clerk catching up
 * with a user it has just been told about. That doesn't carry over to a day
 * here because of where a marker comes from: only a lookup that Clerk answered
 * "no user" to writes one, for an id that was already on a stored game, so it
 * names an account that existed when the game took it and has since been
 * removed, not one that is still being created. A removed account does not
 * come back under the same id, and the one change that can make an id
 * resolvable again, a claim, clears the marker (`forgetSharedUser`) along with
 * a rename. The day is how long a wrong answer could last at worst, and it is
 * about as long as any one player's session at the table.
 */
export const SHARED_KNOWN_MISSING_MS = 24 * 60 * 60 * 1000;

/**
 * How long a read waits on the database before it settles for Clerk. A warm
 * read is ~15-20 ms and Clerk's median is ~250 ms, so a read still out after
 * this is slower than the thing it saves: it adds at most this to a lookup that
 * was going to wait on Clerk anyway, and the next lookups skip the tier for a
 * while (`SHARED_BACKOFF_MS`) rather than each paying it.
 */
export const SHARED_READ_BUDGET_MS = 300;

/** How long every lookup in this process skips the tier after one read failed or ran out of budget. */
export const SHARED_BACKOFF_MS = 30_000;

/** The same bound on the writes, which run after the response and only keep the function alive. */
const SHARED_WRITE_BUDGET_MS = 5000;

/**
 * How long an invalidation marker is kept. It only has to outlive a Clerk
 * lookup that began before the change (the longest is `CLERK_REFRESH_BUDGET_MS`,
 * ten seconds); an hour is generous, and a marker has no display fields to
 * retain.
 */
const INVALIDATION_RETENTION_MS = 60 * 60 * 1000;

/**
 * Instances' clocks differ by a little, and the guard on a write compares the
 * time a lookup began with the time of a change made on another instance. This
 * leans it towards refusing: a lookup that began within this of a change is not
 * written back, which costs one more trip to Clerk later, where the other way
 * round would write an answer from before the change.
 */
const CLOCK_SKEW_MS = 1000;

// The connection, imported when it is first needed rather than when this module
// loads. mongodb.ts registers every game's models, and those reach back here
// through GameData -> clerk.ts, so a static import would be a cycle in which
// the models are used before they exist.
const openConnection = async () => { await (await import('@/utils/mongodb/mongodb')).dbConnect(); };
let connect = openConnection;

/**
 * Whether there is a database to share through. A process with no
 * `MONGODB_URI` (a script, a unit test) has no connection `dbConnect` could
 * open, and the tier sits out entirely there: nothing is read, written or
 * scheduled, rather than each lookup failing and logging. A deployment always
 * has one.
 */
export function sharedDirectoryAvailable(): boolean {
    return connect !== openConnection || !!process.env.MONGODB_URI;
}

/** What the database holds of a player, and when Clerk last said so. */
export interface SharedRecord {
    record: DirectoryRecord;
    /** Epoch ms of Clerk's answer. */
    fetchedAt: number;
}

export interface SharedRead {
    /** Every requested id the database holds a record young enough to serve for. */
    found: Map<string, SharedRecord>;
    /** Every requested id the database holds a fresh "Clerk has no user for this" marker for. */
    missing: Set<string>;
    /** How long the read took; absent when none was made (nothing asked, or the tier is backing off). */
    tookMs?: number;
}

// When the tier next gets a try after a read failed or ran out of budget.
let unavailableUntil = 0;

// Only the display fields and the age: the projection is what keeps anything
// else a row might ever hold from reaching a lookup.
const PROJECTION = { _id: 0, userId: 1, name: 1, handle: 1, imageUrl: 1, fetchedAt: 1, missingAt: 1 } as const;

interface StoredRow { userId: string; name?: unknown; handle?: unknown; imageUrl?: unknown; fetchedAt?: unknown; missingAt?: unknown }

/** A stored row as a record, or null for one that isn't a usable copy (invalidated, or malformed). */
function toSharedRecord(row: StoredRow, now: number): SharedRecord | null {
    if (typeof row.userId !== 'string' || typeof row.name !== 'string') return null;
    const fetchedAt = row.fetchedAt instanceof Date ? row.fetchedAt.getTime() : NaN;
    // A date in the future is another instance's clock running ahead: as new as it can be.
    if (!Number.isFinite(fetchedAt) || now - fetchedAt >= SHARED_DIRECTORY_MAX_AGE_MS) return null;
    return {
        record: {
            id: row.userId,
            name: row.name,
            handle: typeof row.handle === 'string' ? row.handle : null,
            imageUrl: typeof row.imageUrl === 'string' ? row.imageUrl : null,
        },
        fetchedAt: Math.min(fetchedAt, now),
    };
}

/** Whether a row is a marker, still believed, that Clerk has no user for the id (and holds no copy of one). */
function isKnownMissing(row: StoredRow, now: number): boolean {
    return typeof row.name !== 'string' && row.missingAt instanceof Date && now - row.missingAt.getTime() < SHARED_KNOWN_MISSING_MS;
}

/**
 * The shared records for `ids`, in one query. Never throws and never waits
 * longer than `SHARED_READ_BUDGET_MS`: a failure or a timeout is "nothing found"
 * (and the tier sits out the next `SHARED_BACKOFF_MS`), so the caller asks Clerk
 * for everything as it always did.
 */
export async function readSharedUsers(ids: string[]): Promise<SharedRead> {
    const now = Date.now();
    if (ids.length === 0 || now < unavailableUntil || !sharedDirectoryAvailable()) return { found: new Map(), missing: new Set() };

    const began = performance.now();
    const rows = await withTimeout<StoredRow[] | null>(async () => {
        await connect();
        return PlayerDirectoryModel.find({ userId: { $in: ids } }, PROJECTION).lean().exec();
    }, SHARED_READ_BUDGET_MS, null, 'Shared name lookup');
    const tookMs = performance.now() - began;
    if (!rows) {
        unavailableUntil = Date.now() + SHARED_BACKOFF_MS;
        return { found: new Map(), missing: new Set(), tookMs };
    }

    const found = new Map<string, SharedRecord>();
    const missing = new Set<string>();
    for (const row of rows) {
        const shared = toSharedRecord(row, now);
        if (shared) found.set(shared.record.id, shared);
        else if (typeof row.userId === 'string' && isKnownMissing(row, now)) missing.add(row.userId);
    }
    return { found, missing, tookMs };
}

/**
 * Stores what Clerk answered for a lookup: a record for each id it returned and
 * a "known missing" marker for each it did not (an account that is gone; see
 * `SHARED_KNOWN_MISSING_MS`), which replaces any copy the row held. One `bulkWrite`,
 * unordered, so one row's failure costs that row. Never throws; the caller runs
 * it after the response.
 *
 * `started` is when the lookup began. A row invalidated since then is left
 * alone, whichever of the two it was going to write, because Clerk may have
 * answered from before the change that invalidated it: the write is an upsert whose filter only matches a row with
 * no invalidation, or one from before the lookup began. For a row that is
 * invalidated the filter misses, the upsert tries to insert a second row for
 * the player, and the unique index refuses: the duplicate-key error is the
 * guard doing its job, not a failure (the same reading `duplicateKey.ts` gives
 * a lost race anywhere else).
 */
export async function writeSharedUsers(askedFor: string[], found: DirectoryRecord[], started: Date, answered = new Date()): Promise<void> {
    if (askedFor.length === 0 || !sharedDirectoryAvailable()) return;
    const answeredAt = answered.getTime();
    const guard = new Date(started.getTime() - CLOCK_SKEW_MS);
    const returned = new Set(found.map(record => record.id));
    const unlessInvalidatedSince = (userId: string) =>
        ({ userId, $or: [{ invalidatedAt: { $exists: false } }, { invalidatedAt: { $lt: guard } }] });
    const operations = [
        ...found.map(({ id, name, handle, imageUrl }) => ({
            updateOne: {
                filter: unlessInvalidatedSince(id),
                // A user Clerk knows again is no longer marked missing.
                update: {
                    $set: { name, handle, imageUrl, fetchedAt: answered, expiresAt: new Date(answeredAt + SHARED_DIRECTORY_RETENTION_MS) },
                    $unset: { missingAt: 1 },
                },
                upsert: true,
            },
        })),
        // No user: the marker carries no display field, so a copy the row held
        // of the account is removed with this.
        ...askedFor.filter(id => !returned.has(id)).map(id => ({
            updateOne: {
                filter: unlessInvalidatedSince(id),
                update: {
                    $set: { missingAt: answered, expiresAt: new Date(answeredAt + SHARED_KNOWN_MISSING_MS) },
                    $unset: { name: 1, handle: 1, imageUrl: 1, fetchedAt: 1 },
                },
                upsert: true,
            },
        })),
    ];

    await withTimeout(async () => {
        await connect();
        try {
            await PlayerDirectoryModel.bulkWrite(operations, { ordered: false });
        } catch (error) {
            if (!isOnlyDuplicateKeyErrors(error)) throw error;
        }
    }, SHARED_WRITE_BUDGET_MS, undefined, 'Shared name write');
}

/**
 * Takes a player out of the shared directory, for the routes that change how
 * they are shown (a rename, a claim, a deletion) to await once their write has
 * landed. Never throws; if the database can't be reached the other instances
 * keep their copy until it ages out, which is the bound they had before this
 * tier existed.
 *
 * A change leaves a marker: the display fields gone and any "known missing"
 * marker with them (a claim makes the id resolvable straight away), so the row
 * reads as a miss, and `invalidatedAt` kept for `writeSharedUsers` to check a
 * lookup against. A deletion removes the row outright, since it is a person's
 * data and the account it describes no longer exists. (A lookup that was
 * already out for that account can still write it back; the next Clerk answer
 * for the id, "no such user", replaces it with a "known missing" marker, and
 * the retention bounds it regardless.)
 */
/** Why a player is forgotten: how they are shown `changed` (a rename, a claim), or their account was `deleted`. */
export type ForgetReason = 'changed' | 'deleted';

export async function forgetSharedUser(userId: string, reason: ForgetReason): Promise<void> {
    if (!sharedDirectoryAvailable()) return;
    await withTimeout(async () => {
        await connect();
        if (reason === 'deleted') {
            await PlayerDirectoryModel.deleteOne({ userId }).exec();
            return;
        }
        const now = Date.now();
        const invalidate = () => PlayerDirectoryModel.updateOne({ userId }, {
            $set: { invalidatedAt: new Date(now), expiresAt: new Date(now + INVALIDATION_RETENTION_MS) },
            $unset: { name: 1, handle: 1, imageUrl: 1, fetchedAt: 1, missingAt: 1 },
        }, { upsert: true }).exec();
        try {
            await invalidate();
        } catch (error) {
            // Two upserts for a player nobody had a row for yet: the loser finds
            // the row the winner made and updates it.
            if (!isDuplicateKeyError(error)) throw error;
            await invalidate();
        }
    }, SHARED_WRITE_BUDGET_MS, undefined, 'Shared name invalidation');
}

/**
 * Test seam: forget that a read ever failed, and say how the database is
 * reached (nothing, for a test that stands in for the collection itself).
 */
export function __resetSharedDirectoryForTests(connection: () => Promise<void> = openConnection) {
    unavailableUntil = 0;
    connect = connection;
}
