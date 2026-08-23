import { clerkClient } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { InvitationModel } from '@/utils/mongodb/InvitationData';
import { normaliseJoinCode } from '@/utils/games/joinCode';
import { openSeats } from '@/utils/games/lobby';
import { readableName } from '@/utils/ui/players';
import { clientIp, consumeRateLimit } from '@/utils/rateLimit';

export interface ILobbyPreviewResponse {
    sender: string;
    gameFriendlyName: string;
    openSeatCount: number;
}

// §4 deferred this: a link recipient could learn which game and whose lobby
// it is only after claiming a seat. A guest with no account of their own,
// landing at a site they've never used and being asked for a name, needs to
// know that first — a signed-in player doesn't, which is why /join's
// signed-in screen never calls this. It's the app's first public read, and a
// cheaper enumeration oracle than the join route beside it (taking a seat is
// self-limiting in a way looking never is), so it shares that route's per-IP
// throttle rather than going unguarded, and answers with nothing beyond what
// justifies asking for a name — no player list, nothing a wrong guess at a
// code could use to learn more than "a lobby exists or it doesn't".
const PREVIEW_RATE_LIMIT = 30;
const PREVIEW_RATE_WINDOW_MS = 10 * 60 * 1000;

export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
    console.log(`GET ${request.nextUrl.pathname}`);

    if (!(await consumeRateLimit('lobby-preview', clientIp(request), PREVIEW_RATE_LIMIT, PREVIEW_RATE_WINDOW_MS))) {
        return NextResponse.json({}, { status: 429, statusText: "Too many attempts — try again shortly." });
    }

    const { code } = await params;
    const joinCode = normaliseJoinCode(code);
    if (!joinCode) {
        return NextResponse.json({}, { status: 400, statusText: "Missing join code" });
    }

    await dbConnect();

    const lobby = await InvitationModel.findOne({ joinCode, expiresAt: { $gt: new Date() } }).exec();
    if (!lobby) {
        return NextResponse.json({}, { status: 404, statusText: "Lobby not found" });
    }

    const sender = await (await clerkClient()).users.getUser(lobby.senderId);

    const response: ILobbyPreviewResponse = {
        sender: readableName(sender),
        gameFriendlyName: lobby.gameFriendlyName,
        openSeatCount: openSeats(lobby).length,
    };
    return NextResponse.json(response);
}
