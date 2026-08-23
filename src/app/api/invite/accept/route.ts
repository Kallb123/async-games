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

  const { inviteId } = await request.json();

  await dbConnect();
  const inviteData: IInvitationDataDocument = await InvitationModel.findOne({inviteId}).exec();
  if (!inviteData) {
    return NextResponse.json({}, {status: 404, statusText: "Invite not found"});
  }

  const { gameStarted, gameId, gameUrl } = await acceptSeat(inviteData, authResponse.userId);

  return NextResponse.json({ success: true, gameStarted, gameId, gameUrl });
}
