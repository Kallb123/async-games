import { describe, expect, it } from "vitest";
import { buildSymmetricAdjacency, edgeListFrom, isAdjacentIn } from "./adjacencyGraph";

describe("buildSymmetricAdjacency / isAdjacentIn", () => {
    const names = ["A", "B", "C"];
    const adjacency = buildSymmetricAdjacency(names, { A: ["B"], B: ["C"] });

    it("closes a one-directional edge dictionary into a symmetric graph", () => {
        expect(adjacency[0]).toEqual([1]); // A -> B
        expect(adjacency[1]).toEqual([0, 2]); // B <- A, B -> C
        expect(adjacency[2]).toEqual([1]); // C <- B
    });

    it("isAdjacentIn reads both directions of a closed edge", () => {
        expect(isAdjacentIn(adjacency, 0, 1)).toBe(true);
        expect(isAdjacentIn(adjacency, 1, 0)).toBe(true);
        expect(isAdjacentIn(adjacency, 0, 2)).toBe(false);
    });
});

describe("edgeListFrom", () => {
    it("dedupes a symmetric adjacency list into one edge per connected pair", () => {
        const adjacency = buildSymmetricAdjacency(["A", "B", "C"], { A: ["B"], B: ["C"] });
        const edges = edgeListFrom(adjacency);
        expect(edges).toHaveLength(2);
        expect(edges).toContainEqual([0, 1]);
        expect(edges).toContainEqual([1, 2]);
    });

    it("returns nothing for a graph with no edges", () => {
        expect(edgeListFrom([[], [], []])).toEqual([]);
    });
});
