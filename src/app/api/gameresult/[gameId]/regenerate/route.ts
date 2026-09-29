import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { GameDataModel } from '@/utils/mongodb/GameData';
import { GameResultModel, regenerateGameResultStats } from '@/utils/mongodb/GameResultData';
import { consumeRateLimit } from '@/utils/rateLimit';
import { gameResultResponse } from '@/utils/api/gameResultResponse';

// Working the stats out again replays the whole game, which for a long one is
// seconds of work: more than the platform's default few.
export const maxDuration = 60;

// A result only ever needs regenerating once a fix to how it is worked out
// has shipped, so a handful an hour is plenty for anyone — and keeps a full
// replay a request away from being something to hammer.
const REGENERATE_LIMIT = 5;
const REGENERATE_WINDOW_MS = 60 * 60 * 1000;

// Works a finished game's stats and charts out again from its own moves (see
// regenerateGameResultStats), for a player in it, while the game is still
// kept. Hands back the result as GET /api/gameresult/[gameId] would.
export async function POST(request: NextRequest, { params }: { params: Promise<{ gameId: string }> }) {
    console.log(`POST ${request.nextUrl.pathname}`);

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
    // Players only: a friend may look at a result, but it isn't theirs to rewrite.
    if (!result.playerIds.includes(userId)) {
        return NextResponse.json({}, { status: 403, statusText: "Only a player in this game can regenerate its results" });
    }

    if (!(await consumeRateLimit('regenerate-result', userId, REGENERATE_LIMIT, REGENERATE_WINDOW_MS))) {
        return NextResponse.json({}, { status: 429, statusText: "You've regenerated results a lot recently — try again later" });
    }

    // Scoped to the caller's games as well, so the game is theirs whatever its
    // result says.
    const gameData = await GameDataModel.findOne({ gameId, complete: true, userIdList: userId }).exec();
    if (!gameData) {
        return NextResponse.json({}, { status: 410, statusText: "This game's moves are no longer kept" });
    }

    if (!(await regenerateGameResultStats(gameData))) {
        return NextResponse.json({}, { status: 400, statusText: "This game has no results to regenerate" });
    }

    const regenerated = await GameResultModel.findOne({ gameId }).exec();
    return NextResponse.json({ success: true, result: await gameResultResponse(regenerated ?? result, userId) });
}
