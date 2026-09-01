import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { GameDataModel, IGameDataDocument } from '@/utils/mongodb/GameData';
import { ReactionModel } from '@/utils/mongodb/ReactionData';
import { ChatMessageModel } from '@/utils/mongodb/ChatMessageData';
import { ChatReadModel, IChatReadDataDocument } from '@/utils/mongodb/ChatReadData';
import { userIdListToUserIdNameMap } from '@/utils/users/clerk';
import { buildEventFeed, IGameEvent } from '@/utils/games/recap';
import { metaForGame } from '@/utils/ui/games';
import { playerColour } from '@/utils/ui/playerColours';

export interface IGetRecapParams {
    gameid: string;
}

// One recap row as sent to the client: the game-agnostic event plus the actor's
// player colour (for the timeline dot), a pre-formatted "affects you" flag,
// and the reaction already dropped on it (there's only ever one — the viewer's).
export interface IRecapEventResponse extends IGameEvent {
    dotColour: string;
    affectsMe: boolean;
    reaction: string | null;
}

export interface IRecapResponse {
    success: boolean;
    hasRecap: boolean;
    header?: { name: string; url: string; accent: string; glyph?: string };
    summary?: { headline: string; subline: string };
    events?: IRecapEventResponse[];
    tip?: { glyph: string; text: string } | null;
    // Messages from other players since the viewer's chat read marker — a
    // single "who spoke while you were away" line above the timeline, not a
    // second event feed. Chat has no command and is never replayed
    // (docs/since-you-were-last-here.md §3, docs/in-game-chat.md §8), so it
    // stays a field of its own rather than becoming an IGameEvent. Omitted
    // when there is nothing unread.
    chat?: { count: number; senders: string[] };
}

// The recap's "💬 N messages from X" line: messages from other players newer
// than the viewer's own ChatReadData marker (no marker means nothing has been
// read yet, so every message from somebody else counts — the same first-time
// signal the dashboard badge and the board's own dot give, docs/in-game-chat.md
// §13.5). Resolves no names of its own — senders are looked up in the
// userIdNameMap the route already built for the roster (§5's rule for the
// thread applies here too). A failure only decorates the recap, so it's
// swallowed to "nothing to report" the way dashboard.ts's unreadChatCounts is.
async function unreadChatSince(
    gameId: string,
    userId: string,
    userIdNameMap: { [key: string]: string },
): Promise<{ count: number; senders: string[] } | undefined> {
    try {
        const marker = await ChatReadModel.findOne({ gameId, userId }).exec() as IChatReadDataDocument | null;
        const filter = {
            gameId,
            senderId: { $ne: userId },
            ...(marker?.readAt ? { timestamp: { $gt: marker.readAt } } : {}),
        };
        const [count, senderIds] = await Promise.all([
            ChatMessageModel.countDocuments(filter),
            ChatMessageModel.distinct('senderId', filter) as Promise<string[]>,
        ]);
        return count > 0 ? { count, senders: senderIds.map((id) => userIdNameMap[id] ?? id) } : undefined;
    } catch (error) {
        console.error(`Failed to read unread chat for game ${gameId}`, error);
        return undefined;
    }
}

// Returns the "since you were last here" recap for the signed-in player: the
// turns that happened since their last move, a summary line, and an optional
// tip. hasRecap is false (with no payload) when there's nothing to show or the
// game has no recap support (e.g. Smartthink).
export async function GET(request: NextRequest, { params }: { params: Promise<IGetRecapParams> }) {
    console.log(`GET ${request.nextUrl.pathname}`);

    const { userId } = await auth();
    if (!userId) {
        // 401 (not 400) so the client can tell "session cookie not ready yet"
        // apart from a genuine failure and retry instead of silently dropping
        // the recap — this fires whenever a backgrounded tab's Clerk session
        // cookie is still refreshing when the tab regains focus.
        console.warn(`GET ${request.nextUrl.pathname} 401: no authenticated user`);
        return NextResponse.json({}, { status: 401, statusText: "Not signed in" });
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

    try {
        const feed = await buildEventFeed(gameData, userIdNameMap, userId);
        if (!feed.hasRecap) {
            return NextResponse.json({ success: true, hasRecap: false } satisfies IRecapResponse);
        }

        const meta = metaForGame({ url: gameData.gameType.url, friendlyName: gameData.gameType.friendlyName });
        const reactions = await ReactionModel.find({ gameId: gameid, eventId: { $in: feed.events.map((e) => e.id) } }).exec();
        const reactionByEventId = new Map(reactions.map((r) => [r.eventId, r.reaction as string]));
        const events: IRecapEventResponse[] = feed.events.map((event) => ({
            ...event,
            dotColour: playerColour(gameData.userIdList.indexOf(event.actorId)),
            affectsMe: event.affectedIds?.includes(userId) ?? false,
            reaction: reactionByEventId.get(event.id) ?? null,
        }));

        const chat = await unreadChatSince(gameid, userId, userIdNameMap);

        const response: IRecapResponse = {
            success: true,
            hasRecap: true,
            header: {
                name: meta?.name ?? gameData.gameType.friendlyName,
                url: gameData.gameType.url,
                accent: meta?.accent ?? "terracotta",
                glyph: meta?.glyph,
            },
            summary: feed.summary ?? undefined,
            events,
            tip: feed.tip,
            chat,
        };
        return NextResponse.json(response);
    } catch (error) {
        console.error("Failed to build recap", error);
        return NextResponse.json({}, { status: 500, statusText: "Unable to build recap" });
    }
}
