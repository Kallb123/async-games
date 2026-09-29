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
// has shipped, so a handful an hour is plenty — and keeps a full replay a
// request away from being something to hammer. Per player, and per game too:
// every seat in a game (a guest's included) is a player who may ask, and the
// same moves replay to the same stats however many of them do.
const REGENERATE_LIMIT = 5;
const REGENERATE_GAME_LIMIT = 3;
const REGENERATE_WINDOW_MS = 60 * 60 * 1000;

// Refusals go in the body, where the client reads them: a status line is
// empty over HTTP/2, and one that isn't plain ASCII throws.
function refuse(status: number, error: string) {
    return NextResponse.json({ error }, { status });
}

// Works a finished game's stats and charts out again from its own moves (see
// regenerateGameResultStats), for a player in it, while the game is still
// kept. Hands back the result as GET /api/gameresult/[gameId] would.
export async function POST(request: NextRequest, { params }: { params: Promise<{ gameId: string }> }) {
    console.log(`POST ${request.nextUrl.pathname}`);

    const { userId } = await auth();
    if (!userId) {
        return refuse(400, "Not signed in");
    }

    const { gameId } = await params;

    await dbConnect();

    const result = await GameResultModel.findOne({ gameId }).exec();
    if (!result) {
        return refuse(404, "Game result not found");
    }
    // Players only: a friend may look at a result, but it isn't theirs to rewrite.
    if (!result.playerIds.includes(userId)) {
        return refuse(403, "Only a player in this game can regenerate its results");
    }

    if (!(await consumeRateLimit('regenerate-result', userId, REGENERATE_LIMIT, REGENERATE_WINDOW_MS))
        || !(await consumeRateLimit('regenerate-result-game', gameId, REGENERATE_GAME_LIMIT, REGENERATE_WINDOW_MS))) {
        return refuse(429, "These results have been regenerated a lot recently. Try again later.");
    }

    // Scoped to the caller's games as well, so the game is theirs whatever its
    // result says.
    const gameData = await GameDataModel.findOne({ gameId, complete: true, userIdList: userId }).exec();
    if (!gameData) {
        return refuse(410, "This game's moves are no longer kept");
    }

    const outcome = await regenerateGameResultStats(gameData);
    if ('refused' in outcome) {
        return outcome.refused === 'lossy'
            ? refuse(409, "The game's moves no longer add up to these results, so they were kept as they were")
            : refuse(400, "This game has no results to regenerate");
    }

    return NextResponse.json({ success: true, result: await gameResultResponse(outcome.regenerated, userId) });
}
