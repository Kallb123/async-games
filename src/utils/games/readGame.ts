import { GameDataModel, IGameDataDocument } from '@/utils/mongodb/GameData';
import { attachHistoryReactions } from '@/utils/games/historyReactions';
import { unlockedHere } from '@/utils/games/unlockedHere';
import { untimed, type TimeSpan } from '@/utils/api/serverTiming';
import type { IGameDataResponse } from '@/utils/apiModels/GameDataApi';

/**
 * One player's view of one game: what `GET /api/game/:id` answers, read the
 * way it reads it. Kept apart from the route so `npm run perf:explain` can
 * explain exactly these reads, not a copy of them.
 */
export async function readGameForViewer(gameId: string, userId: string, time: TimeSpan = untimed): Promise<{ status: 404 | 403 } | { gameData: IGameDataResponse }> {
    const gameData = await time('mongo_query', () => GameDataModel.findOne({ gameId }).exec()) as IGameDataDocument | null;
    if (!gameData) return { status: 404 };
    if (!gameData.userIdList.includes(userId)) return { status: 403 };
    const response = await time('response', () => gameData.CreateDataResponse(userId));
    // Side by side: both are one indexed read, and neither needs the other.
    const [history, unlocks] = await Promise.all([
        time('reactions', () => attachHistoryReactions(gameId, response.gameState.history)),
        time('achievements', () => unlockedHere(gameData, userId)),
    ]);
    response.gameState.history = history;
    response.unlockedHere = unlocks;
    return { gameData: response };
}
