import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { IInvitationDataDocument, InvitationModel } from '@/utils/mongodb/InvitationData';
import { isOpenSeat, OPEN_SEAT_ID } from '@/utils/games/lobby';
import { GAME_META } from '@/utils/ui/games';
import { partySizeErrorMessage } from '@/components/ui/PartySizeHint';
import { acceptSeat } from '@/utils/games/startGame';

export interface ILobbyStartRequest {
    inviteId: string;
}

export async function POST(request: NextRequest) {
    console.log(`POST ${request.nextUrl.pathname}`);

    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({}, { status: 400, statusText: "Not signed in" });
    }

    const { inviteId }: ILobbyStartRequest = await request.json();
    if (!inviteId) {
        return NextResponse.json({}, { status: 400, statusText: "Missing inviteId" });
    }

    await dbConnect();

    // Closes the window between a lobby actually expiring and the TTL index
    // reaping it, same as the join route. Also excludes a plain named
    // invitation, which has no expiresAt at all — "start now" is a lobby
    // affordance.
    const notExpired = { expiresAt: { $gt: new Date() } };

    const invite: IInvitationDataDocument | null = await InvitationModel.findOne({ inviteId, ...notExpired }).exec();
    if (!invite) {
        return NextResponse.json({}, { status: 404, statusText: "Lobby not found" });
    }
    if (invite.senderId !== userId) {
        return NextResponse.json({}, { status: 403, statusText: "Only the host can start the lobby" });
    }

    const meta = GAME_META[invite.gameType.toLowerCase()];
    if (!meta) {
        return NextResponse.json({}, { status: 400, statusText: "Unsupported game" });
    }

    // The party once every open seat is gone: named invitees plus claimed
    // seats, plus the host. Removing open seats can only shrink the party, so
    // this is the size it would start at — check it before pulling anything.
    const partySize = invite.userIdList.filter(uid => !isOpenSeat(uid)).length + 1;
    const partySizeError = partySizeErrorMessage(meta, partySize);
    if (partySizeError) {
        return NextResponse.json({}, { status: 400, statusText: partySizeError });
    }

    // There is deliberately no second start rule: this edits the seat list
    // until the existing all-accepted predicate (in acceptSeat) is true,
    // rather than bypassing it. The pull has to be the same kind of single
    // conditional update the join route uses — "start now" racing a join is
    // the same seat-claim race, so a read-modify-write here could resurrect a
    // seat a concurrent join just claimed.
    const updated: IInvitationDataDocument | null = await InvitationModel.findOneAndUpdate(
        { inviteId, senderId: userId, ...notExpired },
        { $pull: { userIdList: { userId: OPEN_SEAT_ID } } },
        { new: true }
    ).exec();
    if (!updated) {
        return NextResponse.json({}, { status: 404, statusText: "Lobby not found" });
    }

    const { gameStarted, gameId, gameUrl } = await acceptSeat(updated, userId);

    return NextResponse.json({ success: true, gameStarted, gameId, gameUrl });
}
