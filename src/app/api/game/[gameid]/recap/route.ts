import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { GameDataModel, IGameDataDocument } from '@/utils/mongodb/GameData';
import { userIdListToUsernameMap } from '@/utils/users/clerk';
import { buildEventFeed, IGameEvent } from '@/utils/games/recap';
import { metaForGame } from '@/utils/ui/games';
import { playerColour } from '@/utils/ui/playerColours';

export interface IGetRecapParams {
    gameid: string;
}

// One recap row as sent to the client: the game-agnostic event plus the actor's
// player colour (for the timeline dot) and a pre-formatted "affects you" flag.
export interface IRecapEventResponse extends IGameEvent {
    dotColour: string;
    affectsMe: boolean;
}

export interface IRecapResponse {
    success: boolean;
    hasRecap: boolean;
    header?: { name: string; url: string; accent: string; glyph?: string };
    summary?: { headline: string; subline: string };
    events?: IRecapEventResponse[];
    tip?: { glyph: string; text: string } | null;
}

// Returns the "since you were last here" recap for the signed-in player: the
// turns that happened since their last move, a summary line, and an optional
// tip. hasRecap is false (with no payload) when there's nothing to show or the
// game has no recap support (e.g. Smartthink).
export async function GET(request: NextRequest, { params }: { params: Promise<IGetRecapParams> }) {
    console.log(`GET ${request.nextUrl.pathname}`);

    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({}, { status: 400, statusText: "Not signed in" });
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

    const usernameMap = await userIdListToUsernameMap(gameData.userIdList);
    const userIdNameMap: { [key: string]: string } = {};
    usernameMap.forEach((username, id) => {
        userIdNameMap[id] = username;
    });

    try {
        const feed = await buildEventFeed(gameData, userIdNameMap, userId);
        if (!feed.hasRecap) {
            return NextResponse.json({ success: true, hasRecap: false } satisfies IRecapResponse);
        }

        const meta = metaForGame({ url: gameData.gameType.url, friendlyName: gameData.gameType.friendlyName });
        const events: IRecapEventResponse[] = feed.events.map((event) => ({
            ...event,
            dotColour: playerColour(gameData.userIdList.indexOf(event.actorId)),
            affectsMe: event.affectedIds?.includes(userId) ?? false,
        }));

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
        };
        return NextResponse.json(response);
    } catch (error) {
        console.error("Failed to build recap", error);
        return NextResponse.json({}, { status: 500, statusText: "Unable to build recap" });
    }
}
