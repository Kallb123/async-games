import type { uuidString } from "./GameDataApi";
import type { IGameData } from "../mongodb/GameData";

export interface ICommandOutcome {
    validMove: boolean,
    /** The turn passed to a different player: `CheckEndTurn` moves `currentTurn`, the timer restarts, and the new player is told it's their move. */
    turnOver: boolean,
    /**
     * A deadline boundary that is *not* a hand-off: the player who acted is
     * still `currentTurn` afterwards, but the turn timer should start again
     * because the thing it measures has finished.
     *
     * Only a game whose turn belongs to something smaller than a player needs
     * this. Fires Out's solitaire crew is that game (docs/games/fires-out-gdd.md
     * §17.2 gap 3, §17.6 step 12): one player holds every figure, so `turnOver`
     * is false for every hand-off between them, and a timer that only restarts
     * on `turnOver` never moved at all — leaving a game that was being played
     * every day permanently expired, swept twice a period forever, and pushed a
     * "take your turn now or it passes to the next player" warning that was
     * false in both halves. Each figure's turn *is* a real deadline, so it
     * restarts the timer while leaving `currentTurn` and the "your move" push
     * alone.
     *
     * Deliberately not "any accepted command": in a crew game that would let
     * one player hold the table indefinitely by nudging one action a period.
     */
    timerRestarts?: boolean,
    /**
     * A command the game wants run straight after this one, exactly as if the
     * player had sent it themselves. `runCommand` puts it through the whole
     * pipeline — its own id and timestamp, its own history line, `CheckGameOver`,
     * `CheckEndTurn`, its own entry on `commandHistory` and its own step in a
     * replay — so it is an ordinary command in every way, which is the point: it
     * stays indistinguishable from the same command sent by hand. Settlements &
     * Cities ends a turn this way when its player can no longer afford anything
     * (see `sacFinishTurn`), and telling the table *that* is telling them what
     * that player holds.
     *
     * Because it is recorded, a replay reads the one that really ran instead of
     * minting another — `RunCommandOptions.resolveFollowUp` is how `buildTimeline`
     * says so, matching on the `recordedFollowUpToId` the pipeline stamps. Generate
     * it fresh each time the trigger runs and leave the recorded-versus-regenerated
     * choice to that.
     *
     * Two things the pipeline will not do, so don't rely on them: it ignores a
     * follow-up from a command that already reported `turnOver` (the turn has
     * moved on, and the follow-up would land on the next player), and it ignores
     * one asked for *by* a follow-up. One command, one answer.
     */
    followUpCommand?: IGameCommand
}

export interface IGameCommand {
    id: uuidString;
    timestamp: string;
    gameId: uuidString;
    senderId: string;
    senderUsername: string;
    readonly className: string;

    myString: () => string;
    Execute: (gameData: IGameData) => Promise<ICommandOutcome>;
}

export interface IGameType {
    gameType: string,
    friendlyName: string,
    icon: string,
    url: string,
    readonly className: string;

    CheckEndTurn: (gameData: IGameData, commandOutcome: ICommandOutcome) => void;
    CheckGameOver: (gameData: IGameData) => boolean;
}

// Recorded-RNG fields — the `recorded…` convention described in
// docs/turn-recap-and-planning.md — exist so replaying a command reproduces the
// randomness it consumed the first time it ran. Every Execute that consumes
// randomness therefore *prefers* a recorded value over rolling afresh
// (`this.recordedRoll ?? DiceRoll(6)`), which makes them the one part of a
// command a client must never be allowed to supply: /api/game/command
// deserialises the request body straight into a command instance, so without
// this a player could post {"recordedRoll": 6} and pick their own dice.
//
// Replay is the only legitimate source of these values. buildTimeline() feeds
// commands either from persisted commandHistory (already trusted) or from a
// player's own hypothetical planned moves (never saved, and only ever shown
// back to that player), so it deliberately does not call this.
// The same `recorded…` prefix, and stripped by the same pass below, for the same
// reason: `recordedFollowUpToId` marks a command as the follow-up the pipeline
// ran for the command of that id, which is how a replay tells the recorded copy
// apart from the one it would regenerate. The server writes it; a client that
// supplied one could make a replay drop a follow-up that really happened.
export const RECORDED_FOLLOW_UP_TO_ID = "recordedFollowUpToId";

export function stripRecordedRandomness(command: IGameCommand): void {
    const fields = command as unknown as Record<string, unknown>;
    for (const key of Object.keys(fields)) {
        if (key.startsWith("recorded")) {
            delete fields[key];
        }
    }
}

// Whether an executed command consumed randomness: any own property whose
// name starts with `recorded`, other than `recordedFollowUpToId` — that one
// marks a follow-up command, not a random outcome, and its own callers (see
// above) are the ones who care about it. This is the machine-checked half of
// "only on non-random actions" (docs/undo.md §1, §6): a command that answers
// true here must never declare itself undoable, because restoring an older
// snapshot would silently replay the randomness it consumed a second time.
export function consumedRandomness(command: IGameCommand): boolean {
    const fields = command as unknown as Record<string, unknown>;
    return Object.keys(fields).some(key => key.startsWith("recorded") && key !== RECORDED_FOLLOW_UP_TO_ID);
}

// A command outcome that carries a native Map (Dice Cities' roll payouts do,
// keyed by userId) can't survive `NextResponse.json`: a Map has no own
// enumerable properties, so plain JSON.stringify sends it over as `{}`. Every
// reader of a stored map already treats it as "however it arrived" rather than
// assuming a live Map (see mongoMap()), so this hands each one over the same
// way Mongo already does after a round trip: as a plain object.
export function serializeOutcomeMaps<T extends ICommandOutcome>(outcome: T): T {
    const fields = outcome as unknown as Record<string, unknown>;
    const serialized: Record<string, unknown> = { ...fields };
    for (const key of Object.keys(serialized)) {
        const value = serialized[key];
        if (value instanceof Map) {
            serialized[key] = Object.fromEntries(value);
        }
    }
    return serialized as T;
}
