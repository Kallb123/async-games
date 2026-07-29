import { sendPushToUsers, homeNotificationLink } from '@/utils/firebase/pushNotification';
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
  }, {
    title: "Game Invite",
    body: `${thisUser.username} has invited you to play Smartthink!`,
    imageUrl: `https://async-games.vercel.app/art/smartthink/icon.png`
  }, {
    channel: 'gameInvite'
  });
  await sendPushToUsers([thisUser], {
    event: "NewInvite",
    inviteId: invite.inviteId,
  });

  return NextResponse.json({ success: true });
}
