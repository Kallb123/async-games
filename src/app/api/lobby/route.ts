import { auth, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { dbConnect, invitationModelFor } from '@/utils/mongodb/mongodb';
import { IInvitationDataDocument, IUserIdAcceptance, IInvitationRequest } from '@/utils/mongodb/InvitationData';
import { isUnlockedUser, usersByUsername } from '@/utils/users/clerk';
import { GAME_META, partySizeErrorMessage } from '@/utils/ui/games';
import { OPEN_SEAT_ID, LOBBY_TTL_MS } from '@/utils/games/lobby';
import { generateJoinCode } from '@/utils/games/joinCode';
import { sendPushToUsers, homeNotificationLink } from '@/utils/firebase/pushNotification';
import { buildGameInviteNotification } from '@/utils/firebase/notificationContent';
import { isGuest, readableName } from '@/utils/ui/players';

// A lobby's create request is just a game's existing invite payload
// (IInvitationRequest, plus whatever extra settings that game's own
// InvitationRequest adds — DiceCities' enabledDocks, SettlementsAndCities'
// expansions, Solitaire's drawMode, and so on) with two more fields: which
// game, and how many seats to leave open for a code-holder to claim.
export interface ILobbyRequest extends IInvitationRequest {
    gameType: string;
    seatCount: number;
    [extraGameSetting: string]: unknown;
}

// A generated code collides with a live lobby's about 1-in-234k of the time
// (docs/account-less-play.md §4), so a handful of retries is already many
// times more headroom than the collision odds need.
const MAX_JOIN_CODE_ATTEMPTS = 5;

export async function POST(request: NextRequest) {
    console.log(`POST ${request.nextUrl.pathname}`);

    const { userId } = await auth();
    const thisUser = await currentUser();
    if (!userId || !thisUser) {
        return NextResponse.json({}, { status: 400, statusText: "Not signed in" });
    }
    // The gate belongs on lobby creation, not lobby joining (§8): an
    // unlocked host vouches for everyone holding their code. isUnlockedUser
    // also passes a guest — that's correct for the general app-access gate
    // (§5/§12), which a guest must clear the moment they exist, but a guest
    // is exactly the account with nobody vouching for them, so it can't
    // double as the lobby-creation gate on its own: every lobby needs a real
    // registered host (§8), so a guest is rejected here explicitly.
    if (isGuest(thisUser) || !isUnlockedUser(thisUser)) {
        return NextResponse.json({}, { status: 403, statusText: "Account not unlocked" });
    }

    const { gameType, turnTimer, userList: usernames, seatCount, ...gameSettings }: ILobbyRequest = await request.json();

    const invitationModel = invitationModelFor(gameType);
    const meta = GAME_META[gameType.toLowerCase()];
    if (!invitationModel || !meta) {
        return NextResponse.json({}, { status: 400, statusText: "Unsupported game" });
    }

    if (!Number.isInteger(seatCount) || seatCount < 0) {
        return NextResponse.json({}, { status: 400, statusText: "Invalid seat count" });
    }

    // Via usersByUsername, so an open-seat-only lobby (nobody named) looks up
    // nobody rather than having Clerk hand back its entire user list and fail
    // the resolved-every-name check below.
    const invitedUsers = await usersByUsername(usernames);
    if (invitedUsers.length !== usernames.length) {
        return NextResponse.json({}, { status: 404, statusText: "User not found" });
    }

    // The host isn't a userIdList entry (they're senderId), so the party is
    // the named invitees, plus the open seats, plus the host themselves.
    const partySize = invitedUsers.length + seatCount + 1;
    const partySizeError = partySizeErrorMessage(meta, partySize);
    if (partySizeError) {
        return NextResponse.json({}, { status: 400, statusText: partySizeError });
    }

    await dbConnect();

    const userIdList: IUserIdAcceptance[] = invitedUsers
        .map(user => ({ userId: user.id, inviteAccepted: false }))
        .concat(Array.from({ length: seatCount }, () => ({ userId: OPEN_SEAT_ID, inviteAccepted: false })));

    let invite: IInvitationDataDocument | undefined;
    for (let attempt = 0; !invite; attempt++) {
        const candidate: IInvitationDataDocument = new invitationModel({
            ...gameSettings,
            inviteId: randomUUID(),
            senderId: userId,
            userIdList,
            turnTimer,
            timestamp: (new Date()).toISOString(),
            gameType,
            gameFriendlyName: meta.name,
            joinCode: generateJoinCode(),
            expiresAt: new Date(Date.now() + LOBBY_TTL_MS),
        });
        try {
            await candidate.save();
            invite = candidate;
        } catch (err: any) {
            // The partial unique index on joinCode throws this on a
            // collision — no coordination, no counter, just try again with a
            // fresh code (docs/account-less-play.md §4).
            if (err?.code !== 11000 || attempt >= MAX_JOIN_CODE_ATTEMPTS - 1) {
                throw err;
            }
        }
    }

    if (invitedUsers.length > 0) {
        await sendPushToUsers(invitedUsers, {
            event: "NewInvite",
            inviteId: invite.inviteId,
            link: homeNotificationLink()
        }, buildGameInviteNotification(readableName(thisUser), invite.gameFriendlyName), {
            channel: 'gameInvite'
        });
    }
    await sendPushToUsers([thisUser], {
        event: "NewInvite",
        inviteId: invite.inviteId,
    });

    return NextResponse.json({ success: true, inviteId: invite.inviteId, joinCode: invite.joinCode });
}
