import { describe, expect, it } from "vitest";

import ATLAS from "./terrainAtlas.json";
import { atlasCellName, overlaysKey, riverMask, snapCorners, TERRAIN_KEYS, terrainCornerGrid, terrainFieldMatchesGrid, terrainStripBounds, terrainStripRows, terrainStripSize, terrainTileSpec, MAX_STRIP_PIXELS } from "./useTerrainImage";
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

    it("places a one-band map so its ground footprint remains in world coordinates", () => {
        // An 80x57 footprint with 14px sides, 54px above and 7px below — the sheet's own 64px tiles.
        const dims = { Wt: 80, Ht: 57, PX: 14, HR: 54, BP: 7 };
        const world = field("gggg");
        expect(terrainStripRows(world, dims)).toEqual([{ first: 0, count: 2 }]);
        const bounds = terrainStripBounds(world, { first: 0, count: 2 }, dims);
        expect(bounds.x).toBeCloseTo(-14 * 2 / 80);
        expect(bounds.y).toBeCloseTo(-54 * 2 / 57);
        // Two 2-unit tiles plus the padding either side, in world units.
        expect(bounds.width).toBeCloseTo(4 + 28 * 2 / 80);
        expect(bounds.height).toBeCloseTo(4 + 61 * 2 / 57);
    });

    it("splits a full-size world into bands of whole rows, each under iOS Safari's canvas limit", () => {
        const world = generateWorld("atlas-bands").terrainField;
        const strips = terrainStripRows(world);
        expect(strips.length).toBeGreaterThan(1);
        // Each band starts where the one above it ends, and the last ends on the last row.
        let next = 0;
        for (const strip of strips) {
            expect(strip.first).toBe(next);
            next += strip.count;
        }
        expect(next).toBe(world.rows);
        expect(MAX_STRIP_PIXELS).toBeLessThan(16_777_216);
        for (const strip of strips) {
            const { width, height } = terrainStripSize(world, strip);
            expect(width * height).toBeLessThanOrEqual(MAX_STRIP_PIXELS);
        }
    });

    it("stacks the bands so each starts on its own first row's ground", () => {
        const world = generateWorld("atlas-bands").terrainField;
        const [, second] = terrainStripRows(world);
        const { Ht, HR } = ATLAS.dims;
        expect(terrainStripBounds(world, second).y + HR * world.tileSize / Ht).toBeCloseTo(second.first * world.tileSize);
    });

    it("keys overlays by content so polling does not redraw an unchanged map", () => {
        expect(overlaysKey([{ tile: 2, code: "B", orientation: "ew" }])).toBe("2:B:ew");
    });
});
