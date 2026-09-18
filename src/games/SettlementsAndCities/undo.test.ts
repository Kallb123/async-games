import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
    SettlementsAndCitiesGameType,
    SACPlaceSettlementSetup,
    SACPlaceRoadSetup,
    SACBuildRoad,
    SACBuildSettlement,
    SACPlayKnight,
    SACRollDice,
    SACEndTurn,
    SACUndo,
} from "./SettlementsAndCitiesLogic";
import { cmd, makeGame, makeState, player, rollOf } from "./testFixtures";
import { BOARD_TOPOLOGY, HEX_POSITIONS } from "./board";
import type { ISACHex, ISACSpecificGameState } from "./board";
import type { ISettlementsAndCitiesGameData } from "./SettlementsAndCitiesModels";
import type { IGameData } from "@/utils/mongodb/GameData";
import type { IGameCommand } from "@/utils/apiModels/GameLogic";
import { consumedRandomness } from "@/utils/apiModels/gameCommand";
import { runCommand } from "@/utils/games/commandPipeline";
import { buildTimeline } from "@/utils/games/replay";
import { gameStateToResponse } from "./SettlementsAndCitiesModels";
import type { ISACSpecificGameStateResponse } from "./apiModels";

// The real pipeline: Execute, then commandHistory/CheckEndTurn, exactly what a
// live request drives. SACUndo's anchor check reads commandHistory's tail, so
// every test here plays through this rather than calling Execute() in
// isolation.
function run(game: ISettlementsAndCitiesGameData, command: IGameCommand) {
    return runCommand(game as unknown as IGameData, new SettlementsAndCitiesGameType(), command);
}

// Every hex has a real board position (BOARD_TOPOLOGY.vertexHexes/hexVertices
// index into the full 19-hex layout), so a fixture that only fills in hex 0
// and leaves the rest short would throw the moment a placement near another
// hex looked one up. One producing forest, the rest desert, keeps every index
// valid while still paying out exactly where the tests expect.
function fullHexesWithOneForest(): ISACHex[] {
    return HEX_POSITIONS.map((_, i) => (i === 0 ? { terrain: "forest", numberToken: 8 } : { terrain: "desert", numberToken: null }));
}

function emptyBoard() {
    return {
        hexes: fullHexesWithOneForest(),
        vertices: Array.from({ length: BOARD_TOPOLOGY.numVertices }, () => ({ building: null, owner: null })),
        edges: Array.from({ length: BOARD_TOPOLOGY.numEdges }, () => ({ hasRoad: false, owner: null })),
        robberHexIndex: 0,
    };
}

function setupBoard(setupStep: number): ISACSpecificGameState {
    const gs = makeState({
        phase: "setup",
        setupStep,
        hasRolled: false,
        lastRoll: null,
        ...emptyBoard(),
    });
    gs.playerStates.set("u1", player());
    gs.playerStates.set("u2", player());
    return gs;
}

// A vertex touching the one producing hex, so a second-round setup settlement
// there is guaranteed to gather something.
const SETUP_VERTEX = BOARD_TOPOLOGY.hexVertices[0][0];
const SETUP_EDGE = BOARD_TOPOLOGY.vertexEdges[SETUP_VERTEX][0];

// A main-phase board with u1 already holding a settlement (so a road off it is
// legal) and the resources to build one road twice over.
function mainBoardWithRoad() {
    const gs = makeState(emptyBoard());
    const vertexId = BOARD_TOPOLOGY.hexVertices[0][0];
    gs.vertices[vertexId] = { building: "settlement", owner: "u1" };
    const edgeId = BOARD_TOPOLOGY.vertexEdges[vertexId][0];
    gs.playerStates.set("u1", player({ resources: { brick: 2, lumber: 2 }, devCards: { knight: 1 } }));
    gs.playerStates.set("u2", player());
    return { gs, edgeId };
}

