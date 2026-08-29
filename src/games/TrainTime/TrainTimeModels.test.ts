import { describe, expect, it } from "vitest";
import {
    TrainTimeGameDataModel,
    buildInitialTrainTimeStateFromGameData,
    computeTrainTimeResultStats,
    formatTrainTimeCharts,
    gameStateToModel,
    type ITrainTimeGameData,
    type ITrainTimeGameResultStats,
} from "./TrainTimeModels";
import { TrainTimeGameResultModel } from "@/utils/mongodb/GameResultData";
import { ROUTE_COUNT, TRAINS_PER_PLAYER, buildInitialTrainTimeState, totalScore } from "./board";

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

    // Turn review replays from that snapshot, and it arrives as a Mongoose
    // subdocument whose fields sit behind getters — a spread copies none of
    // them. That made every number in a reviewed turn undefined, so the
    // standings read NaN. Clone by name, and check the numbers survive the
    // round trip the review screen actually takes.
    it("replays from the stored snapshot with every score intact", () => {
        const state = buildInitialTrainTimeState(["u1", "u2"]);
        state.playerStates.get("u1")!.score = 7;
        state.playerStates.get("u1")!.routesClaimed = 1;
        state.playerStates.get("u1")!.trains = TRAINS_PER_PLAYER - 4;

        const doc = gameDoc(state);
        const replayed = buildInitialTrainTimeStateFromGameData(doc as unknown as ITrainTimeGameData);
        const alice = replayed.playerStates.get("u1")!;
        expect(alice).toEqual(state.playerStates.get("u1"));

        const response = gameStateToModel(replayed, Object.fromEntries(NAMES), "u1");
        const ps = response.playerStates.u1;
        expect(totalScore(ps)).toBe(7);
        expect(ps.trains).toBe(TRAINS_PER_PLAYER - 4);
        expect(ps.routesClaimed).toBe(1);
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

    it("plots the points race and the Long Haul race, keyed by userId", () => {
        const charts = formatTrainTimeCharts(stats(), NAMES);

        expect(charts.map(c => c.title)).toEqual(["Route points per turn", "Longest run per turn"]);
        expect(charts[0].turns).toEqual([{ u1: 0, u2: 4 }, { u1: 7, u2: 4 }]);
        expect(charts[1].turns[1]).toEqual({ u1: 4, u2: 3 });
    });

    it("plots nothing for a game that couldn't be replayed", () => {
        // A game dealt before the starting snapshot existed replays into no
        // series at all, and a chart of nothing is worse than no chart.
        expect(formatTrainTimeCharts(stats({ pointsPerTurn: [], longestRunPerTurn: [] }), NAMES)).toEqual([]);
    });
});
