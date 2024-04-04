import { auth } from '@clerk/nextjs'
import { NextRequest, NextResponse } from 'next/server';
import clientPromise from "../../../../utils/mongodb/mongodb";

export async function GET(request: NextRequest) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }

  const dbClient = await clientPromise;
  const db = dbClient.db("async-games");
  const inviteResponse = await db.collection("gameInvites").find({"userIdList.userId": userId}).toArray();
  return NextResponse.json({success: true, inviteList: inviteResponse});
}
