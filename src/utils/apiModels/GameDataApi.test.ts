import { describe, expect, it } from "vitest";
import { collapseToRounds, formatPerTurnChart, mapEventsToRounds } from "./GameDataApi";

describe("collapseToRounds", () => {
    it("keeps the state at the end of every complete round", () => {
        // Three players, six turns - two complete rounds.
        const perTurn = [1, 2, 3, 4, 5, 6];
        expect(collapseToRounds(perTurn, 3)).toEqual([3, 6]);
    });

    it("keeps a trailing incomplete round rather than dropping it", () => {
        // Three players, five turns - one complete round and a partial one.
        const perTurn = [1, 2, 3, 4, 5];
        expect(collapseToRounds(perTurn, 3)).toEqual([3, 5]);
    });

    it("is a no-op for a solo game, where every turn is its own round", () => {
        const perTurn = [1, 2, 3];
        expect(collapseToRounds(perTurn, 1)).toEqual([1, 2, 3]);
    });

    it("returns nothing for no turns", () => {
        expect(collapseToRounds([], 2)).toEqual([]);
    });

    it("keeps a single turn as a partial round", () => {
        expect(collapseToRounds([1], 3)).toEqual([1]);
    });
});

describe("formatPerTurnChart", () => {
    it("collapses a per-turn series into a round-by-round chart", () => {
        const perTurn = [
            new Map([["u1", 1], ["u2", 0]]),
            new Map([["u1", 1], ["u2", 2]]),
            new Map([["u1", 4], ["u2", 2]]),
        ];

        const chart = formatPerTurnChart(perTurn, "Coins per round", "Coins", 2);

        expect(chart?.rounds).toEqual([
            { u1: 1, u2: 2 },
            { u1: 4, u2: 2 },
        ]);
    });

    it("returns undefined for an empty or missing series", () => {
        expect(formatPerTurnChart([], "Coins per round", "Coins", 2)).toBeUndefined();
        expect(formatPerTurnChart(undefined, "Coins per round", "Coins", 2)).toBeUndefined();
    });

    it("places events on the round the turn they happened in collapses to", () => {
        const perTurn = [
            new Map([["u1", 1], ["u2", 0]]),
            new Map([["u1", 1], ["u2", 2]]),
            new Map([["u1", 4], ["u2", 2]]),
        ];
        const events = [{ turnIndex: 0, glyph: "🏛️" }, { turnIndex: 2, glyph: "💥", seriesKey: "u1" }];

        const chart = formatPerTurnChart(perTurn, "Coins per round", "Coins", 2, undefined, events);

        // Turns 0-1 collapse to round 0, turn 2 is the trailing partial round.
        expect(chart?.events).toEqual([
            { round: 0, glyph: "🏛️" },
            { round: 1, glyph: "💥", seriesKey: "u1" },
        ]);
    });

    it("carries no events field when none are given", () => {
        const perTurn = [new Map([["u1", 1]])];
        expect(formatPerTurnChart(perTurn, "Coins per round", "Coins", 1)?.events).toBeUndefined();
        expect(formatPerTurnChart(perTurn, "Coins per round", "Coins", 1, undefined, [])?.events).toBeUndefined();
    });
});

describe("mapEventsToRounds", () => {
    it("maps each event's turn onto the round it falls in", () => {
        // Two players, three turns: collapseToRounds groups turns 0-1 into
        // round 0 and the trailing turn 2 into round 1 - the same grouping
        // formatPerTurnChart applies to the per-turn series alongside it.
        const events = [
            { turnIndex: 0, glyph: "🏛️" },
            { turnIndex: 1, glyph: "🏛️" },
            { turnIndex: 2, glyph: "💥" },
        ];

        expect(mapEventsToRounds(events, 2, 2)).toEqual([
            { round: 0, glyph: "🏛️" },
            { round: 0, glyph: "🏛️" },
            { round: 1, glyph: "💥" },
        ]);
    });

    it("keeps title and seriesKey when present, and drops them when not", () => {
        const events = [
            { turnIndex: 0, glyph: "🏛️", title: "Built a landmark", seriesKey: "u1" },
            { turnIndex: 0, glyph: "☣️" },
        ];

        expect(mapEventsToRounds(events, 1, 1)).toEqual([
            { round: 0, glyph: "🏛️", title: "Built a landmark", seriesKey: "u1" },
            { round: 0, glyph: "☣️" },
        ]);
    });

    it("clamps to the last round rather than overrunning it", () => {
        expect(mapEventsToRounds([{ turnIndex: 5, glyph: "💥" }], 2, 1)).toEqual([{ round: 0, glyph: "💥" }]);
    });
});
