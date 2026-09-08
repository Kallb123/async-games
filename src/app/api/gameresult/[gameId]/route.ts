import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { GameResultModel, formatGameResultStats, formatGameResultCharts } from '@/utils/mongodb/GameResultData';
import { areFriends } from '@/utils/mongodb/FriendshipData';
import { userIdListToUsernameMap } from '@/utils/users/clerk';
import { UNKNOWN_PLAYER_NAME } from '@/utils/ui/players';
import type { GameEndReason, GameResultStatGroup, GameResultChart } from '@/utils/apiModels/GameDataApi';

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
    charts: GameResultChart[];
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ gameId: string }> }) {
    console.log(`GET ${request.nextUrl.pathname}`);

    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({}, { status: 400, statusText: "Not signed in" });
    }

    const { gameId } = await params;

    await dbConnect();

    const result = await GameResultModel.findOne({ gameId }).exec();
    if (!result) {
        return NextResponse.json({}, { status: 404, statusText: "Game result not found" });
    }

    const playerIds: string[] = result.playerIds;
    if (!playerIds.includes(userId)) {
        const friendChecks = await Promise.all(playerIds.map(playerId => areFriends(userId, playerId)));
        if (!friendChecks.some(Boolean)) {
            return NextResponse.json({}, { status: 403, statusText: "You can only view results you played or a friend played" });
        }
    }

    const usernameById = await userIdListToUsernameMap(playerIds);

    // A guest's Clerk user is deleted a week after their last game
    // (docs/account-less-play.md step 17), so there is nothing left for the
    // lookup above to resolve their id to. The name they played under was
    // copied onto this record for exactly this moment (guestNames, step 13) —
    // read only where the live lookup came back empty, so a player who is
    // still around is named by today's name, the way the reactions feed falls
    // back on its own stored name. Without it every guest who ever sat at a
    // table becomes "Unknown player" on the result page, in its stat groups
    // and on every per-round chart line — including on matches that now show
    // in the other players' recent form (§8).
    for (const [playerId, name] of usernameById) {
        const remembered = name === UNKNOWN_PLAYER_NAME && result.guestNames?.get(playerId);
        if (remembered) {
            usernameById.set(playerId, remembered);
        }
    }

    const response: IGameResultResponse = {
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
        stats: formatGameResultStats(result.gameType, (result as any).stats, usernameById),
        charts: formatGameResultCharts(result.gameType, (result as any).stats, usernameById),
    };

    return NextResponse.json({ success: true, result: response });
}
