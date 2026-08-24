import { describe, expect, it } from "vitest";

import { gameStateToResponse as worldDominationStateToResponse } from "@/games/WorldDomination/WorldDominationModels";
import type { IWorldDominationSpecificGameState } from "@/games/WorldDomination/WorldDominationModels";
import { gameStateToResponse as sacStateToResponse } from "@/games/SettlementsAndCities/SettlementsAndCitiesModels";
import type { ISACPlayerState, ISACSpecificGameState } from "@/games/SettlementsAndCities/board";

// The two games this guards were both sending every player's hidden hand to
// every player: World Domination shipped each player's territory cards, and
// Settlements & Cities shipped each player's resource composition and dev card
// identities. Both are dealt face down by their own design docs, and both UIs
// only ever rendered a *count* for opponents — so the leak was invisible on
// screen and visible to anyone reading the response.
//
// These assert on the serialised response as well as the shape, because the
// question is what a client can read off the wire, not what the typings say.

const NAMES = { u1: "Alice", u2: "Bob" };

// ─── World Domination ────────────────────────────────────────────────────────

// Cards are identified by id, so give each player one with an id no other field
// could plausibly contain — that makes "is Bob's hand in here anywhere?" a
// substring search over the whole response.
const ALICE_CARD = { id: "alice-secret-card", type: "infantry" as const, territoryId: 3 };
const BOB_CARD = { id: "bob-secret-card", type: "cavalry" as const, territoryId: 7 };

function worldDominationState(): IWorldDominationSpecificGameState {
    return {
        territories: Array.from({ length: 4 }, (_, i) => ({ owner: i < 2 ? "u1" : "u2", armies: 1 })),
        playerStates: new Map([
            ["u1", { cards: [ALICE_CARD], eliminated: false, conqueredTerritoryThisTurn: false, totalArmiesDeployed: 4 }],
            ["u2", { cards: [BOB_CARD, { ...BOB_CARD, id: "bob-second-card" }], eliminated: false, conqueredTerritoryThisTurn: false, totalArmiesDeployed: 4 }],
        ]),
        phase: "reinforce",
        reinforcementsRemaining: 3,
        pendingOccupation: null,
        fortifyUsed: false,
        cardSetsCashedIn: 0,
        cardDeck: [],
        lastBattle: null,
    };
}

describe("World Domination's response", () => {
    it("gives the viewer their own hand and everyone else a count", () => {
        const response = worldDominationStateToResponse(worldDominationState(), NAMES, "u1");

        expect(response.playerStates.Alice.cards).toEqual([ALICE_CARD]);
        expect(response.playerStates.Alice.cardCount).toBe(1);

        expect(response.playerStates.Bob.cards).toBeUndefined();
        expect(response.playerStates.Bob.cardCount).toBe(2);
    });

    it("keeps an opponent's cards out of the payload entirely", () => {
        const wire = JSON.stringify(worldDominationStateToResponse(worldDominationState(), NAMES, "u1"));

        expect(wire).toContain("alice-secret-card");
        expect(wire).not.toContain("bob-secret-card");
        expect(wire).not.toContain("bob-second-card");
    });

    it("shows nobody's hand when nobody in particular is asking", () => {
        // The recap and result replays build snapshots with no viewer. Counts
        // still have to be right — the recap reports how many cards a player
        // has left after cashing in a set.
        const response = worldDominationStateToResponse(worldDominationState(), NAMES, null);

        expect(response.playerStates.Alice.cards).toBeUndefined();
        expect(response.playerStates.Bob.cards).toBeUndefined();
        expect(response.playerStates.Alice.cardCount).toBe(1);
        expect(response.playerStates.Bob.cardCount).toBe(2);
        expect(JSON.stringify(response)).not.toContain("secret-card");
    });
});

// ─── Settlements & Cities ────────────────────────────────────────────────────

