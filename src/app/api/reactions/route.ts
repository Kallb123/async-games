import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { GameDataModel, IGameDataDocument } from '@/utils/mongodb/GameData';
import { ReactionModel, IReactionDataDocument } from '@/utils/mongodb/ReactionData';
import { userIdListToUserIdNameMap, buildUserDirectory } from '@/utils/users/clerk';
import { UNKNOWN_PLAYER_NAME } from '@/utils/ui/players';
import { buildAllEvents } from '@/utils/games/recap';
import { metaForGame } from '@/utils/ui/games';

const RECEIVED_REACTIONS_LIMIT = 5;

// One reaction someone else sent to the signed-in user, with enough context
// to render it without a follow-up request: who sent it, which game, a
// human-readable summary of the action it landed on (re-derived by replay —
// ReactionData only stores the eventId), and the reaction itself. The sender's
// name and picture are resolved live from Clerk (like match history), not read
// from the copy frozen onto the reaction when it was sent, so a player who
// later changes their username shows their current one here.
export interface IReceivedReaction {
    reactionId: string;
    gameId: string;
    gameUrl: string;
    gameName: string;
    actorUsername: string;
    actorImageUrl: string | null;
    reaction: string;
    timestamp: string;
    eventTitle: string | null;
    eventDetail: string | null;
}

export interface IReactionsResponse {
    success: boolean;
    reactions: IReceivedReaction[];
}

// Returns the signed-in user's most recent reactions received (from other
// players reacting to their actions), newest first.
export async function GET(request: NextRequest) {
    console.log(`GET ${request.nextUrl.pathname}`);

    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({}, { status: 400, statusText: "Not signed in" });
    }

    await dbConnect();

    const received: IReactionDataDocument[] = await ReactionModel
        .find({ recipientId: userId })
        .sort({ timestamp: -1 })
        .limit(RECEIVED_REACTIONS_LIMIT)
        .exec();

    const gameIds = Array.from(new Set(received.map((r) => r.gameId)));
    const games: IGameDataDocument[] = await GameDataModel.find({ gameId: { $in: gameIds } }).exec();
    const gameById = new Map<string, IGameDataDocument>(games.map((g) => [g.gameId, g]));

    // Each distinct game needs one replay to recover the title of the action a
    // reaction landed on (not stored on the reaction itself). Un-replayable or
    // deleted games degrade to a null title rather than failing the whole list.
    const eventTitlesByGame = new Map<string, Map<string, { title: string; detail?: string }>>();
    for (const gameId of gameIds) {
        const gameData = gameById.get(gameId);
        if (!gameData) continue;
        const userIdNameMap = await userIdListToUserIdNameMap(gameData.userIdList);
        const events = await buildAllEvents(gameData, userIdNameMap);
        eventTitlesByGame.set(gameId, new Map(events.map((e) => [e.id, { title: e.title, detail: e.detail }])));
    }

    // Name and picture of everyone who reacted, resolved live from Clerk in one
    // lookup — the sender's *current* name, not the copy frozen onto the reaction
    // when it was sent, so renaming yourself updates the reactions you've left
    // (the same way turn history resolves its `{{userId}}` tokens). The stored
    // actorUsername stays only as a fallback for a sender Clerk no longer knows
    // (e.g. a swept guest), which is better than "Unknown player".
    const actors = await buildUserDirectory(received.map((r) => r.actorId));

    const reactions: IReceivedReaction[] = received.map((r) => {
        const gameData = gameById.get(r.gameId);
        const meta = gameData
            ? metaForGame({ url: gameData.gameType.url, friendlyName: gameData.gameType.friendlyName })
            : undefined;
        const event = eventTitlesByGame.get(r.gameId)?.get(r.eventId);
        const liveName = actors.name(r.actorId);
        return {
            reactionId: r.reactionId,
            gameId: r.gameId,
            gameUrl: gameData?.gameType.url ?? "",
            gameName: meta?.name ?? gameData?.gameType.friendlyName ?? "a game",
            actorUsername: liveName === UNKNOWN_PLAYER_NAME ? r.actorUsername : liveName,
            actorImageUrl: actors.imageUrl(r.actorId),
            reaction: r.reaction,
            timestamp: r.timestamp,
            eventTitle: event?.title ?? null,
            eventDetail: event?.detail ?? null,
        };
    });

    return NextResponse.json({ success: true, reactions } satisfies IReactionsResponse);
}
