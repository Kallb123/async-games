import { IGameData } from "../mongodb/GameData";
import { ICommandOutcome, IGameCommand, IGameType, RECORDED_FOLLOW_UP_TO_ID } from "../apiModels/gameCommand";

export interface RunCommandOptions {
    /**
     * Called once per command actually *applied* — the given one, then any
     * follow-up — after that command's own `CheckEndTurn`. A caller that records
     * a step per command (`buildTimeline`) uses this so a follow-up gets a step
     * of its own rather than being folded into its trigger's.
     */
    onStep?: (applied: IGameCommand, appliedOutcome: ICommandOutcome) => void;
    /**
     * Last word on the follow-up a game asked for: return it, return the command
     * to run in its place, or return null to run none. `trigger` is the command
     * that asked, whose id the recorded copy carries as `recordedFollowUpToId`.
     *
     * Only a replay needs this. A follow-up is recorded on `commandHistory` like
     * any other command, so the list `buildTimeline` is walking already holds the
     * one that really ran — with the id and timestamp that stamped its history
     * line. Regenerating it would apply the same command twice.
     */
    resolveFollowUp?: (generated: IGameCommand, trigger: IGameCommand) => IGameCommand | null;
}

/** Marks `followUp` as the command the pipeline ran for `trigger`. */
function stampFollowUpOf(followUp: IGameCommand, trigger: IGameCommand): void {
    (followUp as unknown as Record<string, unknown>)[RECORDED_FOLLOW_UP_TO_ID] = trigger.id;
}

/** True for a command that carries that mark, recorded or freshly stamped. */
export function isFollowUp(command: unknown): boolean {
    return typeof (command as Record<string, unknown> | null)?.[RECORDED_FOLLOW_UP_TO_ID] === "string";
}

/** True when `command` is the recorded follow-up of the command with `triggerId`. */
export function isRecordedFollowUpOf(command: unknown, triggerId: string): boolean {
    return (command as Record<string, unknown> | null)?.[RECORDED_FOLLOW_UP_TO_ID] === triggerId;
}

/** What running one command against a game turned out to mean. */
export interface RunCommandResult {
    outcome: ICommandOutcome;
    /** True once `gameType.CheckGameOver` said so — `CheckEndTurn` never runs in that case. */
    gameOver: boolean;
    /**
     * The game asked for a follow-up and its own rules then refused it. The
     * command itself still counts — it was recorded and its effects stand — but
     * the turn is in a state the game didn't expect, so a caller that would
     * otherwise keep feeding it commands should stop instead of asking for the
     * same refusal again.
     */
    followUpRefused?: boolean;
}

/**
 * Runs one command against `gameData`: `Execute` it, and — only for a valid
 * move — record it on `commandHistory`, then let the game type decide whether
 * the game just ended or whose turn it is now. Then the same again for any
 * `followUpCommand` the outcome named (see `ICommandOutcome`), which is why
 * `onStep` exists: a caller that records a move per command (`buildTimeline`)
 * gets one call per command actually applied, not per command handed in.
 *
 * A follow-up is recorded exactly like the command that asked for it, so a
 * replay reads it back off `commandHistory` rather than minting a second copy —
 * which is what `resolveFollowUp` is for.
 *
 * The returned outcome is the one the *given* command produced, minus the
 * follow-up it has now spent, with `turnOver`/`timerRestarts` widened to
 * whatever the whole run did — a caller deciding whether to restart the timer
 * or push "your move" cares that the turn passed, not which command passed it.
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
    options: RunCommandOptions = {},
): Promise<RunCommandResult> {
    const { onStep, resolveFollowUp } = options;
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

    const gameOver = gameType.CheckGameOver(gameData);
    if (!gameOver) {
        gameType.CheckEndTurn(gameData, outcome);
    }

    // `followUpCommand` is spent here and never handed on: it has been dealt
    // with, and a caller passing the outcome further (the route sends it to the
    // client, buildTimeline hands it to the recap adapters) has no use for a
    // command object on it.
    const { followUpCommand, ...spent } = outcome;
    onStep?.(command, spent);
    // One command, one answer. A follow-up is refused from a command that already
    // passed the turn (`CheckEndTurn` ran above, so it would land on whoever has
    // the dice now) and from a command that is itself a follow-up — which keeps
    // the chain exactly two long, and keeps a replay's lookahead for the recorded
    // copy one entry rather than a moving cursor.
    if (!followUpCommand || gameOver || spent.turnOver || isFollowUp(command)) {
        return { outcome: spent, gameOver };
    }

    stampFollowUpOf(followUpCommand, command);
    const toRun = resolveFollowUp ? resolveFollowUp(followUpCommand, command) : followUpCommand;
    if (!toRun) return { outcome: spent, gameOver };

    const follow = await runCommand(gameData, gameType, toRun, options);
    // A follow-up the game generated from its own state should never be refused.
    // If one is, the command that asked for it still stands — it was recorded and
    // its effects are real — so stop rather than pretend the rest happened.
    if (!follow.outcome.validMove) return { outcome: spent, gameOver, followUpRefused: true };

    return {
        outcome: {
            ...spent,
            turnOver: spent.turnOver || follow.outcome.turnOver,
            timerRestarts: spent.timerRestarts || follow.outcome.timerRestarts,
        },
        gameOver: follow.gameOver,
    };
}
