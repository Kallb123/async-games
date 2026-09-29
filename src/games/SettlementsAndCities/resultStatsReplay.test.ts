import { describe, expect, it } from "vitest";
import {
    SettlementsAndCitiesGameType, SACBuildRoad, SACBuyDevCard, SACEndTurn, SACPlaceRoadSetup, SACPlaceSettlementSetup,
    SACPlayKnight, SACPlayYearOfPlenty, SACUndo, sacUnrecordedHoldEnd,
} from "./SettlementsAndCitiesLogic";
import { computeSettlementsAndCitiesResultStats, formatSettlementsAndCitiesCharts, SAC_REPLAYED_STATS } from "./SettlementsAndCitiesModels";
import type { ISettlementsAndCitiesGameData } from "./SettlementsAndCitiesModels";
import { cmd, makeGame, makeState, player, rollOf } from "./testFixtures";
import { BOARD_TOPOLOGY, HEX_POSITIONS, NO_RESOURCES, cloneSACState, randomSetupRoadEdge, randomSetupSettlementVertex } from "./board";
import type { ISACHex, ISACPlayerState } from "./board";
import type { IGameData } from "@/utils/mongodb/GameData";
import { RECORDED_ON_TURN_OF, type IGameCommand } from "@/utils/apiModels/GameLogic";
import { runCommand } from "@/utils/games/commandPipeline";
import { PlayerDropped } from "@/utils/games/playerDropout";
import { computePerTurnInternalStats } from "@/utils/games/replay";

// The game-end replay, read the way GameResultData's Settlements & Cities
// entry reads it.
function replayGame(game: ISettlementsAndCitiesGameData) {
    return computePerTurnInternalStats(game as unknown as IGameData, SAC_REPLAYED_STATS);
}

async function resultOf(game: ISettlementsAndCitiesGameData) {
    return computeSettlementsAndCitiesResultStats(game, await replayGame(game));
}

const NAMES = new Map([["u1", "Alice"], ["u2", "Bob"]]);

function run(game: ISettlementsAndCitiesGameData, command: IGameCommand) {
    return runCommand(game as unknown as IGameData, new SettlementsAndCitiesGameType(), command);
}

async function play(game: ISettlementsAndCitiesGameData, command: IGameCommand) {
    expect((await run(game, command)).outcome.validMove).toBe(true);
}

function emptyBoard() {
    return {
        vertices: Array.from({ length: BOARD_TOPOLOGY.numVertices }, () => ({ building: null, owner: null })),
        edges: Array.from({ length: BOARD_TOPOLOGY.numEdges }, () => ({ hasRoad: false, owner: null })),
    };
}

// The one forest, an 8; everything else desert.
function oneForest(): ISACHex[] {
    return HEX_POSITIONS.map((_, i) => (i === 0 ? { terrain: "forest", numberToken: 8 } : { terrain: "desert", numberToken: null }));
}

// u1 holds a settlement on the one forest (an 8), and a Year of Plenty, then
// rolls an 8 and plays it: 1 lumber from the roll, then a wool and an ore.
async function playedGame() {
    const gs = makeState({
        hexes: oneForest(),
        ...emptyBoard(),
        robberHexIndex: 1,
        hasRolled: false,
        lastRoll: null,
    });
    gs.vertices[BOARD_TOPOLOGY.hexVertices[0][0]] = { building: "settlement", owner: "u1" };
    gs.playerStates.set("u1", player({ devCards: { yearOfPlenty: 1 } as ISACPlayerState["devCards"] }));
    gs.playerStates.set("u2", player());
    const game = makeGame(gs);

    await run(game, rollOf(5, 3));
    const plenty = cmd(new SACPlayYearOfPlenty());
    plenty.resource1 = "wool";
    plenty.resource2 = "ore";
    await run(game, plenty);
    return game;
}

const EXPECTED_U1 = { ...NO_RESOURCES, lumber: 1, wool: 1, ore: 1 };