describe("Settlements & Cities — undoing a setup placement", () => {
    it("takes back a settlement, restoring the vertex, the piece count and the resources it granted", async () => {
        const gs = setupBoard(2); // second round: this placement also gathers.
        const game = makeGame(gs);
        const settlement = cmd(new SACPlaceSettlementSetup());
        settlement.vertexId = SETUP_VERTEX;

        const placed = await run(game, settlement);
        expect(placed.outcome.validMove).toBe(true);
        expect(gs.playerStates.get("u1")!.resources.lumber).toBe(1);
        expect(gs.playerStates.get("u1")!.remainingSettlements).toBe(4);

        const undone = await run(game, cmd(new SACUndo()));
        expect(undone.outcome.validMove).toBe(true);
        expect(gs.vertices[SETUP_VERTEX]).toEqual({ building: null, owner: null });
        expect(gs.playerStates.get("u1")!.remainingSettlements).toBe(5);
        expect(gs.playerStates.get("u1")!.resources.lumber).toBe(0);
        expect(gs.pendingRoadSetup).toBe(false);
        expect(gs.lastSetupSettlementVertex).toBeNull();
    });

    it("undoes twice in a row — the road, then the settlement it followed — the depth the game actually needs", async () => {
        const gs = setupBoard(0);
        const game = makeGame(gs);
        const settlement = cmd(new SACPlaceSettlementSetup());
        settlement.vertexId = SETUP_VERTEX;
        await run(game, settlement);

        const road = cmd(new SACPlaceRoadSetup());
        road.edgeId = SETUP_EDGE;
        const built = await run(game, road);
        expect(built.outcome.validMove).toBe(true);
        expect(gs.edges[SETUP_EDGE].hasRoad).toBe(true);

        const undoRoad = await run(game, cmd(new SACUndo()));
        expect(undoRoad.outcome.validMove).toBe(true);
        expect(gs.edges[SETUP_EDGE]).toEqual({ hasRoad: false, owner: null });
        expect(gs.playerStates.get("u1")!.remainingRoads).toBe(15);
        // The settlement is still there — only the road came back.
        expect(gs.vertices[SETUP_VERTEX].owner).toBe("u1");

        const undoSettlement = await run(game, cmd(new SACUndo()));
        expect(undoSettlement.outcome.validMove).toBe(true);
        expect(gs.vertices[SETUP_VERTEX]).toEqual({ building: null, owner: null });
        expect(gs.playerStates.get("u1")!.remainingSettlements).toBe(5);
    });

    it("restores from a copy, not a view — a later mutation of the live state can't leak into the snapshot", async () => {
        const gs = setupBoard(0);
        const game = makeGame(gs);
        const settlement = cmd(new SACPlaceSettlementSetup());
        settlement.vertexId = SETUP_VERTEX;
        await run(game, settlement);

        // Simulate the live state moving on after the snapshot was taken — if
        // the stack held a reference into the same playerStates map, this would
        // corrupt the entry the undo is about to restore.
        gs.playerStates.get("u1")!.resources.brick = 999;

        await run(game, cmd(new SACUndo()));
        expect(gs.playerStates.get("u1")!.resources.brick).toBe(0);
    });
});

