import { describe, expect, it } from "vitest";
import { resolveStalledTurn } from "@/utils/games/turnTimeout";
import type { IGameDataDocument } from "@/utils/mongodb/GameData";
import { SettlementsAndCitiesGameType } from "./SettlementsAndCitiesLogic";
import { BOARD_TOPOLOGY, isValidSetupRoadEdge } from "./board";
import type { ISACEdge, ISACVertex } from "./board";
import { makeState, player } from "./testFixtures";

// A stalled turn resolves through this game's own commands, never by mutating
// specificGameState from the cron — see turnTimeout.ts's registration for why
// the cron's old plain advance corrupted the setup snake order and could
// misattribute a road, and skipped a whole roll's payout in the main phase.
// Shape of src/games/BannedIslet/turnTimeout.test.ts.

function emptyVertices(): ISACVertex[] {
    return Array.from({ length: BOARD_TOPOLOGY.numVertices }, () => ({ building: null, owner: null }));
}

function emptyEdges(): ISACEdge[] {
    return Array.from({ length: BOARD_TOPOLOGY.numEdges }, () => ({ hasRoad: false, owner: null }));
}

function makeGame(state: ReturnType<typeof makeState>, turnOrder: string[] = ["u1", "u2"]): IGameDataDocument {
    return {
        gameId: "g",
        gameType: new SettlementsAndCitiesGameType(),
        currentTurn: turnOrder[0],
        userIdList: turnOrder,
        gameState: { turnOrder, history: [], commandHistory: [] },
        specificGameState: state,
        complete: false,
        winner: "",
        markModified: () => {},
    } as unknown as IGameDataDocument;
}

function playedClassNames(game: IGameDataDocument): string[] {
    return (game.gameState.commandHistory as unknown as { className: string }[]).map(c => c.className);
}

describe("Settlements & Cities turn timeout — setup phase", () => {
    it("places a random legal settlement and its road when nothing has been placed yet", async () => {
        const gs = makeState({ phase: "setup", vertices: emptyVertices(), edges: emptyEdges() });
        gs.playerStates.set("u1", player());
        gs.playerStates.set("u2", player());
        const game = makeGame(gs);

        expect(await resolveStalledTurn(game, "u1", "Alice")).toBe("advanced");
        expect(playedClassNames(game)).toEqual(["SACPlaceSettlementSetup", "SACPlaceRoadSetup"]);

        const settlementVertex = gs.vertices.findIndex(v => v.owner === "u1");
        expect(settlementVertex).toBeGreaterThanOrEqual(0);
        expect(gs.vertices[settlementVertex].building).toBe("settlement");

        const road = gs.edges.findIndex(e => e.owner === "u1");
        expect(road).toBeGreaterThanOrEqual(0);
        // Checked against a fresh, unbuilt board: the live one already carries
        // the road we're validating, which isValidSetupRoadEdge would refuse.
        expect(isValidSetupRoadEdge(road, settlementVertex, emptyEdges())).toBe(true);

        // The snake order actually advanced (setupStep, not just currentTurn) —
        // the desync the old plain advance left behind.
        expect(gs.setupStep).toBe(1);
        expect(game.currentTurn).toBe("u2");
    });

    it("places only the road when the settlement is already down and the road stalled", async () => {
        const vertices = emptyVertices();
        const settlementVertex = 10;
        vertices[settlementVertex] = { building: "settlement", owner: "u1" };
        const gs = makeState({
            phase: "setup",
            vertices,
            edges: emptyEdges(),
            pendingRoadSetup: true,
            lastSetupSettlementVertex: settlementVertex,
            setupStep: 0,
        });
        gs.playerStates.set("u1", player());
        gs.playerStates.set("u2", player());
        const game = makeGame(gs);

        expect(await resolveStalledTurn(game, "u1", "Alice")).toBe("advanced");
        expect(playedClassNames(game)).toEqual(["SACPlaceRoadSetup"]);

        const road = gs.edges.findIndex(e => e.owner === "u1");
        expect(road).toBeGreaterThanOrEqual(0);
        expect(BOARD_TOPOLOGY.edges[road]).toContain(settlementVertex);
        expect(gs.pendingRoadSetup).toBe(false);
        expect(gs.setupStep).toBe(1);
        expect(game.currentTurn).toBe("u2");
    });

    it("never hands out a vertex the distance rule already forbids", async () => {
        // Every vertex adjacent to u2's opening settlement is off limits — the
        // random pick has to respect that like any live placement would.
        const vertices = emptyVertices();
        vertices[0] = { building: "settlement", owner: "u2" };
        const gs = makeState({ phase: "setup", vertices, edges: emptyEdges() });
        gs.playerStates.set("u1", player());
        gs.playerStates.set("u2", player());
        const game = makeGame(gs);

        await resolveStalledTurn(game, "u1", "Alice");

        const settlementVertex = gs.vertices.findIndex(v => v.owner === "u1");
        expect(settlementVertex).not.toBe(0);
        expect(BOARD_TOPOLOGY.vertexAdjacent[0]).not.toContain(settlementVertex);
    });
});

