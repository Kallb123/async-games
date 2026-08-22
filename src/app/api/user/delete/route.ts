import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { GameDataModel } from '@/utils/mongodb/GameData';
import { GameResultModel } from '@/utils/mongodb/GameResultData';
import { IInvitationDataDocument, InvitationModel } from '@/utils/mongodb/InvitationData';
import { FriendshipModel } from '@/utils/mongodb/FriendshipData';
import { ReactionModel } from '@/utils/mongodb/ReactionData';
import { sendPushToUsers } from '@/utils/firebase/pushNotification';

// Deletes the signed-in player's account: everything of theirs in Mongo, then
// the Clerk user itself. Clerk holds the account details, the registered device
// tokens and the notification preferences in its private metadata, so deleting
// the user there takes all three with it.
//
// Games, invitations, results and reactions belong to more than one player, so
// the players left behind are told what went (silently — see the events below)
// and their screens re-fetch without the removed player's games and invites.
export async function POST(request: NextRequest) {
    console.log(`POST ${request.nextUrl.pathname}`);

    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ success: false, message: 'Not signed in' }, { status: 400 });
    }

    await dbConnect();

    // Games: a game without one of its players cannot be played on or replayed,
    // so both the live game and its recorded result go, for everyone in it.
    const games = await GameDataModel.find({ userIdList: userId }).exec();
    const gamePlayerIds = new Set(games.flatMap(game => game.userIdList));
    await GameDataModel.deleteMany({ userIdList: userId }).exec();
    await GameResultModel.deleteMany({ playerIds: userId }).exec();

    // Invitations: the ones they sent go whole; the ones they were invited to
    // just lose them, and only go too once nobody is left to accept.
    const invites: IInvitationDataDocument[] = await InvitationModel.find({
        $or: [{ senderId: userId }, { 'userIdList.userId': userId }]
    }).exec();
    const inviteeIds = new Set(invites.flatMap(invite => [
        invite.senderId,
        ...invite.userIdList.map(invitee => invitee.userId)
    ]));
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
    const friendships = await FriendshipModel.find({
        $or: [{ requesterId: userId }, { recipientId: userId }]
    }).exec();
    const friendIds = new Set(friendships.flatMap(friendship => [friendship.requesterId, friendship.recipientId]));
    await FriendshipModel.deleteMany({ $or: [{ requesterId: userId }, { recipientId: userId }] }).exec();
    await ReactionModel.deleteMany({ $or: [{ actorId: userId }, { recipientId: userId }] }).exec();

    await (await clerkClient()).users.deleteUser(userId);

    await notifyRemainingPlayers(userId, { gamePlayerIds, inviteeIds, friendIds });

    return NextResponse.json({ success: true });
}

// Clerk pages user lists at 10 by default and caps a page at 500. Anyone past
// that simply refreshes on their next load, as they would without push at all.
const CLERK_USER_PAGE_LIMIT = 500;

// Silent, data-only pushes so the other players' open screens re-fetch. There
// is no "account deleted" event to send: what each player needs is the refresh
// they already do when a game ends, an invite is cancelled or a friendship
// goes, so this reuses those three rather than teaching every list a new one.
async function notifyRemainingPlayers(
    deletedUserId: string,
    affected: { gamePlayerIds: Set<string>; inviteeIds: Set<string>; friendIds: Set<string> }
) {
    const everyone = new Set([...affected.gamePlayerIds, ...affected.inviteeIds, ...affected.friendIds]);
    everyone.delete(deletedUserId);
    if (!everyone.size) {
        return;
    }

    const { data: users } = await (await clerkClient()).users.getUserList({
        userId: [...everyone],
        limit: Math.min(everyone.size, CLERK_USER_PAGE_LIMIT)
    });

    await sendPushToUsers(users.filter(user => affected.gamePlayerIds.has(user.id)), { event: 'GameOver' });
    await sendPushToUsers(users.filter(user => affected.inviteeIds.has(user.id)), { event: 'InviteCancelled' });
    await sendPushToUsers(users.filter(user => affected.friendIds.has(user.id)), { event: 'FriendRemoved' });
}
