import { NextRequest, NextResponse } from 'next/server';
import { LOBBY_PREVIEW_SCOPE, allowLobbyPreview, findLobbyPreview } from '@/utils/games/lobbyPreview';
import { normaliseJoinCode } from '@/utils/games/joinCode';
import { clientIp } from '@/utils/rateLimit';

export interface ILobbyPreviewResponse {
    sender: string;
    gameFriendlyName: string;
    openSeatCount: number;
}

// §4 deferred this: a link recipient could learn which game and whose lobby
// it is only after claiming a seat. A guest with no account of their own,
// landing at a site they've never used and being asked for a name, needs to
// know that first — a signed-in player doesn't, which is why /join's
// signed-in screen never calls this. The read itself, its throttle and what
// it is allowed to say all live in `lobbyPreview.ts`, shared with the two
// other readers of the same lookup (the link preview /join's metadata builds,
// and the share card it points at).
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
    console.log(`GET ${request.nextUrl.pathname}`);

    if (!(await allowLobbyPreview(LOBBY_PREVIEW_SCOPE, clientIp(request.headers)))) {
        return NextResponse.json({}, { status: 429, statusText: "Too many attempts — try again shortly." });
    }

    const { code } = await params;
    if (!normaliseJoinCode(code)) {
        return NextResponse.json({}, { status: 400, statusText: "Missing join code" });
    }

    const lobby = await findLobbyPreview(code);
    if (!lobby) {
        return NextResponse.json({}, { status: 404, statusText: "Lobby not found" });
    }

    const response: ILobbyPreviewResponse = {
        sender: lobby.sender,
        gameFriendlyName: lobby.gameFriendlyName,
        openSeatCount: lobby.openSeatCount,
    };
    return NextResponse.json(response);
}
