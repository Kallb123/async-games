import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getUserList = vi.fn();
vi.mock('@clerk/nextjs/server', () => ({
    clerkClient: async () => ({ users: { getUserList } }),
}));

// This file is the memory tier on its own: the shared tier behind it is
// stood in for by one that never holds anything, so what it pins is what memory
// does when nothing else can answer. sharedDirectory.test.ts is the tiers
// together.
vi.mock('./sharedDirectory', () => ({
    sharedDirectoryAvailable: () => false,
    readSharedUsers: async () => ({ found: new Map(), missing: new Set() }),
    writeSharedUsers: async () => undefined,
    forgetSharedUser: async () => undefined,
}));

import {
    buildUserDirectory, userIdListToImageMap, userIdListToNamesAndMap, userIdListToUntaggedNameList,
    userIdListToUsernameList, usersById,
} from './clerk';
import {
    __heldDirectoryEntriesForTests, __resetDirectoryCacheForTests, DIRECTORY_MAX_ENTRIES,
    DIRECTORY_MAX_AGE_MS, DIRECTORY_MISS_TTL_MS, DIRECTORY_TTL_MS, forgetCachedUser,
} from './directoryCache';
import { ServerTiming } from '@/utils/api/serverTiming';

// Clerk's users as the real thing answers a filter: the ones asked for that exist.
let clerkUsers: Record<string, unknown>[] = [];
const person = (id: string, displayName: string, username: string | null, extra: Record<string, unknown> = {}) =>
    ({ id, username, publicMetadata: { displayName }, ...extra });

/** The ids each `getUserList` call asked for, in order. */
const askedFor = () => getUserList.mock.calls.map(([{ userId }]) => userId as string[]);

beforeEach(() => {
    vi.useFakeTimers();
    __resetDirectoryCacheForTests();
    clerkUsers = [];
    getUserList.mockReset();
    getUserList.mockImplementation(async ({ userId }: { userId: string[] }) => ({
        data: clerkUsers.filter(user => userId.includes(user.id as string)),
    }));
});

afterEach(() => {
    vi.useRealTimers();
});

