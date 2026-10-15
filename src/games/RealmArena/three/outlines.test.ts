import { describe, expect, it } from "vitest";
import { boundaryRuns, dashesOf, solidOf, stripCorners, strokeLength, strokeWidth, type EdgeRun } from "./outlines";

/** A 4×3 map: squares 0–3 are the first row, 4–7 the second, 8–11 the third. */
const FIELD = { width: 4, height: 3 };
const flat = () => 0;
const length = (run: EdgeRun) => run.x1 - run.x0 + run.z1 - run.z0;

describe("boundaryRuns", () => {
    it("draws nothing for no squares", () => {
        expect(boundaryRuns(FIELD, new Set(), flat)).toEqual([]);
    });

    it("draws the four sides of a lone square", () => {
        expect(boundaryRuns(FIELD, new Set([5]), flat)).toEqual([
            { x0: 1, z0: 1, x1: 2, z1: 1, y: 0 },
            { x0: 1, z0: 1, x1: 1, z1: 2, y: 0 },
            { x0: 2, z0: 1, x1: 2, z1: 2, y: 0 },
            { x0: 1, z0: 2, x1: 2, z1: 2, y: 0 },
        ]);
    });

    it("joins the edges of squares side by side into one run a side, and draws nothing between them", () => {
        // Squares 4, 5 and 6: one row of three.
        const runs = boundaryRuns(FIELD, new Set([4, 5, 6]), flat);
        expect(runs).toHaveLength(4);
        expect(runs).toContainEqual({ x0: 0, z0: 1, x1: 3, z1: 1, y: 0 });
        expect(runs).toContainEqual({ x0: 0, z0: 2, x1: 3, z1: 2, y: 0 });
        expect(runs).toContainEqual({ x0: 0, z0: 1, x1: 0, z1: 2, y: 0 });
        expect(runs).toContainEqual({ x0: 3, z0: 1, x1: 3, z1: 2, y: 0 });
    });

    it("draws round a block of squares and not through it", () => {
        // A 2×2 block: squares 5, 6, 9, 10 — the perimeter, 8 units, in 4 runs of 2.
        const runs = boundaryRuns(FIELD, new Set([5, 6, 9, 10]), flat);
        expect(runs).toHaveLength(4);
        expect(runs.map(length)).toEqual([2, 2, 2, 2]);
    });

    it("follows an L-shape's corner in separate runs", () => {
        // Squares 0, 1 and 4: the edge between 1 and 4's row steps.
        const runs = boundaryRuns(FIELD, new Set([0, 1, 4]), flat);
        expect(runs.map(length).reduce((a, b) => a + b)).toBe(8);
        expect(runs).toContainEqual({ x0: 1, z0: 1, x1: 2, z1: 1, y: 0 });
        expect(runs).toContainEqual({ x0: 0, z0: 0, x1: 2, z1: 0, y: 0 });
    });

    it("draws the map's own edge, where nothing is across it", () => {
        const runs = boundaryRuns(FIELD, new Set([0]), flat);
        expect(runs).toContainEqual({ x0: 0, z0: 0, x1: 1, z1: 0, y: 0 });
        expect(runs).toContainEqual({ x0: 0, z0: 0, x1: 0, z1: 1, y: 0 });
    });

    it("draws a hole in a set round the hole", () => {
        // Squares round the middle of the top two rows' left three, leaving 5 out.
        const around = new Set([0, 1, 2, 4, 6, 8, 9, 10]);
        const runs = boundaryRuns(FIELD, around, flat);
        // Outside: 3 + 3 + 3 + 3 = 12; the hole's own side: 4.
        expect(runs.map(length).reduce((a, b) => a + b)).toBe(16);
        expect(runs).toContainEqual({ x0: 1, z0: 1, x1: 2, z1: 1, y: 0 });
    });

    it("lies each edge on the top of its own square, and goes on across a step in the set", () => {
        const heights = [0, 0, 0, 0, 0, 3, 3, 0, 0, 0, 0, 0];
        const runs = boundaryRuns(FIELD, new Set([4, 5, 6, 7]), square => heights[square]);
        // Nothing between squares 4 and 5, though they stand at different heights;
        // the sides at each height are their own runs.
        expect(runs).not.toContainEqual(expect.objectContaining({ x0: 1, x1: 1 }));
        expect(runs).toContainEqual({ x0: 1, z0: 1, x1: 3, z1: 1, y: 3 });
        expect(runs).toContainEqual({ x0: 0, z0: 1, x1: 1, z1: 1, y: 0 });
        expect(runs).toContainEqual({ x0: 3, z0: 1, x1: 4, z1: 1, y: 0 });
    });

    it("is in the same order whatever order the set was built in", () => {
        const a = boundaryRuns(FIELD, new Set([5, 6, 9]), flat);
        const b = boundaryRuns(FIELD, new Set([9, 6, 5]), flat);
        expect(a).toEqual(b);
    });
});

