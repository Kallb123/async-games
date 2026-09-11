import { describe, expect, it } from "vitest";
import { buildInitialBannedIsletState, cloneBannedIsletState, gameStateToModel } from "./BannedIsletModels";
import {
    DIFFICULTIES,
    HELICOPTER_LIFT_CARD_COUNT,
    SANDBAGS_CARD_COUNT,
    STARTING_HAND_SIZE,
    TILES_FLOODED_AT_SETUP,
    TILE_COUNT,
    TILE_IDS,
    TREASURE_CARDS_PER_TREASURE,
    TREASURE_DECK_CARDS,
    TREASURE_IDS,
    WATERS_RISE_CARD_COUNT,
    roleDef,
} from "./board";
import { positionOfTile } from "./rules";

const NAMES = { u1: "Alice", u2: "Bob", u3: "Carol" };
const TURN_ORDER = ["u1", "u2", "u3"];

describe("buildInitialBannedIsletState — the opening island (§6)", () => {
    it("shuffles all 24 tiles into the 24 positions, dry but for the six that flooded", () => {
        const state = buildInitialBannedIsletState(TURN_ORDER, "normal");

        expect(state.positions).toHaveLength(TILE_COUNT);
        expect(state.positions.map(p => p.tile).sort()).toEqual([...TILE_IDS].sort());
        expect(state.positions.filter(p => p.state === "flooded")).toHaveLength(TILES_FLOODED_AT_SETUP);
        expect(state.positions.filter(p => p.state === "sunk")).toHaveLength(0);
    });

    it("floods exactly the tiles whose flood cards it flipped (§6 step 2)", () => {
        const state = buildInitialBannedIsletState(TURN_ORDER, "normal");

        expect(state.floodDiscard).toHaveLength(TILES_FLOODED_AT_SETUP);
        for (const tile of state.floodDiscard) {
            expect(state.positions[positionOfTile(state.positions, tile)].state).toBe("flooded");
        }
    });

    it("keeps all 24 flood cards accounted for between the deck and the discard (§9.1's conservation)", () => {
        const state = buildInitialBannedIsletState(TURN_ORDER, "normal");

        expect(state.floodDeck).toHaveLength(TILE_COUNT - TILES_FLOODED_AT_SETUP);
        expect([...state.floodDeck, ...state.floodDiscard].sort()).toEqual([...TILE_IDS].sort());
    });

    it("deals one role each, on that role's own start tile (§6 step 4)", () => {
        const state = buildInitialBannedIsletState(TURN_ORDER, "normal");

        const roles = TURN_ORDER.map(userId => state.players.get(userId)!.role);
        expect(new Set(roles).size).toBe(TURN_ORDER.length);
        for (const userId of TURN_ORDER) {
            const ps = state.players.get(userId)!;
            expect(ps.position).toBe(positionOfTile(state.positions, roleDef(ps.role).startTile));
            expect(ps.actionsLeft).toBe(3);
            expect(ps.pilotFlightUsed).toBe(false);
        }
    });

    it("starts a pawn on a flooded start tile rather than moving it — a flooded tile is standable (§6 step 4, §9.1)", () => {
        // Over enough deals the six-tile flood lands on somebody's start tile;
        // whenever it does, the pawn is still there.
        for (let attempt = 0; attempt < 50; attempt++) {
            const state = buildInitialBannedIsletState(TURN_ORDER, "normal");
            for (const userId of TURN_ORDER) {
                const ps = state.players.get(userId)!;
                expect(state.positions[ps.position].tile).toBe(roleDef(ps.role).startTile);
                expect(state.positions[ps.position].state).not.toBe("sunk");
            }
        }
    });

    it("deals two cards each, never a Waters Rise!, and shuffles them back in afterwards (§6 step 5)", () => {
        // Repeated because the guard is about a shuffle: one clean deal proves
        // nothing about the next.
        for (let attempt = 0; attempt < 50; attempt++) {
            const state = buildInitialBannedIsletState(TURN_ORDER, "normal");
            const hands = TURN_ORDER.flatMap(userId => state.players.get(userId)!.hand);
            expect(hands).toHaveLength(TURN_ORDER.length * STARTING_HAND_SIZE);
            expect(hands).not.toContain("watersRise");
            expect(state.treasureDeck.filter(c => c === "watersRise")).toHaveLength(WATERS_RISE_CARD_COUNT);
        }
    });

    it("keeps §10's 28 cards accounted for between the hands and the deck", () => {
        const state = buildInitialBannedIsletState(TURN_ORDER, "normal");
        const hands = TURN_ORDER.flatMap(userId => state.players.get(userId)!.hand);

        expect([...state.treasureDeck, ...hands].sort()).toEqual([...TREASURE_DECK_CARDS].sort());
        expect(TREASURE_DECK_CARDS).toHaveLength(
            TREASURE_IDS.length * TREASURE_CARDS_PER_TREASURE
            + WATERS_RISE_CARD_COUNT + HELICOPTER_LIFT_CARD_COUNT + SANDBAGS_CARD_COUNT,
        );
        expect(state.treasureDiscard).toEqual([]);
    });

    it("leaves every treasure uncaptured and the turn open for actions", () => {
        const state = buildInitialBannedIsletState(TURN_ORDER, "normal");
        expect(state.treasures).toEqual({ emberCrown: false, stormIdol: false, tideChalice: false, rootStone: false });
        expect(state.phase).toBe("actions");
    });

    it.each(DIFFICULTIES)("starts $label on water level $startWaterLevel (§13)", ({ id, startWaterLevel }) => {
        expect(buildInitialBannedIsletState(TURN_ORDER, id).waterLevel).toBe(startWaterLevel);
        expect(buildInitialBannedIsletState(TURN_ORDER, id).difficulty).toBe(id);
    });
});

