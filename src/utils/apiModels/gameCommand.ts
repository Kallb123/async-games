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
     * player had sent it themselves — `runCommandChain` executes it through the
     * same pipeline, and it is *not* recorded on `commandHistory`.
     *
     * That last part is the point. It exists so a game can end a turn on the
     * player's behalf without the ending being a distinguishable event:
     * Settlements & Cities passes back an ordinary `SACEndTurn` when a roll or
     * trade leaves its player unable to afford anything, so the log line, the
     * push notification and the match-review timeline all read exactly as they
     * do when that player taps "End turn". A follow-up must therefore be a
     * *deterministic* function of the state the triggering command left behind:
     * replaying the trigger regenerates it, which is why there is nothing to
     * record — and why a recorded one would replay twice.
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
    Undo: (gameData: IGameData) => void;
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
export function stripRecordedRandomness(command: IGameCommand): void {
    const fields = command as unknown as Record<string, unknown>;
    for (const key of Object.keys(fields)) {
        if (key.startsWith("recorded")) {
            delete fields[key];
        }
    }
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
