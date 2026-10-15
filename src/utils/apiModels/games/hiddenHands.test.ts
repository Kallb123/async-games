import { describe, expect, it, vi } from "vitest";

// CreateDataResponse names the players through Clerk; the test hands it the names.
vi.mock("@/utils/users/clerk", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/utils/users/clerk")>()),
    userIdListToNamesAndMap: async (userIdList: string[]) => ({
        usernameList: userIdList.map(userId => ({ u1: "Alice", u2: "Bob" })[userId] ?? userId),
        userIdNameMap: { u1: "Alice", u2: "Bob" },
    }),
}));

import { gameStateToResponse as worldDominationStateToResponse, WorldDominationGameDataModel } from "@/games/WorldDomination/WorldDominationModels";
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
import { buildInitialRaceCarsState, gameStateToModel as raceCarsStateToModel } from "@/games/RaceCars/RaceCarsModels";
import { mongoMap } from "@/utils/games/mongoMaps";
import { getReplayAdapter } from "@/utils/games/replay";
import { buildInitialDiceCitiesState } from "@/games/DiceCities/DiceCitiesModels";
import { DiceCitiesCardIds } from "@/games/DiceCities/cards";
import { AMBULANCE_START, EDGE_COUNT, ENGINE_START, INTERIOR_SPACE_COUNT, SPACE_COUNT, spaceIndex } from "@/games/FiresOut/board";
import { buildTimeline } from "@/utils/games/replay";
import { REALM } from "@/games/RealmArena/characters";
import { gameStateToModel as realmArenaStateToModel, stepOutcomeToModel as realmArenaStepOutcome } from "@/games/RealmArena/RealmArenaModels";
import { RealmArenaGameType, type IRealmArenaOutcome, type RealmArenaEndTurn } from "@/games/RealmArena/RealmArenaLogic";
import { buildAllEvents } from "@/utils/games/recap";
import type { IRealmArenaSpecificGameStateResponse } from "@/games/RealmArena/apiModels";
import { areaAround as realmArenaAreaAround, check as realmArenaCheck, isStanding as isRealmArenaStanding, warbandOwner } from "@/games/RealmArena/rules";
import {
    actBy as realmArenaAct,
    battleOf as realmArenaBattle,
    endTurnBy as realmArenaEndTurn,
    makeGame as makeRealmArenaGame,
    muster as realmArenaMuster,
    musterAll as realmArenaMusterAll,
    play as playRealmArena,
    readyMadePicks as realmArenaPicks,
    scriptedAction as realmArenaScriptedAction,
    type RealmArenaTestGame,
} from "@/games/RealmArena/testFixtures";

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

    it("keeps the undo snapshot — every hand and the deck — off the wire, whoever asks", () => {
        // docs/undo.md §8: a held move's snapshot is a whole state, so it holds
        // Bob's hand and the deck. Only `canUndo` and `autoEndTurnAt` go out.
        const deckCard = { id: "top-of-the-deck", type: "wild" as const, territoryId: null };
        const gs = worldDominationState();
        gs.cardDeck = [deckCard];
        gs.undoStack = [{ by: "u1", turnStartedAt: "2026-10-01T08:00:00.000Z", state: { ...gs, cardDeck: [deckCard] } }];
        gs.undoAnchorId = "last-command";
        gs.autoEndTurnAt = "2026-10-01T08:00:10.000Z";

        for (const viewerId of ["u1", "u2", null]) {
            const response = worldDominationStateToResponse(gs, NAMES, viewerId, viewerId === "u1");
            const wire = JSON.stringify(response);
            expect(wire).not.toContain("undoStack");
            expect(wire).not.toContain("undoAnchorId");
            expect(wire).not.toContain("last-command");
            expect(wire).not.toContain("top-of-the-deck");
            expect(response.autoEndTurnAt).toBe(viewerId === "u1" ? gs.autoEndTurnAt : null);
            expect(response.canUndo).toBe(viewerId === "u1");
        }
    });

    it("sends undo only to the mover, through the real gate, and never the snapshot", async () => {
        // CreateDataResponse works `canUndo` out itself (undoEntryFor, against the
        // command log and the turn clock), so this builds the game it reads rather
        // than handing gameStateToResponse the answer. The snapshot's own copy of
        // Bob's hand and deck carry ids found nowhere else.
        const TURN_STARTED = "2026-10-01T08:00:00.000Z";
        const snapshotBobCard = { id: "snapshot-bob-card", type: "artillery" as const, territoryId: 11 };
        const snapshotDeckCard = { id: "snapshot-deck-card", type: "wild" as const, territoryId: null };
        const gs = worldDominationState();
        gs.cardDeck = [{ id: "live-deck-card", type: "wild" as const, territoryId: null }];
        gs.undoStack = [{
            by: "u1",
            turnStartedAt: TURN_STARTED,
            state: {
                ...gs,
                cardDeck: [snapshotDeckCard],
                playerStates: new Map([["u1", worldDominationPlayer({ cards: [ALICE_CARD] })], ["u2", worldDominationPlayer({ cards: [snapshotBobCard] })]]),
            },
        }];
        gs.undoAnchorId = "last-command";
        gs.autoEndTurnAt = "2026-10-01T08:00:10.000Z";
        const doc = {
            gameType: { className: "WorldDominationGameType", url: "worlddomination" },
            userIdList: ["u1", "u2"],
            turnTimer: "1d",
            currentTurn: "u1",
            lastTurnTimestamp: TURN_STARTED,
            gameState: { turnOrder: ["u1", "u2"], history: [], commandHistory: [{ id: "earlier-command" }, { id: "last-command" }] },
            specificGameState: gs,
            initialSpecificGameState: gs,
            complete: false,
            winner: "",
        };
        const respond = (viewerId: string | null) =>
            WorldDominationGameDataModel.schema.methods.CreateDataResponse.call(doc, viewerId);

        for (const viewerId of ["u1", "u2", null]) {
            const response = await respond(viewerId);
            expect(response.specificGameState.canUndo).toBe(viewerId === "u1");
            expect(response.specificGameState.autoEndTurnAt).toBe(viewerId === "u1" ? gs.autoEndTurnAt : null);
            const wire = JSON.stringify(response);
            expect(wire).not.toContain("undoStack");
            expect(wire).not.toContain("undoAnchorId");
            expect(wire).not.toContain("last-command");
            expect(wire).not.toContain("snapshot-bob-card");
            expect(wire).not.toContain("snapshot-deck-card");
            expect(wire).not.toContain("live-deck-card");
            // Bob's live hand is his own to see; nobody else's.
            if (viewerId !== "u2") {
                expect(wire).not.toContain("bob-secret-card");
                expect(wire).not.toContain("bob-second-card");
            }
        }

        // Anything run since the move closes the gate for the mover as well.
        doc.gameState.commandHistory.push({ id: "a-later-command" });
        expect((await respond("u1")).specificGameState.canUndo).toBe(false);
        expect((await respond("u1")).specificGameState.autoEndTurnAt).toBeNull();
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

    it("holds back whether a seat has ever had wool or grain, and its VP cards, until the game is complete", () => {
        const gs = sacState();
        gs.playerStates.get("u2")!.woolTraded = 1;
        gs.playerStates.get("u2")!.grainTraded = 1;
        const live = [null, "u1", "u2"].map(viewer => sacStateToResponse(gs, NAMES, viewer));
        const done = [null, "u1", "u2"].map(viewer => sacStateToResponse(gs, NAMES, viewer, null, true));

        // Not under the key at all, for any viewer, while the game is on.
        for (const response of live) {
            const wire = JSON.stringify(response);
            expect(wire).not.toContain("hasHeldWool");
            expect(wire).not.toContain("hasHeldGrain");
            expect(wire).not.toContain("victoryPointCards");
        }
        // Then the same answer for every viewer once it is over: Bob's two
        // victory-point cards are revealed to the whole table.
        for (const response of done) {
            expect(response.playerStates.u2.hasHeldWool).toBe(true);
            expect(response.playerStates.u2.hasHeldGrain).toBe(true);
            expect(response.playerStates.u2.victoryPointCards).toBe(2);
        }
    });

    it("sends a roll's payout to every viewer alike, with a 7's discards as a count", () => {
        // A roll's production is derivable from the public board and its number
        // tokens, so the payout goes out whole to every player. What a 7 *took*
        // isn't — it would name cards out of a hidden hand — so the state records
        // a count and that is all that can reach the wire.
        const gs = sacState();
        const payout = [
            { userId: "u1", gained: { lumber: 2, wool: 0, grain: 0, brick: 0, ore: 0 }, discarded: 0 },
            { userId: "u2", gained: { lumber: 0, wool: 0, grain: 0, brick: 0, ore: 0 }, discarded: 3 },
        ];
        gs.lastRollChanges = payout;

        // All three viewers: the player it paid, the opponent it cost, and the
        // viewerless snapshot a recap or result replay builds.
        for (const viewerId of ["u1", "u2", null]) {
            const wire = JSON.parse(JSON.stringify(sacStateToResponse(gs, NAMES, viewerId)));
            expect(wire.lastRollChanges).toEqual(payout);
        }
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

    // What each player gathered, by resource, is kept for the post-game
    // results table and revealed only there: mid-game it would name a robber
    // steal's resource. Nobody's is sent while the game is live — not even
    // the viewer's own, which their hand already covers.
    it("never sends what anyone gathered by resource", () => {
        const gs = sacState();
        for (const ps of gs.playerStates.values()) {
            ps.resourcesGatheredByType = { lumber: 7, wool: 0, grain: 0, brick: 0, ore: 5 };
        }

        for (const viewerId of ["u1", "u2", null]) {
            const wire = JSON.stringify(sacStateToResponse(gs, NAMES, viewerId));
            expect(wire).not.toContain("resourcesGatheredByType");
        }
    });

    // The undo stack (docs/undo.md §8) is a copy of every player's hand, dev
    // cards and deck — strictly more sensitive than the resources/dev cards
    // above — so it gets the same three-viewer treatment: the mover, an
    // opponent, and nobody in particular (a recap/result replay).
    it("never sends the undo stack, and tells only the mover they have one", () => {
        const gs = sacState();
        gs.undoStack = [{ by: "u1", state: sacState() }];
        gs.undoAnchorId = "some-command-id";

        for (const viewerId of ["u1", "u2", null]) {
            // The anchor still matches the (fictional) last command here, so
            // this is the "still your move" case — see undo.test.ts for the
            // anchor going stale.
            const wire = JSON.parse(JSON.stringify(sacStateToResponse(gs, NAMES, viewerId, "some-command-id")));
            expect(wire.undoStack).toBeUndefined();
            expect(wire.undoAnchorId).toBeUndefined();
            expect(wire.canUndo).toBe(viewerId === "u1");
        }
    });
});

// ─── Fires Out ────────────────────────────────────────────────────────────
// The whole game turns on POI identity staying hidden from *every* player —
// not per-opponent, since this is co-op — until a firefighter physically
// reaches that space (fires-out-gdd.md §10.1's design note). Unlike the
// three games above, redaction here doesn't key on the viewer at all, so
// there's only one wire shape to check rather than "mine" vs. "theirs".

/**
 * `owners` is a list of *figure* owners rather than the game's turn order
 * (fires-out-gdd.md §17.2 gap 3), so one player may appear more than once —
 * which is what §1's solitaire crew is (§17.6 step 12). The default is the
 * crew shape; the solo shape is the one the redaction guard below has to see
 * too, since a multi-figure roster is the new wire shape and any future
 * per-figure secret would land in it.
 */
function firesOutState(owners: string[] = ["u1"]): IFiresOutSpecificGameState {
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
        firefighters: owners.map(owner => newFirefighter(owner)),
        activeFirefighter: 0,
        hotspotReserve: 0,
        engine: ENGINE_START,
        ambulance: AMBULANCE_START,
        undoStack: [],
        undoAnchorId: null,
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

    it("redacts a whole solitaire crew's board the same way, for its owner and for anyone else", () => {
        // §1's solitaire mode puts every figure in one player's hands, so the
        // roster on the wire is several entries under one owner id. Nothing
        // about that is secret — §17.3 requires every figure's AP, specialist
        // and position to be visible on every screen — but the guard that
        // keeps POI identity off the wire only ever ran against a one-figure
        // crew game, so a per-figure secret added later would have had nothing
        // asserting it.
        const state = firesOutState(["u1", "u1", "u1", "u1"]);
        const asOwner = JSON.stringify(firesOutStateToModel(state, NAMES, "u1"));
        const asStranger = JSON.stringify(firesOutStateToModel(state, NAMES, "u2"));

        expect(asOwner).not.toContain('"victim":true');
        expect(JSON.parse(asOwner).poiPool).toBeUndefined();
        expect(JSON.parse(asOwner).spaces[spaceIndex(0, 0)].poi).toEqual({ id: 0, revealed: false });
        expect(JSON.parse(asOwner).firefighters).toHaveLength(4);
        expect(asStranger).toEqual(asOwner);
    });

    // A game saved before the exterior became a full perimeter ring has
    // shorter spaces/edges arrays, which the response builder grows before
    // serialising (rules.ts's boardAtCurrentLayout). The spaces it appends
    // must be blank outdoor ones, not a copy of anything — so the grown board
    // is checked here rather than only where the migration lives.
    it("grows a board saved before the exterior perimeter without inventing a POI", () => {
        const state = firesOutState();
        state.spaces = state.spaces.slice(0, INTERIOR_SPACE_COUNT + 16);
        state.edges = state.edges.slice(0, 98);

        const response = firesOutStateToModel(state, NAMES, "u1");

        expect(response.spaces).toHaveLength(SPACE_COUNT);
        expect(response.edges).toHaveLength(EDGE_COUNT);
        expect(response.spaces.slice(INTERIOR_SPACE_COUNT + 16).every(space => space.poi === null)).toBe(true);
        expect(JSON.stringify(response)).not.toContain('"victim":true');
        // The stored state is left exactly as it was — the response builder reads, it doesn't migrate.
        expect(state.spaces).toHaveLength(INTERIOR_SPACE_COUNT + 16);
    });
});

// ─── Race Cars ──────────────────────────────────────────────────────────────
// The inverse of every guard above: Race Cars hides *nothing* (§2's fourth
// pillar — docs/games/race-cars.md §23.4), so what has to be proved is the
// absence of hidden state rather than the presence of redaction. Two
// assertions, and only one of them proves it:
//
// - serialising as three different viewers gives three identical strings,
//   which proves `gameStateToModel` ignores its viewer — and nothing more.
//   Both leaks this file exists for were identical for every viewer;
// - the exact key set, top level and both player entries, against §23.4's list.
//   That is the one that fails the day a field arrives that a driver should
//   not see, which is the mechanism by which the pillar survives PRs 3-9.
//
// Both run twice: on the grid, and on a race one driver has got away from
// (§6a). The grid alone cannot fail either of them — every car is identical and
// every field is at its default, so an asymmetric field has nothing to be
// asymmetric about yet and an absent one is dropped by JSON before it is
// counted.

describe("Race Cars' response", () => {
    const raceCarsState = () => buildInitialRaceCarsState(["u1", "u2"], {
        distance: 'grandPrix', spec: 'balanced', oilSpills: true,
    });

    const RC_STATE_KEYS = [
        "autoEndTurnAt", "canUndo", "laps", "oilSpills", "playerStates", "round", "roundIndex", "roundOrder",
        "slicks", "spec", "trackId",
    ];
    const RC_PLAYER_KEYS = [
        "brakeSpent", "brakes", "cornerStops", "finishedPosition", "gear", "gearbox",
        "lane", "lapsCompleted", "phase", "raceNumber", "roll", "row", "skipNextTurn",
        "startRoll", "tyres", "userId", "username",
    ];

    /**
     * The grid once one driver has taken §6a's getaway and the other has not:
     * two cars that no longer match, which is the only state either assertion
     * below can actually fail in.
     *
     * On the grid alone, every car is identical and every field is at its
     * default — so a field that is `undefined` until a race is running would be
     * dropped by `JSON.stringify` and pass the key-set assertion, and a
     * viewer-dependent field cannot show itself while the two entries are
     * byte-identical anyway. `startRoll` is only caught by the grid because its
     * default happens to be `null` rather than absent.
     */
    const raceCarsUnderway = () => {
        const state = raceCarsState();
        const away = mongoMap(state.players).get("u1")!;
        away.startRoll = 18;
        away.phase = 'move';
        away.gear = 1;
        away.roll = 4;
        return state;
    };

    it.each([
        ["on the grid", raceCarsState],
        ["once a driver has got away", raceCarsUnderway],
    ])("carries exactly §23.4's state and nothing else, %s", (_when, build) => {
        const wire = JSON.parse(JSON.stringify(raceCarsStateToModel(build(), NAMES, "u1")));

        expect(Object.keys(wire).sort()).toEqual(RC_STATE_KEYS);
        expect(Object.keys(wire.playerStates.u1).sort()).toEqual(RC_PLAYER_KEYS);
        // The opponent's entry too: a field that only ever appears on the
        // viewer's own car is exactly the asymmetry this file exists to catch.
        expect(Object.keys(wire.playerStates.u2).sort()).toEqual(RC_PLAYER_KEYS);
    });

    it.each([
        ["on the grid", raceCarsState],
        ["once a driver has got away", raceCarsUnderway],
    ])("serialises identically for every viewer, including none, %s", (_when, build) => {
        const state = build();
        const asU1 = JSON.stringify(raceCarsStateToModel(state, NAMES, "u1"));
        const asU2 = JSON.stringify(raceCarsStateToModel(state, NAMES, "u2"));
        const asNobody = JSON.stringify(raceCarsStateToModel(state, NAMES, null));

        expect(asU2).toEqual(asU1);
        expect(asNobody).toEqual(asU1);
    });
});

// ─── Dice Cities ────────────────────────────────────────────────────────────
// Like Race Cars, Dice Cities hides nothing: the bank and every seat's cards and
// coins are the board. It is pinned for the view an achievement's check is
// handed (docs/achievements.md §9, §12 test 5) — the replay adapter asked for no
// viewer, exactly as `tableView` asks — by its exact key set, which is what fails
// the day a field arrives that the table shouldn't see. Asked of a game under
// way as well as a fresh one, because a field that stays undefined until play
// starts is dropped by JSON and would pass on the fresh one alone.

describe("Dice Cities' response to a viewer with no seat", () => {
    const DC_STATE_KEYS = [
        "autoEndTurnAt", "awaitingBCSelectionOpponent", "awaitingBCSelectionOwn", "awaitingDoubleReroll",
        "awaitingHarbourChoice", "awaitingTSSelection", "bankCards", "bankMoney", "bcSelectedOpponent",
        "bcSelectedOpponentCard", "bcSelectedOwnCard", "canUndo", "enabledDocks", "harbourRoll1", "harbourRoll2",
        "hasReRolled", "hasRolled", "playerStates", "theme",
    ];
    const DC_PLAYER_KEYS = [
        "acquiredCards", "bonusDiningAndStore", "cards", "doubleUnlocked", "harbourUnlocked", "lastDiceSelection", "money",
        "oneReroll", "rerollDoubles", "totalCoinsEarned", "userId", "username",
    ];

    const UNDO_DEADLINE = "2026-03-01T00:00:10.000Z";
    const fresh = () => buildInitialDiceCitiesState(["u1", "u2"]);
    const underway = () => {
        const state = fresh();
        const alice = state.playerStates.get("u1")!;
        alice.cards.push({ card: DiceCitiesCardIds.MINE, amount: 2 });
        alice.money = 17;
        alice.doubleUnlocked = true;
        state.hasRolled = true;
        // Alice's purchase is inside its undo hold: the two fields that are
        // hers alone to act on are live, so asserting they stay off the table's
        // view means something.
        state.undoStack = [{ by: "u1", turnStartedAt: "2026-03-01T00:00:00.000Z", state: {} } as never];
        state.autoEndTurnAt = UNDO_DEADLINE;
        return state;
    };
    const tableView = (state: ReturnType<typeof fresh>) =>
        JSON.parse(JSON.stringify(getReplayAdapter("DiceCitiesGameType")!.toResponseState(state, NAMES, null, [])));

    it.each([
        ["a fresh game", fresh],
        ["a game under way", underway],
    ])("carries exactly the public table and nothing else, in %s", (_when, build) => {
        const wire = tableView(build());

        expect(Object.keys(wire).sort()).toEqual(DC_STATE_KEYS);
        expect(Object.keys(wire.playerStates.u1).sort()).toEqual(DC_PLAYER_KEYS);
        expect(Object.keys(wire.playerStates.u2).sort()).toEqual(DC_PLAYER_KEYS);
        // And the entries inside them: a field slipped into a card count would
        // pass every assertion above.
        expect(Object.keys(wire.bankCards[0]).sort()).toEqual(["amount", "card"]);
        expect(Object.keys(wire.playerStates.u1.cards[0]).sort()).toEqual(["amount", "card"]);
        // Nothing to act on belongs to a viewer who holds no seat.
        expect(wire.canUndo).toBe(false);
        expect(wire.autoEndTurnAt).toBeNull();
        expect(JSON.stringify(wire)).not.toContain(UNDO_DEADLINE);
    });
});


// ─── Realm Arena ─────────────────────────────────────────────────────────────

// A co-op enemy drawn at random (docs/games/realm-arena.md §29.3, §29.11): the
// team musters not knowing whom it will face, so the faction stays off the
// wire, unnamed in the log and out of every review step until the team first
// sees one of its characters — and is everyone's from then on. A character's
// kind is its faction, so before then the log calls them "an enemy character",
// and the enemy's own "one of its characters", never "their Knight".

describe("Realm Arena's random co-op enemy", () => {
    const RA_NAMES = { a: "Alice", b: "Bob" };
    const VIEWERS = ["a", "b", null];
    // As the log writes it at the start of a line, too: "The Renegades moved…".
    const ENEMY_NAME = new RegExp(REALM.enemyName.replace(/^the /, ""), "i");

    /** One command of the fixtures' scripted turn: the current player's next action, or their End turn. */
    async function step(game: RealmArenaTestGame): Promise<void> {
        const player = game.currentTurn;
        const action = realmArenaBattle(game).fighters
            .filter(one => one.owner === player && isRealmArenaStanding(one))
            .map(one => realmArenaScriptedAction(game, one))
            .find(Boolean);
        const { outcome } = await playRealmArena(game, action ? realmArenaAct(player, action) : realmArenaEndTurn(player));
        if (!outcome.validMove) throw new Error(`${player}'s scripted command was refused`);
    }

    it("is hidden in fog of war until the team sees it, and named from then on", async () => {
        const game = makeRealmArenaGame(["a", "b"], {}, { fog: true, coop: { enemy: "realm", random: true } });
        await realmArenaMusterAll(game);
        const gs = game.specificGameState;
        const hidden = () => {
            for (const viewer of VIEWERS) expect(realmArenaStateToModel(gs, viewer, null)).not.toHaveProperty("enemy");
            for (const { text } of game.gameState.history) {
                expect(text).not.toMatch(ENEMY_NAME);
                if (text.startsWith("The enemy")) expect(text).not.toMatch(/their [A-Z]/);
            }
        };
        for (let command = 0; !gs.coop?.enemySeen; command++) {
            if (game.complete || command > 200) throw new Error("the team never saw the enemy");
            hidden();
            await step(game);
        }
        for (const viewer of VIEWERS) expect(realmArenaStateToModel(gs, viewer, null).enemy).toBe("realm");

        // A review is built from the state at each step: none before the
        // sighting carries it, and every one from it on does. The command that
        // saw it is the last one played, so its step is the review's last —
        // and in fog a review leaves out every step its viewer was told
        // nothing of (§27.2), so that's counted from the end. Only a player
        // is ever served one: nobody in particular is told nothing in fog,
        // the sighting included.
        for (const viewer of ["a", "b"]) {
            const { snapshots } = await buildTimeline(game, RA_NAMES, [], undefined, viewer);
            const seenAt = snapshots.length - 1;
            for (const [index, snapshot] of snapshots.entries()) {
                const wire = snapshot.specificGameState as IRealmArenaSpecificGameStateResponse;
                if (index < seenAt) {
                    expect(wire).not.toHaveProperty("enemy");
                    expect(JSON.stringify(snapshot.history)).not.toMatch(ENEMY_NAME);
                } else {
                    expect(wire.enemy).toBe("realm");
                }
            }
        }

        // Lines written after the sighting name it; those before stay as they were.
        while (!game.complete && !game.gameState.history.some(({ text }) => ENEMY_NAME.test(text))) await step(game);
        expect(game.gameState.history.some(({ text }) => ENEMY_NAME.test(text))).toBe(true);
    }, 60_000);

    it("never names the Miners by a Sapper's dynamite thrown out of sight (§33.3)", async () => {
        const game = makeRealmArenaGame(["a", "b"], {}, { fog: true, coop: { enemy: "miners", random: true } });
        await realmArenaMusterAll(game);
        const gs = game.specificGameState;
        // The first warband's Prospector is made a Sapper, and throws its
        // dynamite at open ground nobody stands round, far out of the team's sight.
        const sapper = gs.fighters.find(fighter => fighter.owner === warbandOwner(0) && fighter.character === "prospector")!;
        gs.fighters = gs.fighters.map(one => one.id === sapper.id ? { ...one, character: "sapper" } : one);
        // Its turn hasn't begun, so it's checked with the AP it will have.
        const battle = realmArenaBattle(game);
        const ready = { ...battle, fighters: battle.fighters.map(one => one.id === sapper.id ? { ...one, ap: 4 } : one) };
        const at = battle.field.tiles.findIndex((_, square) => realmArenaAreaAround(battle.field, square).every(near => !gs.fighters.some(one => one.square === near))
            && !("refused" in realmArenaCheck(ready, sapper.owner, { kind: "dynamite", fighter: sapper.id, at: square })));
        expect(at).toBeGreaterThanOrEqual(0);
        const ended = Object.assign(realmArenaEndTurn("a"), { recordedEnemyActions: [{ kind: "dynamite", fighter: sapper.id, at }] }) as RealmArenaEndTurn;
        const { outcome } = await playRealmArena(game, ended);
        expect(outcome.validMove).toBe(true);
        expect((outcome as IRealmArenaOutcome).events.some(event => event.kind === "dynamite")).toBe(true);
        expect(gs.coop?.enemySeen).toBeUndefined();

        const MINERS = /dynamite|🧨|Sapper|Miner/i;
        expect(game.gameState.history.map(({ text }) => text).filter(text => text.startsWith("The enemy")).join("\n")).not.toMatch(MINERS);
        for (const viewer of ["a", "b"]) expect(JSON.stringify(new RealmArenaGameType().outcomeFor(game, outcome, viewer))).not.toMatch(MINERS);
        for (const viewer of VIEWERS) {
            expect(realmArenaStateToModel(gs, viewer, null)).not.toHaveProperty("enemy");
            expect(JSON.stringify(realmArenaStepOutcome(outcome, viewer, gs) ?? null)).not.toMatch(MINERS);
            expect(JSON.stringify(await buildAllEvents(game, RA_NAMES, viewer))).not.toMatch(MINERS);
        }
    });

    it("is known the moment it hurts the team, even when the blow downs the only one who could see it (§31.3)", async () => {
        const game = makeRealmArenaGame(["a", "b"], {}, { fog: true, coop: { enemy: "swarm", random: true } });
        await realmArenaMusterAll(game);
        const gs = game.specificGameState;
        expect(gs.coop?.enemySeen).toBeUndefined();
        // Alice's Archer, hurt, alone with a Ravager; the rest of both sides
        // down but one teammate on the far side of the field, who sees nothing.
        const field = realmArenaBattle(game).field;
        const archer = gs.fighters.find(one => one.owner === "a" && one.character === "archer")!;
        const ravager = gs.fighters.find(one => one.owner === warbandOwner(0) && one.character === "ravager")!;
        const far = gs.fighters.find(one => one.owner === "b")!;
        const { col, row } = { col: archer.square % field.width, row: Math.floor(archer.square / field.width) };
        const beside = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dc, dr]) => (row + dr) * field.width + col + dc)
            .find(square => field.tiles[square]?.terrain.standable && field.tiles[square].elevation === field.tiles[archer.square].elevation && !gs.fighters.some(one => one.square === square))!;
        gs.fighters = gs.fighters.map(one => one.id === archer.id ? { ...one, hp: 2 }
            : one.id === ravager.id ? { ...one, square: beside }
            : one.id === far.id ? one : { ...one, hp: 0 });
        expect(realmArenaBattle(game).fighters.filter(one => isRealmArenaStanding(one)).length).toBe(3);

        const ended = Object.assign(realmArenaEndTurn(game.currentTurn), { recordedEnemyActions: [{ kind: "rend", fighter: ravager.id, target: archer.id }], recordedRolls: [1] }) as RealmArenaEndTurn;
        const { outcome } = await playRealmArena(game, ended);
        expect(outcome.validMove).toBe(true);
        expect((outcome as IRealmArenaOutcome).events).toContainEqual({ kind: "struck", fighter: ravager.id, target: archer.id, damage: 6, reaction: false, chance: 80, roll: 1 });
        expect(gs.coop?.enemySeen).toBe(true);
        for (const viewer of ["a", "b"]) expect(realmArenaStateToModel(gs, viewer, null).enemy).toBe("swarm");
        // The enemy's turn is told once it's over, by when the team knows whom it fights.
        expect(game.gameState.history.map(({ text }) => text)).toContain("The Swarm struck {{a}}'s Archer with their Ravager for 6; {{a}}'s Archer is down; scored 4 for the knock-out");
    });

    it("is there from the moment the squads take the field without fog", async () => {
        const game = makeRealmArenaGame(["a", "b"], {}, { coop: { enemy: "realm", random: true } });
        await realmArenaMusterAll(game);
        expect(game.specificGameState.coop?.enemySeen).toBe(true);
        for (const viewer of VIEWERS) expect(realmArenaStateToModel(game.specificGameState, viewer, null).enemy).toBe("realm");
    });

    it("is never hidden when the host picked it, and never sent before the battle when it was drawn", async () => {
        const picked = makeRealmArenaGame(["a", "b"], {}, { fog: true, coop: { enemy: "realm" } });
        expect(realmArenaStateToModel(picked.specificGameState, "a", null).enemy).toBe("realm");
        const drawn = makeRealmArenaGame(["a", "b"], {}, { coop: { enemy: "realm", random: true } });
        await playRealmArena(drawn, realmArenaMuster("a", realmArenaPicks(drawn, 0)));
        for (const viewer of VIEWERS) expect(realmArenaStateToModel(drawn.specificGameState, viewer, null)).not.toHaveProperty("enemy");
    });

    it("pins the viewerless response used to judge achievements", async () => {
        const game = makeRealmArenaGame(["a", "b"], {}, { fog: true, size: "large", coop: { enemy: "realm", random: true, mission: "holdOut", difficulty: "hard" } });
        await realmArenaMusterAll(game);

        const hidden = realmArenaStateToModel(game.specificGameState, null, null);
        expect(Object.keys(hidden).sort()).toEqual([
            "battleRounds", "blasted", "budget", "canUndo", "clouds", "coop",
            "difficulty", "fighters", "fog", "ghosts", "map", "mastery", "mission", "mustered",
            "myMuster", "nextWave", "phase", "round", "rulesVersion", "scores", "size",
        ]);
        // What the host chose in the open: every viewer's, the null viewer's included.
        expect(hidden).toMatchObject({ difficulty: "hard", size: "large" });
        // In fog with the enemy unseen, the next wave's round and nothing of its size, which would name the faction.
        expect(hidden.nextWave).toEqual({ round: 4 });
        expect(hidden).not.toHaveProperty("enemy");
        expect(hidden.fighters).toEqual([]);
        expect(hidden.ghosts).toEqual([]);
        expect(hidden.mastery).toEqual({});
        expect(hidden.myMuster).toBeNull();
        expect(hidden.canUndo).toBe(false);

        // Match achievements run only after the battle ends. Completion lifts
        // the fog for the null viewer, revealing the enemy and every fighter.
        const complete = realmArenaStateToModel(game.specificGameState, null, null, true);
        // The next wave goes with the battle: no wave is coming.
        expect(Object.keys(complete).sort()).toEqual([...Object.keys(hidden).filter(key => key !== "nextWave"), "enemy"].sort());
        expect(complete.enemy).toBe("realm");
        expect(complete.fighters).toHaveLength(game.specificGameState.fighters.length);
        expect(complete.ghosts).toEqual([]);
    });
});