describe("Settlements & Cities turn timeout — main phase", () => {
    it("moves the robber off a random other hex when a 7 left it stalled", async () => {
        const gs = makeState({
            phase: "main",
            hexes: [{ terrain: "desert", numberToken: null }, { terrain: "desert", numberToken: null }],
            vertices: emptyVertices(),
            edges: emptyEdges(),
            robberHexIndex: 0,
            pendingRobber: true,
            hasRolled: true,
        });
        gs.playerStates.set("u1", player());
        gs.playerStates.set("u2", player());
        const game = makeGame(gs);

        expect(await resolveStalledTurn(game, "u1", "Alice")).toBe("advanced");
        // Nobody had a building anywhere, so there was nobody to steal from —
        // and nothing left to build with an empty hand, so SACMoveRobber's own
        // follow-up ends the turn too.
        expect(playedClassNames(game)).toEqual(["SACMoveRobber", "SACEndTurn"]);
        expect(gs.robberHexIndex).toBe(1);
        expect(gs.pendingRobber).toBe(false);
        expect(game.currentTurn).toBe("u2");
    });

    it("places both of a stalled Road Building's free roads, then ends the turn", async () => {
        const vertices = emptyVertices();
        vertices[5] = { building: "settlement", owner: "u1" };
        const gs = makeState({
            phase: "main",
            vertices,
            edges: emptyEdges(),
            hasRolled: true,
            pendingRoadBuilding: 2,
        });
        gs.playerStates.set("u1", player());
        gs.playerStates.set("u2", player());
        const game = makeGame(gs);

        expect(await resolveStalledTurn(game, "u1", "Alice")).toBe("advanced");
        expect(playedClassNames(game)).toEqual(["SACBuildRoad", "SACBuildRoad", "SACEndTurn"]);
        expect(gs.pendingRoadBuilding).toBe(0);
        expect(gs.edges.filter(e => e.owner === "u1")).toHaveLength(2);
        expect(game.currentTurn).toBe("u2");
    });

    it("ends a Special Build turn straight away rather than deciding what to build", async () => {
        const gs = makeState({
            phase: "main",
            vertices: emptyVertices(),
            edges: emptyEdges(),
            hasRolled: false,
            specialBuildActive: true,
            specialBuildQueue: ["u1", "u2"],
            specialBuildMainPlayer: "u2",
        });
        gs.playerStates.set("u1", player());
        gs.playerStates.set("u2", player());
        const game = makeGame(gs);

        expect(await resolveStalledTurn(game, "u1", "Alice")).toBe("advanced");
        expect(playedClassNames(game)).toEqual(["SACEndTurn"]);
        expect(game.currentTurn).toBe("u2");
    });

    it("rolls the dice for a turn that stalled before rolling — every seat's payout, not just the stalled player's", async () => {
        const gs = makeState({
            phase: "main",
            hexes: [{ terrain: "desert", numberToken: null }, { terrain: "desert", numberToken: null }],
            vertices: emptyVertices(),
            edges: emptyEdges(),
            robberHexIndex: 0,
            hasRolled: false,
            lastRoll: null,
        });
        gs.playerStates.set("u1", player());
        gs.playerStates.set("u2", player());
        const game = makeGame(gs);

        expect(await resolveStalledTurn(game, "u1", "Alice")).toBe("advanced");
        expect(playedClassNames(game)[0]).toBe("SACRollDice");
        // The turn passed to u2, whose own hasRolled/lastRoll correctly starts
        // fresh — what proves u1's roll actually happened is that it wasn't
        // cleared with the rest of the turn: lastRollAutoEnded (nothing left to
        // build with an empty hand either way) keeps it on screen across the
        // handoff, the same as a live player's roll would.
        expect(gs.lastRoll).not.toBeNull();
        expect(gs.lastRollAutoEnded).toBe(true);
        expect(game.currentTurn).toBe("u2");
    });

    it("just ends the turn when there is nothing pending and nothing left to decide", async () => {
        const gs = makeState({
            phase: "main",
            vertices: emptyVertices(),
            edges: emptyEdges(),
            hasRolled: true,
        });
        gs.playerStates.set("u1", player());
        gs.playerStates.set("u2", player());
        const game = makeGame(gs);

        expect(await resolveStalledTurn(game, "u1", "Alice")).toBe("advanced");
        expect(playedClassNames(game)).toEqual(["SACEndTurn"]);
        expect(game.currentTurn).toBe("u2");
    });

    it("declines a turn for a seat the game doesn't hold, rather than looping on it", async () => {
        const gs = makeState({ phase: "main", vertices: emptyVertices(), edges: emptyEdges(), hasRolled: true });
        gs.playerStates.set("u1", player());
        gs.playerStates.set("u2", player());
        const game = makeGame(gs, ["u1", "u2", "ghost"]);
        game.currentTurn = "ghost";

        expect(await resolveStalledTurn(game, "ghost", "Ghost")).toBe("declined");
        expect(playedClassNames(game)).toEqual([]);
    });
});
