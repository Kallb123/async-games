import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { IInvitationDataDocument, InvitationModel } from '@/utils/mongodb/InvitationData';
import { OPEN_SEAT_CLAIM_FILTER } from '@/utils/games/lobby';
import { normaliseJoinCode } from '@/utils/games/joinCode';
import { acceptSeat } from '@/utils/games/startGame';

export interface ILobbyJoinRequest {
    joinCode: string;
}

export async function POST(request: NextRequest) {
    console.log(`POST ${request.nextUrl.pathname}`);

    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({}, { status: 400, statusText: "Not signed in" });
    }

    const { joinCode }: ILobbyJoinRequest = await request.json();
    if (!joinCode) {
        return NextResponse.json({}, { status: 400, statusText: "Missing join code" });
    }

    await dbConnect();

    // One conditional update, not read-modify-write: matching an unclaimed
    // seat (OPEN_SEAT_CLAIM_FILTER) in the same query that finds the lobby is
    // what makes the claim atomic. Two guests racing on the same code each
    // land on a different array element — Mongo's `$` positional operator
    // resolves to exactly one matching entry per update — so neither can
    // silently overwrite the other's claim or double up on the last seat.
    // The `expiresAt` check closes the window between a lobby actually
    // expiring and the TTL index reaping it.
    const invite: IInvitationDataDocument | null = await InvitationModel.findOneAndUpdate(
        {
            joinCode: normaliseJoinCode(joinCode),
            expiresAt: { $gt: new Date() },
            ...OPEN_SEAT_CLAIM_FILTER,
        },
        { $set: { "userIdList.$.userId": userId } },
        { new: true }
    ).exec();

    if (!invite) {
        return NextResponse.json({}, { status: 404, statusText: "Lobby not found" });
    }

    // The seat is claimed; run it through the same accept-and-maybe-start
    // sequence a named invitee's acceptance uses, so a lobby and a named
    // invite start through identical code.
    const { gameStarted, gameId, gameUrl } = await acceptSeat(invite, userId);

    return NextResponse.json({ success: true, gameStarted, gameId, gameUrl });
}
