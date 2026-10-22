import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getUserList = vi.fn();
vi.mock('@clerk/nextjs/server', () => ({
    clerkClient: async () => ({ users: { getUserList } }),
}));

import { userIdListToImageMap, userIdListToUsernameList } from './clerk';
import {
    __heldDirectoryEntriesForTests, __resetDirectoryCacheForTests, DIRECTORY_MISS_TTL_MS, DIRECTORY_TTL_MS, forgetCachedUser,
} from './directoryCache';
import {
    __resetSharedDirectoryForTests, SHARED_BACKOFF_MS, SHARED_KNOWN_MISSING_MS, SHARED_DIRECTORY_MAX_AGE_MS, SHARED_DIRECTORY_RETENTION_MS, SHARED_READ_BUDGET_MS,
} from './sharedDirectory';
import { ServerTiming } from '@/utils/api/serverTiming';
import { DIRECTORY_ROW_FIELDS, directoryRows, directoryStore, installPlayerDirectoryStore } from '@/utils/testing/playerDirectoryStore';

// The directory's tiers together — memory, then the database every instance
// shares, then Clerk — with the database stood in for by a Map
// (utils/testing/playerDirectoryStore.ts). "A cold instance" below is
// `__resetDirectoryCacheForTests()`: another process with nothing in memory.

let clerkUsers: Record<string, unknown>[] = [];
const person = (id: string, displayName: string, username: string | null, extra: Record<string, unknown> = {}) =>
    ({ id, username, publicMetadata: { displayName }, ...extra });

/** The ids each `getUserList` call asked for, in order. */
const askedFor = () => getUserList.mock.calls.map(([{ userId }]) => userId as string[]);

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

/** A row as the shared directory would hold one that Clerk answered for `age` ms ago. */
function seed(id: string, name: string, age: number, handle: string | null = null) {
    const fetchedAt = new Date(Date.now() - age);
    directoryRows.set(id, {
        userId: id, name, handle, imageUrl: null, fetchedAt,
        expiresAt: new Date(fetchedAt.getTime() + SHARED_DIRECTORY_RETENTION_MS),
    });
}

const coldInstance = () => __resetDirectoryCacheForTests();

