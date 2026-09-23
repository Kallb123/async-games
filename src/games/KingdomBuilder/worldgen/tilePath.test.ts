import { describe, expect, it } from "vitest";
import { findTilePath, isPassableTile, tileCostsFrom, travelGridFor } from "./tilePath";
import type { TerrainField } from "./terrainField";

/** A hand-drawn field, one string per row — the grid the tests read. */
function fieldOf(...rows: string[]): TerrainField {
    return { columns: rows[0].length, rows: rows.length, tileSize: 2, codes: rows.join("") };
}

const at = (field: TerrainField, col: number, row: number): number => row * field.columns + col;

describe("travelGridFor", () => {
    it("weighs each tile by its area, lets a bridge or ford cross only its own water, and caps ground under a road", () => {
        const field = fieldOf("grlmo");
        const grid = travelGridFor(field, [
            { tile: 1, code: "B" },
            { tile: 2, code: "B" }, // A bridge can't cross a lake — only a ford can.
            { tile: 3, code: "R" },
        ]);
        expect([...grid.weights]).toEqual([1, 2.5, Infinity, 1, Infinity]);
    });

    it("leaves a decorative overlay's ground as it was", () => {
        expect(travelGridFor(fieldOf("h"), [{ tile: 0, code: "U" }]).weights[0]).toBe(2);
    });

    it("treats tiles past the end of a malformed, too-short field as impassable rather than guessing", () => {
        const grid = travelGridFor({ columns: 3, rows: 1, tileSize: 2, codes: "g" });
        expect([...grid.weights]).toEqual([1, Infinity, Infinity]);
    });
});

describe("findTilePath", () => {
    it("walks a straight line of grass at one world unit a unit", () => {
        const field = fieldOf("ggggg");
        const path = findTilePath(travelGridFor(field), 0, 4)!;
        expect(path.tiles).toEqual([0, 1, 2, 3, 4]);
        expect(path.cost).toBeCloseTo(8, 6);
    });

    it("costs the same whichever end it starts from", () => {
        const field = fieldOf(
            "gwhmg",
            "gghwg",
            "wgggs",
        );
        const grid = travelGridFor(field);
        expect(findTilePath(grid, at(field, 0, 0), at(field, 4, 2))!.cost)
            .toBeCloseTo(findTilePath(grid, at(field, 4, 2), at(field, 0, 0))!.cost, 9);
    });

    it("crosses a river only at its one bridge", () => {
        const field = fieldOf(
            "ggggg",
            "rrrrr",
            "ggggg",
        );
        const grid = travelGridFor(field, [{ tile: at(field, 4, 1), code: "B", orientation: "ns" }]);
        const path = findTilePath(grid, at(field, 0, 0), at(field, 0, 2))!;
        expect(path.tiles).toContain(at(field, 4, 1));
        expect(findTilePath(travelGridFor(field), at(field, 0, 0), at(field, 0, 2))).toBeUndefined();
    });

    it("threads a pass through a range rather than climbing it, when the pass is cheaper", () => {
        const field = fieldOf(
            "ggmmmgg",
            "ggmmmgg",
            "gghhhgg",
            "ggmmmgg",
            "ggmmmgg",
        );
        const path = findTilePath(travelGridFor(field), at(field, 0, 0), at(field, 6, 0))!;
        expect(path.tiles.filter(tile => field.codes[tile] === "m")).toEqual([]);
        expect(path.tiles).toContain(at(field, 3, 2));
    });

    it("takes a road beside rough ground rather than the rough ground itself", () => {
        const field = fieldOf(
            "ggggggg",
            "sssssss",
        );
        const road = [1, 2, 3, 4, 5].map(col => ({ tile: at(field, col, 1), code: "R" }));
        const path = findTilePath(travelGridFor(field, road), at(field, 0, 1), at(field, 6, 1))!;
        expect(path.tiles).toEqual([0, 1, 2, 3, 4, 5, 6].map(col => at(field, col, 1)));
        // Marsh at either end, road between: the same as grass all the way, but for the two half-steps into marsh.
        expect(path.cost).toBeCloseTo(12 + 2 * 1.5, 6);
    });

    it("steps diagonally at √2 the cost of a straight step", () => {
        const field = fieldOf(
            "gg",
            "gg",
        );
        expect(findTilePath(travelGridFor(field), 0, 3)!.cost).toBeCloseTo(2 * Math.SQRT2, 9);
    });

    it("never cuts the corner between two impassable tiles", () => {
        const field = fieldOf(
            "gr",
            "rg",
        );
        expect(findTilePath(travelGridFor(field), 0, 3)).toBeUndefined();
    });

    it("never cuts past even one impassable corner", () => {
        const field = fieldOf(
            "gg",
            "rg",
        );
        expect(findTilePath(travelGridFor(field), 0, 3)!.tiles).toEqual([0, 1, 3]);
    });

    it("finds nothing to or from an island, open water, or a tile off the grid", () => {
        const field = fieldOf("ggogg");
        const grid = travelGridFor(field);
        expect(findTilePath(grid, 0, 4)).toBeUndefined();
        expect(findTilePath(grid, 0, 2)).toBeUndefined();
        expect(findTilePath(grid, -1, 1)).toBeUndefined();
        expect(findTilePath(grid, 0, 99)).toBeUndefined();
        expect(findTilePath(grid, 0.5, 1)).toBeUndefined();
    });

    it("paths a tile to itself for nothing", () => {
        expect(findTilePath(travelGridFor(fieldOf("g")), 0, 0)).toEqual({ tiles: [0], cost: 0 });
    });
});

describe("tileCostsFrom", () => {
    it("agrees with the point-to-point search on every tile it reaches", () => {
        const field = fieldOf(
            "gwhmg",
            "ggrwg",
            "wgrgs",
            "ggggg",
        );
        const grid = travelGridFor(field);
        const flood = tileCostsFrom(grid, 0);
        for (let tile = 0; tile < field.codes.length; tile++) {
            const path = findTilePath(grid, 0, tile);
            if (path) expect(flood[tile], `tile ${tile}`).toBeCloseTo(path.cost, 9);
            else expect(flood[tile], `tile ${tile}`).toBe(Infinity);
        }
    });

    it("stops at the reach it was given", () => {
        const flood = tileCostsFrom(travelGridFor(fieldOf("ggggg")), 0, 4);
        expect([...flood]).toEqual([0, 2, 4, Infinity, Infinity]);
    });

    it("reaches nothing from an impassable start", () => {
        const grid = travelGridFor(fieldOf("ogg"));
        expect(isPassableTile(grid, 0)).toBe(false);
        expect([...tileCostsFrom(grid, 0)]).toEqual([Infinity, Infinity, Infinity]);
    });
});
