import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { GameDataModel, IGameDataDocument } from '@/utils/mongodb/GameData';

export interface ILobbyGameParams {
    inviteId: string
}

/**
 * The game a lobby became, for whoever is still sitting on the lobby screen
 * when its last seat fills. Starting a game deletes the invitation (see
 * startGameFromInvitation), so the lobby's own list refresh can only tell the
 * host that it is gone — this is how they find out where it went.
 *
 * 404 covers every "no game here": a lobby that expired or was cancelled
 * rather than starting, and a game the caller isn't playing in.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<ILobbyGameParams> }) {
    console.log(`GET ${request.nextUrl.pathname}`);

    const { userId } = await auth();
    if (!userId) {
        // 401 (not 400) so the client can tell "session cookie not ready yet"
        // apart from a genuine 404 and retry, the same way GET /api/game/[gameid]
        // does — fetchWithSessionRetry is what does the retrying.
        console.warn(`GET ${request.nextUrl.pathname} 401: no authenticated user`);
        return NextResponse.json({}, { status: 401, statusText: "Not signed in" });
    }

    await dbConnect();

    const { inviteId } = await params;
    // Scoped to the caller's own games: an inviteId is guessable enough that
    // it shouldn't hand out a game id to someone who isn't playing in it.
    const gameData: IGameDataDocument | null = await GameDataModel.findOne({ inviteId, userIdList: userId }).exec();
    if (!gameData) {
        return NextResponse.json({}, { status: 404, statusText: "Game not found" });
    }

    return NextResponse.json({ success: true, gameId: gameData.gameId, gameUrl: gameData.gameType.url });
}
