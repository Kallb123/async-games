// Shared test fixtures for Settlements & Cities domain state.
//
// The dev-card commands, the recap adapter and the response redaction tests all
// need a bare main-phase state with a couple of players in it, and none of them
// need a real board. Kept here rather than copied into each spec: this literal
// is twenty fields long and grows whenever ISACSpecificGameState does, so a copy
// goes stale silently — and a copy that misses a field needs an `as unknown as`
// cast to compile, which is how you know it's wrong.
//
// Test-only. Nothing under src/app imports this.

import { createInitialPlayerState } from "./board";
import type { ISACDevCards, ISACPlayerState, ISACResources, ISACSpecificGameState } from "./board";
import { SACRollDice, SettlementsAndCitiesGameType } from "./SettlementsAndCitiesLogic";
import { cloneSACState } from "./SettlementsAndCitiesModels";
import type { ISettlementsAndCitiesGameData } from "./SettlementsAndCitiesModels";

// The three card records are merged rather than replaced, so a test names only
// the resource or card it cares about — hence the partial sub-records, which a
// plain Partial<ISACPlayerState> wouldn't allow.
type PlayerOverrides = Omit<Partial<ISACPlayerState>, "resources" | "devCards" | "newDevCards"> & {
    resources?: Partial<ISACResources>;
    devCards?: Partial<ISACDevCards>;
    newDevCards?: Partial<ISACDevCards>;
};

export function player(overrides: PlayerOverrides = {}): ISACPlayerState {
    const base = createInitialPlayerState();
    return {
        ...base,
        ...overrides,
        resources: { ...base.resources, ...(overrides.resources ?? {}) },
        devCards: { ...base.devCards, ...(overrides.devCards ?? {}) },
        newDevCards: { ...base.newDevCards, ...(overrides.newDevCards ?? {}) },
    };
}

export function makeState(overrides: Partial<ISACSpecificGameState> = {}): ISACSpecificGameState {
    return {
        hexes: [],
        vertices: [],
        edges: [],
        harbors: [],
        playerStates: new Map<string, ISACPlayerState>(),
        robberHexIndex: 0,
        phase: "main",
        setupStep: 0,
        pendingRoadSetup: false,
        lastSetupSettlementVertex: null,
        hasRolled: true,
        lastRoll: 8,
        lastRollDie1: 5,
        lastRollDie2: 3,
        lastRollChanges: [],
        lastRollAutoEnded: false,
        lastRollAutoEndedBy: null,
        pendingRobber: false,
        longestRoadOwner: null,
        largestArmyOwner: null,
        devCardDeck: [],
        pendingRoadBuilding: 0,
        playedDevCard: false,
        specialBuildActive: false,
        specialBuildQueue: [],
        specialBuildMainPlayer: null,
        randomTiles: false,
        expansions: {
            seasAndSailors: false,
            knightsAndCommerce: false,
            tradersAndRaiders: false,
            explorersAndPirates: false,
            fiveSixPlayerExtension: false,
        },
        victoryTarget: 10,
        undoStack: [],
        undoAnchorId: null,
        autoEndTurnAt: null,
        ...overrides,
    };
}

// A whole game around one of those states, for the tests that run commands
// rather than poking at state directly. Same reasoning as makeState: the shell
// is a dozen fields and every copy of it needs an `as unknown as` cast, which
// is the tell that it's a copy.
export function makeGame(
    specificGameState: ISACSpecificGameState,
    overrides: Partial<ISettlementsAndCitiesGameData> = {},
): ISettlementsAndCitiesGameData {
    return {
        gameId: "11111111-1111-1111-1111-111111111111",
        gameType: new SettlementsAndCitiesGameType(),
        userIdList: ["u1", "u2"],
        turnTimer: "1d",
        currentTurn: "u1",
        lastTurnTimestamp: "2026-01-01T00:00:00.000Z",
        gameState: { turnOrder: ["u1", "u2"], history: [], commandHistory: [] },
        complete: false,
        winner: "",
        specificGameState,
        // A *copy*, the way a real game stores it at creation: buildTimeline
        // replays from this, and sharing the live object would have the replay
        // start from wherever the commands under test had already left it.
        initialSpecificGameState: cloneSACState(specificGameState, ["u1", "u2"]),
        ...overrides,
    } as unknown as ISettlementsAndCitiesGameData;
}

// u1 is Alice and u2 is Bob throughout, matching the names the response tests
// resolve tokens against.
export function cmd<T extends { senderId: string; senderUsername: string }>(command: T, sender = "u1"): T {
    command.senderId = sender;
    command.senderUsername = sender === "u1" ? "Alice" : "Bob";
    return command;
}

/** A roll with its dice already decided, the way a replayed one arrives. */
export function rollOf(die1: number, die2: number, sender = "u1"): SACRollDice {
    const roll = cmd(new SACRollDice(), sender);
    roll.recordedRoll1 = die1;
    roll.recordedRoll2 = die2;
    return roll;
}
