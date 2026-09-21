import { describe, expect, it } from "vitest";
import { generateLandmass } from "./landmass";
import { createRandom } from "./random";
import {
    applySitesToTerrainField,
    areaCodeAt,
    generateBaseTerrainField,
    runBeachPass,
    runFieldsPass,
    runRiverTracePass,
    runSmoothingPass,
    runWaterSplitPass,
    tileAt,
    tileIndex,
    walkTileLine,
    TERRAIN_FIELD_TILE_SIZE,
    type TerrainField,
} from "./terrainField";

describe("generateBaseTerrainField", () => {
    it("is deterministic for the same seed, and covers exactly one code per tile", () => {
        const landmass = generateLandmass(createRandom("ground"));
        const first = generateBaseTerrainField(landmass, createRandom("ground-field"));
        const second = generateBaseTerrainField(landmass, createRandom("ground-field"));
        expect(first).toEqual(second);
        expect(first.field.columns).toBe(50);
        expect(first.field.rows).toBe(35);
        expect(first.field.codes).toHaveLength(50 * 35);
        expect(first.elevations).toHaveLength(50 * 35);
    });

    it("keeps the map's border in the sea, same as the landmass itself", () => {
        const landmass = generateLandmass(createRandom("border"));
        const { field } = generateBaseTerrainField(landmass, createRandom("border-field"));
        for (let col = 0; col < field.columns; col++) {
            expect(field.codes[tileIndex(field, col, 0)]).toBe("o");
        }
    });
});

describe("runWaterSplitPass", () => {
    it("marks water reachable from the border as ocean, and encloses the rest as lake", () => {
        // A 5x5 grid: a ring of provisional water around a single enclosed
        // "lake" tile in the middle, with land everywhere else irrelevant here.
        const columns = 5, rows = 5;
        const codes = Array.from({ length: columns * rows }, (_, index) => {
            const col = index % columns, row = Math.floor(index / columns);
            return (col === 0 || row === 0) ? "l" : (col === 2 && row === 2) ? "l" : "g";
        });
        runWaterSplitPass(codes, columns, rows);
        expect(codes[tileIndex({ columns }, 0, 0)]).toBe("o");
        expect(codes[tileIndex({ columns }, 2, 2)]).toBe("l");
    });
});

describe("runRiverTracePass", () => {
    it("carves a one-tile path downhill from a high tile toward water, stopping at the water's edge", () => {
        const columns = 1, rows = 6;
        // A single column: high ground at the top, sloping down to open ocean at the bottom.
        const codes = ["g", "g", "g", "g", "g", "o"];
        const elevations = [0.9, 0.7, 0.5, 0.4, 0.3, 0];
        runRiverTracePass(codes, elevations, columns, rows, createRandom("river"), 1);
        expect(codes[5]).toBe("o");
        expect(codes.slice(0, 5)).not.toContain("o");
        expect(codes.slice(1, 5).some(code => code === "r")).toBe(true);
    });

    it("never overwrites water, and gives up rather than looping on a local minimum", () => {
        const columns = 3, rows = 1;
        const codes = ["g", "g", "g"];
        const elevations = [0.9, 0.9, 0.9]; // flat: no strictly-lower neighbour anywhere
        expect(() => runRiverTracePass(codes, elevations, columns, rows, createRandom("flat"), 1)).not.toThrow();
        expect(codes.every(code => code === "g")).toBe(true);
    });
});

describe("runBeachPass", () => {
    it("turns land touching ocean into beach, and leaves everything else alone", () => {
        const columns = 3, rows = 1;
        const codes = ["o", "g", "m"];
        runBeachPass(codes, columns, rows);
        expect(codes).toEqual(["o", "b", "m"]);
    });
});

describe("runFieldsPass", () => {
    it("turns grass near a site into fields, and leaves distant grass and other areas alone", () => {
        const columns = 5, rows = 1;
        const codes = ["g", "g", "g", "g", "w"];
        // Tile centres sit at x = 1,3,5,7,9 for TERRAIN_FIELD_TILE_SIZE = 2.
        runFieldsPass(codes, columns, rows, [{ x: 1, y: 1 }], 3);
        expect(codes[0]).toBe("f");
        expect(codes[1]).toBe("f");
        expect(codes[2]).toBe("g");
        expect(codes[4]).toBe("w");
    });
});

describe("runSmoothingPass", () => {
    it("flips a lone stray tile surrounded by a different land window", () => {
        const columns = 3, rows = 3;
        const codes = ["g", "g", "g", "g", "m", "g", "g", "g", "g"];
        runSmoothingPass(codes, columns, rows, 1);
        expect(codes[4]).toBe("g");
    });

    it("never touches water, beach, river or fields tiles", () => {
        const columns = 3, rows = 1;
        const codes = ["o", "r", "f"];
        runSmoothingPass(codes, columns, rows, 2);
        expect(codes).toEqual(["o", "r", "f"]);
    });
});

describe("applySitesToTerrainField", () => {
    it("is additive on top of the base field and stable in length", () => {
        const landmass = generateLandmass(createRandom("sites"));
        const { field } = generateBaseTerrainField(landmass, createRandom("sites-field"));
        const withSites = applySitesToTerrainField(field, [{ x: 50, y: 35 }]);
        expect(withSites.codes).toHaveLength(field.codes.length);
        expect(withSites.columns).toBe(field.columns);
    });
});

describe("areaCodeAt / tileAt", () => {
    it("clamps out-of-range points to the grid rather than throwing", () => {
        const field: TerrainField = { columns: 5, rows: 5, tileSize: TERRAIN_FIELD_TILE_SIZE, codes: "g".repeat(25) };
        expect(() => areaCodeAt(field, { x: -50, y: 9999 })).not.toThrow();
        expect(tileAt(field, { x: -50, y: 9999 })).toEqual({ col: 0, row: 4 });
    });
});

describe("walkTileLine", () => {
    it("sums to the line's full length across the tiles it crosses", () => {
        const field: TerrainField = { columns: 10, rows: 10, tileSize: 2, codes: "g".repeat(100) };
        const from = { x: 1, y: 1 };
        const to = { x: 17, y: 9 };
        const segments = walkTileLine(field, from, to);
        const total = segments.reduce((sum, segment) => sum + segment.length, 0);
        expect(total).toBeCloseTo(Math.hypot(to.x - from.x, to.y - from.y), 6);
        expect(new Set(segments.map(segment => `${segment.col},${segment.row}`)).size).toBe(segments.length);
    });

    it("walks a straight horizontal line through every tile it passes, never diagonally slipping a corner", () => {
        const field: TerrainField = { columns: 5, rows: 5, tileSize: 2, codes: "g".repeat(25) };
        const segments = walkTileLine(field, { x: 0, y: 5 }, { x: 10, y: 5 });
        expect(segments.every(segment => segment.row === 2)).toBe(true);
        expect(segments.map(segment => segment.col)).toEqual([0, 1, 2, 3, 4]);
    });

    it("returns nothing for a zero-length line", () => {
        const field: TerrainField = { columns: 5, rows: 5, tileSize: 2, codes: "g".repeat(25) };
        expect(walkTileLine(field, { x: 3, y: 3 }, { x: 3, y: 3 })).toEqual([]);
    });
});
