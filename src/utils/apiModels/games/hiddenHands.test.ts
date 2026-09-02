import { describe, expect, it } from "vitest";

import { gameStateToResponse as worldDominationStateToResponse } from "@/games/WorldDomination/WorldDominationModels";
import type { IWorldDominationSpecificGameState } from "@/games/WorldDomination/WorldDominationModels";
import {
    makeState as makeWorldDominationState,
    player as worldDominationPlayer,
} from "@/games/WorldDomination/testFixtures";
import { gameStateToModel as trainTimeStateToModel } from "@/games/TrainTime/TrainTimeModels";
import { buildInitialTrainTimeState } from "@/games/TrainTime/board";
import { gameStateToResponse as sacStateToResponse } from "@/games/SettlementsAndCities/SettlementsAndCitiesModels";
import type { ISACSpecificGameState } from "@/games/SettlementsAndCities/board";
import { makeState as makeSacState, player as sacPlayer } from "@/games/SettlementsAndCities/testFixtures";
import { gameStateToModel as firesOutStateToModel, IFiresOutSpecificGameState } from "@/games/FiresOut/FiresOutModels";
import { buildEmptyEdges, buildEmptySpaces, newFirefighter } from "@/games/FiresOut/rules";
import { AMBULANCE_START, ENGINE_START, spaceIndex } from "@/games/FiresOut/board";

// Two of the games this guards were once sending every player's hidden hand to
// every player: World Domination shipped each player's territory cards, and
// Settlements & Cities shipped each player's resource composition and dev card
// identities. Both are dealt face down by their own design docs, and both UIs
// only ever rendered a *count* for opponents — so the leak was invisible on
// screen and visible to anyone reading the response. Train Time is here for
// the same reason one step earlier: its hand is now on screen for its owner at
// every moment of the game, so the redaction that keeps it theirs alone is
// worth a guard of its own.
//
// These assert on the serialised response as well as the shape, because the
// question is what a client can read off the wire, not what the typings say.

const NAMES = { u1: "Alice", u2: "Bob" };

// ─── Train Time ──────────────────────────────────────────────────────────────

// Train Time's redaction is keyed on the viewer, not on whose turn it is —
// which is what lets the board keep a waiting player's own hand on screen
// between their turns. Asking as each player in turn is the guard: key it on
// the mover instead and one of these two halves fails.

function trainTimeState() {
    const state = buildInitialTrainTimeState(["u1", "u2"]);
    // Kept tickets as well as the pending deal, so the "who can see which
    // tickets" question is asked of a mid-game hand, not just the setup one.
    state.playerStates.get("u1")!.tickets = state.playerStates.get("u1")!.pendingTickets.splice(0, 1);
    state.playerStates.get("u2")!.tickets = state.playerStates.get("u2")!.pendingTickets.splice(0, 1);
    return state;
}

describe("Train Time's response", () => {
    it("gives each viewer their own hand and everyone else a count", () => {
        const state = trainTimeState();
        const alice = state.playerStates.get("u1")!;
        const bob = state.playerStates.get("u2")!;

        const asAlice = trainTimeStateToModel(state, NAMES, "u1");
        expect(asAlice.myHand).toEqual(alice.hand);
        expect(asAlice.playerStates.u2.handCount).toBe(bob.hand.length);

        const asBob = trainTimeStateToModel(state, NAMES, "u2");
        expect(asBob.myHand).toEqual(bob.hand);
        expect(asBob.playerStates.u1.handCount).toBe(alice.hand.length);
    });

    it("keeps an opponent's cards and tickets off the wire", () => {
        const state = trainTimeState();
        const wire = JSON.parse(JSON.stringify(trainTimeStateToModel(state, NAMES, "u1")));

        // Nothing but the counts: no hand array, and tickets stay face down
        // until the game is scored (§10), which this one isn't.
        expect(wire.playerStates.u2.hand).toBeUndefined();
        expect(wire.playerStates.u2.tickets).toBeUndefined();
        expect(wire.playerStates.u1.hand).toBeUndefined();
        expect(wire.playerStates.u1.tickets).toBeUndefined();
        expect(wire.playerStates.u2.ticketCount).toBe(state.playerStates.get("u2")!.tickets.length);

        // The viewer's own, and only the viewer's own.
        const ownTicketIds = state.playerStates.get("u1")!.tickets;
        expect(wire.myTickets.map((t: { id: number }) => t.id)).toEqual(ownTicketIds);
        expect(wire.myPendingTickets.map((t: { id: number }) => t.id))
            .toEqual(state.playerStates.get("u1")!.pendingTickets);
    });

    it("shows nobody's hand when nobody in particular is asking", () => {
        // Recap and result replays build snapshots with no viewer; the counts
        // they narrate from still have to be right.
        const state = trainTimeState();
        const response = trainTimeStateToModel(state, NAMES, null);

        expect(response.myHand).toEqual([]);
        expect(response.myTickets).toEqual([]);
        expect(response.myPendingTickets).toEqual([]);
        expect(response.playerStates.u1.handCount).toBe(state.playerStates.get("u1")!.hand.length);
        expect(response.playerStates.u2.handCount).toBe(state.playerStates.get("u2")!.hand.length);
    });

    it("reveals every player's tickets once the game is scored", () => {
        const state = trainTimeState();
        state.gameOver = true;

        const response = trainTimeStateToModel(state, NAMES, "u1");
        expect(response.playerStates.u2.tickets?.map(t => t.id))
            .toEqual(state.playerStates.get("u2")!.tickets);
    });
});

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

        expect(response.playerStates.u1.cards).toEqual([ALICE_CARD]);
        expect(response.playerStates.u1.cardCount).toBe(1);

        expect(response.playerStates.u2.cards).toBeUndefined();
        expect(response.playerStates.u2.cardCount).toBe(2);
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

        expect(response.playerStates.u1.cards).toBeUndefined();
        expect(response.playerStates.u2.cards).toBeUndefined();
        expect(response.playerStates.u1.cardCount).toBe(1);
        expect(response.playerStates.u2.cardCount).toBe(2);
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