describe("Settlements & Cities — the undo anchor", () => {
    it("reports canUndo true right after the undoable move, and nobody else's", async () => {
        const { gs, edgeId } = mainBoardWithRoad();
        const game = makeGame(gs);
        const road = cmd(new SACBuildRoad());
        road.edgeId = edgeId;
        await run(game, road);

        const lastId = game.gameState.commandHistory.at(-1)!.id;
        const NAMES = { u1: "Alice", u2: "Bob" };
        expect(gameStateToResponse(gs, NAMES, "u1", lastId).canUndo).toBe(true);
        expect(gameStateToResponse(gs, NAMES, "u2", lastId).canUndo).toBe(false);
        expect(gameStateToResponse(gs, NAMES, null, lastId).canUndo).toBe(false);
    });

    it("refuses once anything else has been played since the snapshot", async () => {
        const { gs, edgeId } = mainBoardWithRoad();
        const game = makeGame(gs);

        const road = cmd(new SACBuildRoad());
        road.edgeId = edgeId;
        await run(game, road);
        expect(gs.edges[edgeId].hasRoad).toBe(true);

        await run(game, cmd(new SACPlayKnight()));

        // The stack's own top entry still names u1 — only the anchor (matched
        // against the real tail of commandHistory) tells canUndo the Knight
        // happened in between, so it must go stale here too, not just the
        // command's own refusal below.
        const lastId = game.gameState.commandHistory.at(-1)!.id;
        expect(gameStateToResponse(gs, { u1: "Alice", u2: "Bob" }, "u1", lastId).canUndo).toBe(false);

        const undone = await run(game, cmd(new SACUndo()));
        expect(undone.outcome.validMove).toBe(false);
        // Nothing rolled back: the road is still built and the Knight still spent.
        expect(gs.edges[edgeId].hasRoad).toBe(true);
        expect(gs.playerStates.get("u1")!.devCards.knight).toBe(0);
        expect(gs.playerStates.get("u1")!.knightsPlayed).toBe(1);
    });

    it("refuses once the turn has passed, even with nothing else played on it", async () => {
        const { gs, edgeId } = mainBoardWithRoad();
        const game = makeGame(gs);

        const road = cmd(new SACBuildRoad());
        road.edgeId = edgeId;
        await run(game, road);
        await run(game, cmd(new SACEndTurn()));

        const lastId = game.gameState.commandHistory.at(-1)!.id;
        expect(gameStateToResponse(gs, { u1: "Alice", u2: "Bob" }, "u1", lastId).canUndo).toBe(false);

        const undone = await run(game, cmd(new SACUndo()));
        expect(undone.outcome.validMove).toBe(false);
        expect(gs.edges[edgeId].hasRoad).toBe(true);
    });

    it("refuses a roll — SACRollDice pushes no snapshot, so there is no anchor to match", async () => {
        const gs = makeState({ hasRolled: false, lastRoll: null, ...emptyBoard() });
        // Enough for a 4:1 trade, so the roll doesn't leave u1 with nothing to
        // do and auto-end the turn (sacFinishTurn) before the assertion below.
        gs.playerStates.set("u1", player({ resources: { ore: 4 } }));
        gs.playerStates.set("u2", player());
        const game = makeGame(gs);

        await run(game, rollOf(5, 3));
        expect(gs.hasRolled).toBe(true);

        const undone = await run(game, cmd(new SACUndo()));
        expect(undone.outcome.validMove).toBe(false);
        expect(gs.hasRolled).toBe(true);
    });
});

describe("Settlements & Cities — who may undo", () => {
    it("refuses a player who isn't the one the snapshot belongs to", async () => {
        const { gs, edgeId } = mainBoardWithRoad();
        const game = makeGame(gs);

        const road = cmd(new SACBuildRoad());
        road.edgeId = edgeId;
        await run(game, road);

        const undone = await run(game, cmd(new SACUndo(), "u2"));
        expect(undone.outcome.validMove).toBe(false);
        expect(gs.edges[edgeId].hasRoad).toBe(true);
    });
});

