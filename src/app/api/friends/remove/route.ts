import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { FriendshipModel } from '@/utils/mongodb/FriendshipData';

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

  const result = await FriendshipModel.deleteOne({
    friendshipId,
    $or: [{requesterId: userId}, {recipientId: userId}]
  });
  if (result.deletedCount === 0) {
    return NextResponse.json({}, {status: 404, statusText: "Friendship not found"});
  }

  return NextResponse.json({success: true});
}
