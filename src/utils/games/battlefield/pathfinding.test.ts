import { describe, expect, it } from "vitest";
import { CLIMB_COST, findPath, pathCost, pathTo, reachFrom, stepCost } from "./pathfinding";
import { at, fieldOf, hillOf } from "./testFixtures";

describe("stepCost", () => {
    const field = fieldOf(
        ".s.",
        ".,#",
        "...",
    );

    it("costs the square stepped onto, and 1.5 times that on a diagonal", () => {
        expect(stepCost(field, at(field, 0, 0), at(field, 0, 1))).toBe(1);
        expect(stepCost(field, at(field, 0, 0), at(field, 1, 0))).toBe(2);
        // Rubble is half a height: climbing onto it and off again each cost a climb.
        expect(stepCost(field, at(field, 0, 0), at(field, 1, 1))).toBe((1 + CLIMB_COST) * 1.5);
        expect(stepCost(field, at(field, 1, 1), at(field, 0, 2))).toBe((1 + CLIMB_COST) * 1.5);
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

    it("can't step on or off the map", () => {
        const last = field.tiles.length - 1;
        expect(stepCost(field, last, last + field.width)).toBeUndefined();
        expect(stepCost(field, last + field.width, last)).toBeUndefined();
        expect(stepCost(field, 0, -1)).toBeUndefined();
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
        expect(pathCost(field, squares)).toBe(6);
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

describe("climbing", () => {
    /** A step from open ground up (or down) onto open ground this many quarters higher. */
    const step = (from: number, to: number, climb?: number) => stepCost(hillOf([".."], [`${from}${to}`]), 0, 1, climb);

    it("takes a quarter in its stride, climbs a half or three quarters, and can't climb a full height", () => {
        expect(step(0, 1)).toBe(1);
        expect(step(0, 2)).toBe(1 + CLIMB_COST);
        expect(step(0, 3)).toBe(1 + CLIMB_COST);
        expect(step(0, 4)).toBeUndefined();
    });

    it("climbs down as it climbs up", () => {
        expect(step(1, 0)).toBe(1);
        expect(step(3, 0)).toBe(1 + CLIMB_COST);
        expect(step(4, 0)).toBeUndefined();
    });

    it("lets a mover that climbs better up a full height, and no more", () => {
        expect(step(0, 4, 4)).toBe(1 + CLIMB_COST);
        expect(step(0, 5, 4)).toBeUndefined();
    });

    it("never climbs onto or off a stair, however far it rises", () => {
        // Open ground, a stair three quarters up, and ground two full heights up past it.
        const tower = hillOf(["...s."], ["00008"]);
        expect(stepCost(tower, 2, 3)).toBe(2);
        expect(stepCost(tower, 3, 4)).toBe(1);
        expect(findPath(tower, 0, 4)?.squares).toEqual([0, 1, 2, 3, 4]);
    });

    it("can't cut a diagonal past a corner a full height above both ends", () => {
        const corner = hillOf(["..", ".."], ["04", "00"]);
        expect(stepCost(corner, at(corner, 0, 0), at(corner, 1, 1))).toBeUndefined();
        const low = hillOf(["..", ".."], ["03", "00"]);
        expect(stepCost(low, at(low, 0, 0), at(low, 1, 1))).toBe(1.5);
    });
});

describe("pathCost", () => {
    const field = fieldOf(
        "..,",
        ".#.",
    );

    it("adds up every step, and a lone square costs nothing", () => {
        expect(pathCost(field, [at(field, 0, 1), at(field, 0, 0), at(field, 1, 0), at(field, 2, 0)])).toBe(3 + CLIMB_COST);
        expect(pathCost(field, [at(field, 0, 0)])).toBe(0);
    });

    it("refuses a path with a jump, a wall or a cut corner in it", () => {
        expect(pathCost(field, [at(field, 0, 0), at(field, 2, 0)])).toBeUndefined();
        expect(pathCost(field, [at(field, 0, 0), at(field, 1, 1)])).toBeUndefined();
        expect(pathCost(field, [at(field, 1, 0), at(field, 2, 1)])).toBeUndefined();
    });
});
