import { sendPushToUsers } from '@/utils/firebase/pushNotification';
import { auth, clerkClient, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { DiceCitiesInvitationModel, DiceCitiesInvitationRequest } from '@/games/DiceCities/DiceCitiesModels';
import { IInvitationDataDocument } from '@/utils/mongodb/InvitationData';

export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);
  const diceCitiesInvitation: DiceCitiesInvitationRequest = await request.json();

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }
  const thisUser = await currentUser();
  if (!thisUser) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }

  const { data: userList } = await (await clerkClient()).users.getUserList({
    username: diceCitiesInvitation.userList
  });

  // Lookup failed for a user
  if (userList.length !== diceCitiesInvitation.userList.length) {
    return NextResponse.json({}, {status: 404, statusText: "User not found"});
  }

  if (userList.length === 0) {
    return NextResponse.json({}, {status: 404, statusText: "User not found"});
  }

  await dbConnect();

  // Create invite
  const invite: IInvitationDataDocument = new DiceCitiesInvitationModel({
    inviteId: randomUUID(),
    senderId: userId,
    userIdList: userList.map(user => {
      return {userId: user.id, inviteAccepted: false}
    }),
    enabledDocks: diceCitiesInvitation.enabledDocks,
    enabledBillionaireRow: diceCitiesInvitation.enabledBillionaireRow,
    turnTimer: diceCitiesInvitation.turnTimer,
    timestamp: (new Date()).toISOString(),
    gameType: 'DiceCities',
    gameFriendlyName: 'Dice Cities'
  });

  await invite.save();

  // Send notifications
  await sendPushToUsers(userList, {
    event: "NewInvite",
    inviteId: invite.inviteId,
  }, {
    title: "Game Invite",
    body: `${thisUser.username} has invited you to play Dice Cities!`,
    imageUrl: `https://async-games.vercel.app/art/dicecities/icon.png`
  });
  await sendPushToUsers([thisUser], {
    event: "NewInvite",
    inviteId: invite.inviteId,
  });

  return NextResponse.json({success: true});
}
