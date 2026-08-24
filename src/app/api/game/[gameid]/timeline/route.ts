import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { GameDataModel, IGameDataDocument } from '@/utils/mongodb/GameData';
import { userIdListToUserIdNameMap } from '@/utils/users/clerk';
import { buildTimeline } from '@/utils/games/replay';
import { IGameCommand } from '@/utils/apiModels/GameLogic';
import { deserializeJSON } from '@/utils/apiModels/Serialisable';

export interface IGetTimelineParams {
    gameid: string;
}

// Returns the full reconstructed timeline for a game: the initial state, one
// snapshot per real turn (recap), and — when `plannedCommands` are supplied —
// additional snapshots for the hypothetical planned turns (planning mode).
export async function POST(request: NextRequest, { params }: { params: Promise<IGetTimelineParams> }) {
    console.log(`POST ${request.nextUrl.pathname}`);

    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({}, { status: 400, statusText: "Not signed in" });
    }

    let plannedCommands: IGameCommand[] = [];
    try {
        const body = await request.text();
        if (body) {
            const parsed = deserializeJSON(body);
            if (Array.isArray(parsed?.plannedCommands)) {
                plannedCommands = parsed.plannedCommands as IGameCommand[];
            }
        }
    } catch {
        return NextResponse.json({}, { status: 400, statusText: "Invalid request body" });
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

    // Planned moves are hypothetical and never persisted; for v1 planning we only
    // let a user plan their own moves.
    plannedCommands.forEach((command) => {
        command.gameId = gameData.gameId;
        command.senderId = userId;
    });

    const userIdNameMap = await userIdListToUserIdNameMap(gameData.userIdList);

    try {
        // The requesting player is the viewer, so a game with hidden information
        // reconstructs their own hand across the timeline — and nobody else's.
        const timeline = await buildTimeline(gameData, userIdNameMap, plannedCommands, undefined, userId);
        return NextResponse.json({ success: true, ...timeline, userIdNameMap });
    } catch (error) {
        console.error("Failed to build timeline", error);
        return NextResponse.json({}, { status: 500, statusText: "Unable to build timeline" });
    }
}
