// recordUnlocks, whose answer is the whole point of the collection: which of
// these rows were *new*, because the caller celebrates exactly those and two
// judging passes can race to award the same thing (docs/achievements.md §5.2).
//
// Two layers. The first drives it through the test store in
// utils/testing/apiRoute.ts, which answers `upsertedIds` the way the driver
// does and can be told to fail the way a lost race does. The second lets the
// write go through the real Mongoose `bulkWrite` and stops at the driver's
// collection, because what a fake store can't show is what Mongoose does to
// the operations on the way: the casting that drops one, and the error it
// passes back up.
//
// Every driver class here comes from `mongoose.mongo`, the copy Mongoose itself
// loaded, never from an import of "mongodb": recordUnlocks checks the errors it
// catches against that copy, and a test that built them from another one would
// stay green on the day the two stop being the same.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

vi.mock('@clerk/nextjs/server', async () => (await import('@/utils/testing/apiRoute')).clerkStub());
vi.mock('@/utils/mongodb/mongodb', async () => (await import('@/utils/testing/apiRoute')).mongodbStub());

import mongoose from 'mongoose';
import type { BulkWriteResult, WriteError } from 'mongodb';
import { failNextAchievementUnlockWrite, resetApiRouteStubs, seedAchievementUnlock, storedAchievementUnlocks } from '@/utils/testing/apiRoute';
import { AchievementUnlockModel, AchievementUnlockSchema, recordUnlocks } from './AchievementUnlockData';

const { MongoBulkWriteError, ObjectId } = mongoose.mongo;

const ANN = 'user_ann';
const BOB = 'user_bob';
const NOW = '2026-03-01T12:00:00.000Z';
const EARLIER = '2026-01-01T09:00:00.000Z';

const DUPLICATE_KEY = 11000;
const WRITE_CONFLICT = 112;

/** A write error as the driver hands one out: the code sits behind a getter
 *  over an inner `err`, not on the object itself. */
class FakeWriteError {
    constructor(readonly err: { code: number, index: number }) { }
    get code() { return this.err.code; }
    get index() { return this.err.index; }
}

/**
 * The error an unordered `bulkWrite` throws when some of its rows failed: the
 * driver's real class, so `instanceof`, the copied-up `code` and the
 * `upsertedIds` getter are the real ones.
 *
 * Its result and write errors are stand-ins. `BulkWriteResult` and `WriteError`
 * are types in the driver's public API, not exports — `MongoBulkWriteError` is
 * the one class of the three it lets a caller reach — so the result is an
 * object holding the one field the error's getters read, and each write error
 * has the shape the driver's has.
 */
function bulkWriteError({ upserted, failed }: { upserted: number[], failed: { index: number, code: number }[] }) {
    const result = { upsertedIds: Object.fromEntries(upserted.map(index => [index, new ObjectId()])) } as unknown as BulkWriteResult;
    const writeErrors = failed.map(one => new FakeWriteError(one)) as unknown as WriteError[];
    return new MongoBulkWriteError({ message: 'bulk write failed', code: failed[0]?.code ?? 0, writeErrors }, result);
}

beforeEach(async () => {
    await resetApiRouteStubs();
    vi.mocked(AchievementUnlockModel.bulkWrite).mockClear();
});

// What keeps two racing passes to one row is the constraint, so the test that
// matters most is the one that fails the day the line declaring it goes.
describe('the AchievementUnlock schema', () => {
    it('has a unique index on the player and the achievement', () => {
        expect(AchievementUnlockSchema.indexes()).toContainEqual([{ userId: 1, achievementId: 1 }, expect.objectContaining({ unique: true })]);
    });
});

