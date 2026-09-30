// The reads that carry a player's achievements to the screens that show them
// (docs/achievements.md §6): the toaster's recent feed, both profiles, and a
// finished game's results page.
// Each is gated exactly as it was before achievements (signed in and your own;
// yourself or an accepted friend; a player or a friend of one), and what those
// gates let through is pinned here: a profile carries only its own player's
// unlocks, and the results page lists every player's, for every viewer it lets in.
//
// The unlocks are the real `AchievementUnlockData` reads over the test store;
// GameResult, Clerk and friendship are stubbed.

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
import { ANN, BOB, resetApiRouteStubs, seedAchievementUnlock, signIn, stubClerkUsers } from '@/utils/testing/apiRoute';
import { GameResultModel } from '@/utils/mongodb/GameResultData';
import { GameDataModel } from '@/utils/mongodb/GameData';
import { GET as stats } from '../stats/route';
import { GET as profile } from '../profile/[userId]/route';
import { GET as gameResult } from '../gameresult/[gameId]/route';
import { GET as recent } from './recent/route';

const CAROL = { id: 'user_carol', username: 'carol' };

/** The finished game these tests read: Ann and Bob played it. */
const RESULT = {
    gameId: 'game_1', gameType: 'SnakesAndLadders', url: 'snakesandladders', winner: ANN.id, endReason: 'win',
    playerIds: [ANN.id, BOB.id], endedAt: '2026-03-01T00:00:00.000Z', totalTurns: 12,
};

const request = (path: string) => new NextRequest(`https://async.games${path}`);

/**
 * GameResult answering every read these routes make of it: the recent matches
 * (none), which games still have a result (those listed), one result by id, and
 * the per-game tally (none).
 */
function stubResults(gameIdsWithResults: string[]) {
    vi.spyOn(GameResultModel, 'find').mockImplementation(((filter: Record<string, unknown>) =>
        'gameId' in filter
            ? { lean: () => ({ exec: async () => gameIdsWithResults.map(gameId => ({ gameId })) }) }
            : { sort: () => ({ limit: () => ({ exec: async () => [] }) }) }) as never);
    vi.spyOn(GameResultModel, 'findOne').mockImplementation(((filter: { gameId: string }) =>
        ({ exec: async () => filter.gameId === RESULT.gameId ? RESULT : null })) as never);
    vi.spyOn(GameResultModel, 'aggregate').mockResolvedValue([] as never);
    vi.spyOn(GameDataModel, 'exists').mockResolvedValue(null as never);
}

beforeEach(async () => {
    vi.restoreAllMocks();
    await resetApiRouteStubs();
    areFriends.mockReset().mockResolvedValue(false);
    stubClerkUsers(ANN, BOB, CAROL);
    stubResults([RESULT.gameId]);
    // Ann's: one from the finished game, one from a game still in play (no
    // results page yet), and one backfilled (no game at all).
    seedAchievementUnlock({ userId: ANN.id, achievementId: 'snakesandladders.home', unlockedAt: '2026-03-01T00:00:00.000Z', gameId: 'game_1', url: 'snakesandladders' });
    seedAchievementUnlock({ userId: ANN.id, achievementId: 'dicecities.mine-baron', unlockedAt: '2026-03-02T00:00:00.000Z', gameId: 'game_live', url: 'dicecities' });
    seedAchievementUnlock({ userId: ANN.id, achievementId: 'platform.first-win', unlockedAt: '2026-03-03T00:00:00.000Z' });
    // Bob's, from the same finished game.
    seedAchievementUnlock({ userId: BOB.id, achievementId: 'snakesandladders.climber', unlockedAt: '2026-03-01T00:00:01.000Z', gameId: 'game_1', url: 'snakesandladders' });
});

/** Ann's three unlocks as a profile carries them. */
const ANNS_ACHIEVEMENTS = [
    { id: 'snakesandladders.home', unlockedAt: '2026-03-01T00:00:00.000Z', gameId: 'game_1', url: 'snakesandladders', hasResult: true },
    { id: 'dicecities.mine-baron', unlockedAt: '2026-03-02T00:00:00.000Z', gameId: 'game_live', url: 'dicecities', hasResult: false },
    { id: 'platform.first-win', unlockedAt: '2026-03-03T00:00:00.000Z' },
];

describe('GET /api/achievements/recent', () => {
    it("answers the caller's own unlocks from the last week, and nobody else's", async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        try {
            // Eight days after Ann's first unlock: that one is no longer news.
            vi.setSystemTime(new Date('2026-03-09T00:00:00.000Z'));
            signIn(ANN);

            const response = await recent(request('/api/achievements/recent'));

            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({
                success: true,
                unlocks: [
                    { id: 'dicecities.mine-baron', unlockedAt: '2026-03-02T00:00:00.000Z', gameId: 'game_live', url: 'dicecities' },
                    { id: 'platform.first-win', unlockedAt: '2026-03-03T00:00:00.000Z' },
                ],
            });
        } finally {
            vi.useRealTimers();
        }
    });

    it('asks who is signed in, and answers nobody else', async () => {
        const response = await recent(request('/api/achievements/recent'));

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({});
    });
});

describe('GET /api/stats', () => {
    it("carries the caller's own unlocks, each marked with whether its game still has a results page", async () => {
        signIn(ANN);

        const response = await stats(request('/api/stats'));

        expect(response.status).toBe(200);
        expect((await response.json()).achievements).toEqual(ANNS_ACHIEVEMENTS);
    });
});

describe('GET /api/profile/[userId]', () => {
    const view = (userId: string) => profile(request(`/api/profile/${userId}`), { params: Promise.resolve({ userId }) });

    it("carries a friend's unlocks, and only theirs", async () => {
        signIn(BOB);
        areFriends.mockResolvedValue(true);

        const response = await view(ANN.id);

        expect(response.status).toBe(200);
        expect((await response.json()).achievements).toEqual(ANNS_ACHIEVEMENTS);
    });

    it("keeps a stranger's unlocks to themselves", async () => {
        signIn(CAROL);

        const response = await view(ANN.id);

        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({});
    });
});

describe('GET /api/gameresult/[gameId]', () => {
    const read = () => gameResult(request('/api/gameresult/game_1'), { params: Promise.resolve({ gameId: 'game_1' }) });

    /** Everything game_1 earned, for everyone at the table — and nothing from any other game. */
    const EARNED_HERE = [
        { userId: ANN.id, id: 'snakesandladders.home', unlockedAt: '2026-03-01T00:00:00.000Z' },
        { userId: BOB.id, id: 'snakesandladders.climber', unlockedAt: '2026-03-01T00:00:01.000Z' },
    ];

    it('lists every player’s unlocks from that game to a player', async () => {
        signIn(ANN);

        const response = await read();

        expect(response.status).toBe(200);
        expect((await response.json()).result.achievements).toEqual(EARNED_HERE);
    });

    it('shows a friend of one player the same list', async () => {
        signIn(CAROL);
        areFriends.mockImplementation(async (a: string, b: string) => a === CAROL.id && b === BOB.id);

        const response = await read();

        expect(response.status).toBe(200);
        expect((await response.json()).result.achievements).toEqual(EARNED_HERE);
    });

    it('leaves out a career unlock this game only backfilled, which was stored without it', async () => {
        signIn(ANN);
        seedAchievementUnlock({ userId: BOB.id, achievementId: 'platform.regular', unlockedAt: '2026-03-01T00:00:02.000Z' });

        const response = await read();

        expect((await response.json()).result.achievements).toEqual(EARNED_HERE);
    });
});
