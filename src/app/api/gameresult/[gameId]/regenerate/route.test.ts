// The gates in front of a full replay of somebody's finished game: who may ask,
// how often, and for which game. What the regeneration itself does is
// regenerateGameResultStats's, tested beside it in GameResultData.test.ts —
// here it only answers the way it can.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AchievementCatalogue } from '@/utils/games/achievements';

// The real catalogue is empty until the first achievements ship, so the test
// that regenerating judges nothing fills one for the judge to find if it were
// ever asked (gameRoutes.test.ts does the same).
const { signedIn, consumeRateLimit, regenerateGameResultStats, gameResultResponse, testCatalogue } = vi.hoisted(() => ({
    testCatalogue: { games: {}, platform: [] } as AchievementCatalogue,
    signedIn: { userId: 'user_ann' as string | null },
    consumeRateLimit: vi.fn(async () => true),
    regenerateGameResultStats: vi.fn(),
    gameResultResponse: vi.fn(async (result: { gameId: string }) => ({ gameId: result.gameId, canRegenerate: true })),
}));
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: signedIn.userId }) }));
vi.mock('@/utils/mongodb/mongodb', async () => (await import('@/utils/testing/apiRoute')).mongodbStub());
vi.mock('@/utils/rateLimit', () => ({ consumeRateLimit }));
vi.mock('@/utils/api/gameResultResponse', () => ({ gameResultResponse }));
vi.mock('@/utils/mongodb/GameResultData', async () => (await import('@/utils/testing/apiRoute')).gameResultDataStub({ regenerateGameResultStats }));
vi.mock('@/utils/games/achievements', async importOriginal => ({
    ...(await importOriginal<typeof import('@/utils/games/achievements')>()),
    ACHIEVEMENT_CATALOGUE: testCatalogue,
}));

import { NextRequest } from 'next/server';
import * as awardAchievements from '@/utils/games/awardAchievements';
import { AchievementUnlockModel } from '@/utils/mongodb/AchievementUnlockData';
import { GameDataModel } from '@/utils/mongodb/GameData';
import { GameResultModel } from '@/utils/mongodb/GameResultData';
import { ending, platform, turnEnd } from '@/utils/testing/achievementFixtures';
import { POST } from './route';

const query = (value: unknown) => ({ exec: async () => value }) as never;
const RESULT = { gameId: 'game_1', playerIds: ['user_ann', 'user_bob'] };
const GAME = { gameId: 'game_1', complete: true, userIdList: ['user_ann', 'user_bob'] };

let findGame: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    vi.restoreAllMocks();
    signedIn.userId = 'user_ann';
    consumeRateLimit.mockReset().mockResolvedValue(true);
    testCatalogue.games = {};
    testCatalogue.platform = [];
    regenerateGameResultStats.mockReset().mockResolvedValue({ regenerated: { gameId: 'game_1' } });
    vi.spyOn(GameResultModel, 'findOne').mockReturnValue(query(RESULT));
    findGame = vi.spyOn(GameDataModel, 'findOne').mockReturnValue(query(GAME));
});

async function regenerate() {
    const response = await POST(
        new NextRequest('http://localhost/api/gameresult/game_1/regenerate', { method: 'POST' }),
        { params: Promise.resolve({ gameId: 'game_1' }) },
    );
    return { status: response.status, body: await response.json() };
}

describe('POST /api/gameresult/[gameId]/regenerate', () => {
    it('works the stats out again for a player, and hands back the result', async () => {
        const { status, body } = await regenerate();

        expect(status).toBe(200);
        expect(body).toEqual({ success: true, result: { gameId: 'game_1', canRegenerate: true } });
        // The game is looked for among the caller's own finished games.
        expect(findGame).toHaveBeenCalledWith({ gameId: 'game_1', complete: true, userIdList: 'user_ann' });
        expect(regenerateGameResultStats).toHaveBeenCalledWith(GAME);
    });

    it('never judges achievements: a game is judged as it is played, and working its stats out again earns nothing', async () => {
        // A catalogue with something for every kind of judging, all of it true:
        // regenerating a result is a replay for its charts, and a player who
        // regenerates a year-old game shouldn't be handed what the game didn't earn.
        testCatalogue.games = {
            snakesandladders: [turnEnd('snakesandladders.always', () => true), ending('snakesandladders.ended', () => true)],
        };
        testCatalogue.platform = [platform('platform.played-1', career => career.played, 1)];
        const judges = [vi.spyOn(awardAchievements, 'judgeTurnEnd'), vi.spyOn(awardAchievements, 'judgeGameEnd')];
        const write = vi.spyOn(AchievementUnlockModel, 'bulkWrite').mockResolvedValue({} as never);

        expect((await regenerate()).status).toBe(200);

        expect(regenerateGameResultStats).toHaveBeenCalledTimes(1);
        for (const judge of judges) expect(judge).not.toHaveBeenCalled();
        expect(write).not.toHaveBeenCalled();
    });

    it('refuses anybody signed out', async () => {
        signedIn.userId = null;
        expect((await regenerate()).status).toBe(400);
        expect(regenerateGameResultStats).not.toHaveBeenCalled();
    });

    it('refuses a game with no result', async () => {
        vi.spyOn(GameResultModel, 'findOne').mockReturnValue(query(null));
        expect((await regenerate()).status).toBe(404);
    });

    it("refuses somebody who didn't play in it, before spending anything on them", async () => {
        signedIn.userId = 'user_cara';
        const { status, body } = await regenerate();

        expect(status).toBe(403);
        expect(body.error).toMatch(/only a player/i);
        expect(consumeRateLimit).not.toHaveBeenCalled();
        expect(regenerateGameResultStats).not.toHaveBeenCalled();
    });

    it('stops once the player, or the game, has been regenerated too often', async () => {
        consumeRateLimit.mockResolvedValueOnce(false);
        expect((await regenerate()).status).toBe(429);

        consumeRateLimit.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
        const { status, body } = await regenerate();
        expect(status).toBe(429);
        // In the body, where the client reads it — and plain ASCII in any case.
        expect(body.error).toMatch(/try again later/i);
        expect(consumeRateLimit).toHaveBeenCalledWith('regenerate-result-game', 'game_1', expect.any(Number), expect.any(Number));
        expect(regenerateGameResultStats).not.toHaveBeenCalled();
    });

    it("says so when the game's moves are no longer kept", async () => {
        findGame.mockReturnValue(query(null));
        expect((await regenerate()).status).toBe(410);
        expect(regenerateGameResultStats).not.toHaveBeenCalled();
    });

    it('keeps a result the moves would now chart less of, and says why', async () => {
        regenerateGameResultStats.mockResolvedValue({ refused: 'lossy' });
        const { status, body } = await regenerate();

        expect(status).toBe(409);
        expect(body.error).toMatch(/kept as they were/);
    });

    it('refuses a game with nothing to regenerate', async () => {
        regenerateGameResultStats.mockResolvedValue({ refused: 'nothing' });
        expect((await regenerate()).status).toBe(400);
    });
});
