import { describe, expect, it } from "vitest";
import {
    SettlementsAndCitiesGameDataModel,
    cloneSACState,
    gameStateToResponse,
    computeSettlementsAndCitiesResultStats,
    formatSettlementsAndCitiesCharts,
} from "./SettlementsAndCitiesModels";
import { makeState, player } from "./testFixtures";
import type { ISACRollChange, ISACSpecificGameState } from "./board";
import { BOARD_TOPOLOGY, NO_RESOURCES } from "./board";

const NAMES = { u1: "Alice", u2: "Bob" };

function gain(userId: string, gained: Partial<typeof NO_RESOURCES>): ISACRollChange {
    return { userId, gained: { ...NO_RESOURCES, ...gained }, discarded: 0 };
}

function stateWith(lastRollChanges: ISACRollChange[] | undefined): ISACSpecificGameState {
    return makeState({
        lastRollChanges,
        playerStates: new Map([["u1", player()], ["u2", player()]]),
        // A real (empty) board rather than makeState's default `[]` — calculateLongestRoad
        // walks BOARD_TOPOLOGY's edge/vertex ids into these arrays, so the
        // roll-frequency stats tests below (which call the full result-stats
        // computation, longest road included) need them the real size.
        vertices: Array.from({ length: BOARD_TOPOLOGY.numVertices }, () => ({ building: null, owner: null })),
        edges: Array.from({ length: BOARD_TOPOLOGY.numEdges }, () => ({ hasRoad: false, owner: null })),
    });
}

function docFor(specificGameState: ISACSpecificGameState) {
    return new SettlementsAndCitiesGameDataModel({
        gameId: "11111111-1111-1111-1111-111111111111",
        gameType: {
            gameId: "g", gameType: "SettlementsAndCities", friendlyName: "Settlements & Cities",
            icon: "", url: "settlementsandcities", className: "SettlementsAndCitiesGameType",
        },
        userIdList: ["u1", "u2"],
        turnTimer: "1d",
        currentTurn: "u1",
        lastTurnTimestamp: new Date().toISOString(),
        timerWarningNotificationSent: false,
        gameState: { turnOrder: ["u1", "u2"], history: [], commandHistory: [] },
        complete: false,
        winner: "",
        specificGameState,
        initialSpecificGameState: specificGameState,
    });
}

// `lastRollChanges` is what the dice paid out, recorded as the roll resolves so
// the board, the history and the recap all read the same payout. Three things
// about it depend on Mongoose behaving a particular way, and each of them is a
// real bug if it doesn't — hence this file rather than trusting the cast.
describe("Settlements & Cities' roll payout through Mongoose", () => {
    it("stays absent on a game played before the field existed, rather than becoming []", () => {
        // A Mongoose array path defaults to `[]`, which here would be a claim —
        // "this roll paid nobody" — about a roll that simply never recorded one.
        // `default: undefined` in the schema is what keeps the two apart, and the
        // screens show no payout line at all for the absent case.
        const doc = docFor(stateWith(undefined));

        expect(doc.validateSync()).toBeUndefined();
        expect(doc.specificGameState.lastRollChanges).toBeUndefined();
        expect(gameStateToResponse(doc.specificGameState, NAMES, "u1").lastRollChanges).toBeUndefined();
    });

    it("marks itself dirty when a roll writes it, with no markModified to remember", () => {
        // This game has a real schema rather than Schema.Types.Mixed, so assigning
        // a fresh array onto the nested state path is tracked on its own — unlike
        // the Mixed-state games, which each need an explicit markDirty().
        const doc = docFor(stateWith(undefined));
        doc.$isNew = false;
        doc.unmarkModified("specificGameState");

        doc.specificGameState.lastRollChanges = [gain("u1", { lumber: 2 })];
        expect(doc.isModified("specificGameState.lastRollChanges")).toBe(true);

        // …and so does clearing it, which is what the turn hand-off does.
        doc.unmarkModified("specificGameState");
        doc.specificGameState.lastRollChanges = [];
        expect(doc.isModified("specificGameState.lastRollChanges")).toBe(true);
    });

    it("reaches the client as plain rows, without the subdocument _id Mongoose adds", () => {
        const doc = docFor(stateWith([gain("u1", { lumber: 2, grain: 1 }), { userId: "u2", gained: NO_RESOURCES, discarded: 3 }]));
        const wire = JSON.parse(JSON.stringify(gameStateToResponse(doc.specificGameState, NAMES, "u1")));

        expect(wire.lastRollChanges).toEqual([
            { userId: "u1", gained: { lumber: 2, wool: 0, grain: 1, brick: 0, ore: 0 }, discarded: 0 },
            { userId: "u2", gained: { lumber: 0, wool: 0, grain: 0, brick: 0, ore: 0 }, discarded: 3 },
        ]);
        // The stored rows do carry an _id of their own, which is exactly why the
        // response builds each row field by field instead of sending them as-is.
        expect(JSON.parse(JSON.stringify(doc.specificGameState.lastRollChanges))[0]._id).toBeDefined();
    });

    it("is deep-cloned for replay, absent state and all", () => {
        const changes = [gain("u1", { ore: 1 })];
        const cloned = cloneSACState(stateWith(changes), ["u1", "u2"]);

        expect(cloned.lastRollChanges).toEqual(changes);
        expect(cloned.lastRollChanges).not.toBe(changes);
        expect(cloned.lastRollChanges![0].gained).not.toBe(changes[0].gained);
        expect(cloneSACState(stateWith(undefined), ["u1", "u2"]).lastRollChanges).toBeUndefined();
    });
});