describe('the player directory cache', () => {
    it('answers a repeat lookup without asking Clerk again', async () => {
        clerkUsers = [person('user_1', 'Ann', 'ann')];

        expect(await userIdListToUsernameList(['user_1'])).toEqual(['Ann']);
        expect(await userIdListToUsernameList(['user_1'])).toEqual(['Ann']);

        expect(getUserList).toHaveBeenCalledTimes(1);
    });

    it('fetches only the ids it does not hold, in one call', async () => {
        clerkUsers = [person('user_1', 'Ann', 'ann'), person('user_2', 'Bob', 'bob'), person('user_3', 'Cy', 'cy')];
        await userIdListToUsernameList(['user_1']);

        expect(await userIdListToUsernameList(['user_1', 'user_2', 'user_3'])).toEqual(['Ann', 'Bob', 'Cy']);

        expect(askedFor()).toEqual([['user_1'], ['user_2', 'user_3']]);
    });

    it('makes no Clerk call at all when everything is held', async () => {
        clerkUsers = [person('user_1', 'Ann', 'ann'), person('user_2', 'Bob', 'bob')];
        await userIdListToUsernameList(['user_1', 'user_2']);
        getUserList.mockClear();

        const directory = await buildUserDirectory(['user_2', 'user_1']);

        expect(getUserList).not.toHaveBeenCalled();
        expect(directory.name('user_1')).toBe('Ann');
        expect(directory.name('user_2')).toBe('Bob');
    });

    it('serves every resolver from the same entries', async () => {
        clerkUsers = [person('user_1', 'Ann', 'ann', { hasImage: true, imageUrl: 'https://img/ann.png' })];
        const directory = await buildUserDirectory(['user_1']);
        getUserList.mockClear();

        expect(directory.imageUrl('user_1')).toBe('https://img/ann.png');
        expect(await userIdListToNamesAndMap(['user_1'])).toEqual({
            usernameList: ['Ann'],
            userIdNameMap: { user_1: 'Ann' },
        });
        expect([...await userIdListToImageMap(['user_1'])]).toEqual([['user_1', 'https://img/ann.png']]);
        expect(getUserList).not.toHaveBeenCalled();
    });

    it('believes an entry for five minutes, then serves it while it is refreshed behind the answer', async () => {
        clerkUsers = [person('user_1', 'Ann', 'ann')];
        await userIdListToUsernameList(['user_1']);

        vi.advanceTimersByTime(DIRECTORY_TTL_MS - 1);
        await userIdListToUsernameList(['user_1']);
        expect(getUserList).toHaveBeenCalledTimes(1);

        clerkUsers = [person('user_1', 'Annie', 'ann')];
        vi.advanceTimersByTime(2);
        // Answered from memory, without waiting on Clerk...
        expect(await userIdListToUsernameList(['user_1'])).toEqual(['Ann']);
        // ...which is asked once, behind it, and the next lookup has the new name.
        await vi.waitFor(() => expect(getUserList).toHaveBeenCalledTimes(2));
        await vi.waitFor(async () => expect(await userIdListToUsernameList(['user_1'])).toEqual(['Annie']));
        expect(getUserList).toHaveBeenCalledTimes(2);
    });

    it('refreshes a stale entry once however many lookups land while it is out', async () => {
        clerkUsers = [person('user_1', 'Ann', 'ann')];
        await userIdListToUsernameList(['user_1']);
        vi.advanceTimersByTime(DIRECTORY_TTL_MS + 1);
        let answer!: () => void;
        getUserList.mockImplementation(({ userId }: { userId: string[] }) => new Promise(resolve => {
            answer = () => resolve({ data: clerkUsers.filter(user => userId.includes(user.id as string)) });
        }));

        await userIdListToUsernameList(['user_1']);
        await userIdListToUsernameList(['user_1']);
        expect(getUserList).toHaveBeenCalledTimes(2);
        answer();
    });

    it('leaves a stale id a waited lookup took along to that lookup', async () => {
        clerkUsers = [person('user_1', 'Ann', 'ann'), person('user_2', 'Bob', 'bob')];
        await userIdListToUsernameList(['user_1']);
        vi.advanceTimersByTime(DIRECTORY_TTL_MS + 1);
        const answers: (() => void)[] = [];
        getUserList.mockImplementation(({ userId }: { userId: string[] }) => new Promise(resolve => {
            answers.push(() => resolve({ data: clerkUsers.filter(user => userId.includes(user.id as string)) }));
        }));

        const waited = userIdListToUsernameList(['user_1', 'user_2']);
        // Once that lookup is out (it reads the shared tier first), with the
        // stale id along in it, a request landing meanwhile leaves the id to it.
        await vi.waitFor(() => expect(getUserList).toHaveBeenCalledTimes(2));
        await userIdListToUsernameList(['user_1']);
        expect(askedFor().slice(1)).toEqual([['user_2', 'user_1']]);
        answers.forEach(answer => answer());
        await waited;
    });

    it('lets a refresh Clerk never answered go after ten seconds, so the id is refreshed again', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        clerkUsers = [person('user_1', 'Ann', 'ann')];
        await userIdListToUsernameList(['user_1']);
        vi.advanceTimersByTime(DIRECTORY_TTL_MS + 1);
        getUserList.mockImplementation(() => new Promise(() => {}));

        await userIdListToUsernameList(['user_1']);
        await userIdListToUsernameList(['user_1']);
        expect(getUserList).toHaveBeenCalledTimes(2);

        await vi.advanceTimersByTimeAsync(10_001);
        await userIdListToUsernameList(['user_1']);
        expect(getUserList).toHaveBeenCalledTimes(3);
        // The refresh mark is the server's, not the cache's, so it outlives the
        // cache reset: let this one run out before the next test.
        await vi.advanceTimersByTimeAsync(10_001);
        vi.restoreAllMocks();
    });

    it('waits on Clerk again once an entry is past its fifteen minutes', async () => {
        clerkUsers = [person('user_1', 'Ann', 'ann')];
        await userIdListToUsernameList(['user_1']);
        clerkUsers = [person('user_1', 'Annie', 'ann')];

        vi.advanceTimersByTime(DIRECTORY_MAX_AGE_MS + 1);
        expect(await userIdListToUsernameList(['user_1'])).toEqual(['Annie']);
    });

    it('brings a stale entry along in a lookup that has to wait anyway', async () => {
        clerkUsers = [person('user_1', 'Ann', 'ann'), person('user_2', 'Bob', 'bob')];
        await userIdListToUsernameList(['user_1']);
        vi.advanceTimersByTime(DIRECTORY_TTL_MS + 1);
        clerkUsers = [person('user_1', 'Annie', 'ann'), person('user_2', 'Bob', 'bob')];

        expect(await userIdListToUsernameList(['user_1', 'user_2'])).toEqual(['Annie', 'Bob']);
        expect(askedFor()[1]).toEqual(['user_2', 'user_1']);
        expect(getUserList).toHaveBeenCalledTimes(2);
    });

    it('stays inside its entry limit, dropping the least recently used first', async () => {
        const ids = Array.from({ length: DIRECTORY_MAX_ENTRIES }, (_, i) => `user_${i}`);
        clerkUsers = [...ids, 'user_new', 'user_newer'].map(id => person(id, id, id));
        await userIdListToUsernameList(ids);
        expect(__heldDirectoryEntriesForTests()).toHaveLength(DIRECTORY_MAX_ENTRIES);

        // Using the oldest one makes it the youngest, so the next oldest goes.
        await userIdListToUsernameList(['user_0']);
        await userIdListToUsernameList(['user_new']);
        await userIdListToUsernameList(['user_newer']);

        const held = __heldDirectoryEntriesForTests().map(([id]) => id);
        expect(held).toHaveLength(DIRECTORY_MAX_ENTRIES);
        expect(held).toContain('user_0');
        expect(held).toContain('user_new');
        expect(held).toContain('user_newer');
        expect(held).not.toContain('user_1');
        expect(held).not.toContain('user_2');
        expect(held).toContain('user_3');
    });

    it('remembers an id Clerk does not know, but only briefly', async () => {
        clerkUsers = [person('user_1', 'Ann', 'ann')];

        expect(await userIdListToUsernameList(['user_1', 'user_gone'])).toEqual(['Ann', 'Unknown player']);
        expect(await userIdListToUsernameList(['user_1', 'user_gone'])).toEqual(['Ann', 'Unknown player']);
        expect(getUserList).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(DIRECTORY_MISS_TTL_MS + 1);
        await userIdListToUsernameList(['user_1', 'user_gone']);
        expect(askedFor()[1]).toEqual(['user_gone']);
    });

    it('holds display fields only, never the Clerk user behind them', async () => {
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

        const held = __heldDirectoryEntriesForTests();
        expect(held).toEqual([['user_1', { id: 'user_1', name: 'Ann', handle: 'ann', imageUrl: 'https://img/ann.png' }]]);
        const everything = JSON.stringify(held);
        for (const secret of ['secret-device-token', 'g-123', 'ann@example.com', 'Real-Surname', 'Annabel', 'private', 'unlocked', 'admin']) {
            expect(everything).not.toContain(secret);
        }
    });

    it('drops a player when told they changed, so a rename shows at once', async () => {
        clerkUsers = [person('user_1', 'Ann', 'ann')];
        await userIdListToUsernameList(['user_1']);

        clerkUsers = [person('user_1', 'Anne', 'ann')];
        await forgetCachedUser('user_1');

        expect(await userIdListToUsernameList(['user_1'])).toEqual(['Anne']);
    });

    it('does not keep an answer from a lookup that was already in flight when the player changed', async () => {
        // Clerk answers this lookup from before the rename, but only after it.
        let answer!: () => void;
        getUserList.mockImplementationOnce(() => new Promise(resolve => {
            answer = () => resolve({ data: [person('user_1', 'Ann', 'ann')] });
        }));
        const inFlight = userIdListToUsernameList(['user_1']);
        await vi.waitFor(() => expect(getUserList).toHaveBeenCalled());

        clerkUsers = [person('user_1', 'Anne', 'ann')];
        await forgetCachedUser('user_1');
        answer();

        expect(await inFlight).toEqual(['Ann']);
        expect(await userIdListToUsernameList(['user_1'])).toEqual(['Anne']);
    });

    it('still tells two players of one name apart when one is held and one is fresh', async () => {
        clerkUsers = [person('user_1', 'Dave', 'dave'), person('user_2', 'Dave', 'daveb'), person('user_3', 'Alice', 'alice')];
        // Alone, neither Dave is ambiguous, so nothing is tagged yet...
        expect(await userIdListToUsernameList(['user_1'])).toEqual(['Dave']);

        // ...and together they are, though only one of them came from Clerk.
        expect(await userIdListToUsernameList(['user_1', 'user_2', 'user_3']))
            .toEqual(['Dave (@dave)', 'Dave (@daveb)', 'Alice']);
        expect(askedFor()[1]).toEqual(['user_2', 'user_3']);

        // Held in plain form: the tag belongs to the request, not the entry.
        expect(__heldDirectoryEntriesForTests().find(([id]) => id === 'user_1')?.[1]?.name).toBe('Dave');
        expect(await userIdListToUsernameList(['user_1'])).toEqual(['Dave']);
    });

    it('numbers colliding players who have no handle, in id order, whether held or fresh', async () => {
        clerkUsers = [
            { id: 'user_b', username: 'guest_x', publicMetadata: { guest: true, displayName: 'Sam' } },
            { id: 'user_a', username: 'guest_y', publicMetadata: { guest: true, displayName: 'Sam' } },
        ];
        await userIdListToUsernameList(['user_b']);

        expect(await userIdListToUsernameList(['user_b', 'user_a'])).toEqual(['Sam (2)', 'Sam (1)']);
    });

    it('does not cache what usersById returns, nor the untagged-name check', async () => {
        clerkUsers = [person('user_1', 'Ann', 'ann')];

        await usersById(['user_1']);
        await usersById(['user_1']);
        expect(getUserList).toHaveBeenCalledTimes(2);
        expect(__heldDirectoryEntriesForTests()).toEqual([]);

        await userIdListToUsernameList(['user_1']);
        getUserList.mockClear();
        clerkUsers = [person('user_1', 'Anne', 'ann')];
        expect(await userIdListToUntaggedNameList(['user_1'])).toEqual(['Anne']);
        expect(getUserList).toHaveBeenCalledTimes(1);
    });

    describe('when Clerk fails', () => {
        beforeEach(() => {
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
        });
        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('serves entries past their expiry rather than fail', async () => {
            clerkUsers = [person('user_1', 'Ann', 'ann'), person('user_2', 'Bob', 'bob')];
            await userIdListToUsernameList(['user_1', 'user_2']);
            vi.advanceTimersByTime(DIRECTORY_MAX_AGE_MS + 1);
            getUserList.mockRejectedValue(new Error('Clerk is down'));

            expect(await userIdListToUsernameList(['user_1', 'user_2'])).toEqual(['Ann', 'Bob']);
            expect(getUserList).toHaveBeenCalledTimes(2);
        });

        it('serves a fresh entry beside an expired one', async () => {
            clerkUsers = [person('user_1', 'Ann', 'ann'), person('user_2', 'Bob', 'bob')];
            await userIdListToUsernameList(['user_1']);
            vi.advanceTimersByTime(DIRECTORY_MAX_AGE_MS - 10);
            await userIdListToUsernameList(['user_2']);
            vi.advanceTimersByTime(20);
            getUserList.mockRejectedValue(new Error('Clerk is down'));

            expect(await userIdListToUsernameList(['user_1', 'user_2'])).toEqual(['Ann', 'Bob']);
        });

        it('fails as it always did when some id has nothing held', async () => {
            clerkUsers = [person('user_1', 'Ann', 'ann')];
            await userIdListToUsernameList(['user_1']);
            vi.advanceTimersByTime(DIRECTORY_MAX_AGE_MS + 1);
            getUserList.mockRejectedValue(new Error('Clerk is down'));

            await expect(userIdListToUsernameList(['user_1', 'user_never_seen'])).rejects.toThrow('Clerk is down');
        });

        it('fails when nothing is held at all', async () => {
            getUserList.mockRejectedValue(new Error('Clerk is down'));

            await expect(buildUserDirectory(['user_1'])).rejects.toThrow('Clerk is down');
        });
    });

    describe('when Clerk stops answering', () => {
        // A call Clerk accepted and never answered, until the test says so.
        function hangClerk() {
            let answer!: () => void;
            getUserList.mockImplementation(({ userId }: { userId: string[] }) => new Promise(resolve => {
                answer = () => resolve({ data: clerkUsers.filter(user => userId.includes(user.id as string)) });
            }));
            return () => answer();
        }

        beforeEach(() => {
            vi.spyOn(console, 'error').mockImplementation(() => {});
            vi.spyOn(console, 'warn').mockImplementation(() => {});
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('serves entries past their expiry once the budget runs out, and keeps the late answer', async () => {
            clerkUsers = [person('user_1', 'Ann', 'ann')];
            await userIdListToUsernameList(['user_1']);
            vi.advanceTimersByTime(DIRECTORY_MAX_AGE_MS + 1);
            const answer = hangClerk();
            clerkUsers = [person('user_1', 'Anne', 'ann')];

            const lookup = userIdListToUsernameList(['user_1']);
            await vi.advanceTimersByTimeAsync(1500);
            expect(await lookup).toEqual(['Ann']);

            answer();
            await vi.waitFor(() => expect(__heldDirectoryEntriesForTests()).toEqual([
                ['user_1', { id: 'user_1', name: 'Anne', handle: 'ann', imageUrl: null }],
            ]));
            getUserList.mockClear();
            expect(await userIdListToUsernameList(['user_1'])).toEqual(['Anne']);
            expect(getUserList).not.toHaveBeenCalled();
        });

        it('keeps waiting when some id has nothing held, rather than fail a slow answer', async () => {
            clerkUsers = [person('user_1', 'Ann', 'ann')];
            const answer = hangClerk();

            let settled = false;
            const lookup = userIdListToUsernameList(['user_1']).finally(() => { settled = true; });
            await vi.advanceTimersByTimeAsync(5000);
            expect(settled).toBe(false);

            answer();
            expect(await lookup).toEqual(['Ann']);
        });
    });
});

describe('reporting to the request', () => {
    it('counts hits and misses and times the lookup against the current ServerTiming', async () => {
        clerkUsers = [person('user_1', 'Ann', 'ann'), person('user_2', 'Bob', 'bob')];
        const timing = new ServerTiming();

        await timing.time('response', async () => {
            await userIdListToUsernameList(['user_1']);
            await userIdListToUsernameList(['user_1', 'user_2']);
        });

        const header = timing.header();
        expect(header).toMatch(/names;dur=[0-9.]+/);
        expect(header).toContain('names_cache;desc="hit=1 miss=2 stale=0 shared=0"');
        // Counts and timings only: no id and no name ever reaches the header.
        expect(header).not.toMatch(/user_|Ann|Bob/);
    });

    it('reports nothing when no lookup ran, and does nothing outside a request', async () => {
        clerkUsers = [person('user_1', 'Ann', 'ann')];
        expect(new ServerTiming().header()).not.toContain('names');

        await expect(userIdListToUsernameList(['user_1'])).resolves.toEqual(['Ann']);
    });
});
