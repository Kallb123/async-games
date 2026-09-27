import { describe, expect, it } from "vitest";
import { SettlementsAndCitiesGameType, SACBuyDevCard, SACEndTurn, SACPlayKnight, SACPlayYearOfPlenty } from "./SettlementsAndCitiesLogic";
import { computeSettlementsAndCitiesResultStats, formatSettlementsAndCitiesCharts } from "./SettlementsAndCitiesModels";
import type { ISettlementsAndCitiesGameData } from "./SettlementsAndCitiesModels";
import { cmd, makeGame, makeState, player, rollOf } from "./testFixtures";
import { BOARD_TOPOLOGY, HEX_POSITIONS, NO_RESOURCES, calculateTotalVP } from "./board";
import type { ISACPlayerState, ISACSpecificGameState } from "./board";
import type { IGameData } from "@/utils/mongodb/GameData";
import type { IGameCommand } from "@/utils/apiModels/GameLogic";
import { runCommand } from "@/utils/games/commandPipeline";
import { computePerTurnInternalStats } from "@/utils/games/replay";

// The game-end replay, read the way GameResultData's Settlements & Cities
// entry reads it.
function replayGame(game: ISettlementsAndCitiesGameData) {
    return computePerTurnInternalStats<ISACSpecificGameState, "victoryPoints">(game as unknown as IGameData, {
        victoryPoints: (state, userId) => calculateTotalVP(userId, state),
    });
}

async function replayFinalState(game: ISettlementsAndCitiesGameData): Promise<ISACSpecificGameState | undefined> {
    return (await replayGame(game))?.finalState;
}

const NAMES = new Map([["u1", "Alice"], ["u2", "Bob"]]);

function run(game: ISettlementsAndCitiesGameData, command: IGameCommand) {
    return runCommand(game as unknown as IGameData, new SettlementsAndCitiesGameType(), command);
}

function emptyBoard() {
    return {
        vertices: Array.from({ length: BOARD_TOPOLOGY.numVertices }, () => ({ building: null, owner: null })),
        edges: Array.from({ length: BOARD_TOPOLOGY.numEdges }, () => ({ hasRoad: false, owner: null })),
    };
}

// u1 holds a settlement on the one forest (an 8), and a Year of Plenty, then
// rolls an 8 and plays it: 1 lumber from the roll, then a wool and an ore.
async function playedGame() {
    const gs = makeState({
        hexes: HEX_POSITIONS.map((_, i) => (i === 0 ? { terrain: "forest", numberToken: 8 } : { terrain: "desert", numberToken: null })),
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

        const replayed = await replayFinalState(game);
        expect(replayed?.playerStates.get("u1")?.resourcesGatheredByType).toEqual(EXPECTED_U1);
    });

    it("recovers the whole count for a game that was already under way when counting began", async () => {
        const game = await playedGame();
        // The live game only started counting by resource after the roll.
        game.specificGameState.playerStates.get("u1")!.resourcesGatheredByType = { ...NO_RESOURCES, wool: 1, ore: 1 };

        const replayed = await replayFinalState(game);
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
        const replayed = await replayFinalState(game);
        replayed!.playerStates.get("u1")!.resourcesGatheredByType = { ...NO_RESOURCES, brick: 9 };

        const stats = computeSettlementsAndCitiesResultStats(game, [], replayed);

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
        expect((await run(game, command)).outcome.validMove).toBe(true);
    }
    return game;
}

describe("Settlements & Cities' victory points chart", () => {
    it("plots every player's points each round, hidden VP cards and a lost Largest Army included", async () => {
        const game = await armyChangesHands();
        const replayed = await replayGame(game);
        const stats = computeSettlementsAndCitiesResultStats(game, [], replayed?.finalState, replayed?.perTurn.victoryPoints);

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
        const stats = computeSettlementsAndCitiesResultStats(game, []);
        expect(formatSettlementsAndCitiesCharts(stats, NAMES).some(c => !c.kind && c.title === "Victory points per round")).toBe(false);
    });
});