beforeEach(() => {
    vi.useFakeTimers();
    __resetDirectoryCacheForTests();
    installPlayerDirectoryStore();
    clerkUsers = [];
    getUserList.mockReset();
    getUserList.mockImplementation(async ({ userId }: { userId: string[] }) => ({
        data: clerkUsers.filter(user => userId.includes(user.id as string)),
    }));
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe('the shared directory behind memory', () => {
    it('stores what Clerk answered, once the lookup has been answered', async () => {
        clerkUsers = [person('user_1', 'Ann', 'ann', { hasImage: true, imageUrl: 'https://img/ann.png' })];

        expect(await userIdListToUsernameList(['user_1'])).toEqual(['Ann']);

        await vi.waitFor(() => expect(directoryRows.get('user_1')).toMatchObject({
            userId: 'user_1', name: 'Ann', handle: 'ann', imageUrl: 'https://img/ann.png',
        }));
        const row = directoryRows.get('user_1')!;
        // Reaped by the TTL index a retention after Clerk last said so.
        expect((row.expiresAt as Date).getTime() - (row.fetchedAt as Date).getTime()).toBe(SHARED_DIRECTORY_RETENTION_MS);
        // One bulkWrite for the whole lookup, not a write a player.
        expect(directoryStore.bulkWrites).toBe(1);
    });

    it('answers a cold instance from the database without asking Clerk, and fills memory', async () => {
        seed('user_1', 'Ann', 2 * MINUTE, 'ann');
        seed('user_2', 'Bob', 1 * MINUTE, 'bob');

        expect(await userIdListToUsernameList(['user_1', 'user_2'])).toEqual(['Ann', 'Bob']);
        expect(getUserList).not.toHaveBeenCalled();
        // One query for every id memory couldn't answer, not one a player.
        expect(directoryStore.queries).toEqual([['user_1', 'user_2']]);

        // Held now: the same instance doesn't ask the database again.
        expect(await userIdListToUsernameList(['user_2', 'user_1'])).toEqual(['Bob', 'Ann']);
        expect(directoryStore.queries).toHaveLength(1);
        expect(__heldDirectoryEntriesForTests().map(([id]) => id).sort()).toEqual(['user_1', 'user_2']);
    });

    it('gives a record from the database the age Clerk gave it, not a fresh five minutes', async () => {
        seed('user_1', 'Ann', 4 * MINUTE, 'ann');
        await userIdListToUsernameList(['user_1']);

        // Believed for one more minute...
        await vi.advanceTimersByTimeAsync(MINUTE - 1000);
        await userIdListToUsernameList(['user_1']);
        expect(getUserList).not.toHaveBeenCalled();

        // ...and then served stale from memory, refreshed from Clerk after.
        clerkUsers = [person('user_1', 'Annie', 'ann')];
        await vi.advanceTimersByTimeAsync(2000);
        expect(await userIdListToUsernameList(['user_1'])).toEqual(['Ann']);
        await vi.waitFor(() => expect(directoryRows.get('user_1')?.name).toBe('Annie'));
        expect(askedFor()).toEqual([['user_1']]);
    });

    it('asks the database only for what memory cannot answer', async () => {
        seed('user_1', 'Ann', MINUTE, 'ann');
        seed('user_2', 'Bob', MINUTE, 'bob');
        seed('user_3', 'Cy', MINUTE, 'cy');
        await userIdListToUsernameList(['user_1']);
        directoryStore.queries.length = 0;

        await userIdListToUsernameList(['user_1', 'user_2', 'user_3']);

        expect(directoryStore.queries).toEqual([['user_2', 'user_3']]);
    });

    it('does not ask the database for a name memory can still serve stale', async () => {
        clerkUsers = [person('user_1', 'Ann', 'ann')];
        await userIdListToUsernameList(['user_1']);
        await vi.advanceTimersByTimeAsync(DIRECTORY_TTL_MS + 1000);
        directoryStore.queries.length = 0;

        // Served from memory at once; refreshed from Clerk after the answer.
        expect(await userIdListToUsernameList(['user_1'])).toEqual(['Ann']);
        expect(directoryStore.queries).toEqual([]);
        await vi.waitFor(() => expect(getUserList).toHaveBeenCalledTimes(2));
    });

    it('serves a record past its five minutes at once, and refreshes it after the answer', async () => {
        seed('user_1', 'Ann', 6 * MINUTE, 'ann');
        clerkUsers = [person('user_1', 'Annie', 'ann')];

        expect(await userIdListToUsernameList(['user_1'])).toEqual(['Ann']);
        // The refresh is behind the answer: Clerk is asked once, and the row
        // and memory both have the new name for the next request.
        await vi.waitFor(() => expect(directoryRows.get('user_1')?.name).toBe('Annie'));
        expect(askedFor()).toEqual([['user_1']]);
        expect(await userIdListToUsernameList(['user_1'])).toEqual(['Annie']);
        expect(getUserList).toHaveBeenCalledTimes(1);
    });

    it('waits on Clerk for a record past the shared maximum age', async () => {
        seed('user_1', 'Ann', SHARED_DIRECTORY_MAX_AGE_MS + 1000, 'ann');
        seed('user_2', 'Bob', SHARED_DIRECTORY_MAX_AGE_MS - DAY, 'bob');
        clerkUsers = [person('user_1', 'Annie', 'ann')];

        // The old one is waited on; the six-day-old one is served, and rides
        // along in the same call to be refreshed.
        expect(await userIdListToUsernameList(['user_1', 'user_2'])).toEqual(['Annie', 'Bob']);
        expect(askedFor()).toEqual([['user_1', 'user_2']]);
    });

    it('makes one Clerk call for everything the database could not answer, stale ones included', async () => {
        seed('user_1', 'Ann', MINUTE, 'ann');
        seed('user_2', 'Bob', 10 * MINUTE, 'bob');
        clerkUsers = [person('user_2', 'Bobby', 'bob'), person('user_3', 'Cy', 'cy'), person('user_4', 'Di', 'di')];

        expect(await userIdListToUsernameList(['user_1', 'user_2', 'user_3', 'user_4'])).toEqual(['Ann', 'Bobby', 'Cy', 'Di']);

        expect(askedFor()).toEqual([['user_3', 'user_4', 'user_2']]);
    });

    it('treats an invalidated row as a miss', async () => {
        seed('user_1', 'Ann', MINUTE, 'ann');
        await forgetCachedUser('user_1');
        coldInstance();
        clerkUsers = [person('user_1', 'Anne', 'ann')];

        expect(await userIdListToUsernameList(['user_1'])).toEqual(['Anne']);
        expect(askedFor()).toEqual([['user_1']]);
    });

    it('serves the display fields it holds for a picture too', async () => {
        directoryRows.set('user_1', {
            userId: 'user_1', name: 'Ann', handle: 'ann', imageUrl: 'https://img/ann.png',
            fetchedAt: new Date(), expiresAt: new Date(Date.now() + DAY),
        });

        expect([...await userIdListToImageMap(['user_1'])]).toEqual([['user_1', 'https://img/ann.png']]);
        expect(getUserList).not.toHaveBeenCalled();
    });

    it('replaces the copy of an account Clerk no longer knows with a marker that holds no display field', async () => {
        seed('user_gone', 'Ghost', SHARED_DIRECTORY_MAX_AGE_MS + 1000);
        seed('user_1', 'Ann', MINUTE, 'ann');
        clerkUsers = [person('user_1', 'Ann', 'ann')];

        expect(await userIdListToUsernameList(['user_1', 'user_gone'])).toEqual(['Ann', 'Unknown player']);

        await vi.waitFor(() => expect(directoryRows.get('user_gone')?.missingAt).toBeInstanceOf(Date));
        const marker = directoryRows.get('user_gone')!;
        expect(Object.keys(marker).sort()).toEqual(['expiresAt', 'missingAt', 'userId']);
        expect((marker.expiresAt as Date).getTime() - (marker.missingAt as Date).getTime()).toBe(SHARED_KNOWN_MISSING_MS);
        expect(directoryRows.get('user_1')?.name).toBe('Ann');
    });

    it('marks a stale account whose refresh finds it gone', async () => {
        seed('user_gone', 'Ghost', 6 * MINUTE);

        expect(await userIdListToUsernameList(['user_gone'])).toEqual(['Ghost']);

        await vi.waitFor(() => expect(directoryRows.get('user_gone')?.missingAt).toBeInstanceOf(Date));
        expect(directoryRows.get('user_gone')?.name).toBeUndefined();
    });
});

describe('an account Clerk has no user for', () => {
    const mark = (id: string, age: number) => {
        const missingAt = new Date(Date.now() - age);
        directoryRows.set(id, { userId: id, missingAt, expiresAt: new Date(missingAt.getTime() + SHARED_KNOWN_MISSING_MS) });
    };

    it('is answered from its marker on a cold instance without asking Clerk, as Clerk would answer', async () => {
        mark('user_gone', 3 * 60 * MINUTE);
        seed('user_1', 'Ann', MINUTE, 'ann');

        expect(await userIdListToUsernameList(['user_1', 'user_gone'])).toEqual(['Ann', 'Unknown player']);

        expect(getUserList).not.toHaveBeenCalled();
        expect(directoryStore.queries).toEqual([['user_1', 'user_gone']]);
    });

    it('is held in memory only as the short miss, so the marker is read again after it', async () => {
        mark('user_gone', MINUTE);
        await userIdListToUsernameList(['user_gone']);
        await userIdListToUsernameList(['user_gone']);
        expect(directoryStore.queries).toHaveLength(1);

        await vi.advanceTimersByTimeAsync(DIRECTORY_MISS_TTL_MS + 1000);
        expect(await userIdListToUsernameList(['user_gone'])).toEqual(['Unknown player']);

        expect(directoryStore.queries).toHaveLength(2);
        expect(getUserList).not.toHaveBeenCalled();
    });

    it('asks Clerk again once its marker is older than a day', async () => {
        mark('user_gone', SHARED_KNOWN_MISSING_MS + 1000);
        clerkUsers = [person('user_gone', 'Back', 'back')];

        expect(await userIdListToUsernameList(['user_gone'])).toEqual(['Back']);

        expect(askedFor()).toEqual([['user_gone']]);
        await vi.waitFor(() => expect(directoryRows.get('user_gone')).toMatchObject({ name: 'Back' }));
        expect(directoryRows.get('user_gone')?.missingAt).toBeUndefined();
    });

    it('is resolvable again straight away once a claim clears its marker', async () => {
        mark('user_guest', MINUTE);
        await forgetCachedUser('user_guest');
        coldInstance();
        clerkUsers = [person('user_guest', 'Dave', 'dave')];

        expect(await userIdListToUsernameList(['user_guest'])).toEqual(['Dave']);

        expect(askedFor()).toEqual([['user_guest']]);
        expect(directoryRows.get('user_guest')?.missingAt).toBeUndefined();
    });

    it('is not marked by an answer from a lookup that began before the claim', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        let answer!: () => void;
        getUserList.mockImplementationOnce(() => new Promise(resolve => { answer = () => resolve({ data: [] }); }));
        const inFlight = userIdListToUsernameList(['user_guest']);
        await vi.waitFor(() => expect(getUserList).toHaveBeenCalled());
        await vi.advanceTimersByTimeAsync(5000);
        await forgetCachedUser('user_guest');
        await vi.advanceTimersByTimeAsync(5000);
        answer();
        await inFlight;
        await vi.waitFor(() => expect(directoryStore.bulkWrites).toBe(1));

        expect(directoryRows.get('user_guest')?.missingAt).toBeUndefined();
    });

    it('is counted with the ids the shared store answered', async () => {
        mark('user_gone', MINUTE);
        seed('user_1', 'Ann', MINUTE, 'ann');
        const timing = new ServerTiming();

        await timing.time('response', () => userIdListToUsernameList(['user_1', 'user_gone']));

        expect(timing.header()).toContain('names_cache;desc="hit=0 miss=0 stale=0 shared=2"');
    });
});

describe('what the shared directory stores', () => {
    it('is display fields only, never the Clerk user behind them', async () => {
        clerkUsers = [person('user_1', 'Ann', 'ann', {
            hasImage: true,
            imageUrl: 'https://img/ann.png',
            firstName: 'Annabel',
            lastName: 'Real-Surname',
            emailAddresses: [{ emailAddress: 'ann@example.com' }],
            privateMetadata: { fcmTokens: ['secret-device-token'], googleId: 'g-123' },
            unsafeMetadata: { note: 'private' },
        })];
        clerkUsers[0].publicMetadata = { displayName: 'Ann', unlocked: true, admin: true };

        await userIdListToUsernameList(['user_1']);
        await vi.waitFor(() => expect(directoryRows.has('user_1')).toBe(true));

        const row = directoryRows.get('user_1')!;
        expect(Object.keys(row).sort()).toEqual(['expiresAt', 'fetchedAt', 'handle', 'imageUrl', 'name', 'userId']);
        expect(row).toMatchObject({ userId: 'user_1', name: 'Ann', handle: 'ann', imageUrl: 'https://img/ann.png' });
        const everything = JSON.stringify([...directoryRows.values()]);
        for (const secret of ['secret-device-token', 'g-123', 'ann@example.com', 'Real-Surname', 'Annabel', 'private', 'unlocked', 'admin']) {
            expect(everything).not.toContain(secret);
        }
    });

    it('is, after a rename, only the marker, and the marker holds no display field', async () => {
        clerkUsers = [person('user_1', 'Ann', 'ann')];
        await userIdListToUsernameList(['user_1']);
        await vi.waitFor(() => expect(directoryRows.has('user_1')).toBe(true));

        await forgetCachedUser('user_1');

        const row = directoryRows.get('user_1')!;
        expect(Object.keys(row).sort()).toEqual(['expiresAt', 'invalidatedAt', 'userId']);
        for (const row of directoryRows.values()) {
            expect(Object.keys(row).every(field => (DIRECTORY_ROW_FIELDS as readonly string[]).includes(field))).toBe(true);
        }
    });

    it('is nothing at all for a deleted account', async () => {
        clerkUsers = [person('user_1', 'Ann', 'ann')];
        await userIdListToUsernameList(['user_1']);
        await vi.waitFor(() => expect(directoryRows.has('user_1')).toBe(true));

        await forgetCachedUser('user_1', 'deleted');

        expect(directoryRows.has('user_1')).toBe(false);
        // A cold instance now has nothing to serve for them, and asks Clerk.
        coldInstance();
        await userIdListToUsernameList(['user_1']);
        expect(getUserList).toHaveBeenCalledTimes(2);
    });

    it('leaves a player who stops being looked up to the TTL index', async () => {
        clerkUsers = [person('user_1', 'Ann', 'ann')];
        await userIdListToUsernameList(['user_1']);
        await vi.waitFor(() => expect(directoryRows.has('user_1')).toBe(true));

        // The index reaps a row at its `expiresAt`; the retention is longer
        // than any age a row is served at, so a row that is gone was unused.
        expect(SHARED_DIRECTORY_RETENTION_MS).toBeGreaterThan(SHARED_DIRECTORY_MAX_AGE_MS);
        expect((directoryRows.get('user_1')!.expiresAt as Date).getTime()).toBeGreaterThan(Date.now() + SHARED_DIRECTORY_MAX_AGE_MS);
    });
});

describe('changing a player', () => {
    it('shows a rename on a cold instance at once', async () => {
        clerkUsers = [person('user_1', 'Ann', 'ann')];
        await userIdListToUsernameList(['user_1']);
        await vi.waitFor(() => expect(directoryRows.get('user_1')?.name).toBe('Ann'));

        clerkUsers = [person('user_1', 'Anne', 'ann')];
        await forgetCachedUser('user_1');
        coldInstance();

        expect(await userIdListToUsernameList(['user_1'])).toEqual(['Anne']);
    });

    it('stores the new name from a lookup that began after the change', async () => {
        clerkUsers = [person('user_1', 'Ann', 'ann')];
        await userIdListToUsernameList(['user_1']);
        await vi.waitFor(() => expect(directoryRows.get('user_1')?.name).toBe('Ann'));

        clerkUsers = [person('user_1', 'Anne', 'ann')];
        await forgetCachedUser('user_1');
        await vi.advanceTimersByTimeAsync(5000);
        await userIdListToUsernameList(['user_1']);

        await vi.waitFor(() => expect(directoryRows.get('user_1')?.name).toBe('Anne'));
        expect(directoryRows.get('user_1')?.invalidatedAt).toBeInstanceOf(Date);
    });

    it('does not write back an answer from a lookup that began before the change', async () => {
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
        // Clerk answers this lookup from before the rename, but only after it.
        let answer!: () => void;
        getUserList.mockImplementationOnce(() => new Promise(resolve => {
            answer = () => resolve({ data: [person('user_1', 'Ann', 'ann')] });
        }));
        const inFlight = userIdListToUsernameList(['user_1']);
        await vi.waitFor(() => expect(getUserList).toHaveBeenCalled());

        await vi.advanceTimersByTimeAsync(5000);
        await forgetCachedUser('user_1');
        await vi.advanceTimersByTimeAsync(5000);
        answer();
        expect(await inFlight).toEqual(['Ann']);
        await vi.waitFor(() => expect(directoryStore.bulkWrites).toBe(1));

        // The stale answer found the marker and was refused: no name stored,
        // and the refusal is the guard working, not an error to log.
        expect(directoryRows.get('user_1')?.name).toBeUndefined();
        expect(errors).not.toHaveBeenCalled();

        // And the next lookup, on any instance, asks Clerk for the new name.
        clerkUsers = [person('user_1', 'Anne', 'ann')];
        coldInstance();
        expect(await userIdListToUsernameList(['user_1'])).toEqual(['Anne']);
    });

    it('does not write back an answer that began within clock skew of the change', async () => {
        clerkUsers = [person('user_1', 'Anne', 'ann')];
        await forgetCachedUser('user_1');
        await userIdListToUsernameList(['user_1']);
        await vi.waitFor(() => expect(directoryStore.bulkWrites).toBe(1));

        expect(directoryRows.get('user_1')?.name).toBeUndefined();
    });

    it('lets the marker stand for a player nobody had a row for', async () => {
        await forgetCachedUser('user_new');

        expect(directoryRows.get('user_new')).toMatchObject({ userId: 'user_new', invalidatedAt: expect.any(Date) });
        expect(directoryRows.get('user_new')?.name).toBeUndefined();
    });

    it('retries an invalidation that lost a race to create the row', async () => {
        const { PlayerDirectoryModel } = await import('@/utils/mongodb/PlayerDirectoryData');
        const exec = vi.fn()
            .mockRejectedValueOnce(Object.assign(new Error('E11000'), { code: 11000 }))
            .mockResolvedValueOnce({});
        vi.spyOn(PlayerDirectoryModel, 'updateOne').mockReturnValue({ exec } as never);

        await forgetCachedUser('user_1');

        expect(exec).toHaveBeenCalledTimes(2);
    });

    it('still removes a deleted account from memory when the database cannot be reached', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        clerkUsers = [person('user_1', 'Ann', 'ann')];
        await userIdListToUsernameList(['user_1']);
        directoryStore.writes = 'fail';

        await expect(forgetCachedUser('user_1', 'deleted')).resolves.toBeUndefined();

        expect(__heldDirectoryEntriesForTests()).toEqual([]);
    });
});

