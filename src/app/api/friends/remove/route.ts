import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { FriendshipModel, IFriendshipDataDocument } from '@/utils/mongodb/FriendshipData';
import { sendPushToUsers } from '@/utils/firebase/pushNotification';

// Removes a friendship record: declines an incoming request, cancels an
// outgoing request, or unfriends an accepted friend.
export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }

  const { friendshipId } = await request.json();
  if (!friendshipId) {
    return NextResponse.json({}, {status: 400, statusText: "No friendshipId provided"});
  }

  await dbConnect();

  const friendship: IFriendshipDataDocument | null = await FriendshipModel.findOne({
    friendshipId,
    $or: [{requesterId: userId}, {recipientId: userId}]
  });
  if (!friendship) {
    return NextResponse.json({}, {status: 404, statusText: "Friendship not found"});
  }

  await FriendshipModel.deleteOne({ friendshipId }).exec();

  // Refresh the other party live so the removed friendship / request disappears
  // from their profile (covers decline, cancel, and unfriend) — silent push.
  const otherUserId = friendship.requesterId === userId ? friendship.recipientId : friendship.requesterId;
  const otherUser = await (await clerkClient()).users.getUser(otherUserId);
  await sendPushToUsers([otherUser], {
    event: "FriendRemoved",
    friendshipId
  });

  return NextResponse.json({success: true});
}
