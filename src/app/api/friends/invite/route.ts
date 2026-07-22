import { auth, clerkClient, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { FriendshipModel, IFriendshipDataDocument } from '@/utils/mongodb/FriendshipData';
import { sendPushToUsers } from '@/utils/firebase/pushNotification';

export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }
  const thisUser = await currentUser();
  if (!thisUser) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }

  const { username } = await request.json();
  if (!username || typeof username !== 'string') {
    return NextResponse.json({}, {status: 400, statusText: "No username provided"});
  }

  const { data: users } = await (await clerkClient()).users.getUserList({username: [username]});
  const recipient = users.find(user => user.username?.toLowerCase() === username.toLowerCase());
  if (!recipient) {
    return NextResponse.json({}, {status: 404, statusText: "User not found"});
  }

  if (recipient.id === userId) {
    return NextResponse.json({}, {status: 400, statusText: "You cannot add yourself as a friend"});
  }

  await dbConnect();

  const existing = await FriendshipModel.findOne({
    $or: [
      {requesterId: userId, recipientId: recipient.id},
      {requesterId: recipient.id, recipientId: userId}
    ]
  });
  if (existing) {
    const statusText = existing.accepted ? "You are already friends with this user" : "A friend request already exists with this user";
    return NextResponse.json({}, {status: 409, statusText});
  }

  const friendship: IFriendshipDataDocument = new FriendshipModel({
    friendshipId: randomUUID(),
    requesterId: userId,
    recipientId: recipient.id,
    accepted: false,
    timestamp: (new Date()).toISOString()
  });
  await friendship.save();

  await sendPushToUsers([recipient], {
    event: "FriendInvite",
    friendshipId: friendship.friendshipId
  }, {
    title: "Friend Request",
    body: `${thisUser.username} sent you a friend request!`
  }, {
    channel: 'friendInvite'
  });

  return NextResponse.json({success: true, username: recipient.username});
}
