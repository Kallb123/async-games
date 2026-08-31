import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { GameDataModel } from '@/utils/mongodb/GameData';
import { GameResultModel } from '@/utils/mongodb/GameResultData';
import { IInvitationDataDocument, InvitationModel } from '@/utils/mongodb/InvitationData';
import { FriendshipModel } from '@/utils/mongodb/FriendshipData';
import { ReactionModel } from '@/utils/mongodb/ReactionData';
import { ChatMessageModel } from '@/utils/mongodb/ChatMessageData';

// Deletes the signed-in player's account: everything of theirs in Mongo, then
// the Clerk user itself. Clerk holds the account details, the registered device
// tokens and the notification preferences in its private metadata, so deleting
// the user there takes all three with it.
//
// Games, invitations, results, reactions and chat belong to more than one player, but
// the players left behind get no push about any of it: an account going is not
// worth interrupting them for, and there is no silent kind to send (see
// usePushEvents). Their lists drop the removed player on the next foreground.
export async function POST(request: NextRequest) {
    console.log(`POST ${request.nextUrl.pathname}`);

    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ success: false, message: 'Not signed in' }, { status: 400 });
    }

    await dbConnect();

    // Chat is keyed by game, not by user, so it can't ride along with the
    // per-user deletes below: read this player's game ids first, while the games
    // still exist, then take every message in those games — not just this
    // player's, so nobody's half of a conversation is orphaned in a collection
    // whose game is gone (docs/in-game-chat.md §3). There is no other path that
    // deletes a game today; if one is added it deletes chat too.
    //
    // The chat delete runs *before* the games, and that order is load-bearing.
    // Every other delete here is keyed by userId, so each is idempotent and a
    // failed request can be retried whole. This one depends on a prior read of a
    // collection it then deletes: if the games went first and Mongo failed
    // between the two deletes, the retry's re-read would find the games already
    // gone, return no ids, and leave every message in them orphaned for good.
    // Deleting chat first makes a partial failure recoverable — the retry
    // re-reads the still-present ids and the game delete runs again harmlessly.
    const playersGames = await GameDataModel.find({ userIdList: userId }, { gameId: 1 }).exec();
    const gameIds = playersGames.map(game => game.gameId);
    await ChatMessageModel.deleteMany({ gameId: { $in: gameIds } }).exec();

    // Games: a game without one of its players cannot be played on or replayed,
    // so both the live game and its recorded result go, for everyone in it.
    await GameDataModel.deleteMany({ userIdList: userId }).exec();
    await GameResultModel.deleteMany({ playerIds: userId }).exec();

    // Invitations: the ones they sent go whole; the ones they were invited to
    // just lose them, and only go too once nobody is left to accept.
    const invites: IInvitationDataDocument[] = await InvitationModel.find({
        $or: [{ senderId: userId }, { 'userIdList.userId': userId }]
    }).exec();
    const invitedToIds = invites
        .filter(invite => invite.senderId !== userId)
        .map(invite => invite.inviteId);
    await InvitationModel.deleteMany({ senderId: userId }).exec();
    await InvitationModel.updateMany(
        { 'userIdList.userId': userId },
        { $pull: { userIdList: { userId } } }
    ).exec();
    // Only the invites just emptied: a solo game's invite is legitimately
    // empty for the moment between being created and being accepted.
    await InvitationModel.deleteMany({ inviteId: { $in: invitedToIds }, userIdList: { $size: 0 } }).exec();

    // Friendships in either direction, and every reaction they left or received.
    await FriendshipModel.deleteMany({ $or: [{ requesterId: userId }, { recipientId: userId }] }).exec();
    await ReactionModel.deleteMany({ $or: [{ actorId: userId }, { recipientId: userId }] }).exec();

    await (await clerkClient()).users.deleteUser(userId);

    return NextResponse.json({ success: true });
}
