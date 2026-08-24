import { describe, expect, it } from "vitest";
import {
    TrainTimeGameDataModel,
    computeTrainTimeResultStats,
    formatTrainTimeCharts,
    type ITrainTimeGameData,
    type ITrainTimeGameResultStats,
} from "./TrainTimeModels";
import { TrainTimeGameResultModel } from "@/utils/mongodb/GameResultData";
import { ROUTE_COUNT, TRAINS_PER_PLAYER, buildInitialTrainTimeState } from "./board";

const NAMES = new Map([["u1", "Alice"], ["u2", "Bob"]]);

function gameDoc(state: ReturnType<typeof buildInitialTrainTimeState>) {
    return new TrainTimeGameDataModel({
        gameId: "11111111-1111-1111-1111-111111111111",
        gameType: { gameId: "g", gameType: "TrainTime", friendlyName: "Train Time", icon: "", url: "traintime", className: "TrainTimeGameType" },
        userIdList: ["u1", "u2"],
        turnTimer: "1d",
        currentTurn: "u1",
        lastTurnTimestamp: new Date().toISOString(),
        timerWarningNotificationSent: false,
        gameState: { turnOrder: ["u1", "u2"], history: [], commandHistory: [] },
        complete: false,
        winner: "",
        specificGameState: state,
        initialSpecificGameState: state,
    });
}

describe("Train Time Mongoose schema", () => {
    // The starting snapshot recap replays from is a second Mongoose path built
    // from the same sub-schema factory, so a casting bug hits it as well as the
    // live state — and silently, since nothing reads the snapshot until someone
    // opens a recap. World Domination shipped exactly that bug (see
    // WorldDominationModels.test.ts); this is the same guard one game later.
    it("keeps both game-state paths intact through schema casting", () => {
        const state = buildInitialTrainTimeState(["u1", "u2"]);
        // A claimed route and an unclaimed one: routeOwners is a Mixed array
        // whose entries are nullable, which is the part a schema can mangle.
        state.routeOwners[0] = "u1";

        const doc = gameDoc(state);
        expect(doc.validateSync()).toBeUndefined();

        for (const path of [doc.specificGameState, doc.initialSpecificGameState!]) {
            expect(path.deck).toEqual(state.deck);
            expect(path.market).toEqual(state.market);
            expect(path.ticketDeck).toEqual(state.ticketDeck);
            expect(path.routeOwners).toHaveLength(ROUTE_COUNT);
            expect(path.routeOwners[0]).toBe("u1");
            expect(path.routeOwners[1]).toBeNull();

            const alice = path.playerStates.get("u1")!;
            expect(alice.hand).toEqual(state.playerStates.get("u1")!.hand);
            expect(alice.pendingTickets).toEqual(state.playerStates.get("u1")!.pendingTickets);
            expect(alice.trains).toBe(TRAINS_PER_PLAYER);
        }
    });

    it("casts the per-turn chart series on the result document", () => {
        const result = new TrainTimeGameResultModel({
            gameId: "22222222-2222-2222-2222-222222222222",
            gameType: "TrainTime",
            url: "traintime",
            playerIds: ["u1", "u2"],
            winner: "u1",
            endedAt: new Date().toISOString(),
            totalTurns: 2,
            stats: computeTrainTimeResultStats(
                { specificGameState: buildInitialTrainTimeState(["u1", "u2"]) } as ITrainTimeGameData,
                [new Map([["u1", 0], ["u2", 4]]), new Map([["u1", 7], ["u2", 4]])],
                [new Map([["u1", 0], ["u2", 3]]), new Map([["u1", 4], ["u2", 3]])],
            ),
        });

        expect(result.validateSync()).toBeUndefined();
        expect(result.stats.pointsPerTurn).toHaveLength(2);
        expect(result.stats.pointsPerTurn[1].get("u1")).toBe(7);
        expect(result.stats.longestRunPerTurn[1].get("u2")).toBe(3);
    });
});

describe("Train Time result charts", () => {
    const stats = (overrides: Partial<ITrainTimeGameResultStats> = {}): ITrainTimeGameResultStats => ({
        playerStats: new Map(),
        pointsPerTurn: [new Map([["u1", 0], ["u2", 4]]), new Map([["u1", 7], ["u2", 4]])],
        longestRunPerTurn: [new Map([["u1", 0], ["u2", 3]]), new Map([["u1", 4], ["u2", 3]])],
        ...overrides,
    });

    it("plots the points race and the Long Haul race, keyed by username", () => {
        const charts = formatTrainTimeCharts(stats(), NAMES);

        expect(charts.map(c => c.title)).toEqual(["Route points per turn", "Longest run per turn"]);
        expect(charts[0].turns).toEqual([{ Alice: 0, Bob: 4 }, { Alice: 7, Bob: 4 }]);
        expect(charts[1].turns[1]).toEqual({ Alice: 4, Bob: 3 });
    });

    it("plots nothing for a game that couldn't be replayed", () => {
        // A game dealt before the starting snapshot existed replays into no
        // series at all, and a chart of nothing is worse than no chart.
        expect(formatTrainTimeCharts(stats({ pointsPerTurn: [], longestRunPerTurn: [] }), NAMES)).toEqual([]);
    });
});
