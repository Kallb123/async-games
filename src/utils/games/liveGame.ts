import { NextResponse } from 'next/server';
import { GameDataModel, IGameDataDocument } from '@/utils/mongodb/GameData';

/**
 * Either the live game a request named, or the response to answer it with.
 * Callers do `if ('error' in found) return found.error;` and carry on with
 * `found.game`, which is a plain document from there on.
 */
export type LiveGameLookup =
    | { game: IGameDataDocument }
    | { error: NextResponse };

/**
 * The three checks every route that *changes* a game has to pass before it
 * touches one: the request named a game id at all, that game exists, and it
 * is still being played.
 *
 * The last one is why this exists. `complete` was only ever enforced by
 * `currentTurn`: a won game clears it (see each game's CheckGameOver) and so
 * does the turntimer cron when it abandons one, so "is it your turn?" happened
 * to answer "is the game still on?" too. `/api/game/end` doesn't clear it —
 * it marks the game complete and leaves the turn where it was — so whoever
 * was mid-turn when somebody else ended the game could keep playing it. Their
 * moves landed on a game that had already written its GameResult, and
 * recordGameResult is idempotent on gameId, so a game that later "won" kept
 * the `ended` result it was given: two records of the same game that disagree
 * about how it finished, permanently.
 *
 * `/api/game/end` clears `currentTurn` now as well, which closes the same door
 * from the other side, but the guard belongs on the routes that mutate rather
 * than on every route that might one day forget to.
 */
export async function requireLiveGame(gameId: unknown): Promise<LiveGameLookup> {
    if (typeof gameId !== 'string' || !gameId) {
        return { error: NextResponse.json({}, { status: 400, statusText: "Missing gameId" }) };
    }

    const game: IGameDataDocument | null = await GameDataModel.findOne({ gameId }).exec();
    if (!game) {
        return { error: NextResponse.json({}, { status: 404, statusText: "Game not found" }) };
    }
    if (game.complete) {
        return { error: NextResponse.json({}, { status: 409, statusText: "This game has finished" }) };
    }

    return { game };
}
