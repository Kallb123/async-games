import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from "../../../../utils/mongodb/mongodb";
import { IInvitationDataDocument, InvitationModel, IInvitationResponse } from '@/utils/mongodb/InvitationData';
import { invitationToResponse } from '@/utils/games/invitationResponse';

export async function GET(request: NextRequest) {
  console.log(`GET ${request.nextUrl.pathname}`);
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }

  await dbConnect();

  const inviteData: IInvitationDataDocument[] = await InvitationModel.find({senderId: userId});

  const inviteResponses: IInvitationResponse[] = [];
  for(const invite of inviteData) {
    inviteResponses.push(await invitationToResponse(invite));
  }

  return NextResponse.json({success: true, inviteList: inviteResponses});
}