describe("Settlements & Cities' resources table, counted by replay", () => {
    it("replays the game to the same by-resource count the live game kept", async () => {
        const game = await playedGame();
        expect(game.specificGameState.playerStates.get("u1")?.resourcesGatheredByType).toEqual(EXPECTED_U1);

        expect((await resultOf(game)).playerStats.get("u1")?.resourcesGatheredByType).toEqual(EXPECTED_U1);
    });

    it("recovers the whole count for a game that was already under way when counting began", async () => {
        const game = await playedGame();
        // The live game only started counting by resource after the roll.
        game.specificGameState.playerStates.get("u1")!.resourcesGatheredByType = { ...NO_RESOURCES, wool: 1, ore: 1 };

        const stats = await resultOf(game);

        expect(stats.playerStats.get("u1")?.resourcesGatheredByType).toEqual(EXPECTED_U1);
        const table = formatSettlementsAndCitiesCharts(stats, NAMES).find(c => c.kind === "table");
        if (table?.kind !== "table") throw new Error("expected a table");
        expect(table.rows.find(r => r.label.endsWith("Lumber"))?.values).toEqual({ u1: 1, u2: 0 });
    });

    it("leaves the table off rather than show a count that started part-way", async () => {
        const game = await playedGame();
        game.specificGameState.playerStates.get("u1")!.resourcesGatheredByType = { ...NO_RESOURCES, wool: 1, ore: 1 };

        // No replay (a game too old to replay), so only the short live count.
        const stats = computeSettlementsAndCitiesResultStats(game);

        expect(stats.playerStats.get("u1")?.resourcesGatheredByType).toBeUndefined();
        expect(formatSettlementsAndCitiesCharts(stats, NAMES).some(c => c.kind === "table")).toBe(false);
    });

    it("falls back to the live count when the replay's count disagrees with the game as played", async () => {
        const game = await playedGame();
        const replayed = (await replayGame(game))!;
        replayed.brick.at(-1)!.set("u1", 9);

        const stats = computeSettlementsAndCitiesResultStats(game, replayed);

        expect(stats.playerStats.get("u1")?.resourcesGatheredByType).toEqual(EXPECTED_U1);
    });
});

describe("Settlements & Cities' result, from a replay that doesn't end where the game did", () => {
    it("leaves the per-round charts off rather than draw a different game", async () => {
        const game = await playedGame();
        // Something the replay can't reproduce: a live count it never reaches.
        game.specificGameState.playerStates.get("u2")!.resourcesGathered = 1;

        const stats = await resultOf(game);

        expect(stats.resourcesPerTurn).toEqual([]);
        expect(stats.victoryPointsPerTurn).toEqual([]);
        expect(formatSettlementsAndCitiesCharts(stats, NAMES).some(c => !c.kind)).toBe(false);
        // The live game still has its say on what it counted whole.
        expect(stats.playerStats.get("u1")?.resourcesGatheredByType).toEqual(EXPECTED_U1);
    });
});

// Round 1: u1 rolls, buys the deck's one card - a hidden Victory Point - and
// ends. u2 holds Largest Army (3 knights) and rolls, which ends their turn
// with nothing to spend. Round 2: u1
// plays their fourth knight and takes Largest Army off u2.
async function armyChangesHands() {
    const gs = makeState({ ...emptyBoard(), hasRolled: false, lastRoll: null, largestArmyOwner: "u2", devCardDeck: ["victoryPoint"] });
    gs.playerStates.set("u1", player({ knightsPlayed: 3, devCards: { knight: 1 }, resources: { wool: 2, grain: 2, ore: 2 } }));
    gs.playerStates.set("u2", player({ knightsPlayed: 3 }));
    const game = makeGame(gs);

    for (const command of [
        rollOf(5, 3), cmd(new SACBuyDevCard()), cmd(new SACEndTurn()),
        rollOf(5, 3, "u2"),
        cmd(new SACPlayKnight()),
    ]) {
        await play(game, command);
    }
    return game;
}

describe("Settlements & Cities' victory points chart", () => {
    it("plots every player's points each round, hidden VP cards and a lost Largest Army included", async () => {
        const game = await armyChangesHands();
        const stats = await resultOf(game);

        const chart = formatSettlementsAndCitiesCharts(stats, NAMES)[0];
        if (chart.kind) throw new Error("expected the line chart first");
        expect(chart.title).toBe("Victory points per round");
        // u1's VP card counts from the round it was bought; u2's line falls
        // when Largest Army moves.
        expect(chart.rounds).toEqual([{ u1: 1, u2: 2 }, { u1: 3, u2: 0 }]);
        expect(chart.rounds.at(-1)).toEqual({ u1: stats.playerStats.get("u1")?.victoryPoints, u2: stats.playerStats.get("u2")?.victoryPoints });
    });

    it("is left off a result recorded before it", async () => {
        const game = await armyChangesHands();
        const stats = computeSettlementsAndCitiesResultStats(game);
        expect(formatSettlementsAndCitiesCharts(stats, NAMES).some(c => !c.kind && c.title === "Victory points per round")).toBe(false);
    });
});

