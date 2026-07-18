import { sendPushToUsers } from '@/utils/firebase/pushNotification';
import { auth, clerkClient, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { SettlementsAndCitiesInvitationModel, SettlementsAndCitiesInvitationRequest } from '@/games/SettlementsAndCities/SettlementsAndCitiesModels';
import { IInvitationDataDocument } from '@/utils/mongodb/InvitationData';

export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);
  const sacInvitation: SettlementsAndCitiesInvitationRequest = await request.json();

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({}, { status: 400, statusText: 'Not signed in' });
  }
  const thisUser = await currentUser();
  if (!thisUser) {
    return NextResponse.json({}, { status: 400, statusText: 'Not signed in' });
  }

  const { data: userList } = await (await clerkClient()).users.getUserList({
    username: sacInvitation.userList,
  });

  if (userList.length !== sacInvitation.userList.length) {
    return NextResponse.json({}, { status: 404, statusText: 'User not found' });
  }

  if (userList.length === 0) {
    return NextResponse.json({}, { status: 404, statusText: 'User not found' });
  }

  await dbConnect();

  const invite: IInvitationDataDocument = new SettlementsAndCitiesInvitationModel({
    inviteId: randomUUID(),
    senderId: userId,
    userIdList: userList.map(user => ({ userId: user.id, inviteAccepted: false })),
    turnTimer: sacInvitation.turnTimer,
    timestamp: new Date().toISOString(),
    gameType: 'SettlementsAndCities',
    gameFriendlyName: 'Settlements and Cities',
  });

  await invite.save();

  await sendPushToUsers(userList, {
    event: 'NewInvite',
    inviteId: invite.inviteId,
  }, {
    title: 'Game Invite',
    body: `${thisUser.username} has invited you to play Settlements and Cities!`,
  });
  await sendPushToUsers([thisUser], {
    event: 'NewInvite',
    inviteId: invite.inviteId,
  });

  return NextResponse.json({ success: true });
}