describe("dashesOf", () => {
    const run: EdgeRun = { x0: 1, z0: 2, x1: 4, z1: 2, y: 0 };

    it("starts and ends the run on half a dash", () => {
        const dashes = dashesOf(run, [0.2, 0.1]);
        expect(dashes[0].x0).toBeCloseTo(1);
        expect(dashes[dashes.length - 1].x1).toBeCloseTo(4);
        // 3 / 0.3 = 10 periods: ten gaps between eleven pieces, the two ends half as long.
        expect(dashes).toHaveLength(11);
        expect(length(dashes[0])).toBeCloseTo(length(dashes[5]) / 2);
        expect(length(dashes[5])).toBeCloseTo(0.2);
    });

    it("keeps the dash to the gap's proportion, fitted to the run", () => {
        const dashes = dashesOf({ x0: 0, z0: 0, x1: 0, z1: 1, y: 0 }, [0.2, 0.1]);
        // 1 / 0.3 rounds to three periods of one third; a dash is two thirds of one.
        expect(dashes).toHaveLength(4);
        expect(length(dashes[1])).toBeCloseTo(2 / 9);
        expect(dashes[2].z0 - dashes[1].z1).toBeCloseTo(1 / 9);
    });

    it("runs along z for a run along z", () => {
        const dashes = dashesOf({ x0: 3, z0: 0, x1: 3, z1: 2, y: 1 }, [0.5, 0.5]);
        for (const dash of dashes) expect(dash).toMatchObject({ x0: 3, x1: 3, y: 1 });
    });

    it("reaches past the ends of the run, and only the ends, by the cap", () => {
        const plain = dashesOf(run, [0.2, 0.1]);
        const capped = dashesOf(run, [0.2, 0.1], 0.05);
        expect(capped[0].x0).toBeCloseTo(0.95);
        expect(capped[capped.length - 1].x1).toBeCloseTo(4.05);
        expect(capped.slice(1, -1)).toEqual(plain.slice(1, -1));
    });

    it("still has two pieces on a run shorter than a dash", () => {
        expect(dashesOf({ x0: 0, z0: 0, x1: 0.05, z1: 0, y: 0 }, [0.3, 0.3])).toHaveLength(2);
    });
});

describe("solidOf", () => {
    it("is the run, reaching the cap past each end", () => {
        expect(solidOf({ x0: 1, z0: 2, x1: 4, z1: 2, y: 0 }, 0.1)).toEqual({ x0: 0.9, z0: 2, x1: 4.1, z1: 2, y: 0 });
        expect(solidOf({ x0: 3, z0: 0, x1: 3, z1: 2, y: 5 }, 0.1)).toEqual({ x0: 3, z0: -0.1, x1: 3, z1: 2.1, y: 5 });
    });
});

describe("stripCorners", () => {
    it("is the width across the run, centred on it and lifted", () => {
        expect(stripCorners({ x0: 1, z0: 2, x1: 4, z1: 2, y: 1 }, 0.2, 0.01)).toEqual([[1, 1.01, 1.9], [4, 1.01, 1.9], [4, 1.01, 2.1], [1, 1.01, 2.1]]);
        const along = stripCorners({ x0: 3, z0: 0, x1: 3, z1: 2, y: 0 }, 0.5);
        expect(along.map(([x]) => x)).toEqual([2.75, 3.25, 3.25, 2.75]);
        expect(along.map(([, , z]) => z)).toEqual([0, 0, 2, 2]);
    });
});

describe("strokes on the ground", () => {
    it("are as wide on screen as the isometric board strokes them", () => {
        // A square's side is √125 units on screen there, and a strip of the ground one world unit wide across it covers the diamond's 100 over that length.
        expect(strokeWidth(1)).toBeCloseTo(Math.sqrt(125) / 100);
        expect(strokeLength(2)).toBeCloseTo(2 / Math.sqrt(125));
    });
});
