import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { GameDataModel } from '@/utils/mongodb/GameData';
import { GameResultModel } from '@/utils/mongodb/GameResultData';
import { IInvitationDataDocument, InvitationModel } from '@/utils/mongodb/InvitationData';
import { FriendshipModel } from '@/utils/mongodb/FriendshipData';
import { ReactionModel } from '@/utils/mongodb/ReactionData';

// Deletes the signed-in player's account: everything of theirs in Mongo, then
// the Clerk user itself. Clerk holds the account details, the registered device
// tokens and the notification preferences in its private metadata, so deleting
// the user there takes all three with it.
//
// Games, invitations, results and reactions belong to more than one player. The
// players left behind are not pushed about any of it: an account going is not
// worth interrupting them for, and the data-only pushes that used to refresh
// their screens silently are exactly what costs an iOS player their push
// subscription. Their lists drop the removed player on the next foreground
// (see useRefreshableData).
export async function POST(request: NextRequest) {
    console.log(`POST ${request.nextUrl.pathname}`);

    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ success: false, message: 'Not signed in' }, { status: 400 });
    }

    await dbConnect();

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