describe('in a process with no database', () => {
    it('sits out: nothing is read, written or scheduled, and nothing is logged', async () => {
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.stubEnv('MONGODB_URI', '');
        __resetSharedDirectoryForTests();
        clerkUsers = [person('user_1', 'Ann', 'ann')];

        expect(await userIdListToUsernameList(['user_1'])).toEqual(['Ann']);
        await forgetCachedUser('user_1');
        await forgetCachedUser('user_1', 'deleted');

        expect(directoryStore.queries).toEqual([]);
        expect(directoryStore.bulkWrites + directoryStore.singleWrites).toBe(0);
        expect(errors).not.toHaveBeenCalled();
        vi.unstubAllEnvs();
    });
});

describe('when the database does not answer', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    it('asks Clerk when a read fails', async () => {
        seed('user_1', 'Ann', MINUTE, 'ann');
        directoryStore.reads = 'fail';
        clerkUsers = [person('user_1', 'Anne', 'ann')];

        expect(await userIdListToUsernameList(['user_1'])).toEqual(['Anne']);
        expect(askedFor()).toEqual([['user_1']]);
    });

    it('asks Clerk when a read is slower than its budget, and does not wait longer than it', async () => {
        seed('user_1', 'Ann', MINUTE, 'ann');
        directoryStore.reads = 'hang';
        clerkUsers = [person('user_1', 'Anne', 'ann')];

        let answered = false;
        const lookup = userIdListToUsernameList(['user_1']).then(names => { answered = true; return names; });
        await vi.advanceTimersByTimeAsync(SHARED_READ_BUDGET_MS - 1);
        expect(answered).toBe(false);
        await vi.advanceTimersByTimeAsync(2);

        expect(await lookup).toEqual(['Anne']);
    });

    it('stops asking for a while after one read failed, then tries again', async () => {
        directoryStore.reads = 'fail';
        clerkUsers = [person('user_1', 'Ann', 'ann'), person('user_2', 'Bob', 'bob')];
        await userIdListToUsernameList(['user_1']);
        await userIdListToUsernameList(['user_2']);
        expect(directoryStore.queries).toHaveLength(1);

        directoryStore.reads = 'ok';
        await vi.advanceTimersByTimeAsync(SHARED_BACKOFF_MS + 1);
        coldInstance();
        await userIdListToUsernameList(['user_1']);
        expect(directoryStore.queries).toHaveLength(2);
    });

    it('answers a lookup whose write fails, and logs the failure', async () => {
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
        directoryStore.writes = 'fail';
        clerkUsers = [person('user_1', 'Ann', 'ann')];

        expect(await userIdListToUsernameList(['user_1'])).toEqual(['Ann']);

        await vi.waitFor(() => expect(errors).toHaveBeenCalledWith('Shared name write failed', expect.any(Error)));
        // Still held in memory for the next request.
        expect(await userIdListToUsernameList(['user_1'])).toEqual(['Ann']);
        expect(getUserList).toHaveBeenCalledTimes(1);
    });

    it('does not let a rename fail because the marker could not be written', async () => {
        directoryStore.writes = 'fail';

        await expect(forgetCachedUser('user_1')).resolves.toBeUndefined();
    });

    it('does not let a rename wait on a database that never answers', async () => {
        directoryStore.writes = 'hang';

        const forgotten = forgetCachedUser('user_1');
        await vi.advanceTimersByTimeAsync(5001);

        await expect(forgotten).resolves.toBeUndefined();
    });
});

