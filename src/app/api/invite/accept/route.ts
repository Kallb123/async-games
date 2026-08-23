import { sendPushToUsers } from '@/utils/firebase/pushNotification';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { IInvitationDataDocument, InvitationModel } from '@/utils/mongodb/InvitationData';
import { startGameFromInvitation } from '@/utils/games/startGame';

export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);

  const authResponse = await auth();
  if (!authResponse.userId) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }
  
  const { inviteId } = await request.json();

  await dbConnect();
  const inviteData: IInvitationDataDocument = await InvitationModel.findOne({inviteId}).exec();
  if (!inviteData) {
    return NextResponse.json({}, {status: 404, statusText: "Invite not found"});
  }

  const acceptance = inviteData.userIdList.find((uil) => uil.userId === authResponse.userId);
  if (acceptance) {
    acceptance.inviteAccepted = true;
  }

  const userIdList = inviteData.userIdList.map(uid => uid.userId);
  // Notify every invitee *and* the original sender: the sender's outgoing-invite
  // list / home dashboard needs to react live when their invite is accepted and
  // when the game finally starts.
  const { data: userList } = await (await clerkClient()).users.getUserList({
    userId: [...userIdList, inviteData.senderId]
  });

  // If not everyone has accepted
  const allAccepted = inviteData.userIdList.every((uil) => uil.inviteAccepted === true);
  if (!allAccepted) {
    await inviteData.save();
  }

  await sendPushToUsers(userList, {
    event: 'InviteAccepted',
    inviteId: inviteId
  });

  if (!allAccepted) {
    return NextResponse.json({success: true, gameStarted: false});
  }

  const gameData = await startGameFromInvitation(inviteData, authResponse.userId, userList);

  return NextResponse.json({success: true, gameStarted: true, gameId: gameData.gameId, gameUrl: gameData.gameType.url});
}
