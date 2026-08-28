import { IGameData } from "../mongodb/GameData";
import { ICommandOutcome, IGameCommand, IGameType } from "../apiModels/gameCommand";

/** What running one command against a game turned out to mean. */
export interface RunCommandResult {
    outcome: ICommandOutcome;
    /** True once `gameType.CheckGameOver` said so — `CheckEndTurn` never runs in that case. */
    gameOver: boolean;
}

/**
 * Runs one command against `gameData`: `Execute` it, and — only for a valid
 * move — record it on `commandHistory`, then let the game type decide whether
 * the game just ended or whose turn it is now.
 *
 * This is the one pipeline every command goes through, whichever of three
 * places is driving it: a live player's request (`POST /api/game/command`), a
 * replay (`buildTimeline`), or a forced timeout (`resolveStalledTurn`). Mutates
 * `gameData` in place; does not persist it and does not call `markModified` —
 * a caller writing to a real Mongoose document handles that itself once it
 * knows the move was valid, since a replay's in-memory state has no such
 * method to call.
 */
export async function runCommand(
    gameData: IGameData,
    gameType: IGameType,
    command: IGameCommand,
): Promise<RunCommandResult> {
    const outcome = await command.Execute(gameData);
    if (!outcome.validMove) {
        return { outcome, gameOver: false };
    }

    gameData.gameState.commandHistory.push(command);

    if (gameType.CheckGameOver(gameData)) {
        return { outcome, gameOver: true };
    }

    gameType.CheckEndTurn(gameData, outcome);
    return { outcome, gameOver: false };
}
