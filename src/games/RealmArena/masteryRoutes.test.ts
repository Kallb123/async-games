// The two reads that carry a player's Realm Arena mastery to their profile
// (docs/games/realm-arena.md §23.3): your own from /api/stats, and a friend's
// from /api/profile/[userId], each behind the gate the rest of that profile
// already has. GameResult, Clerk and friendship are stubbed.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { areFriends } = vi.hoisted(() => ({ areFriends: vi.fn(async (_a: string, _b: string) => false) }));

vi.mock('@clerk/nextjs/server', async () => {
    const stub = (await import('@/utils/testing/apiRoute')).clerkStub();
    return {
        ...stub,
        clerkClient: async () => ({
            users: {
                ...(await stub.clerkClient()).users,
                getUser: async (id: string) => ({ id, username: id, publicMetadata: {} }),
            },
        }),
    };
});
vi.mock('@/utils/mongodb/mongodb', async () => (await import('@/utils/testing/apiRoute')).mongodbStub());
vi.mock('@/utils/mongodb/FriendshipData', async importOriginal => ({
    ...(await importOriginal<typeof import('@/utils/mongodb/FriendshipData')>()),
    areFriends,
}));

import { NextRequest } from 'next/server';
import { ANN, BOB, resetApiRouteStubs, signIn, stubClerkUsers } from '@/utils/testing/apiRoute';
import { GameResultModel } from '@/utils/mongodb/GameResultData';
import { GET as stats } from '@/app/api/stats/route';
import { GET as profile } from '@/app/api/profile/[userId]/route';

const CAROL = { id: 'user_carol', username: 'carol' };

const request = (path: string) => new NextRequest(`https://async.games${path}`);
const view = (userId: string) => profile(request(`/api/profile/${userId}`), { params: Promise.resolve({ userId }) });

/** Ann's record with the Knight, as the profile carries it: 22 XP. */
const ANNS_MASTERY = { knight: { battles: 1, attacks: 5, abilities: 1, items: 0, xp: 22 } };

beforeEach(async () => {
    vi.restoreAllMocks();
    await resetApiRouteStubs();
    areFriends.mockReset().mockResolvedValue(false);
    stubClerkUsers(ANN, BOB, CAROL);
    // No recent matches; the mastery aggregation answers each player's own
    // rows, and the per-game tally has none.
    vi.spyOn(GameResultModel, 'find').mockImplementation((() => ({ sort: () => ({ limit: () => ({ exec: async () => [] }) }) })) as never);
    vi.spyOn(GameResultModel, 'aggregate').mockImplementation((async (pipeline: { $match?: { gameType?: string; playerIds?: { $in?: string[] } } }[]) =>
        pipeline[0].$match?.gameType === 'RealmArena' && pipeline[0].$match.playerIds?.$in?.includes(ANN.id)
            ? [{ _id: { userId: ANN.id, character: 'knight' }, battles: 1, attacks: 5, abilities: 1, items: 0 }]
            : []) as never);
});

describe('GET /api/stats', () => {
    it("carries the caller's own mastery", async () => {
        signIn(ANN);

        const response = await stats(request('/api/stats'));

        expect(response.status).toBe(200);
        expect((await response.json()).realmArena).toEqual(ANNS_MASTERY);
    });

    it('carries none for a player who has never fought', async () => {
        signIn(BOB);
        expect((await (await stats(request('/api/stats'))).json()).realmArena).toEqual({});
    });
});

describe('GET /api/profile/[userId]', () => {
    it("carries a friend's mastery, since ranks are public", async () => {
        signIn(BOB);
        areFriends.mockResolvedValue(true);

        const response = await view(ANN.id);

        expect(response.status).toBe(200);
        expect((await response.json()).realmArena).toEqual(ANNS_MASTERY);
    });

    it("keeps a stranger's mastery to themselves, as the rest of their profile", async () => {
        signIn(CAROL);

        const response = await view(ANN.id);

        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({});
    });
});
