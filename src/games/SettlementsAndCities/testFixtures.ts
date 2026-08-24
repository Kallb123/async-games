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
        pendingRobber: false,
        longestRoadOwner: null,
        largestArmyOwner: null,
        devCardDeck: [],
        pendingRoadBuilding: 0,
        playedDevCard: false,
        specialBuildActive: false,
        specialBuildQueue: [],
        specialBuildMainPlayer: null,
        expansions: {
            seasAndSailors: false,
            knightsAndCommerce: false,
            tradersAndRaiders: false,
            explorersAndPirates: false,
            fiveSixPlayerExtension: false,
        },
        victoryTarget: 10,
        ...overrides,
    };
}
