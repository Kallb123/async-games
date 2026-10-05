import type { IGameData } from "@/utils/mongodb/GameData";

/**
 * Ends a co-op game in one result for the whole table, from inside the game's
 * own rules (its `CheckGameOver`, or a command that loses mid-resolution).
 * `finishGame` then reads `teamwin` or `teamloss` as one shared ending: no
 * single id can be the winner, so `winner` is empty, and every player is told
 * the same thing.
 *
 * `line` is the history line that announces it. `detail` is the `endDetail`
 * the finish banner, the result page and the push read back after
 * `finishedGameCopy`'s "The team won" / "The team lost" — which shape of the
 * ending it was, or the final score. It must never carry a `{{userId}}` token:
 * only the history is run through `resolveHistory`, so a token there would be
 * rendered raw.
 *
 * Every co-op game uses this helper so its stored result, history and shared
 * finish copy are kept in step.
 */
export function endAsTeam(data: IGameData, reason: "teamwin" | "teamloss", line: string, detail?: string): void {
    data.complete = true;
    data.winner = "";
    data.endReason = reason;
    if (detail !== undefined) data.endDetail = detail;
    data.currentTurn = "";
    data.gameState.history.unshift({ text: line });
}
