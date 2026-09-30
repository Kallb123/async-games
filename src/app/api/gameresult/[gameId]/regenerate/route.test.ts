// The gates in front of a full replay of somebody's finished game: who may ask,
// how often, and for which game. What the regeneration itself does is
// regenerateGameResultStats's, tested beside it in GameResultData.test.ts —
// here it only answers the way it can.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { signedIn, consumeRateLimit, regenerateGameResultStats, gameResultResponse } = vi.hoisted(() => ({
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

import { NextRequest } from 'next/server';
import { GameDataModel } from '@/utils/mongodb/GameData';
import { GameResultModel } from '@/utils/mongodb/GameResultData';
import { POST } from './route';

const query = (value: unknown) => ({ exec: async () => value }) as never;
const RESULT = { gameId: 'game_1', playerIds: ['user_ann', 'user_bob'] };
const GAME = { gameId: 'game_1', complete: true, userIdList: ['user_ann', 'user_bob'] };

let findGame: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    vi.restoreAllMocks();
    signedIn.userId = 'user_ann';
    consumeRateLimit.mockReset().mockResolvedValue(true);
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