// A game played before turns were held for undo (docs/undo.md §5) has no
// SACEndTurn after a setup road, or after a main-turn move that left nothing
// to do: those ended the turn there and then. Its log is today's with those
// SACEndTurns taken out — and it should replay to exactly the same game.
describe("Settlements & Cities' replay of a game recorded before turns were held", () => {
    // The full setup snake (u1, u2, u2, u1) and a roll each, every hold closed
    // by the SACEndTurn a board sends today. Returns those closers' ids too.
    async function setUpAndRoll() {
        const gs = makeState({ phase: "setup", hexes: oneForest(), ...emptyBoard(), robberHexIndex: 1, hasRolled: false, lastRoll: null });
        gs.playerStates.set("u1", player());
        gs.playerStates.set("u2", player());
        const game = makeGame(gs);
        const closers = new Set<string>();
        for (const userId of ["u1", "u2", "u2", "u1"]) {
            const settlement = cmd(new SACPlaceSettlementSetup(), userId);
            settlement.vertexId = randomSetupSettlementVertex(gs.vertices)!;
            await play(game, settlement);
            const road = cmd(new SACPlaceRoadSetup(), userId);
            road.edgeId = randomSetupRoadEdge(settlement.vertexId, gs.edges)!;
            await play(game, road);
            const close = cmd(new SACEndTurn(), userId);
            closers.add(close.id);
            await play(game, close);
        }
        expect(gs.phase).toBe("main");
        for (const userId of ["u1", "u2"]) {
            await play(game, rollOf(5, 3, userId));
            if (game.currentTurn === userId) await play(game, cmd(new SACEndTurn(), userId));
        }
        return { game, closers };
    }

    function withoutCommands(game: ISettlementsAndCitiesGameData, ids: Set<string>): ISettlementsAndCitiesGameData {
        return { ...game, gameState: { ...game.gameState, commandHistory: game.gameState.commandHistory.filter(c => !ids.has(c.id)) } } as ISettlementsAndCitiesGameData;
    }

    it("closes each setup hold its log never closed, the snake's double placements included", async () => {
        const { game, closers } = await setUpAndRoll();
        const legacy = withoutCommands(game, closers);

        const replayed = await replayGame(legacy);

        expect(replayed).toEqual(await replayGame(game));
        expect(replayed!.resourcesGathered.at(-1)).toEqual(new Map([...game.specificGameState.playerStates].map(([u, ps]) => [u, ps.resourcesGathered])));
        const stats = computeSettlementsAndCitiesResultStats(legacy, replayed);
        expect(stats.resourcesPerTurn).not.toEqual([]);
        expect(stats.playerStats.get("u1")?.settlements).toBe(2);
    });

    it("closes a main-turn hold its log went straight on from", async () => {
        // u1 spends their last brick and lumber on a road, which leaves nothing
        // else to do: the hold, closed today by u1's SACEndTurn, and then u2 rolls.
        const gs = makeState({ ...emptyBoard() });
        const home = BOARD_TOPOLOGY.hexVertices[0][0];
        gs.vertices[home] = { building: "settlement", owner: "u1" };
        gs.playerStates.set("u1", player({ resources: { brick: 1, lumber: 1 } }));
        gs.playerStates.set("u2", player());
        const game = makeGame(gs);
        const road = cmd(new SACBuildRoad());
        road.edgeId = BOARD_TOPOLOGY.vertexEdges[home][0];
        await play(game, road);
        expect(gs.autoEndTurnAt).not.toBeNull();
        const close = cmd(new SACEndTurn());
        await play(game, close);
        await play(game, rollOf(1, 1, "u2"));

        const replayed = await replayGame(withoutCommands(game, new Set([close.id])));

        expect(replayed).toEqual(await replayGame(game));
    });

    describe("sacUnrecordedHoldEnd", () => {
        const held = (phase: "setup" | "main") => makeState({ phase, autoEndTurnAt: "2026-09-18T12:00:10.000Z" });

        it("leaves a turn with no hold open alone", () => {
            expect(sacUnrecordedHoldEnd(makeState({ phase: "setup" }), "u1", cmd(new SACPlaceSettlementSetup()))).toBeNull();
        });

        it("lets through the holder's own end turn and undo", () => {
            for (const phase of ["setup", "main"] as const) {
                expect(sacUnrecordedHoldEnd(held(phase), "u1", cmd(new SACEndTurn()))).toBeNull();
                expect(sacUnrecordedHoldEnd(held(phase), "u1", cmd(new SACUndo()))).toBeNull();
            }
        });

        it("lets through a move played out of turn, and the holder's own in the main phase", () => {
            const interrupt = cmd(new SACBuyDevCard(), "u2") as IGameCommand;
            (interrupt as unknown as Record<string, unknown>)[RECORDED_ON_TURN_OF] = "u1";
            expect(sacUnrecordedHoldEnd(held("main"), "u1", interrupt)).toBeNull();
            expect(sacUnrecordedHoldEnd(held("main"), "u1", cmd(new SACBuyDevCard()))).toBeNull();
        });

        it("closes it for another seat's move, or the holder's next setup placement", () => {
            expect(sacUnrecordedHoldEnd(held("main"), "u1", rollOf(3, 4, "u2"))).toBeInstanceOf(SACEndTurn);
            expect(sacUnrecordedHoldEnd(held("setup"), "u1", cmd(new SACPlaceSettlementSetup()))).toBeInstanceOf(SACEndTurn);
            expect(sacUnrecordedHoldEnd(held("setup"), "u1", rollOf(3, 4))).toBeInstanceOf(SACEndTurn);
            expect(sacUnrecordedHoldEnd(held("setup"), "u1", cmd(new SACEndTurn(), "u2"))).toBeInstanceOf(SACEndTurn);
        });
    });
});