describe('recordUnlocks', () => {
    it('answers every row as new when the player holds none of them', async () => {
        const rows = [
            { userId: ANN, achievementId: 'dicecities.mine-baron', gameId: 'game_1', url: 'dicecities' },
            { userId: BOB, achievementId: 'platform.first-win', gameId: 'game_1', url: 'dicecities' },
        ];

        await expect(recordUnlocks(rows, NOW)).resolves.toEqual(rows);

        expect(storedAchievementUnlocks()).toEqual(rows.map(row => ({ ...row, unlockedAt: NOW })));
    });

    it('stores a backfilled career unlock with no game, and no empty fields in its place', async () => {
        const backfilled = { userId: ANN, achievementId: 'dicecities.mayor' };

        await expect(recordUnlocks([backfilled], NOW)).resolves.toEqual([backfilled]);

        // Strictly: an `undefined` gameId or url would be a key the row carries.
        expect(storedAchievementUnlocks()).toStrictEqual([{ ...backfilled, unlockedAt: NOW }]);
    });

    it('answers only the rows it inserted when the player already held some', async () => {
        seedAchievementUnlock({ userId: ANN, achievementId: 'platform.first-win', unlockedAt: EARLIER, gameId: 'game_0', url: 'snakesandladders' });
        const held = { userId: ANN, achievementId: 'platform.first-win', gameId: 'game_1', url: 'dicecities' };
        const fresh = { userId: ANN, achievementId: 'dicecities.mine-baron', gameId: 'game_1', url: 'dicecities' };
        // Another player's hold on the same achievement is not this player's.
        const theirs = { userId: BOB, achievementId: 'platform.first-win', gameId: 'game_1', url: 'dicecities' };

        await expect(recordUnlocks([held, fresh, theirs], NOW)).resolves.toEqual([fresh, theirs]);

        const stored = storedAchievementUnlocks();
        expect(stored).toHaveLength(3);
        // What was already held is untouched: same date, same game.
        expect(stored[0]).toEqual({ userId: ANN, achievementId: 'platform.first-win', unlockedAt: EARLIER, gameId: 'game_0', url: 'snakesandladders' });
    });

    it('answers nothing when everything was already held', async () => {
        seedAchievementUnlock({ userId: ANN, achievementId: 'platform.first-win', unlockedAt: EARLIER });

        await expect(recordUnlocks([{ userId: ANN, achievementId: 'platform.first-win', gameId: 'game_1' }], NOW)).resolves.toEqual([]);

        expect(storedAchievementUnlocks()).toHaveLength(1);
    });

    it('makes no write at all for an empty batch', async () => {
        await expect(recordUnlocks([], NOW)).resolves.toEqual([]);

        expect(AchievementUnlockModel.bulkWrite).not.toHaveBeenCalled();
    });

    it.each([
        ['a blank userId', { userId: '', achievementId: 'platform.first-win' }],
        ['a blank achievementId', { userId: ANN, achievementId: '' }],
        ['a missing userId', { achievementId: 'platform.first-win' }],
        ['a null achievementId', { userId: ANN, achievementId: null }],
        // What a filter would read as an operator rather than a value.
        ['an operator object for a userId', { userId: { $ne: '' }, achievementId: 'platform.first-win' }],
        ['a number for a gameId', { userId: ANN, achievementId: 'platform.first-win', gameId: 7 }],
        ['an object for a url', { userId: ANN, achievementId: 'platform.first-win', url: {} }],
    ])('refuses %s before writing anything, naming the row', async (_, bad) => {
        const good = { userId: BOB, achievementId: 'platform.first-win' };

        await expect(recordUnlocks([good, bad as unknown as typeof good], NOW)).rejects.toThrow(new TypeError('recordUnlocks was given a malformed unlock at index 1'));

        expect(AchievementUnlockModel.bulkWrite).not.toHaveBeenCalled();
        expect(storedAchievementUnlocks()).toEqual([]);
    });

    it('sends one unordered upsert per row, setting everything but the key only on insert', async () => {
        await recordUnlocks([
            { userId: ANN, achievementId: 'dicecities.mine-baron', gameId: 'game_1', url: 'dicecities' },
            { userId: BOB, achievementId: 'dicecities.mayor' },
        ], NOW);

        const [operations, options] = vi.mocked(AchievementUnlockModel.bulkWrite).mock.calls[0];
        // Strictly, so a game link the row doesn't have can't ride along as undefined.
        expect(operations).toStrictEqual([
            {
                updateOne: {
                    filter: { userId: ANN, achievementId: 'dicecities.mine-baron' },
                    // The key itself is never in here: see recordUnlocks.
                    update: { $setOnInsert: { unlockedAt: NOW, gameId: 'game_1', url: 'dicecities' } },
                    upsert: true,
                },
            },
            {
                updateOne: {
                    filter: { userId: BOB, achievementId: 'dicecities.mayor' },
                    update: { $setOnInsert: { unlockedAt: NOW } },
                    upsert: true,
                },
            },
        ]);
        expect(options).toMatchObject({ ordered: false });
    });

    describe('when two judging passes race for the same unlock', () => {
        const rows = [
            { userId: ANN, achievementId: 'platform.first-win', gameId: 'game_1' },
            { userId: ANN, achievementId: 'dicecities.mine-baron', gameId: 'game_1' },
            { userId: ANN, achievementId: 'dicecities.mayor', gameId: 'game_1' },
        ];

        it('answers the rows that went in when the loser comes back as a duplicate key', async () => {
            // The other pass got the middle one first.
            failNextAchievementUnlockWrite(bulkWriteError({ upserted: [0, 2], failed: [{ index: 1, code: DUPLICATE_KEY }] }));

            await expect(recordUnlocks(rows, NOW)).resolves.toEqual([rows[0], rows[2]]);
        });

        it('answers nothing new when every row lost', async () => {
            failNextAchievementUnlockWrite(bulkWriteError({
                upserted: [],
                failed: rows.map((_, index) => ({ index, code: DUPLICATE_KEY })),
            }));

            await expect(recordUnlocks(rows, NOW)).resolves.toEqual([]);
        });

        it('rethrows when a real failure is hiding behind the duplicate', async () => {
            // The error's own `code` reads 11000 because the first failure was a
            // duplicate — which says nothing about the second.
            const error = bulkWriteError({ upserted: [0], failed: [{ index: 1, code: DUPLICATE_KEY }, { index: 2, code: WRITE_CONFLICT }] });
            expect(error.code).toBe(DUPLICATE_KEY);
            failNextAchievementUnlockWrite(error);

            await expect(recordUnlocks(rows, NOW)).rejects.toBe(error);
        });

        it('rethrows a bulk error that is not a write error', async () => {
            // A write-concern failure carries no writeErrors, and so no duplicate to excuse.
            const error = bulkWriteError({ upserted: [0, 1, 2], failed: [] });
            failNextAchievementUnlockWrite(error);

            await expect(recordUnlocks(rows, NOW)).rejects.toBe(error);
        });

        it('rethrows an error that is not a bulk write error', async () => {
            const error = new Error('connection closed');
            failNextAchievementUnlockWrite(error);

            await expect(recordUnlocks(rows, NOW)).rejects.toBe(error);
        });

        it('reads an error built from Mongoose\'s own copy of the driver as a lost race', async () => {
            // `bulkWriteError` builds from `mongoose.mongo`, the class the check
            // is made against; were it the root "mongodb" instead, this would be
            // a rethrow the day the two copies diverge.
            failNextAchievementUnlockWrite(bulkWriteError({ upserted: [], failed: [{ index: 0, code: DUPLICATE_KEY }] }));

            await expect(recordUnlocks(rows.slice(0, 1), NOW)).resolves.toEqual([]);
        });

        it('rethrows a duplicate-key code that has no result to read the new rows from', async () => {
            const error = Object.assign(new Error('E11000 duplicate key'), { code: DUPLICATE_KEY });
            failNextAchievementUnlockWrite(error);

            await expect(recordUnlocks(rows, NOW)).rejects.toBe(error);
        });
    });
});

