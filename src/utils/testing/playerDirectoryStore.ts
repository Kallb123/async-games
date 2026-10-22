// The shared player directory's collection (PlayerDirectoryData.ts), stood in
// for by a Map, for the tests that reach utils/users/sharedDirectory.ts: the
// directory tiers, and every route that renames or deletes a player.
//
// Opt-in, unlike the game store in apiRoute.ts: a test that renames or deletes
// a player, or looks at the tiers, calls `installPlayerDirectoryStore()`. One
// that doesn't has no `MONGODB_URI`, so the shared tier sits out
// (`sharedDirectoryAvailable`) and schedules nothing after the response, which
// is what the tests that count a route's post-response work rely on.
//
// Like the game store in apiRoute.ts it is not a Mongo. It understands exactly
// the filters and updates sharedDirectory.ts sends, with the semantics that
// matter to it (a unique `userId`, an upsert whose filter misses an existing
// row meeting the unique index), and throws on anything else, so a query the
// code starts sending that the stand-in doesn't know can't pass unnoticed.
//
// Test-only: test files import it; app code never does.

import { vi } from 'vitest';
import { PlayerDirectoryModel } from '@/utils/mongodb/PlayerDirectoryData';
import { __resetSharedDirectoryForTests } from '@/utils/users/sharedDirectory';

/** A stored row, as the collection would hold it. */
export type StoredDirectoryRow = Record<string, unknown> & { userId: string };

/** The fields a row may ever carry: anything else turning up in one fails the test that looks. */
export const DIRECTORY_ROW_FIELDS = ['userId', 'name', 'handle', 'imageUrl', 'fetchedAt', 'invalidatedAt', 'missingAt', 'expiresAt'] as const;

/** The collection's rows by player. Seed it directly; read it back to see what was stored. */
export const directoryRows = new Map<string, StoredDirectoryRow>();

/** What the stand-in does when asked: `'ok'`, `'fail'` (rejects) or `'hang'` (never answers). */
export const directoryStore = {
    reads: 'ok' as 'ok' | 'fail' | 'hang',
    writes: 'ok' as 'ok' | 'fail' | 'hang',
    /** The ids each `find` was asked for, in order. */
    queries: [] as string[][],
    /** How many `bulkWrite`s and `updateOne`s / `deleteOne`s have been sent. */
    bulkWrites: 0,
    singleWrites: 0,
};

function duplicateKey() {
    return Object.assign(new Error('E11000 duplicate key error'), { writeErrors: [{ code: 11000 }], code: 11000 });
}

function gate(mode: 'ok' | 'fail' | 'hang'): Promise<void> {
    if (mode === 'fail') return Promise.reject(new Error('the database is down'));
    if (mode === 'hang') return new Promise(() => {});
    return Promise.resolve();
}

/** Whether the guard an upsert's filter carries lets it write over `row`. */
function guardAllows(filter: Record<string, unknown>, row: StoredDirectoryRow | undefined): boolean {
    const { userId, $or, ...rest } = filter;
    if (typeof userId !== 'string' || Object.keys(rest).length > 0) throw new Error(`unsupported update filter ${JSON.stringify(filter)}`);
    if (!$or) return true;
    const branches = $or as { invalidatedAt: { $exists: false } | { $lt: Date } }[];
    const before = branches.find(branch => '$lt' in branch.invalidatedAt) as { invalidatedAt: { $lt: Date } } | undefined;
    if (branches.length !== 2 || !before) throw new Error(`unsupported guard ${JSON.stringify($or)}`);
    const invalidatedAt = row?.invalidatedAt;
    return invalidatedAt === undefined || (invalidatedAt as Date).getTime() < before.invalidatedAt.$lt.getTime();
}

function apply(row: StoredDirectoryRow, update: { $set?: Record<string, unknown>; $unset?: Record<string, unknown> }) {
    Object.assign(row, update.$set);
    for (const field of Object.keys(update.$unset ?? {})) delete row[field];
}

/**
 * Points the model at the Map above and clears it, along with the switches and
 * the shared tier's memory of a failed read. Call from `beforeEach`, after any
 * `vi.restoreAllMocks()`.
 */
export function installPlayerDirectoryStore() {
    directoryRows.clear();
    Object.assign(directoryStore, { reads: 'ok', writes: 'ok', queries: [], bulkWrites: 0, singleWrites: 0 });
    // No connection to open: the Map is the collection.
    __resetSharedDirectoryForTests(async () => undefined);

    vi.spyOn(PlayerDirectoryModel, 'find').mockImplementation(((filter: { userId: { $in: string[] } }) => {
        const query = {
            lean: () => query,
            exec: async () => {
                directoryStore.queries.push(filter.userId.$in);
                await gate(directoryStore.reads);
                return filter.userId.$in.flatMap(id => {
                    const row = directoryRows.get(id);
                    // The projection: nothing but the display fields and the age.
                    return row ? [{ userId: row.userId, name: row.name, handle: row.handle, imageUrl: row.imageUrl, fetchedAt: row.fetchedAt, missingAt: row.missingAt }] : [];
                });
            },
        };
        return query;
    }) as never);

    vi.spyOn(PlayerDirectoryModel, 'bulkWrite').mockImplementation((async (operations: Record<string, any>[]) => {
        directoryStore.bulkWrites++;
        await gate(directoryStore.writes);
        let conflict = false;
        for (const operation of operations) {
            if (operation.updateOne) {
                const { filter, update, upsert } = operation.updateOne;
                const row = directoryRows.get(filter.userId);
                if (!guardAllows(filter, row)) { conflict = true; continue; }
                if (row) apply(row, update);
                else if (upsert) { const created: StoredDirectoryRow = { userId: filter.userId }; apply(created, update); directoryRows.set(filter.userId, created); }
            } else throw new Error(`unsupported bulk operation ${JSON.stringify(operation)}`);
        }
        if (conflict) throw duplicateKey();
        return {};
    }) as never);

    vi.spyOn(PlayerDirectoryModel, 'updateOne').mockImplementation(((filter: Record<string, unknown>, update: Record<string, any>, options: { upsert?: boolean }) => ({
        exec: async () => {
            directoryStore.singleWrites++;
            await gate(directoryStore.writes);
            if (Object.keys(filter).join() !== 'userId') throw new Error(`unsupported update filter ${JSON.stringify(filter)}`);
            const row = directoryRows.get(filter.userId as string);
            if (row) apply(row, update);
            else if (options?.upsert) { const created: StoredDirectoryRow = { userId: filter.userId as string }; apply(created, update); directoryRows.set(created.userId, created); }
            return {};
        },
    })) as never);

    vi.spyOn(PlayerDirectoryModel, 'deleteOne').mockImplementation(((filter: Record<string, unknown>) => ({
        exec: async () => {
            directoryStore.singleWrites++;
            await gate(directoryStore.writes);
            if (Object.keys(filter).join() !== 'userId') throw new Error(`unsupported delete filter ${JSON.stringify(filter)}`);
            directoryRows.delete(filter.userId as string);
            return {};
        },
    })) as never);
}
