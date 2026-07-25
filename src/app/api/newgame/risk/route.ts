import { sendPushToUsers } from '@/utils/firebase/pushNotification';
import { auth, clerkClient, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { RiskInvitationModel, RiskInvitationRequest } from '@/games/Risk/RiskModels';
import { IInvitationDataDocument } from '@/utils/mongodb/InvitationData';

export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);
  const riskInvitation: RiskInvitationRequest = await request.json();

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({}, { status: 400, statusText: "Not signed in" });
  }
  const thisUser = await currentUser();
  if (!thisUser) {
    return NextResponse.json({}, { status: 400, statusText: "Not signed in" });
  }

  const { data: userList } = await (await clerkClient()).users.getUserList({
    username: riskInvitation.userList
  });

  if (userList.length !== riskInvitation.userList.length) {
    return NextResponse.json({}, { status: 404, statusText: "User not found" });
  }

  if (userList.length === 0) {
    return NextResponse.json({}, { status: 404, statusText: "User not found" });
  }

  // Risk supports 2-6 players (docs/games/risk.md §1); the sender is always a
  // player, so the party size is invitees + 1.
  const playerCount = userList.length + 1;
  if (playerCount > 6) {
    return NextResponse.json({}, { status: 400, statusText: "Risk supports at most 6 players" });
  }

  await dbConnect();

  const invite: IInvitationDataDocument = new RiskInvitationModel({
    inviteId: randomUUID(),
    senderId: userId,
    userIdList: userList.map(user => {
      return { userId: user.id, inviteAccepted: false };
    }),
    turnTimer: riskInvitation.turnTimer,
    timestamp: (new Date()).toISOString(),
    gameType: 'Risk',
    gameFriendlyName: 'Risk'
  });

  await invite.save();

  await sendPushToUsers(userList, {
    event: "NewInvite",
    inviteId: invite.inviteId,
  }, {
    title: "Game Invite",
    body: `${thisUser.username} has invited you to play Risk!`,
  }, {
    channel: 'gameInvite'
  });
  await sendPushToUsers([thisUser], {
    event: "NewInvite",
    inviteId: invite.inviteId,
  });

  return NextResponse.json({ success: true });
}
