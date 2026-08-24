// Shared test fixtures for World Domination domain state. Same reasoning as
// Settlements & Cities' — see the note at the top of
// src/games/SettlementsAndCities/testFixtures.ts.
//
// Test-only. Nothing under src/app imports this.

import { TERRITORY_COUNT } from "./board";
import type { IWorldDominationTerritory } from "./board";
import type {
    IWorldDominationPlayerState,
    IWorldDominationSpecificGameState,
} from "./WorldDominationModels";

export function makeTerritories(
    defaultOwner: string,
    overrides: Record<number, Partial<IWorldDominationTerritory>> = {},
): IWorldDominationTerritory[] {
    return Array.from({ length: TERRITORY_COUNT }, (_, id) => ({
        owner: defaultOwner,
        armies: 3,
        ...overrides[id],
    }));
}

export function player(overrides: Partial<IWorldDominationPlayerState> = {}): IWorldDominationPlayerState {
    return { cards: [], eliminated: false, conqueredTerritoryThisTurn: false, totalArmiesDeployed: 0, ...overrides };
}

export function makeState(
    overrides: Partial<IWorldDominationSpecificGameState> = {},
): IWorldDominationSpecificGameState {
    return {
        territories: makeTerritories("u1"),
        playerStates: new Map([["u1", player()], ["u2", player()]]),
        phase: "reinforce",
        reinforcementsRemaining: 0,
        pendingOccupation: null,
        fortifyUsed: false,
        cardSetsCashedIn: 0,
        cardDeck: [],
        lastBattle: null,
        ...overrides,
    };
}
