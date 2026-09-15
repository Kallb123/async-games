import { IGameData } from "../mongodb/GameData";
import { ICommandOutcome, IGameCommand, IGameType } from "../apiModels/gameCommand";

/** A guard on runCommandChain, not a limit anyone is expected to reach. */
const MAX_FOLLOW_UP_COMMANDS = 8;

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

/**
 * `runCommand`, plus any follow-up command the outcome asks for (see
 * `ICommandOutcome.followUpCommand`) — each run through the same pipeline, in
 * order, until one of them stops asking for another or the game ends.
 *
 * `onStep` is called once per command actually applied, after its own run, so a
 * caller that snapshots per command (`buildTimeline`) records the follow-up as
 * its own step rather than folding it into the trigger's. That is what keeps a
 * turn the game ended for a player indistinguishable from one they ended
 * themselves: two steps either way.
 *
 * The returned outcome is the *trigger's*, with `turnOver`/`timerRestarts`
 * widened to whatever the chain as a whole did — a caller deciding whether to
 * restart the timer or push "your move" cares that the turn passed, not which
 * link passed it. `followUpCommand` is stripped off it, having been run.
 */
export async function runCommandChain(
    gameData: IGameData,
    gameType: IGameType,
    command: IGameCommand,
    onStep?: (command: IGameCommand, outcome: ICommandOutcome) => void,
): Promise<RunCommandResult> {
    const first = await runCommand(gameData, gameType, command);
    if (!first.outcome.validMove) return first;
    onStep?.(command, first.outcome);

    const outcome: ICommandOutcome = { ...first.outcome };
    delete outcome.followUpCommand;
    let gameOver = first.gameOver;

    // Today the only follow-up any game asks for is an end turn, which asks for
    // nothing further.
    let next = gameOver ? undefined : first.outcome.followUpCommand;
    for (let i = 0; next && i < MAX_FOLLOW_UP_COMMANDS; i++) {
        const step = await runCommand(gameData, gameType, next);
        // A follow-up the game itself generated should never be refused, but if
        // one is, the trigger still stands: it was recorded and its effects are
        // real. Stop the chain rather than pretending the rest of it happened.
        if (!step.outcome.validMove) break;
        onStep?.(next, step.outcome);
        outcome.turnOver = outcome.turnOver || step.outcome.turnOver;
        if (step.outcome.timerRestarts) outcome.timerRestarts = true;
        gameOver = step.gameOver;
        next = gameOver ? undefined : step.outcome.followUpCommand;
    }

    return { outcome, gameOver };
}