// The same function over the real Model.bulkWrite, with only the driver's
// collection underneath replaced — what it is sent, and what it answers.
describe('recordUnlocks through Mongoose', () => {
    type Collection = { bulkWrite: (operations: unknown[], options: unknown) => Promise<unknown> };
    let driver: MockInstance<Collection['bulkWrite']>;
    let casting: MockInstance;

    const UNCASTABLE = 'user_uncastable';
    const uncastable = { userId: UNCASTABLE, achievementId: 'platform.first-win' };

    beforeEach(() => {
        // Put the real static back over the test store's, then catch the write
        // one layer down.
        vi.mocked(AchievementUnlockModel.bulkWrite).mockRestore();
        const collection = (AchievementUnlockModel as unknown as { $__collection: Collection }).$__collection;
        driver = vi.spyOn(collection, 'bulkWrite');

        // A string always casts to a string, and recordUnlocks refuses whatever
        // isn't one, so no row a caller can send is ever dropped by casting. To
        // see what happens if one were, the userId path refuses one value and
        // casts every other as it always did.
        const userId = AchievementUnlockModel.schema.path('userId') as unknown as { cast: (value: unknown, ...rest: unknown[]) => unknown };
        const cast = userId.cast;
        casting = vi.spyOn(userId, 'cast').mockImplementation(function (this: unknown, value, ...rest) {
            if (value === UNCASTABLE) {
                throw new mongoose.Error.CastError('string', value, 'userId');
            }
            return cast.call(this, value, ...rest);
        });
    });

    afterEach(() => {
        casting.mockRestore();
    });

    const rows = [
        { userId: ANN, achievementId: 'platform.first-win', gameId: 'game_1', url: 'dicecities' },
        { userId: BOB, achievementId: 'platform.first-win', gameId: 'game_1', url: 'dicecities' },
        { userId: ANN, achievementId: 'dicecities.mine-baron', gameId: 'game_1', url: 'dicecities' },
    ];

    it('hands the driver an unordered upsert on the pair that sets nothing but the rest, on insert', async () => {
        driver.mockResolvedValue({ upsertedIds: {} });

        await recordUnlocks(rows.slice(0, 1), NOW);

        const [operations, options] = driver.mock.calls[0];
        expect(options).toMatchObject({ ordered: false });
        const { updateOne } = (operations as { updateOne: { filter: object, update: Record<string, Record<string, unknown>>, upsert: boolean } }[])[0];
        expect(updateOne.filter).toEqual({ userId: ANN, achievementId: 'platform.first-win' });
        expect(updateOne.upsert).toBe(true);
        // Whatever else Mongoose adds (a version key), the update is a
        // $setOnInsert alone and does not name the filter's own fields.
        expect(Object.keys(updateOne.update)).toEqual(['$setOnInsert']);
        expect(updateOne.update.$setOnInsert).toMatchObject({ unlockedAt: NOW, gameId: 'game_1', url: 'dicecities' });
        expect(updateOne.update.$setOnInsert).not.toHaveProperty('userId');
        expect(updateOne.update.$setOnInsert).not.toHaveProperty('achievementId');
    });

    it('reads the new rows off the driver\'s answer by position in the batch', async () => {
        driver.mockResolvedValue({ upsertedIds: { 0: new ObjectId(), 2: new ObjectId() } });

        await expect(recordUnlocks(rows, NOW)).resolves.toEqual([rows[0], rows[2]]);
    });

    it('throws rather than misname the new rows when one row fails casting', async () => {
        // The driver's answer for the two rows Mongoose did send: indexes 0 and 1
        // *of those two*. Read against the batch as written, they would make the
        // bad row and the one after it "new" — and leave the real third one out.
        driver.mockResolvedValue({ upsertedIds: { 0: new ObjectId(), 1: new ObjectId() } });

        await expect(recordUnlocks([rows[0], uncastable, rows[2]], NOW)).rejects.toThrow(/validation/i);
    });

    it('passes the driver\'s lost-race error through Mongoose to be read', async () => {
        driver.mockRejectedValue(bulkWriteError({ upserted: [1], failed: [{ index: 0, code: DUPLICATE_KEY }, { index: 2, code: DUPLICATE_KEY }] }));

        await expect(recordUnlocks(rows, NOW)).resolves.toEqual([rows[1]]);
    });

    it('throws when a row failed casting beside a lost race, whose indexes count the survivors', async () => {
        // Mongoose drops the middle row and sends two, so the driver counts them
        // 0 and 1: its 0 (row 0) lost the race and its 1 (row 2) went in. Read
        // against the batch as written, that would make row 1 the new one.
        const lostRace = bulkWriteError({ upserted: [1], failed: [{ index: 0, code: DUPLICATE_KEY }] });
        driver.mockRejectedValue(lostRace);

        const thrown = await recordUnlocks([rows[0], uncastable, rows[2]], NOW).catch(err => err);

        expect(thrown).toBe(lostRace);
        // Put there by Mongoose before it rethrows, and what recordUnlocks reads.
        expect(thrown.mongoose.validationErrors).toHaveLength(1);
    });
});