describe("Settlements & Cities — the undoable commands never consume randomness", () => {
    // The CI guard docs/undo.md §6 promises: whichever commands declare
    // `readonly undoable = true`, every one of them is exercised here and
    // asserted to carry no `recorded…` field once executed — the machine-
    // checked half of "only on non-random actions". A command discovered below
    // that isn't covered by name here fails the second test, which is the
    // point: a fifth command can't opt in to undo without a reviewer adding it
    // to this file.
    const UNDOABLE_COMMAND_NAMES = ["SACPlaceSettlementSetup", "SACPlaceRoadSetup", "SACBuildRoad", "SACBuildSettlement"];

    it("SACPlaceSettlementSetup", async () => {
        const gs = setupBoard(0);
        const game = makeGame(gs);
        const command = cmd(new SACPlaceSettlementSetup());
        command.vertexId = SETUP_VERTEX;
        const outcome = await command.Execute(game as unknown as IGameData);
        expect(outcome.validMove).toBe(true);
        expect(consumedRandomness(command)).toBe(false);
    });

    it("SACPlaceRoadSetup", async () => {
        const gs = setupBoard(0);
        gs.pendingRoadSetup = true;
        gs.lastSetupSettlementVertex = SETUP_VERTEX;
        const game = makeGame(gs);
        const command = cmd(new SACPlaceRoadSetup());
        command.edgeId = SETUP_EDGE;
        const outcome = await command.Execute(game as unknown as IGameData);
        expect(outcome.validMove).toBe(true);
        expect(consumedRandomness(command)).toBe(false);
    });

    it("SACBuildRoad", async () => {
        const { gs, edgeId } = mainBoardWithRoad();
        const game = makeGame(gs);
        const command = cmd(new SACBuildRoad());
        command.edgeId = edgeId;
        const outcome = await command.Execute(game as unknown as IGameData);
        expect(outcome.validMove).toBe(true);
        expect(consumedRandomness(command)).toBe(false);
    });

    it("SACBuildSettlement", async () => {
        const gs = makeState(emptyBoard());
        const roadVertex = BOARD_TOPOLOGY.hexVertices[0][0];
        const edgeId = BOARD_TOPOLOGY.vertexEdges[roadVertex][0];
        const [, otherVertex] = BOARD_TOPOLOGY.edges[edgeId];
        gs.edges[edgeId] = { hasRoad: true, owner: "u1" };
        gs.playerStates.set("u1", player({ resources: { brick: 1, lumber: 1, wool: 1, grain: 1 } }));
        gs.playerStates.set("u2", player());
        const game = makeGame(gs);
        const command = cmd(new SACBuildSettlement());
        command.vertexId = otherVertex;
        const outcome = await command.Execute(game as unknown as IGameData);
        expect(outcome.validMove).toBe(true);
        expect(consumedRandomness(command)).toBe(false);
    });

    it("declares undoable on exactly these four commands, and no others", () => {
        expect(classesDeclaringUndoable().sort()).toEqual([...UNDOABLE_COMMAND_NAMES].sort());
    });
});

// Every `readonly className = 'X';` in the logic file, checked for an
// `undoable` declaration before the next `myString(` — source-scanned rather
// than a hand-kept list, the same trade serializableRegistry.test.ts makes for
// `@serializable`, so a class that starts declaring `undoable` is caught here
// even if nobody remembered to add a test for it.
function classesDeclaringUndoable(): string[] {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(path.join(here, "SettlementsAndCitiesLogic.ts"), "utf8");
    const found: string[] = [];
    for (const match of source.matchAll(/readonly className = '(\w+)';([\s\S]*?)myString\(/g)) {
        if (/readonly undoable = true/.test(match[2])) found.push(match[1]);
    }
    return found;
}

describe("Settlements & Cities — an undo replays byte-for-byte", () => {
    it("reconstructs a turn with a build, an undo and a rebuild through the recap engine", async () => {
        const { gs, edgeId } = mainBoardWithRoad();
        gs.hasRolled = false;
        gs.lastRoll = null;
        const game = makeGame(gs);
        const NAMES = { u1: "Alice", u2: "Bob" };

        await run(game, rollOf(5, 3));
        const build = cmd(new SACBuildRoad());
        build.edgeId = edgeId;
        await run(game, build);
        await run(game, cmd(new SACUndo()));
        const rebuild = cmd(new SACBuildRoad());
        rebuild.edgeId = edgeId;
        await run(game, rebuild);
        await run(game, cmd(new SACEndTurn()));

        expect(game.gameState.commandHistory.map(c => (c as { className: string }).className))
            .toEqual(["SACRollDice", "SACBuildRoad", "SACUndo", "SACBuildRoad", "SACEndTurn"]);

        const lastId = game.gameState.commandHistory.at(-1)!.id;
        for (const viewerId of ["u1", "u2", null]) {
            const live = gameStateToResponse(game.specificGameState, NAMES, viewerId, lastId);
            const replayed = (await buildTimeline(game, NAMES, [], undefined, viewerId)).snapshots;
            const replayedFinal = replayed[replayed.length - 1].specificGameState as ISACSpecificGameStateResponse;
            expect(replayedFinal).toEqual(live);
            expect(replayed).toHaveLength(game.gameState.commandHistory.length + 1);
        }
    });
});
