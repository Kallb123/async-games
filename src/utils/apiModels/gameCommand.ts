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

// And again: `recordedOnTurnOf` marks a command as played *out of turn*, and
// names the player whose turn it was — `currentTurn` at the moment it ran, who
// is never its sender. The pipeline stamps it (`RunCommandOptions.outOfTurn`),
// only ever for a request the command route has already let past its turn gate
// as `playableOutOfTurn`, and the prefix means a client can't supply one: a
// forged stamp would make a replay leave the turn with somebody the live game
// never gave it to. Replay puts `currentTurn` back to it before running the
// command, and the per-turn charts, the turn count and the recap feed read it
// as "not the start of the sender's turn" (docs/out-of-turn-actions.md §5.4).
export const RECORDED_ON_TURN_OF = "recordedOnTurnOf";

/** Whose turn an out-of-turn command was played on, or undefined for an ordinary one. */
export function recordedOnTurnOf(command: unknown): string | undefined {
    const onTurnOf = (command as Record<string, unknown> | null)?.[RECORDED_ON_TURN_OF];
    return typeof onTurnOf === "string" ? onTurnOf : undefined;
}

/** True for a command the pipeline recorded as played off its sender's turn. */
export function isRecordedOutOfTurn(command: unknown): boolean {
    return recordedOnTurnOf(command) !== undefined;
}

export function stripRecordedRandomness(command: IGameCommand): void {
    const fields = command as unknown as Record<string, unknown>;
    for (const key of Object.keys(fields)) {
        if (key.startsWith("recorded")) {
            delete fields[key];
        }
    }
}

const PLAY_MARKERS = new Set([RECORDED_FOLLOW_UP_TO_ID, RECORDED_ON_TURN_OF]);

// Whether an executed command consumed randomness: any own property whose
// name starts with `recorded`, other than the two markers above —
// `recordedFollowUpToId` and `recordedOnTurnOf` say how a command was played,
// not what it rolled, and their own callers (see above) are the ones who care
// about them. Counting either would have the undo guards refuse a move for a
// reason it doesn't have. This is the machine-checked half of
// "only on non-random actions" (docs/undo.md §1, §6): a command that answers
// true here must never declare itself undoable, because restoring an older
// snapshot would silently replay the randomness it consumed a second time.
export function consumedRandomness(command: IGameCommand): boolean {
    const fields = command as unknown as Record<string, unknown>;
    return Object.keys(fields).some(key => key.startsWith("recorded") && !PLAY_MARKERS.has(key));
}

// Whether a command's *class* declares that it may be played out of turn
// (`readonly playableOutOfTurn = true`) — by a seated player who isn't
// `currentTurn`. See docs/out-of-turn-actions.md §5.1.
//
// Read off a fresh instance of the command's constructor, never off the
// command itself. The command the route holds is the request body, rehydrated
// by deserializeJSON's reviver, which copies every posted property onto the
// instance (`readonly` is compile-time only) — so a flag read off it is the
// client's to set, and the old `ignoresTurnGate` exemption was exactly that
// hole (§3). `constructor` is one of the keys the reviver refuses to copy, so
// it is always the class that was really constructed, and a fresh instance
// carries only what that class declares. Every registered class constructs
// with no arguments and no side effects: `@serializable` does exactly this at
// module load.
//
// Declaring it widens *who* may send the command, not what it does: played on
// its sender's own turn it takes the ordinary path. Played off it, the pipeline
// enforces the out-of-turn invariants (`RunCommandOptions.outOfTurn`), and the
// command's own `Execute` tells the two apart the way the route did —
// `gameData.currentTurn !== this.senderId`. `playableOutOfTurnCommands.test.ts` lists
// every class that answers true; adding one means a reviewer reads its `Execute`.
export function playableOutOfTurn(command: IGameCommand): boolean {
    const declaringClass = (command as object).constructor as new () => unknown;
    if (typeof declaringClass !== "function" || declaringClass === Object) {
        return false;
    }
    return (new declaringClass() as Record<string, unknown>).playableOutOfTurn === true;
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
