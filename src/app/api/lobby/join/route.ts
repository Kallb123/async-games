import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { IInvitationDataDocument, InvitationModel } from '@/utils/mongodb/InvitationData';
import { OPEN_SEAT_CLAIM_FILTER, isSeatedAt, notSeatedFilter, pendingSeatFor } from '@/utils/games/lobby';
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

    const { joinCode: typedCode }: ILobbyJoinRequest = await request.json();
    if (!typedCode) {
        return NextResponse.json({}, { status: 400, statusText: "Missing join code" });
    }
    const joinCode = normaliseJoinCode(typedCode);

    await dbConnect();

    // Closes the window between a lobby actually expiring and the TTL index
    // reaping it.
    const openLobby = { joinCode, expiresAt: { $gt: new Date() } };

    // One conditional update, not read-modify-write: matching an unclaimed
    // seat (OPEN_SEAT_CLAIM_FILTER) that isn't already this player's
    // (notSeatedFilter) in the same query that finds the lobby is what makes
    // the claim atomic. Two guests racing on the same code each land on a
    // different array element — Mongo's `$` positional operator resolves to
    // exactly one matching entry per update — so neither can silently
    // overwrite the other's claim or double up on the last seat. The same
    // single update is what stops one player's two devices racing to a seat
    // each: a read-then-claim would have both read "not seated yet".
    const invite: IInvitationDataDocument | null = await InvitationModel.findOneAndUpdate(
        {
            ...openLobby,
            ...OPEN_SEAT_CLAIM_FILTER,
            ...notSeatedFilter(userId),
        },
        { $set: { "userIdList.$.userId": userId } },
        { new: true }
    ).exec();

    if (invite) {
        // The seat is claimed; run it through the same accept-and-maybe-start
        // sequence a named invitee's acceptance uses, so a lobby and a named
        // invite start through identical code.
        const { gameStarted, gameId, gameUrl } = await acceptSeat(invite, userId);

        // `inviteId` is for the seat-holder who is now waiting: it's the lobby
        // screen they wait on, alongside the host (GET /api/lobby/[inviteId]).
        return NextResponse.json({ success: true, gameStarted, gameId, gameUrl, inviteId: invite.inviteId });
    }

    // Nothing was claimed, and the three reasons are not the same answer, so
    // read the lobby back to tell them apart.
    const lobby: IInvitationDataDocument | null = await InvitationModel.findOne(openLobby).exec();
    if (!lobby) {
        return NextResponse.json({}, { status: 404, statusText: "Lobby not found" });
    }

    if (isSeatedAt(lobby, userId)) {
        // The player already has a place here — their other device, a second
        // go at the code, or the host scanning their own. A code is a way in,
        // not a way to a second seat, so send them to the seat they hold.
        // If that seat is a named invite still waiting on them, entering the
        // code is as good an acceptance as tapping accept on the dashboard —
        // otherwise they'd sit on the lobby screen watching a game their own
        // unaccepted seat is blocking.
        const started = pendingSeatFor(lobby, userId) ? await acceptSeat(lobby, userId) : { gameStarted: false };
        return NextResponse.json({ success: true, alreadySeated: true, ...started, inviteId: lobby.inviteId });
    }

    // A live lobby, but every seat in it is taken.
    return NextResponse.json({}, { status: 409, statusText: "That lobby is full" });
}
