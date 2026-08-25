import { readJsonBody } from '@/utils/api/requestBody';
import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { FriendshipModel, IFriendshipDataDocument } from '@/utils/mongodb/FriendshipData';

// Removes a friendship record: declines an incoming request, cancels an
// outgoing request, or unfriends an accepted friend.
export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }

  const { friendshipId } = await readJsonBody(request);
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

  // No push: being declined, cancelled on or unfriended is not worth
  // notifying anyone about, and there is no silent kind to send (see
  // usePushEvents). Their profile picks it up on its next foreground.

  return NextResponse.json({success: true});
}