// ─── Fires Out ────────────────────────────────────────────────────────────
// The whole game turns on POI identity staying hidden from *every* player —
// not per-opponent, since this is co-op — until a firefighter physically
// reaches that space (fires-out-gdd.md §10.1's design note). Unlike the
// three games above, redaction here doesn't key on the viewer at all, so
// there's only one wire shape to check rather than "mine" vs. "theirs".

function firesOutState(): IFiresOutSpecificGameState {
    const spaces = buildEmptySpaces();
    spaces[spaceIndex(0, 0)].poi = { id: 0, revealed: false, victim: true };
    spaces[spaceIndex(0, 1)].poi = { id: 1, revealed: true, victim: false };
    return {
        ruleset: 'family',
        difficulty: 'recruit',
        spaces,
        edges: buildEmptyEdges(),
        poiPool: [true, false, true],
        nextPoiId: 2,
        rescued: 0,
        lost: 0,
        firefighters: [newFirefighter("u1")],
        activeFirefighter: 0,
        hotspotReserve: 0,
        engine: ENGINE_START,
        ambulance: AMBULANCE_START,
    };
}

describe("Fires Out's response", () => {
    it("keeps an unrevealed POI's identity off the wire entirely", () => {
        const wire = JSON.parse(JSON.stringify(firesOutStateToModel(firesOutState(), NAMES, "u1")));

        expect(wire.spaces[spaceIndex(0, 0)].poi).toEqual({ id: 0, revealed: false });
        expect("victim" in wire.spaces[spaceIndex(0, 0)].poi).toBe(false);
        // Scoped to the unrevealed marker alone — a second, already-revealed
        // POI in the same state legitimately does carry "victim" on the wire.
        expect(JSON.stringify(wire.spaces[spaceIndex(0, 0)].poi)).not.toContain("victim");
    });

    it("reveals identity once a POI has actually been flipped over", () => {
        const wire = JSON.parse(JSON.stringify(firesOutStateToModel(firesOutState(), NAMES, "u1")));
        expect(wire.spaces[spaceIndex(0, 1)].poi).toEqual({ id: 1, revealed: true, victim: false });
    });

    it("redacts the same way for every viewer, since nothing here is per-player", () => {
        const state = firesOutState();
        const asU1 = JSON.stringify(firesOutStateToModel(state, NAMES, "u1"));
        const asU2 = JSON.stringify(firesOutStateToModel(state, NAMES, "u2"));
        const asNobody = JSON.stringify(firesOutStateToModel(state, NAMES, null));
        expect(asU1).not.toContain('"victim":true');
        expect(asU2).toEqual(asU1);
        expect(asNobody).toEqual(asU1);
    });

    it("sends the undrawn POI pool as a count, never the pool itself", () => {
        const response = firesOutStateToModel(firesOutState(), NAMES, "u1");
        expect((response as unknown as { poiPool?: unknown }).poiPool).toBeUndefined();
        expect(response.poiPoolCount).toBe(3);
    });
});
