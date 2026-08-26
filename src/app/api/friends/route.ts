import { auth } from '@clerk/nextjs/server';
import { toUserDto, usersById } from '@/utils/users/clerk';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { FriendshipModel, IFriendshipDataDocument, IFriendRequestResponse, IFriendsResponse, IFriendUser } from '@/utils/mongodb/FriendshipData';
import { GameDataModel } from '@/utils/mongodb/GameData';
import { profileImageUrl } from '@/utils/ui/avatar';

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

  // Each friend's "last action" is the most recent command they authored across
  // any of their games. commandHistory timestamps are ISO 8601 strings, so a
  // lexicographic $max sorts them chronologically.
  const lastActionByUserId: Map<string, string> = new Map;
  if (otherUserIds.length) {
    const lastActions: { _id: string, lastActionTimestamp: string }[] = await GameDataModel.aggregate([
      { $match: { userIdList: { $in: otherUserIds } } },
      { $unwind: '$gameState.commandHistory' },
      { $match: { 'gameState.commandHistory.senderId': { $in: otherUserIds } } },
      { $group: {
        _id: '$gameState.commandHistory.senderId',
        lastActionTimestamp: { $max: '$gameState.commandHistory.timestamp' }
      } }
    ]);
    lastActions.forEach(({ _id, lastActionTimestamp }) => lastActionByUserId.set(_id, lastActionTimestamp));
  }

  const userMap: Map<string, IFriendUser> = new Map;
  if (otherUserIds.length) {
    const users = await usersById(otherUserIds);
    users.forEach(user => {
      userMap.set(user.id, {
        ...toUserDto(user),
        lastActionTimestamp: lastActionByUserId.get(user.id) ?? null
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
