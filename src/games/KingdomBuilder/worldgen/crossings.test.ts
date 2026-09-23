import { describe, expect, it } from "vitest";
import { RIVER_CROSSING_SPACING, deriveCrossings, placeDetourCrossings, placeRiverCrossings } from "./crossings";
import type { TerrainField } from "./terrainField";
import { findTilePath, travelGridFor } from "./tilePath";

function fieldOf(...rows: string[]): TerrainField {
    return { columns: rows[0].length, rows: rows.length, tileSize: 2, codes: rows.join("") };
}

const at = (field: TerrainField, col: number, row: number) => row * field.columns + col;
const site = (field: TerrainField, col: number, row: number) => ({ x: col * 2 + 1, y: row * 2 + 1, tile: at(field, col, row) });

/** A straight river `length` tiles long across the middle row of a grass field, running into the sea at its east end. */
function straightRiver(length: number): TerrainField {
    return fieldOf("g".repeat(length) + "o", "r".repeat(length) + "o", "g".repeat(length) + "o");
}

describe("placeRiverCrossings", () => {
    it("bridges a long river at intervals of the spacing along its length, each running across it", () => {
        const field = straightRiver(RIVER_CROSSING_SPACING * 3);
        const bridges = placeRiverCrossings(field);
        expect(bridges.length).toBe(3);
        for (const bridge of bridges) expect(bridge).toMatchObject({ code: "B", orientation: "ns" });
        const cols = bridges.map(bridge => bridge.tile % field.columns).sort((a, b) => a - b);
        for (let index = 1; index < cols.length; index++) expect(cols[index] - cols[index - 1]).toBe(RIVER_CROSSING_SPACING);
    });

    it("leaves a stub of a river shorter than half the spacing for armies to walk round", () => {
        expect(placeRiverCrossings(straightRiver(RIVER_CROSSING_SPACING / 2 - 1))).toEqual([]);
    });

    it("spans a staircase river at a bend with both of the bend's tiles, since no single one crosses it", () => {
        // A river stepping down to the right, one tile at a time.
        const rows = Array.from({ length: 14 }, (_, row) => {
            const line = Array.from({ length: 16 }, (_, col) => (col === row || col === row + 1 ? "r" : "g"));
            return line.join("");
        });
        const field = fieldOf(...rows);
        const bridges = placeRiverCrossings(field);
        expect(bridges.length).toBeGreaterThan(0);
        expect(bridges.length % 2).toBe(0);
        // Whatever it chose, the two banks now meet.
        const grid = travelGridFor(field, bridges);
        expect(findTilePath(grid, at(field, 0, 5), at(field, 10, 0))).toBeDefined();
        expect(findTilePath(travelGridFor(field), at(field, 0, 5), at(field, 10, 0))).toBeUndefined();
    });

    it("never bridges a river wider than a crossing can span", () => {
        const field = fieldOf("g".repeat(20), "r".repeat(20), "r".repeat(20), "r".repeat(20), "g".repeat(20));
        expect(placeRiverCrossings(field)).toEqual([]);
    });
});

describe("placeDetourCrossings", () => {
    it("bridges the river between two neighbouring sites that would otherwise go a long way round", () => {
        const field = straightRiver(30);
        const sites = [site(field, 2, 0), site(field, 2, 2)];
        const bridges = placeDetourCrossings(field, sites, []);
        expect(bridges).toEqual([{ tile: at(field, 2, 1), code: "B", orientation: "ns" }]);
    });

    it("adds nothing when a crossing already nearby keeps the route short enough", () => {
        const field = straightRiver(30);
        const sites = [site(field, 2, 0), site(field, 2, 2)];
        expect(placeDetourCrossings(field, sites, [{ tile: at(field, 3, 1), code: "B", orientation: "ns" }])).toEqual([]);
    });

    it("fords a lake rather than bridging it", () => {
        const field = fieldOf("ggggggggg", "llllllllo", "ggggggggg");
        const [crossing] = placeDetourCrossings(field, [site(field, 1, 0), site(field, 1, 2)], []);
        expect(crossing.code).toBe("F");
    });

    it("never crosses the sea", () => {
        const field = fieldOf("ggg", "ooo", "ggg");
        expect(placeDetourCrossings(field, [site(field, 1, 0), site(field, 1, 2)], [])).toEqual([]);
    });
});

describe("deriveCrossings", () => {
    it("keeps the rivers' own bridges and adds the detours on top, never two on one tile", () => {
        const field = straightRiver(30);
        const crossings = deriveCrossings(field, [site(field, 0, 0), site(field, 0, 2)]);
        const tiles = crossings.map(crossing => crossing.tile);
        expect(new Set(tiles).size).toBe(tiles.length);
        expect(crossings).toEqual(expect.arrayContaining(placeRiverCrossings(field)));
        expect(tiles).toContain(at(field, 0, 1));
    });
});
