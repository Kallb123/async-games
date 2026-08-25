import { sendPushToUsers, homeNotificationLink } from '@/utils/firebase/pushNotification';
import { buildGameInviteNotification } from '@/utils/firebase/notificationContent';
import { readableName } from '@/utils/ui/players';
import { canHostGame } from '@/utils/users/clerk';
import { auth, clerkClient, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { SmartthinkInvitationModel, SmartthinkInvitationRequest } from '@/games/Smartthink/SmartthinkModels';
import { IInvitationDataDocument } from '@/utils/mongodb/InvitationData';

export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);
  const smartthinkInvitation: SmartthinkInvitationRequest = await request.json();

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }
  const thisUser = await currentUser();
  if (!thisUser) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }
  // Every lobby needs a real, registered host — see canHostGame's own
  // comment (docs/account-less-play.md §8).
  if (!canHostGame(thisUser)) {
    return NextResponse.json({}, {status: 403, statusText: "Account not unlocked"});
  }

  const { data: userList } = await (await clerkClient()).users.getUserList({
    username: smartthinkInvitation.userList
  });

  if (userList.length !== smartthinkInvitation.userList.length) {
    return NextResponse.json({}, {status: 404, statusText: "User not found"});
  }

  if (userList.length !== 1) {
    return NextResponse.json({}, {status: 400, statusText: "Smartthink requires exactly one opponent"});
  }

  await dbConnect();

  const invite: IInvitationDataDocument = new SmartthinkInvitationModel({
    inviteId: randomUUID(),
    senderId: userId,
    userIdList: userList.map(user => {
      return { userId: user.id, inviteAccepted: false };
    }),
    turnTimer: smartthinkInvitation.turnTimer,
    timestamp: (new Date()).toISOString(),
    gameType: 'Smartthink',
    gameFriendlyName: 'Smartthink'
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