describe("cloneBannedIsletState — the snapshot replay reads", () => {
    it("copies every field into independent objects, in turn order", () => {
        const state = buildInitialBannedIsletState(TURN_ORDER, "elite");
        const clone = cloneBannedIsletState(state, TURN_ORDER);

        expect(clone).toEqual(state);
        expect([...clone.players.keys()]).toEqual(TURN_ORDER);

        // Independent: mutating the live game must not reach back into the
        // snapshot recap replays from.
        state.positions[0].state = "sunk";
        state.players.get("u1")!.hand.push("sandbags");
        state.floodDeck.pop();
        expect(clone.positions[0].state).not.toBe("sunk");
        expect(clone.players.get("u1")!.hand).toHaveLength(STARTING_HAND_SIZE);
        expect(clone.floodDeck).toHaveLength(TILE_COUNT - TILES_FLOODED_AT_SETUP);
    });
});

describe("gameStateToModel — what reaches the client (§21.4)", () => {
    it("sends both deck orders as counts and never the cards themselves", () => {
        const state = buildInitialBannedIsletState(["u1", "u2"], "normal");
        const wire = JSON.parse(JSON.stringify(gameStateToModel(state, NAMES, "u1")));

        expect(wire.treasureDeckCount).toBe(state.treasureDeck.length);
        expect(wire.floodDeckCount).toBe(state.floodDeck.length);
        expect(wire.treasureDeck).toBeUndefined();
        expect(wire.floodDeck).toBeUndefined();

        // Which tile sits where is public — the island is on screen — so the
        // guard can't be "this tile name never appears". It's that the response
        // carries no field able to hold a deck order at all: an allowlist, so a
        // field added later fails here rather than shipping the forecast.
        expect(Object.keys(wire).sort()).toEqual([
            "difficulty", "floodDeckCount", "floodDiscard", "phase", "playerStates",
            "positions", "treasureDeckCount", "treasureDiscard", "treasures", "waterLevel",
        ]);
        expect(Object.keys(wire.playerStates.u1).sort()).toEqual([
            "actionsLeft", "hand", "pilotFlightUsed", "position", "role", "userId", "username",
        ]);
    });

    it("sends both discards in full — reading the flood discard is the skill (§14.2)", () => {
        const state = buildInitialBannedIsletState(["u1", "u2"], "normal");
        const wire = gameStateToModel(state, NAMES, "u1");

        expect(wire.floodDiscard).toEqual(state.floodDiscard);
        expect(wire.treasureDiscard).toEqual(state.treasureDiscard);
    });

    it("sends every hand to every viewer — hands are public here by §2", () => {
        const state = buildInitialBannedIsletState(["u1", "u2"], "normal");
        const alice = state.players.get("u1")!;
        const bob = state.players.get("u2")!;

        for (const viewer of ["u1", "u2"]) {
            const wire = gameStateToModel(state, NAMES, viewer);
            expect(wire.playerStates.u1.hand).toEqual(alice.hand);
            expect(wire.playerStates.u2.hand).toEqual(bob.hand);
        }
    });

    it("names each player and copies the island rather than sharing it", () => {
        const state = buildInitialBannedIsletState(["u1", "u2"], "legendary");
        const wire = gameStateToModel(state, NAMES, "u1");

        expect(wire.playerStates.u1.username).toBe("Alice");
        expect(wire.playerStates.u2.username).toBe("Bob");
        expect(wire.positions).toHaveLength(TILE_COUNT);
        expect(wire.waterLevel).toBe(4);

        state.positions[0].state = "sunk";
        expect(wire.positions[0].state).not.toBe("sunk");
    });

    it("falls back to the userId when a name is missing rather than sending nothing", () => {
        const state = buildInitialBannedIsletState(["u1", "u2"], "normal");
        const wire = gameStateToModel(state, {}, "u1");
        expect(wire.playerStates.u1.username).toBe("u1");
    });
});
