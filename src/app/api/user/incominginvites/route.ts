import { auth, clerkClient } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from "../../../../utils/mongodb/mongodb";
import { IInvitationDataDocument, InvitationModel, IInvitationResponse } from '@/utils/mongodb/InvitationData';
import { userIdListToUsernameList } from '@/utils/users/clerk';
import { profileImageUrl } from '@/utils/ui/avatar';

export async function GET(request: NextRequest) {
  console.log(`GET ${request.nextUrl.pathname}`);

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }

  await dbConnect();

  const inviteData: IInvitationDataDocument[] = await InvitationModel.find({"userIdList.userId": userId});

  const inviteResponses: IInvitationResponse[] = [];
  for(const invite of inviteData) {
    const senderUser = await (await clerkClient()).users.getUser(invite.senderId);
    const userList = await userIdListToUsernameList(invite.userIdList.map(userIdAcceptance => userIdAcceptance.userId));
    inviteResponses.push({
      timestamp: invite.timestamp,
      inviteId: invite.inviteId,
      sender: senderUser.username ?? "Unknown User",
      senderImageUrl: profileImageUrl(senderUser),
      userList,
      gameFriendlyName: invite.gameFriendlyName
    });
  }

  return NextResponse.json({success: true, inviteList: inviteResponses});
}
