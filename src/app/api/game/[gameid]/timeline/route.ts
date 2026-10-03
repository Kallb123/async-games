import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { GameDataModel, IGameDataDocument } from '@/utils/mongodb/GameData';
import { userIdListToUserIdNameMap } from '@/utils/users/clerk';
import { buildTimeline, plannableCommands } from '@/utils/games/replay';
import { IGameCommand } from '@/utils/apiModels/GameLogic';
import { deserializeJSON } from '@/utils/apiModels/Serialisable';
import { attachHistoryReactionsToEach } from '@/utils/games/historyReactions';
import { toHistoryDeltas } from '@/utils/games/historyDelta';
import { gameCommandVersion } from '@/utils/ui/games';

export interface IGetTimelineParams {
    gameid: string;
}

// Returns the full reconstructed timeline for a game: the initial state, one
// snapshot per real played command (recap) — a turn spanning several commands
// shows as several snapshots — and, when `plannedCommands` are supplied,
// additional snapshots for the hypothetical planned commands (planning mode).
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

    // Planning runs client-supplied commands against the game's real
    // reconstructed state, so what a game will plan has to be decided by the
    // server. Anything outside the game's allowlist would resolve against real
    // hidden state — a planned draw reads the top of the real deck, a planned
    // Smartthink guess is scored against the real code — so the plan is refused
    // rather than partly run. See plannableCommands() and
    // docs/turn-recap-and-planning.md.
    //
    // This is the only enforcement point: `canPlan` on the board screens is a UI
    // affordance, not a permission, and never reaches the server.
    const plannable = plannableCommands(gameData.gameType.className);
    if (plannedCommands.some((command) => !plannable.includes(command?.className))) {
        console.warn(`POST ${request.nextUrl.pathname} 400: command not plannable in ${gameData.gameType.className}`);
        return NextResponse.json({}, { status: 400, statusText: "That move can't be planned in this game" });
    }

    // Planned moves are hypothetical and never persisted; for v1 planning we only
    // let a user plan their own moves, and only under today's rules.
    const version = gameCommandVersion(gameData.gameType);
    plannedCommands.forEach((command) => {
        command.gameId = gameData.gameId;
        command.senderId = userId;
        command.version = version;
    });

    const userIdNameMap = await userIdListToUserIdNameMap(gameData.userIdList);

    try {
        // The requesting player is the viewer, so a game with hidden information
        // reconstructs their own hand across the timeline — and nobody else's.
        const timeline = await buildTimeline(gameData, userIdNameMap, plannedCommands, undefined, userId);
        // Each snapshot's history goes out as the change from the one before
        // it, not in full: whole, the response grows with the square of the
        // game's length (see utils/games/historyDelta.ts). useTurnNavigation
        // puts the full logs back together.
        const deltas = toHistoryDeltas(timeline.snapshots.map((snapshot) => snapshot.history));
        // One query across every snapshot's new lines, so a reaction stays on
        // its line whichever point in the game a player is stepping through —
        // not just the live one. A line a delta doesn't resend keeps the
        // reactions it was first sent with, which are the same ones.
        const added = await attachHistoryReactionsToEach(gameid, deltas.map((delta) => delta.added));
        const snapshots = timeline.snapshots.map(({ history: _history, ...snapshot }, i) => ({
            ...snapshot,
            historyDelta: { added: added[i], dropped: deltas[i].dropped },
        }));
        return NextResponse.json({ success: true, ...timeline, snapshots, userIdNameMap });
    } catch (error) {
        console.error("Failed to build timeline", error);
        return NextResponse.json({}, { status: 500, statusText: "Unable to build timeline" });
    }
}
