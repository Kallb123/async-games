import { readJsonBody } from '@/utils/api/requestBody';
import { auth, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { GameDataModel, IGameDataDocument } from '@/utils/mongodb/GameData';
import { ReactionModel, IReactionDataDocument } from '@/utils/mongodb/ReactionData';
import { userIdListToUserIdNameMap, usersById } from '@/utils/users/clerk';
import { buildEventFeed } from '@/utils/games/recap';
import { sendPushToUsers, gameNotificationLink } from '@/utils/firebase/pushNotification';
import { buildReactionNotification } from '@/utils/firebase/notificationContent';
import { isValidReaction } from '@/utils/reactions';
import { isDuplicateKeyError } from '@/utils/mongodb/duplicateKey';

export interface IGetReactionParams {
    gameid: string;
}

// Drops a reaction on one action from the signed-in player's "since you were
// last here" recap. The target is re-derived server-side from the same
// recap feed the client was shown (rather than trusted from the request) so
// the reaction can only land on an action the viewer was actually shown, and
// so the recipient (the action's original actor) can't be spoofed.
export async function POST(request: NextRequest, { params }: { params: Promise<IGetReactionParams> }) {
    console.log(`POST ${request.nextUrl.pathname}`);

    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({}, { status: 400, statusText: "Not signed in" });
    }
    const thisUser = await currentUser();
    if (!thisUser) {
        return NextResponse.json({}, { status: 400, statusText: "Not signed in" });
    }

    const { eventId, reaction } = await readJsonBody(request);
    if (!eventId || typeof eventId !== 'string') {
        return NextResponse.json({}, { status: 400, statusText: "Missing eventId" });
    }
    if (!reaction || typeof reaction !== 'string' || !isValidReaction(reaction)) {
        return NextResponse.json({}, { status: 400, statusText: "Invalid reaction" });
    }

    await dbConnect();

    const { gameid } = await params;
    const gameData: IGameDataDocument = await GameDataModel.findOne({ gameId: gameid }).exec();
    if (!gameData) {
        return NextResponse.json({}, { status: 404, statusText: "Game not found" });
    }

    if (!gameData.userIdList.includes(userId)) {
        return NextResponse.json({}, { status: 403, statusText: "Not a player in this game" });
    }

    const userIdNameMap = await userIdListToUserIdNameMap(gameData.userIdList);

    const feed = await buildEventFeed(gameData, userIdNameMap, userId);
    const event = feed.events.find((e) => e.id === eventId);
    if (!event) {
        return NextResponse.json({}, { status: 404, statusText: "Action not found" });
    }

    const existing = await ReactionModel.findOne({ gameId: gameid, eventId });
    if (existing) {
        return NextResponse.json({}, { status: 409, statusText: "Already reacted to this action" });
    }

    const reactionDoc: IReactionDataDocument = new ReactionModel({
        reactionId: randomUUID(),
        gameId: gameid,
        eventId,
        commandId: event.commandId,
        actorId: userId,
        actorUsername: thisUser.username || thisUser.firstName || userId,
        recipientId: event.actorId,
        reaction,
        timestamp: (new Date()).toISOString()
    });
    try {
        await reactionDoc.save();
    } catch (err) {
        // Two taps landed together and both got past the lookup above; the
        // unique { gameId, eventId } index caught the second. One reaction per
        // action either way, so this is the same answer the lookup gives.
        if (!isDuplicateKeyError(err)) {
            throw err;
        }
        return NextResponse.json({}, { status: 409, statusText: "Already reacted to this action" });
    }

    const userList = await usersById([event.actorId]);
    const recipient = userList.find(u => u.id === event.actorId);
    if (recipient) {
        await sendPushToUsers([recipient], {
            event: 'PlayerReaction',
            gameId: gameid,
            eventId,
            link: gameNotificationLink(gameData.gameType.url, gameid)
        }, buildReactionNotification(reactionDoc.actorUsername, reaction, event.title), {
            channel: 'playerReaction'
        });
    }

    return NextResponse.json({ success: true, reaction });
}
