import { readJsonBody } from '@/utils/api/requestBody';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { IInvitationDataDocument, InvitationModel } from '@/utils/mongodb/InvitationData';
import { acceptSeat } from '@/utils/games/startGame';

export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);

  const authResponse = await auth();
  if (!authResponse.userId) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }

  const { inviteId } = await readJsonBody(request);

  await dbConnect();
  const inviteData: IInvitationDataDocument = await InvitationModel.findOne({inviteId}).exec();
  if (!inviteData) {
    return NextResponse.json({}, {status: 404, statusText: "Invite not found"});
  }

  // A solo invitation (Solitaire, Fires Out's and Realm Arena's solo modes)
  // has no seats, so acceptSeat's "has everyone accepted?" is true for anyone
  // who asks. Only its host may start it.
  if (inviteData.userIdList.length === 0 && inviteData.senderId !== authResponse.userId) {
    return NextResponse.json({}, {status: 403, statusText: "Not your invitation"});
  }

  const { gameStarted, gameId, gameUrl } = await acceptSeat(inviteData, authResponse.userId);

  return NextResponse.json({ success: true, gameStarted, gameId, gameUrl });
}
