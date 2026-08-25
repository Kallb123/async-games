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

  // The other party is not pushed. Being declined, cancelled on or unfriended
  // is not something to buzz someone's phone about, and the data-only push that
  // used to refresh their profile silently is what gets a push subscription
  // revoked on iOS — their profile re-fetches on its next foreground instead.

  return NextResponse.json({success: true});
}