// u1 and u3 share the one forest (an 8). Round 1: every seat rolls, the first
// two an 8. Then the turn timer drops u3, and u1 and u2 roll an 8 each again.
async function thirdSeatDrops() {
    const gs = makeState({ hexes: oneForest(), ...emptyBoard(), robberHexIndex: 1, hasRolled: false, lastRoll: null });
    gs.vertices[BOARD_TOPOLOGY.hexVertices[0][0]] = { building: "settlement", owner: "u1" };
    gs.vertices[BOARD_TOPOLOGY.hexVertices[0][3]] = { building: "settlement", owner: "u3" };
    for (const userId of ["u1", "u2", "u3"]) gs.playerStates.set(userId, player());
    const seats = ["u1", "u2", "u3"];
    const game = makeGame(gs, {
        userIdList: seats,
        gameState: { turnOrder: seats, history: [], commandHistory: [] },
        initialSpecificGameState: cloneSACState(gs, seats),
    });
    await play(game, rollOf(5, 3));
    await play(game, rollOf(5, 3, "u2"));
    await play(game, rollOf(1, 1, "u3"));
    // What the turn-timer cron runs once the absent player's turn has passed on.
    expect(game.currentTurn).toBe("u1");
    const drop = cmd(new PlayerDropped(), "u3");
    drop.resumesWith = game.currentTurn;
    await play(game, drop);
    await play(game, rollOf(5, 3));
    await play(game, rollOf(5, 3, "u2"));
    return game;
}

describe("Settlements & Cities' result for a player the game dropped", () => {
    it("holds their lines at what they left with, rather than falling to nothing", async () => {
        const stats = await resultOf(await thirdSeatDrops());

        expect(stats.resourcesPerTurn.map(turn => turn.get("u3"))).toEqual([1, 2, 2, 2, 2]);
        expect(stats.resourcesPerTurn.at(-1)?.get("u1")).toBe(4);
        expect(stats.victoryPointsPerTurn?.at(-1)?.get("u3")).toBe(1);
    });

    it("gives them a result and a column in the resources table", async () => {
        const stats = await resultOf(await thirdSeatDrops());

        expect(stats.playerStats.get("u3")).toMatchObject({ settlements: 1, resourcesGathered: 2, victoryPoints: 1, resourcesGatheredByType: { ...NO_RESOURCES, lumber: 2 } });
        const table = formatSettlementsAndCitiesCharts(stats, new Map([...NAMES, ["u3", "Cara"]])).find(c => c.kind === "table");
        if (table?.kind !== "table") throw new Error("expected a table");
        expect(table.rows.find(r => r.label.endsWith("Lumber"))?.values).toEqual({ u1: 4, u2: 0, u3: 2 });
    });
});
