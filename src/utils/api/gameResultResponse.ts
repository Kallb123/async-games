import { GameDataModel } from '@/utils/mongodb/GameData';
import { IGameResultDataDocument, formatGameResultStats, formatGameResultCharts, hasGameResultStats } from '@/utils/mongodb/GameResultData';
import { userIdListToUsernameMap } from '@/utils/users/clerk';
import type { GameEndReason, GameResultStatGroup, GameResultAnyChart } from '@/utils/apiModels/GameDataApi';

export interface IGameResultResponse {
    gameId: string;
    gameType: string;
    url: string;
    winner: string;
    endReason?: GameEndReason;
    // Which shape of that ending it was, in the player's own words — see
    // IGameData.endDetail. Carries no player id or name, so there is nothing
    // here to resolve through Clerk.
    endDetail?: string;
    forfeitedBy?: string;
    players: string[];
    // The players' stable Clerk userIds, parallel to `players` (same order).
    // The per-round charts are keyed by these, so a shared display name can't
    // collapse two players onto one line.
    playerIds: string[];
    endedAt: string;
    totalTurns: number;
    stats: GameResultStatGroup[];
    charts: GameResultAnyChart[];
    // Whether the viewer can have the stats and charts worked out again from
    // the game's own moves (POST /api/gameresult/[gameId]/regenerate): they
    // played in it, it was recorded with stats of its own, and its GameData —
    // which the result outlives — is still kept.
    canRegenerate: boolean;
}

// One finished game's result as the result page and the recent-form popup
// read it, for `viewerId`. Shared by the route that reads a result and the
// one that regenerates it, so both hand back the same thing. The caller has
// already checked the viewer may see it.
export async function gameResultResponse(result: IGameResultDataDocument, viewerId: string): Promise<IGameResultResponse> {
    const playerIds: string[] = result.playerIds;
    const usernameById = await userIdListToUsernameMap(playerIds);
    const stats = (result as unknown as { stats?: unknown }).stats;
    // A result recorded before its game kept stats has none to rewrite
    // (regenerateGameResultStats finds only one that has).
    const canRegenerate = playerIds.includes(viewerId)
        && stats !== undefined
        && hasGameResultStats(result.gameType)
        && !!(await GameDataModel.exists({ gameId: result.gameId, complete: true }));

    return {
        gameId: result.gameId,
        gameType: result.gameType,
        url: result.url,
        winner: result.winner ? (usernameById.get(result.winner) ?? result.winner) : "",
        endReason: result.endReason,
        endDetail: result.endDetail,
        forfeitedBy: result.forfeitedBy ? (usernameById.get(result.forfeitedBy) ?? result.forfeitedBy) : undefined,
        players: playerIds.map(playerId => usernameById.get(playerId) ?? playerId),
        playerIds,
        endedAt: result.endedAt,
        totalTurns: result.totalTurns,
        stats: formatGameResultStats(result.gameType, stats, usernameById),
        charts: formatGameResultCharts(result.gameType, stats, usernameById),
        canRegenerate,
    };
}
