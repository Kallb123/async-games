import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { IInvitationDataDocument, InvitationModel } from '@/utils/mongodb/InvitationData';
import { invitationToResponse } from '@/utils/games/invitationResponse';

export interface ILobbyParams {
    inviteId: string
}

/**
 * One lobby, for anyone with a seat at it — the host who created it and every
 * player who has claimed a seat since. Both wait on the same screen, and it
 * only ever cares about this one invitation, so it reads it here rather than
 * fetching the whole of /api/user/outgoinginvites (host) or
 * /api/user/incominginvites (seat-holder) and picking one out: which list it
 * would be in depends on who is looking.
 *
 * The response body is `invitationToResponse`'s, exactly as the invite lists
 * serve it, so the screen renders the same shape either way. `isHost`
 * distinguishes the two viewers, since the response deliberately carries the
 * sender's username rather than their id.
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
    // seats. A 404 is what tells the screen the lobby is over — the game
    // started (which deletes the invitation) or it expired — so it must not
    // also be what a wrong-but-live inviteId returns to a nosy caller.
    const invite: IInvitationDataDocument | null = await InvitationModel.findOne({
        inviteId,
        $or: [{ senderId: userId }, { "userIdList.userId": userId }],
    }).exec();
    if (!invite) {
        return NextResponse.json({}, { status: 404, statusText: "Lobby not found" });
    }

    return NextResponse.json({
        success: true,
        invite: await invitationToResponse(invite),
        isHost: invite.senderId === userId,
    });
}
