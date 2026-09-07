import { describe, expect, it } from "vitest";
import { collapseToRounds, formatPerTurnChart } from "./GameDataApi";

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
});
