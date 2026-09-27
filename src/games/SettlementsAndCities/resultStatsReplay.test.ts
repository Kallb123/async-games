import { describe, expect, it } from "vitest";
import { SettlementsAndCitiesGameType, SACPlayYearOfPlenty } from "./SettlementsAndCitiesLogic";
import { computeSettlementsAndCitiesResultStats, formatSettlementsAndCitiesCharts } from "./SettlementsAndCitiesModels";
import type { ISettlementsAndCitiesGameData } from "./SettlementsAndCitiesModels";
import { cmd, makeGame, makeState, player, rollOf } from "./testFixtures";
import { BOARD_TOPOLOGY, HEX_POSITIONS, NO_RESOURCES } from "./board";
import type { ISACPlayerState, ISACSpecificGameState } from "./board";
import type { IGameData } from "@/utils/mongodb/GameData";
import type { IGameCommand } from "@/utils/apiModels/GameLogic";
import { runCommand } from "@/utils/games/commandPipeline";
import { replayFinalState } from "@/utils/games/replay";

const NAMES = new Map([["u1", "Alice"], ["u2", "Bob"]]);

function run(game: ISettlementsAndCitiesGameData, command: IGameCommand) {
    return runCommand(game as unknown as IGameData, new SettlementsAndCitiesGameType(), command);
}

// u1 holds a settlement on the one forest (an 8), and a Year of Plenty, then
// rolls an 8 and plays it: 1 lumber from the roll, then a wool and an ore.
async function playedGame() {
    const gs = makeState({
        hexes: HEX_POSITIONS.map((_, i) => (i === 0 ? { terrain: "forest", numberToken: 8 } : { terrain: "desert", numberToken: null })),
        vertices: Array.from({ length: BOARD_TOPOLOGY.numVertices }, () => ({ building: null, owner: null })),
        edges: Array.from({ length: BOARD_TOPOLOGY.numEdges }, () => ({ hasRoad: false, owner: null })),
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

        const replayed = await replayFinalState<ISACSpecificGameState>(game as unknown as IGameData);
        expect(replayed?.playerStates.get("u1")?.resourcesGatheredByType).toEqual(EXPECTED_U1);
    });

    it("recovers the whole count for a game that was already under way when counting began", async () => {
        const game = await playedGame();
        // The live game only started counting by resource after the roll.
        game.specificGameState.playerStates.get("u1")!.resourcesGatheredByType = { ...NO_RESOURCES, wool: 1, ore: 1 };

        const replayed = await replayFinalState<ISACSpecificGameState>(game as unknown as IGameData);
        const stats = computeSettlementsAndCitiesResultStats(game, [], replayed);

        expect(stats.playerStats.get("u1")?.resourcesGatheredByType).toEqual(EXPECTED_U1);
        const table = formatSettlementsAndCitiesCharts(stats, NAMES).find(c => c.kind === "table");
        if (table?.kind !== "table") throw new Error("expected a table");
        expect(table.rows.find(r => r.label.endsWith("Lumber"))?.values).toEqual({ u1: 1, u2: 0 });
    });

    it("leaves the table off rather than show a count that started part-way", async () => {
        const game = await playedGame();
        game.specificGameState.playerStates.get("u1")!.resourcesGatheredByType = { ...NO_RESOURCES, wool: 1, ore: 1 };

        // No replay (a game too old to replay), so only the short live count.
        const stats = computeSettlementsAndCitiesResultStats(game, []);

        expect(stats.playerStats.get("u1")?.resourcesGatheredByType).toBeUndefined();
        expect(formatSettlementsAndCitiesCharts(stats, NAMES).some(c => c.kind === "table")).toBe(false);
    });

    it("falls back to the live count when the replay disagrees with the game as played", async () => {
        const game = await playedGame();
        const replayed = await replayFinalState<ISACSpecificGameState>(game as unknown as IGameData);
        replayed!.playerStates.get("u1")!.resourcesGatheredByType = { ...NO_RESOURCES, brick: 9 };

        const stats = computeSettlementsAndCitiesResultStats(game, [], replayed);

        expect(stats.playerStats.get("u1")?.resourcesGatheredByType).toEqual(EXPECTED_U1);
    });
});
