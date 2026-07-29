import { auth, clerkClient, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { FriendshipModel, IFriendshipDataDocument } from '@/utils/mongodb/FriendshipData';
import { sendPushToUsers, profileNotificationLink } from '@/utils/firebase/pushNotification';

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

  const { friendshipId } = await request.json();
  if (!friendshipId) {
    return NextResponse.json({}, {status: 400, statusText: "No friendshipId provided"});
  }

  await dbConnect();

  const friendship: IFriendshipDataDocument | null = await FriendshipModel.findOne({
    friendshipId,
    recipientId: userId,
    accepted: false
  });
  if (!friendship) {
    return NextResponse.json({}, {status: 404, statusText: "Friend request not found"});
  }

  friendship.accepted = true;
  await friendship.save();

  const requester = await (await clerkClient()).users.getUser(friendship.requesterId);
  await sendPushToUsers([requester], {
    event: "FriendAccepted",
    friendshipId: friendship.friendshipId,
    link: profileNotificationLink()
  }, {
    title: "Friend Request Accepted",
    body: `${thisUser.username} accepted your friend request!`
  }, {
    channel: 'friendInvite'
  });

  return NextResponse.json({success: true});
}
