import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { IInvitationDataDocument, IInvitationResponse, InvitationModel } from '@/utils/mongodb/InvitationData';
import { GameDataModel, IGameDataDocument } from '@/utils/mongodb/GameData';
import { uuidString } from '@/utils/apiModels/GameDataApi';
import { invitationToResponse, invitationUserIds } from '@/utils/games/invitationResponse';
import { buildUserDirectory } from '@/utils/users/clerk';

export interface ILobbyParams {
    inviteId: string
}

/**
 * What this route answers with, in the lobby screen's two states: the lobby
 * itself while people are still arriving, and — once its last seat has gone
 * and the invitation has become a game — where that game is.
 *
 * Exported and imported by the screen (the way `ILobbyPreviewResponse` is),
 * so the two returns below are checked against the same shape the client
 * reads rather than each describing the wire separately.
 *
 * Nested rather than the flat `{ gameStarted, gameId, gameUrl }` that
 * POST /api/lobby/start answers with (`AcceptSeatResult`): that one is the
 * outcome of an action and has a false to report, this is the state of a
 * lobby, where "not started" is the invitation rather than a flag.
 */
export interface ILobbyResponse {
    success: true;
    invite?: IInvitationResponse;
    isHost?: boolean;
    startedGame?: { gameId: uuidString, gameUrl: string };
}

/**
 * One lobby, for anyone with a seat at it — the host who created it and every
 * player who has claimed a seat since. Both wait on the same screen, and it
 * only ever cares about this one invitation, so it reads it here rather than
 * fetching the whole dashboard and picking one out: which of its two invite
 * lists this lobby would be in depends on who is looking.
 *
 * The response body is `invitationToResponse`'s, exactly as the dashboard's
 * invite lists serve it, so the screen renders the same shape either way. `isHost`
 * distinguishes the two viewers, since the response deliberately carries the
 * sender's username rather than their id.
 *
 * Once the lobby has become a game the answer is `startedGame` instead — see
 * below.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<ILobbyParams> }) {
    console.log(`GET ${request.nextUrl.pathname}`);

    const { userId } = await auth();
    if (!userId) {
        // 401 (not 400) so a backgrounded tab whose Clerk cookie is still
        // refreshing retries instead of reading this as "lobby gone" — see
        // fetchWithSessionRetry, and GET /api/game/[gameid].
        console.warn(`GET ${request.nextUrl.pathname} 401: no authenticated user`);
        return NextResponse.json({}, { status: 401, statusText: "Not signed in" });
    }

    await dbConnect();

    const { inviteId } = await params;
    // Scoped to a seat at this lobby: the host, or whoever holds one of its
    // seats. A wrong-but-live inviteId must answer a nosy caller exactly as a
    // lobby that never existed does, so "not yours" and "not there" are the
    // same 404 below.
    const invite: IInvitationDataDocument | null = await InvitationModel.findOne({
        inviteId,
        $or: [{ senderId: userId }, { "userIdList.userId": userId }],
    }).exec();

    if (!invite) {
        // Starting a game deletes the invitation (see startGameFromInvitation)
        // and `inviteId` is the only link left between the two, so before
        // calling the lobby gone, look for the game it became. Answered here
        // rather than by a second route the screen asks afterwards: every
        // lobby makes this transition, and the screen is watching for exactly
        // this, so it is one round trip rather than two — and, since a 404 is
        // an error in the browser's console whatever the client makes of it,
        // the most ordinary thing a lobby does no longer logs one.
        //
        // Scoped to the caller's own games for the same reason the invitation
        // lookup above is scoped to a seat: an inviteId is guessable enough
        // that it must not hand a game id to someone who isn't playing in it.
        const gameData: IGameDataDocument | null = await GameDataModel.findOne({ inviteId, userIdList: userId }).exec();
        if (gameData) {
            const started: ILobbyResponse = {
                success: true,
                startedGame: { gameId: gameData.gameId, gameUrl: gameData.gameType.url },
            };
            return NextResponse.json(started);
        }
        // No invitation and no game: it expired, it was cancelled, it never
        // existed, or it was never this caller's to look at.
        return NextResponse.json({}, { status: 404, statusText: "Lobby not found" });
    }

    const directory = await buildUserDirectory(invitationUserIds(invite));

    const response: ILobbyResponse = {
        success: true,
        invite: invitationToResponse(invite, directory),
        isHost: invite.senderId === userId,
    };
    return NextResponse.json(response);
}
