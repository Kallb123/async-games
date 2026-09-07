import { NextRequest, NextResponse } from 'next/server';
import { readJsonBody } from '@/utils/api/requestBody';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { duplicateGame } from '@/utils/games/duplicateGame';
import { requireLiveGame } from '@/utils/games/liveGame';
import { gamePath } from '@/utils/ui/games';
import { requireDevCaller } from '@/utils/api/devRequest';

/** What a successful duplication answers with: where the copy is. */
export interface IDuplicateGameResponse {
    success: true;
    gameId: string;
    /** The copy's board screen, ready for the caller to navigate to. */
    path: string;
}

/**
 * Copy a game into a new one with the same players and the same state — the
 * dev menu's "Duplicate this game" (see docs/environments.md).
 *
 * A live game only, through the same `requireLiveGame` guard every route that
 * changes a game uses. A copy of a finished game would be a game nothing can
 * be played on (its rules cleared `currentTurn` when it ended) and that neither
 * dashboard list can show: the live list asks for `complete: false`, and the
 * finished list is built from GameResults, which only `finishGame` writes. It
 * would be an orphan the URL you were pushed to is the only way back to.
 *
 * The caller has to be at the table. The dev tooling has no authentication of
 * its own beyond being signed in, but there is no reason for it to be a way to
 * read a game you aren't in — and a copy is a readable game.
 */
export async function POST(request: NextRequest) {
    console.log(`POST ${request.nextUrl.pathname}`);

    const caller = await requireDevCaller();
    if ('error' in caller) {
        return caller.error;
    }
    const { userId } = caller;

    const { gameId } = await readJsonBody<{ gameId: string }>(request);

    await dbConnect();
    const found = await requireLiveGame(gameId);
    if ('error' in found) {
        return found.error;
    }
    const gameData = found.game;
    if (!gameData.userIdList.includes(userId)) {
        return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    // Null for a game whose type no longer has a model registered — a game
    // renamed or removed since this dev database was last wiped.
    const duplicate = await duplicateGame(gameData);
    if (!duplicate) {
        return NextResponse.json(
            { success: false, message: `Unsupported game type: ${gameData.gameType.gameType}` },
            { status: 400 }
        );
    }
    console.log(`Duplicated game ${gameData.gameId} as ${duplicate.gameId}`);

    const response: IDuplicateGameResponse = {
        success: true,
        gameId: duplicate.gameId,
        path: gamePath(duplicate.gameType.url, duplicate.gameId),
    };
    return NextResponse.json(response);
}

export const dynamic = 'force-dynamic';
