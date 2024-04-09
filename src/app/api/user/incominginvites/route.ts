import { auth, clerkClient } from '@clerk/nextjs'
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from "../../../../utils/mongodb/mongodb";
import { IInvitationDataDocument, InvitationModel, InvitationResponse } from '@/utils/mongodb/InvitationData';

export async function GET(request: NextRequest) {
  console.log(`GET ${request.nextUrl.pathname}`);

  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }

  await dbConnect();

  const inviteData: IInvitationDataDocument[] = await InvitationModel.find({"userIdList.userId": userId});

  const inviteResponses: InvitationResponse[] = [];
  for(const invite of inviteData) {
    const sender = (await clerkClient.users.getUser(invite.senderId)).username ?? "Unknown User";
    const users = await clerkClient.users.getUserList({userId: invite.userIdList.map(userIdAcceptance => userIdAcceptance.userId)});
    const userList = users.map(user => user.username ?? "Unknown User");
    inviteResponses.push({
      timestamp: invite.timestamp,
      inviteId: invite.inviteId,
      sender,
      userList
    });
  }

  return NextResponse.json({success: true, inviteList: inviteResponses});
}
