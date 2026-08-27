import { describe, expect, it } from "vitest";
import { ADJACENCY, CITIES, CITY_COUNT, DISEASE_COLORS, cityIdsForColor, isAdjacent } from "./board";

describe("Outbreak board", () => {
    it("has 48 cities", () => {
        expect(CITY_COUNT).toBe(48);
        expect(CITIES).toHaveLength(48);
    });

    it("gives every colour exactly 12 cities, covering the board with no overlap", () => {
        const seen = new Set<number>();
        for (const color of DISEASE_COLORS) {
            const ids = cityIdsForColor(color);
            expect(ids).toHaveLength(12);
            ids.forEach(id => seen.add(id));
        }
        expect(seen.size).toBe(CITY_COUNT);
    });

    it("is symmetric: every edge appears in both directions", () => {
        for (let from = 0; from < CITY_COUNT; from++) {
            for (const to of ADJACENCY[from]) {
                expect(isAdjacent(to, from)).toBe(true);
            }
        }
    });

    it("has no self-loops and no duplicate edges", () => {
        for (let id = 0; id < CITY_COUNT; id++) {
            expect(ADJACENCY[id]).not.toContain(id);
            expect(new Set(ADJACENCY[id]).size).toBe(ADJACENCY[id].length);
        }
    });

    it("is fully connected — every city is reachable from every other city", () => {
        const visited = new Set<number>([0]);
        const queue = [0];
        while (queue.length > 0) {
            const current = queue.shift()!;
            for (const neighbor of ADJACENCY[current]) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push(neighbor);
                }
            }
        }
        expect(visited.size).toBe(CITY_COUNT);
    });
});