// The roll an auto-ended turn holds over, and who is allowed to see it. The
// other half — the log line, which is word for word an ordinary "ended their
// turn" — is covered in SettlementsAndCitiesLogic.test.ts.
describe("Settlements & Cities' auto-ended turn on the wire", () => {
    function autoEndedState(): ISACSpecificGameState {
        return makeState({
            hasRolled: false,
            lastRoll: 8,
            lastRollDie1: 5,
            lastRollDie2: 3,
            lastRollChanges: [gain("u1", { lumber: 1 })],
            lastRollAutoEnded: true,
            lastRollAutoEndedBy: "u1",
            playerStates: new Map([["u1", player()], ["u2", player()]]),
        });
    }

    it("keeps the held-over roll and its note for the player it happened to", () => {
        const wire = gameStateToResponse(autoEndedState(), NAMES, "u1");

        expect(wire.lastRoll).toBe(8);
        expect(wire.lastRollDie1).toBe(5);
        expect(wire.lastRollDie2).toBe(3);
        expect(wire.lastRollChanges).toHaveLength(1);
        expect(wire.lastRollAutoEnded).toBe(true);
    });

    it.each([["an opponent", "u2"], ["a spectator", null]] as const)(
        "sends %s exactly what a tapped End turn leaves — no dice, no payout, no flag",
        (_who, viewerId) => {
            const wire = gameStateToResponse(autoEndedState(), NAMES, viewerId);

            expect(wire.lastRoll).toBeNull();
            expect(wire.lastRollDie1).toBeNull();
            expect(wire.lastRollDie2).toBeNull();
            expect(wire.lastRollChanges).toEqual([]);
            expect(wire.lastRollAutoEnded).toBe(false);
        },
    );
});

// A roll's total (2-12) is tallied straight off SACRollDice's own recorded
// dice in commandHistory, not replayed - see computeSACRollFrequency. These
// prove the tally against the shape commandHistory actually stores rolls in,
// not just a made-up input.
describe("Settlements & Cities' roll-frequency stat", () => {
    function rollCommand(recordedRoll1: number, recordedRoll2: number) {
        return { className: "SACRollDice", senderId: "u1", recordedRoll1, recordedRoll2 };
    }

    it("tallies every roll's total, seeding every possible total (2-12) at zero", () => {
        const doc = docFor(stateWith(undefined));
        doc.gameState.commandHistory.push(
            rollCommand(3, 4), // 7
            rollCommand(1, 1), // 2
            rollCommand(6, 6), // 12
            rollCommand(3, 4), // 7 again
        );

        const stats = computeSettlementsAndCitiesResultStats(doc, []);

        expect(Object.fromEntries(stats.rollFrequency)).toEqual({
            "2": 1, "3": 0, "4": 0, "5": 0, "6": 0,
            "7": 2, "8": 0, "9": 0, "10": 0, "11": 0, "12": 1,
        });
    });

    it("ignores commands that aren't a roll, and a roll with no recorded dice", () => {
        const doc = docFor(stateWith(undefined));
        doc.gameState.commandHistory.push(
            { className: "SACEndTurn", senderId: "u1" },
            rollCommand(2, 2), // 4
            { className: "SACRollDice", senderId: "u1" }, // never executed - no recorded dice
        );

        const stats = computeSettlementsAndCitiesResultStats(doc, []);

        expect(stats.rollFrequency.get("4")).toBe(1);
        expect([...stats.rollFrequency.values()].reduce((a, b) => a + b, 0)).toBe(1);
    });

    it("appears as the last chart, after the resources/round line chart, with one bar per total", () => {
        const doc = docFor(stateWith(undefined));
        doc.gameState.commandHistory.push(rollCommand(4, 5)); // 9

        const stats = computeSettlementsAndCitiesResultStats(doc, [new Map([["u1", 3]])]);
        const charts = formatSettlementsAndCitiesCharts(stats, new Map(Object.entries(NAMES)));

        expect(charts).toHaveLength(2);
        expect(charts[0].title).toBe("Resources gathered per round");
        const rollChart = charts[1];
        expect(rollChart.title).toBe("Dice roll frequency");
        expect(rollChart.kind).toBe("bar");
        if (rollChart.kind !== "bar") throw new Error("expected a bar chart");
        expect(rollChart.bars.map(b => b.label)).toEqual(
            ["2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]
        );
        expect(rollChart.bars.find(b => b.label === "9")?.value).toBe(1);
        expect(rollChart.bars.find(b => b.label === "2")?.value).toBe(0);
    });

    it("still charts the roll frequency even when no resources chart is recorded", () => {
        const doc = docFor(stateWith(undefined));
        const stats = computeSettlementsAndCitiesResultStats(doc, []);
        const charts = formatSettlementsAndCitiesCharts(stats, new Map(Object.entries(NAMES)));

        expect(charts).toHaveLength(1);
        expect(charts[0].title).toBe("Dice roll frequency");
    });
});
