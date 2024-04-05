import { auth, clerkClient } from '@clerk/nextjs'
import { NextRequest, NextResponse } from 'next/server';
import clientPromise from "../../../../utils/mongodb/mongodb";
import { InvitationData, InvitationResponse } from '@/utils/mongodb/InvitationData';

export async function GET(request: NextRequest) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }

  const dbClient = await clientPromise;
  const db = dbClient.db("async-games");

  // @ts-ignore
  const inviteData: InvitationData[] = await db.collection("gameInvites").find({"userIdList.userId": userId}).toArray();

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
