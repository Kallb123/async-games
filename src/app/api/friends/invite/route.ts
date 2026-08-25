import { auth, clerkClient, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { FriendshipModel, IFriendshipDataDocument } from '@/utils/mongodb/FriendshipData';
import { sendPushToUsers, profileNotificationLink } from '@/utils/firebase/pushNotification';
import { buildFriendInviteNotification } from '@/utils/firebase/notificationContent';
import { readableName } from '@/utils/ui/players';
import { isDuplicateKeyError } from '@/utils/mongodb/duplicateKey';

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
  try {
    await friendship.save();
  } catch (err) {
    // The two of them asked each other at the same moment, so both requests
    // got past the lookup above and the unique index on the pair caught this
    // one (see FriendshipSchema). The other request's invite is the real one —
    // same answer as if this request had simply been the slower of the two.
    if (!isDuplicateKeyError(err)) {
      throw err;
    }
    return NextResponse.json({}, {status: 409, statusText: "A friend request already exists with this user"});
  }

  await sendPushToUsers([recipient], {
    event: "FriendInvite",
    friendshipId: friendship.friendshipId,
    link: profileNotificationLink()
  }, buildFriendInviteNotification(readableName(thisUser)), {
    channel: 'friendInvite'
  });

  return NextResponse.json({success: true, username: recipient.username});
}
