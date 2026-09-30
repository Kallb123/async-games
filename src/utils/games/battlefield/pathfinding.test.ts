import { describe, expect, it } from "vitest";
import { findPath, pathTo, reachFrom, stepCost } from "./pathfinding";
import { at, fieldOf } from "./testFixtures";

describe("stepCost", () => {
    const field = fieldOf(
        ".s.",
        ".,#",
        "...",
    );

    it("costs the square stepped onto, and 1.5 times that on a diagonal", () => {
        expect(stepCost(field, at(field, 0, 0), at(field, 0, 1))).toBe(1);
        expect(stepCost(field, at(field, 0, 0), at(field, 1, 0))).toBe(2);
        expect(stepCost(field, at(field, 0, 0), at(field, 1, 1))).toBe(4.5);
        expect(stepCost(field, at(field, 1, 1), at(field, 0, 2))).toBe(1.5);
    });

    it("can't step onto high cover, or anywhere that isn't next door", () => {
        expect(stepCost(field, at(field, 1, 0), at(field, 2, 1))).toBeUndefined();
        expect(stepCost(field, at(field, 0, 0), at(field, 2, 0))).toBeUndefined();
        expect(stepCost(field, at(field, 0, 0), at(field, 0, 0))).toBeUndefined();
    });

    it("can't cut diagonally past the corner of high cover, but can past low cover", () => {
        expect(stepCost(field, at(field, 1, 1), at(field, 2, 2))).toBeUndefined();
        expect(stepCost(field, at(field, 2, 2), at(field, 1, 1))).toBeUndefined();
        expect(stepCost(field, at(field, 0, 1), at(field, 1, 2))).toBe(1.5);
    });

    it("doesn't wrap a diagonal round the edge of the map", () => {
        const strip = fieldOf("...", "...");
        expect(stepCost(strip, at(strip, 2, 0), at(strip, 0, 1))).toBeUndefined();
    });
});

describe("reachFrom", () => {
    it("prices every square by its cheapest path, diagonals at 1.5", () => {
        const field = fieldOf(
            "....",
            "....",
            "....",
        );
        const { costs } = reachFrom(field, at(field, 0, 0));
        expect(costs[at(field, 0, 0)]).toBe(0);
        expect(costs[at(field, 3, 0)]).toBe(3);
        expect(costs[at(field, 1, 1)]).toBe(1.5);
        expect(costs[at(field, 2, 2)]).toBe(3);
        expect(costs[at(field, 3, 2)]).toBe(4);
    });

    it("climbs over low cover but never stops on it", () => {
        const field = fieldOf(
            "#.#",
            ".,.",
            "#.#",
        );
        const reach = reachFrom(field, at(field, 0, 1));
        expect(reach.costs[at(field, 1, 1)]).toBe(Infinity);
        expect(reach.costs[at(field, 2, 1)]).toBe(4);
        expect(pathTo(reach, at(field, 2, 1))?.squares).toEqual([at(field, 0, 1), at(field, 1, 1), at(field, 2, 1)]);
    });

    it("goes round low cover when that's cheaper than climbing it", () => {
        const field = fieldOf(
            "...",
            ".,.",
            "...",
        );
        expect(reachFrom(field, at(field, 0, 1)).costs[at(field, 2, 1)]).toBe(3);
    });

    it("stops at the budget", () => {
        const field = fieldOf("......");
        const { costs } = reachFrom(field, at(field, 0, 0), 3.5);
        expect([...costs]).toEqual([0, 1, 2, 3, Infinity, Infinity]);
    });

    it("never reaches the far side of a wall with no way round", () => {
        const field = fieldOf(
            ".#.",
            ".#.",
        );
        const reach = reachFrom(field, at(field, 0, 0));
        expect(reach.costs[at(field, 2, 0)]).toBe(Infinity);
        expect(pathTo(reach, at(field, 2, 0))).toBeUndefined();
    });

    it("doesn't squeeze diagonally between two corners of high cover", () => {
        const field = fieldOf(
            ".#",
            "#.",
        );
        expect(reachFrom(field, at(field, 0, 0)).costs[at(field, 1, 1)]).toBe(Infinity);
    });

    it("won't enter a blocked square, and crosses an occupied one without stopping", () => {
        const field = fieldOf(
            "...",
            "...",
        );
        const reach = reachFrom(field, at(field, 0, 0), Infinity, {
            blocked: new Set([at(field, 1, 1)]),
            occupied: new Set([at(field, 1, 0)]),
        });
        expect(reach.costs[at(field, 1, 1)]).toBe(Infinity);
        expect(reach.costs[at(field, 1, 0)]).toBe(Infinity);
        expect(pathTo(reach, at(field, 2, 0))).toEqual({ squares: [at(field, 0, 0), at(field, 1, 0), at(field, 2, 0)], cost: 2 });
    });
});

describe("findPath", () => {
    it("takes the cheapest way, every step next to the last", () => {
        const field = fieldOf(
            ".....",
            ".###.",
            ".....",
        );
        const path = findPath(field, at(field, 0, 1), at(field, 4, 1));
        expect(path?.cost).toBe(6);
        const squares = path?.squares ?? [];
        expect(squares[0]).toBe(at(field, 0, 1));
        expect(squares[squares.length - 1]).toBe(at(field, 4, 1));
        const total = squares.slice(1).reduce((sum, square, i) => sum + (stepCost(field, squares[i], square) ?? NaN), 0);
        expect(total).toBe(6);
    });

    it("stands still for nothing", () => {
        const field = fieldOf("..");
        expect(findPath(field, at(field, 0, 0), at(field, 0, 0))).toEqual({ squares: [at(field, 0, 0)], cost: 0 });
    });

    it("costs the same either way over flat ground", () => {
        const field = fieldOf(
            "......",
            ".T..T.",
            "......",
        );
        const there = findPath(field, at(field, 0, 0), at(field, 5, 2));
        const back = findPath(field, at(field, 5, 2), at(field, 0, 0));
        expect(there?.cost).toBe(back?.cost);
    });
});