describe('reporting to the request', () => {
    it('counts what the database served, and times the read inside the names span', async () => {
        seed('user_1', 'Ann', MINUTE, 'ann');
        seed('user_2', 'Bob', 6 * MINUTE, 'bob');
        clerkUsers = [person('user_2', 'Bob', 'bob'), person('user_3', 'Cy', 'cy')];
        const timing = new ServerTiming();

        await timing.time('response', () => userIdListToUsernameList(['user_1', 'user_2', 'user_3']));

        const header = timing.header();
        expect(header).toMatch(/names;dur=[0-9.]+/);
        expect(header).toMatch(/names_store;dur=[0-9.]+/);
        // user_1 and user_2 from the database (user_2 stale, so refreshed),
        // user_3 from Clerk.
        expect(header).toContain('names_cache;desc="hit=0 miss=1 stale=1 shared=2"');
        expect(header).not.toMatch(/user_|Ann|Bob|Cy/);
    });

    it('times no database read when memory answered everything', async () => {
        clerkUsers = [person('user_1', 'Ann', 'ann')];
        await userIdListToUsernameList(['user_1']);
        const timing = new ServerTiming();

        await timing.time('response', () => userIdListToUsernameList(['user_1']));

        expect(timing.header()).not.toContain('names_store');
        expect(timing.header()).toContain('names_cache;desc="hit=1 miss=0 stale=0 shared=0"');
    });
});
