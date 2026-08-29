import { describe, expect, it } from "vitest";

import { gameStateToResponse as worldDominationStateToResponse } from "@/games/WorldDomination/WorldDominationModels";
import type { IWorldDominationSpecificGameState } from "@/games/WorldDomination/WorldDominationModels";
import {
    makeState as makeWorldDominationState,
    player as worldDominationPlayer,
} from "@/games/WorldDomination/testFixtures";
import { gameStateToResponse as sacStateToResponse } from "@/games/SettlementsAndCities/SettlementsAndCitiesModels";
import type { ISACSpecificGameState } from "@/games/SettlementsAndCities/board";
import { makeState as makeSacState, player as sacPlayer } from "@/games/SettlementsAndCities/testFixtures";

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
    return makeWorldDominationState({
        playerStates: new Map([
            ["u1", worldDominationPlayer({ cards: [ALICE_CARD] })],
            ["u2", worldDominationPlayer({ cards: [BOB_CARD, { ...BOB_CARD, id: "bob-second-card" }] })],
        ]),
    });
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

function sacState(): ISACSpecificGameState {
    return makeSacState({
        playerStates: new Map([
            ["u1", sacPlayer({ resources: { lumber: 2, wool: 1 } })],
            // Bob is holding the game: three ore, and victory-point cards that
            // are supposed to stay hidden until they win it.
            ["u2", sacPlayer({
                resources: { grain: 1, ore: 3 },
                devCards: { knight: 1, victoryPoint: 2 },
                newDevCards: { roadBuilding: 1 },
            })],
        ]),
    });
}

describe("Settlements & Cities' response", () => {
    it("gives the viewer their own resources and everyone else a hand size", () => {
        const response = sacStateToResponse(sacState(), NAMES, "u1");

        expect(response.playerStates.u1.resources).toEqual({ lumber: 2, wool: 1, grain: 0, brick: 0, ore: 0 });
        expect(response.playerStates.u1.resourceCount).toBe(3);

        // Hand size is public in Catan — it's what the robber and the
        // seven-discard are played around — so Bob's total still comes through.
        expect(response.playerStates.u2.resources).toBeUndefined();
        expect(response.playerStates.u2.resourceCount).toBe(4);
    });

    it("sends dev card identities for the viewer alone, and a count for the rest", () => {
        const response = sacStateToResponse(sacState(), NAMES, "u1");

        expect(Object.keys(response.playerDevCards)).toEqual(["u1"]);
        expect(Object.keys(response.playerNewDevCards)).toEqual(["u1"]);
        // Buying is done in the open even though the card drawn isn't, so the
        // count covers playable and just-bought cards together: Bob's 1 knight
        // + 2 victory points + 1 just-bought road building.
        expect(response.playerStates.u2.devCardCount).toBe(4);
    });

    it("keeps an opponent's hidden victory points out of the payload", () => {
        const wire = JSON.parse(JSON.stringify(sacStateToResponse(sacState(), NAMES, "u1")));

        expect(wire.playerDevCards.u2).toBeUndefined();
        expect(wire.playerStates.u2.resources).toBeUndefined();
    });

    it("shows nobody's hand when nobody in particular is asking", () => {
        const response = sacStateToResponse(sacState(), NAMES, null);

        expect(response.playerStates.u1.resources).toBeUndefined();
        expect(response.playerStates.u2.resources).toBeUndefined();
        expect(response.playerDevCards).toEqual({});
        expect(response.playerNewDevCards).toEqual({});
        // The counts the recap's resource deltas are built from survive.
        expect(response.playerStates.u1.resourceCount).toBe(3);
        expect(response.playerStates.u2.resourceCount).toBe(4);
    });
});
