import { readJsonBody } from '@/utils/api/requestBody';
import { auth, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { GameDataModel, IGameDataDocument } from '@/utils/mongodb/GameData';
import { ReactionModel, IReactionDataDocument } from '@/utils/mongodb/ReactionData';
import { userIdListToUserIdNameMap, usersById } from '@/utils/users/clerk';
import { buildAllEvents, buildEventFeed } from '@/utils/games/recap';
import { sendPushToUsers, gameNotificationLink } from '@/utils/firebase/pushNotification';
import { buildReactionNotification } from '@/utils/firebase/notificationContent';
import { isValidReaction } from '@/utils/reactions';
import { isDuplicateKeyError } from '@/utils/mongodb/duplicateKey';
import { readableName, UNKNOWN_PLAYER_NAME } from '@/utils/ui/players';

export interface IGetReactionParams {
    gameid: string;
}

// Drops a reaction on one action, from either the signed-in player's "since
// you were last here" recap (`eventId`) or the always-visible match-history
// log (`commandId`) — a line in one is a line in the other, so both target
// the same underlying event and land in the same store. Either way the
// target is re-derived server-side (rather than trusted from the request):
// `eventId` is checked against the recap feed the client was actually shown,
// while `commandId` is looked up in the game's full, unwindowed event list
// (match history has no "since last here" window — any past line, on a
// finished game included, is fair game). Both paths mean the recipient (the
// action's original actor) can't be spoofed.
//
// Each player gets their own reaction per action — one reacting first doesn't
// use up the others' turn to react — so "already reacted" is scoped to the
// signed-in player, not the action as a whole.
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

    const { eventId, commandId, reaction } = await readJsonBody(request);
    if ((!eventId || typeof eventId !== 'string') && (!commandId || typeof commandId !== 'string')) {
        return NextResponse.json({}, { status: 400, statusText: "Missing eventId or commandId" });
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

    const event = eventId && typeof eventId === 'string'
        ? (await buildEventFeed(gameData, userIdNameMap, userId)).events.find((e) => e.id === eventId)
        : (await buildAllEvents(gameData, userIdNameMap)).find((e) => e.commandId === commandId);
    if (!event) {
        return NextResponse.json({}, { status: 404, statusText: "Action not found" });
    }

    const existing = await ReactionModel.findOne({ gameId: gameid, eventId: event.id, actorId: userId });
    if (existing) {
        return NextResponse.json({}, { status: 409, statusText: "Already reacted to this action" });
    }

    const reactionDoc: IReactionDataDocument = new ReactionModel({
        reactionId: randomUUID(),
        gameId: gameid,
        eventId: event.id,
        commandId: event.commandId,
        actorId: userId,
        // The name is frozen onto the reaction here — it is pushed to the
        // player reacted to and rendered back on their profile — so it is
        // taken from the map naming this game's players rather than resolved
        // again on its own. Spelled out inline, it had no guest branch, and a
        // guest reacting was stored and pushed as their random account
        // username; resolved one user at a time, it would be the one name in
        // the feed missing the handle that tells two Daves apart.
        // The map names every id it was given, so a miss comes back as the
        // "Clerk didn't know them" placeholder rather than as undefined — and
        // freezing *that* onto a stored reaction, when currentUser() is right
        // here holding the answer, is the one case worth resolving alone.
        actorUsername: userIdNameMap[userId] === UNKNOWN_PLAYER_NAME
            ? readableName(thisUser, userId)
            : userIdNameMap[userId],
        recipientId: event.actorId,
        reaction,
        timestamp: (new Date()).toISOString()
    });
    try {
        await reactionDoc.save();
    } catch (err) {
        // Two taps from the same player landed together and both got past the
        // lookup above; the unique { gameId, eventId, actorId } index caught
        // the second. One reaction per player per action either way, so this
        // is the same answer the lookup gives.
        if (!isDuplicateKeyError(err)) {
            throw err;
        }
        return NextResponse.json({}, { status: 409, statusText: "Already reacted to this action" });
    }

    // Match history makes a player's own past moves reachable to react to
    // (recap never did — it only ever showed events since the viewer's last
    // turn, which excludes their own), so this can now be a self-reaction.
    // Nobody needs a push telling them they reacted to themselves.
    if (event.actorId !== userId) {
        const userList = await usersById([event.actorId]);
        const recipient = userList.find(u => u.id === event.actorId);
        if (recipient) {
            await sendPushToUsers([recipient], {
                event: 'PlayerReaction',
                gameId: gameid,
                eventId: event.id,
                link: gameNotificationLink(gameData.gameType.url, gameid)
            }, buildReactionNotification(reactionDoc.actorUsername, reaction, event.title), {
                channel: 'playerReaction'
            });
        }
    }

    return NextResponse.json({ success: true, reaction });
}
