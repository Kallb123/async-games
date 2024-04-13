import { auth, clerkClient } from '@clerk/nextjs'
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from "../../../../utils/mongodb/mongodb";
import { IInvitationDataDocument, InvitationModel, IInvitationResponse } from '@/utils/mongodb/InvitationData';
import { userIdListToUsernameList } from '@/utils/mongodb/GameData';

export async function GET(request: NextRequest) {
  console.log(`GET ${request.nextUrl.pathname}`);
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }

  await dbConnect();

  const inviteData: IInvitationDataDocument[] = await InvitationModel.find({senderId: userId});
  
  const inviteResponses: IInvitationResponse[] = [];
  for(const invite of inviteData) {
    const sender = (await clerkClient.users.getUser(invite.senderId)).username ?? "Unknown User";
    const userList = await userIdListToUsernameList(invite.userIdList.map(userIdAcceptance => userIdAcceptance.userId));
    inviteResponses.push({
      timestamp: invite.timestamp,
      inviteId: invite.inviteId,
      sender,
      userList
    });
  }

  return NextResponse.json({success: true, inviteList: inviteResponses});
}