function sacPlayer(overrides: Partial<ISACPlayerState> = {}): ISACPlayerState {
    return {
        resources: { lumber: 0, wool: 0, grain: 0, brick: 0, ore: 0 },
        devCards: { knight: 0, victoryPoint: 0, roadBuilding: 0, yearOfPlenty: 0, monopoly: 0 },
        newDevCards: { knight: 0, victoryPoint: 0, roadBuilding: 0, yearOfPlenty: 0, monopoly: 0 },
        knightsPlayed: 0,
        remainingRoads: 15,
        remainingSettlements: 5,
        remainingCities: 4,
        devCardsBought: 0,
        resourcesGathered: 0,
        robberUses: 0,
        ...overrides,
    };
}

function sacState(): ISACSpecificGameState {
    return {
        hexes: [],
        vertices: [],
        edges: [],
        harbors: [],
        playerStates: new Map([
            ["u1", sacPlayer({ resources: { lumber: 2, wool: 1, grain: 0, brick: 0, ore: 0 } })],
            // Bob is holding the game: three ore, and a victory-point card that
            // is supposed to stay hidden until it wins.
            ["u2", sacPlayer({
                resources: { lumber: 0, wool: 0, grain: 1, brick: 0, ore: 3 },
                devCards: { knight: 1, victoryPoint: 2, roadBuilding: 0, yearOfPlenty: 0, monopoly: 0 },
                newDevCards: { knight: 0, victoryPoint: 0, roadBuilding: 1, yearOfPlenty: 0, monopoly: 0 },
            })],
        ]),
        robberHexIndex: 0,
        phase: "main",
        setupStep: 0,
        pendingRoadSetup: false,
        lastSetupSettlementVertex: null,
        hasRolled: true,
        lastRoll: 8,
        lastRollDie1: 4,
        lastRollDie2: 4,
        pendingRobber: false,
        longestRoadOwner: null,
        largestArmyOwner: null,
        devCardDeck: [],
        pendingRoadBuilding: 0,
        playedDevCard: false,
        specialBuildActive: false,
        specialBuildQueue: [],
        specialBuildMainPlayer: null,
    } as unknown as ISACSpecificGameState;
}

describe("Settlements & Cities' response", () => {
    it("gives the viewer their own resources and everyone else a hand size", () => {
        const response = sacStateToResponse(sacState(), NAMES, "u1");

        expect(response.playerStates.Alice.resources).toEqual({ lumber: 2, wool: 1, grain: 0, brick: 0, ore: 0 });
        expect(response.playerStates.Alice.resourceCount).toBe(3);

        // Hand size is public in Catan — it's what the robber and the
        // seven-discard are played around — so Bob's total still comes through.
        expect(response.playerStates.Bob.resources).toBeUndefined();
        expect(response.playerStates.Bob.resourceCount).toBe(4);
    });

    it("sends dev card identities for the viewer alone, and a count for the rest", () => {
        const response = sacStateToResponse(sacState(), NAMES, "u1");

        expect(Object.keys(response.playerDevCards)).toEqual(["Alice"]);
        expect(Object.keys(response.playerNewDevCards)).toEqual(["Alice"]);
        // Buying is done in the open even though the card drawn isn't, so the
        // count covers playable and just-bought cards together: Bob's 1 knight
        // + 2 victory points + 1 just-bought road building.
        expect(response.playerStates.Bob.devCardCount).toBe(4);
    });

    it("keeps an opponent's hidden victory points out of the payload", () => {
        const wire = JSON.parse(JSON.stringify(sacStateToResponse(sacState(), NAMES, "u1")));

        expect(wire.playerDevCards.Bob).toBeUndefined();
        expect(wire.playerStates.Bob.resources).toBeUndefined();
    });

    it("shows nobody's hand when nobody in particular is asking", () => {
        const response = sacStateToResponse(sacState(), NAMES, null);

        expect(response.playerStates.Alice.resources).toBeUndefined();
        expect(response.playerStates.Bob.resources).toBeUndefined();
        expect(response.playerDevCards).toEqual({});
        expect(response.playerNewDevCards).toEqual({});
        // The counts the recap's resource deltas are built from survive.
        expect(response.playerStates.Alice.resourceCount).toBe(3);
        expect(response.playerStates.Bob.resourceCount).toBe(4);
    });
});
