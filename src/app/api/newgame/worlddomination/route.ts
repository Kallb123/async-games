import { sendPushToUsers, homeNotificationLink } from '@/utils/firebase/pushNotification';
import { buildGameInviteNotification } from '@/utils/firebase/notificationContent';
import { readableName } from '@/utils/ui/players';
import { canHostGame } from '@/utils/users/clerk';
import { auth, clerkClient, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { WorldDominationInvitationModel, WorldDominationInvitationRequest } from '@/games/WorldDomination/WorldDominationModels';
import { IInvitationDataDocument } from '@/utils/mongodb/InvitationData';

export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);
  const worldDominationInvitation: WorldDominationInvitationRequest = await request.json();

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({}, { status: 400, statusText: "Not signed in" });
  }
  const thisUser = await currentUser();
  if (!thisUser) {
    return NextResponse.json({}, { status: 400, statusText: "Not signed in" });
  }
  // Every lobby needs a real, registered host — see canHostGame's own
  // comment (docs/account-less-play.md §8).
  if (!canHostGame(thisUser)) {
    return NextResponse.json({}, { status: 403, statusText: "Account not unlocked" });
  }

  const { data: userList } = await (await clerkClient()).users.getUserList({
    username: worldDominationInvitation.userList
  });

  if (userList.length !== worldDominationInvitation.userList.length) {
    return NextResponse.json({}, { status: 404, statusText: "User not found" });
  }

  if (userList.length === 0) {
    return NextResponse.json({}, { status: 404, statusText: "User not found" });
  }

  // World Domination supports 2-6 players (docs/games/worlddomination.md §1); the sender is always a
  // player, so the party size is invitees + 1.
  const playerCount = userList.length + 1;
  if (playerCount > 6) {
    return NextResponse.json({}, { status: 400, statusText: "World Domination supports at most 6 players" });
  }

  await dbConnect();

  const invite: IInvitationDataDocument = new WorldDominationInvitationModel({
    inviteId: randomUUID(),
    senderId: userId,
    userIdList: userList.map(user => {
      return { userId: user.id, inviteAccepted: false };
    }),
    turnTimer: worldDominationInvitation.turnTimer,
    timestamp: (new Date()).toISOString(),
    gameType: 'WorldDomination',
    gameFriendlyName: 'World Domination'
  });

  await invite.save();

  await sendPushToUsers(userList, {
    event: "NewInvite",
    inviteId: invite.inviteId,
    link: homeNotificationLink()
  }, buildGameInviteNotification(readableName(thisUser), invite.gameFriendlyName), {
    channel: 'gameInvite'
  });

  return NextResponse.json({ success: true });
}
