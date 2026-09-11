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
    const historyCountBefore = gameData.gameState.history.length;
    const outcome = await command.Execute(gameData);
    if (!outcome.validMove) {
        return { outcome, gameOver: false };
    }

    // Every line Execute() just wrote landed at the front (games only ever
    // unshift onto gameState.history), so the new ones are exactly the first
    // (new length − old length) entries. Stamping them here — the one place
    // every command passes through — is what lets a reaction find its way
    // back to the line it landed on without every game threading its own
    // command id into every history write.
    //
    // Stamped from the command's own timestamp, not `Date.now()`: buildTimeline
    // replays every command through this same pipeline into a fresh in-memory
    // history each time a player opens the match review, so a wall-clock read
    // here would restamp every line to the moment of the *replay* rather than
    // the moment the move was played — the turn history's relative time would
    // read "just now" for a turn played hours ago. The command's timestamp is
    // set once, when it was actually submitted, and survives both a live run
    // and every later replay of it.
    const linesWritten = gameData.gameState.history.length - historyCountBefore;
    for (let i = 0; i < linesWritten; i++) {
        gameData.gameState.history[i].commandId = command.id;
        if (!gameData.gameState.history[i].createdAt) {
            gameData.gameState.history[i].createdAt = command.timestamp;
        }
    }

    gameData.gameState.commandHistory.push(command);

    if (gameType.CheckGameOver(gameData)) {
        return { outcome, gameOver: true };
    }

    gameType.CheckEndTurn(gameData, outcome);
    return { outcome, gameOver: false };
}
