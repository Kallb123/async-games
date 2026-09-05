import type { uuidString } from "./GameDataApi";
import type { IGameData } from "../mongodb/GameData";

export interface ICommandOutcome {
    validMove: boolean,
    turnOver: boolean
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
