import { describe, expect, it } from "vitest";

import ATLAS from "./terrainAtlas.json";
import { atlasCellName, overlaysKey, riverMask, snapCorners, TERRAIN_KEYS, terrainCornerGrid, terrainFieldMatchesGrid, terrainImageBounds, terrainTileSpec } from "./useTerrainImage";
import { generateWorld } from "./worldgen/generateWorld";
import { overlayCodesByTile } from "./worldgen/overlays";
import type { TerrainField } from "./worldgen/terrainField";

const field = (codes: string, columns = 2): TerrainField => ({ columns, rows: codes.length / columns, tileSize: 2, codes });
const spec = (world: TerrainField, col: number, row: number, overlays: ReadonlyMap<number, string> = new Map()) =>
    terrainTileSpec(world, terrainCornerGrid(world), overlays, col, row);
const index = (key: typeof TERRAIN_KEYS[number]) => TERRAIN_KEYS.indexOf(key);

describe("the v2 terrain tile model", () => {
    it("rejects a partial stored field rather than indexing outside it", () => {
        expect(terrainFieldMatchesGrid({ columns: 2, rows: 2, tileSize: 2, codes: "ggg" })).toBe(false);
    });

    it("takes each corner from the cell down/right of it, so neighbours share their corners", () => {
        const world = field("gwgw");
        expect(spec(world, 0, 0).corners).toEqual([index("grass"), index("forest"), index("forest"), index("grass")]);
        expect(spec(world, 1, 0).corners[0]).toBe(spec(world, 0, 0).corners[1]);
    });

    it("keeps the water when a three-terrain tile has to drop one, turning the beach corner to land", () => {
        // Two grass, one sand, one sea: the sea holds and the sand joins the grass (the kit draws its own shore).
        expect(snapCorners([index("grass"), index("grass"), index("coast"), index("sea")]))
            .toEqual([index("grass"), index("grass"), index("grass"), index("sea")]);
    });

    it("never fills a lake in with land", () => {
        expect(snapCorners([index("forest"), index("grass"), index("lake"), index("wheat")])).toContain(index("lake"));
    });

    it("finds a sheet cell even for a tile the corner grid couldn't settle to two terrains", () => {
        const cells = new Set(ATLAS.cells);
        const world = field("obgmwfhl", 4);
        for (let row = 0; row < world.rows; row++) {
            for (let col = 0; col < world.columns; col++) expect(cells.has(atlasCellName(spec(world, col, row)))).toBe(true);
        }
    });

    it("puts every river tile on grass, the only ground the river art is drawn on", () => {
        const world = field("wwwwrwwww", 3);
        expect(spec(world, 1, 1).corners).toEqual([index("grass"), index("grass"), index("grass"), index("grass")]);
    });

    it("uses a repeatable variant in the kit's range", () => {
        const first = spec(field("gggg"), 0, 0).variant;
        expect(first).toBeGreaterThanOrEqual(0);
        expect(first).toBeLessThan(3);
        expect(spec(field("gggg"), 0, 0).variant).toBe(first);
    });

    it("uses the river kit's N/E/S/W bit order", () => {
        expect(riverMask(field("grgrrr", 3), 1, 1)).toBe(8 | 4 | 1);
    });

    it("picks the bridge and summit tiles where they apply", () => {
        expect(atlasCellName(spec(field("grggrggrg", 3), 1, 1, new Map([[4, "B"]])))).toBe("river/grass_river_10_bridge");
        expect(atlasCellName(spec(field("mmmmmmmmm", 3), 1, 1))).toBe("base/mountain_summit");
    });

    it("names a two-terrain tile by the kit's blend index, bit set where the higher-drawn terrain is", () => {
        const blend = spec(field("gwgw"), 0, 0);
        expect(atlasCellName(blend)).toBe("blend/grass__forest/06");
    });

    it("finds a sheet cell for every tile of a generated world", () => {
        const cells = new Set(ATLAS.cells);
        const world = generateWorld("atlas-coverage");
        const grid = terrainCornerGrid(world.terrainField);
        const overlays = overlayCodesByTile(world.overlays);
        const missing = new Set<string>();
        for (let row = 0; row < world.terrainField.rows; row++) {
            for (let col = 0; col < world.terrainField.columns; col++) {
                const name = atlasCellName(terrainTileSpec(world.terrainField, grid, overlays, col, row));
                if (!cells.has(name)) missing.add(name);
            }
        }
        expect([...missing]).toEqual([]);
    });

    it("places the padded image so its ground footprint remains in world coordinates", () => {
        // A 40x28 footprint with 7px sides, 27px above and 3px below — the sheet's own 32px tiles.
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
