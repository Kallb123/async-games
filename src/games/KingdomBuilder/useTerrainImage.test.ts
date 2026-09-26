import { describe, expect, it } from "vitest";

import { overlaysKey, riverMask, terrainCorners, terrainFieldMatchesGrid, terrainImageBounds, terrainTileSpec } from "./useTerrainImage";
import type { TerrainField } from "./worldgen/terrainField";

const field = (codes: string, columns = 2): TerrainField => ({ columns, rows: codes.length / columns, tileSize: 2, codes });

describe("the v2 terrain compositor model", () => {
    it("rejects a partial stored field rather than indexing outside it", () => {
        expect(terrainFieldMatchesGrid({ columns: 2, rows: 2, tileSize: 2, codes: "ggg" })).toBe(false);
    });

    it("turns generated terrain into shared kit corners", () => {
        const world = field("gomw");
        expect(terrainCorners(world, 0, 0)).toEqual(["grass", "sea", "forest", "mountain"]);
        // Both neighbouring tiles read their shared top corner from the same cell.
        expect(terrainCorners(world, 1, 0)[0]).toBe(terrainCorners(world, 0, 0)[1]);
    });

    it("hands all four terrain corners to the source generator rather than reducing a junction to a binary blend", () => {
        const world = field("obgm");
        expect(terrainTileSpec(world, new Map(), 0, 0).corners).toEqual([0, 2, 7, 3]);
    });

    it("uses a repeatable variant in the source generator's range", () => {
        const world = field("gggg");
        const first = terrainTileSpec(world, new Map(), 0, 0).variant;
        expect(first).toBeGreaterThanOrEqual(0);
        expect(first).toBeLessThan(3);
        expect(terrainTileSpec(world, new Map(), 0, 0).variant).toBe(first);
    });

    it("uses the river kit's N/E/S/W bit order", () => {
        expect(riverMask(field("grgrrr", 3), 1, 1)).toBe(8 | 4 | 1);
    });

    it("asks the source generator for bridge and summit variants where they apply", () => {
        const river = field("grggrggrg", 3);
        expect(terrainTileSpec(river, new Map([[4, "B"]]), 1, 1)).toMatchObject({ river: 10, bridge: true });
        const mountains = field("mmmmmmmmm", 3);
        expect(terrainTileSpec(mountains, new Map(), 1, 1).summit).toBe(true);
    });

    it("places the padded image so its ground footprint remains in world coordinates", () => {
        // The kit's dims(32): a 40x28 footprint with 7px sides, 27px above and 3px below.
        const bounds = terrainImageBounds(field("gggg"), { Wt: 40, Ht: 28, PX: 7, HR: 27, BP: 3 });
        expect(bounds.x).toBeCloseTo(-7 * 2 / 40);
        expect(bounds.y).toBeCloseTo(-27 * 2 / 28);
        // Two 2-unit tiles plus the padding either side, in world units.
        expect(bounds.width).toBeCloseTo(4 + 14 * 2 / 40);
        expect(bounds.height).toBeCloseTo(4 + 30 * 2 / 28);
    });

    it("keys overlays by content so polling does not redraw an unchanged map", () => {
        expect(overlaysKey([{ tile: 2, code: "B", orientation: "ew" }])).toBe("2:B:ew");
    });
});
