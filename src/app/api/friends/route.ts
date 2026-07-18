import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { FriendshipModel, IFriendshipDataDocument, IFriendRequestResponse, IFriendsResponse, IFriendUser } from '@/utils/mongodb/FriendshipData';

export async function GET(request: NextRequest) {
  console.log(`GET ${request.nextUrl.pathname}`);

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }

  await dbConnect();

  const friendships: IFriendshipDataDocument[] = await FriendshipModel.find({
    $or: [{requesterId: userId}, {recipientId: userId}]
  });

  const otherUserIds = friendships.map(friendship =>
    friendship.requesterId === userId ? friendship.recipientId : friendship.requesterId
  );

  const userMap: Map<string, IFriendUser> = new Map;
  if (otherUserIds.length) {
    const { data: users } = await (await clerkClient()).users.getUserList({userId: otherUserIds, limit: 500});
    users.forEach(user => {
      userMap.set(user.id, {
        userId: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName
      });
    });
  }

  const friendsResponse: IFriendsResponse = {
    friends: [],
    incomingRequests: [],
    outgoingRequests: []
  };

  for (const friendship of friendships) {
    const otherUserId = friendship.requesterId === userId ? friendship.recipientId : friendship.requesterId;
    const user = userMap.get(otherUserId);
    if (!user) {
      continue;
    }
    const requestResponse: IFriendRequestResponse = {
      friendshipId: friendship.friendshipId,
      user,
      timestamp: friendship.timestamp
    };
    if (friendship.accepted) {
      friendsResponse.friends.push(requestResponse);
    } else if (friendship.recipientId === userId) {
      friendsResponse.incomingRequests.push(requestResponse);
    } else {
      friendsResponse.outgoingRequests.push(requestResponse);
    }
  }

  return NextResponse.json({success: true, ...friendsResponse});
}
