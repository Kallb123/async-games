import { describe, expect, it } from "vitest";

import { neighbourMask, neighbourMask8, overlayCodesByTile, overlayMaskSlot, overlaysKey, seededVariantIndex, terrainFieldMatchesGrid } from "./useTerrainImage";
import { NINE_SLICE_MASKS } from "./tileMapperModel";
import { blobIndexOf, NEIGHBOUR_BITS } from "./tileset";
import type { TerrainField } from "./worldgen/terrainField";

const FIELD: TerrainField = { columns: 2, rows: 2, tileSize: 2, codes: "gggg" };

describe("terrainFieldMatchesGrid", () => {
    it("accepts a field whose codes fill its declared grid", () => {
        expect(terrainFieldMatchesGrid(FIELD)).toBe(true);
    });

    it("rejects a field shorter or longer than columns × rows — a corrupt or partial document, never worth throwing over", () => {
        expect(terrainFieldMatchesGrid({ ...FIELD, codes: "ggg" })).toBe(false);
        expect(terrainFieldMatchesGrid({ ...FIELD, codes: "ggggg" })).toBe(false);
    });
});

describe("overlaysKey", () => {
    it("is stable for the same content even across distinct array instances", () => {
        const a = [{ tile: 4, code: "B" }];
        const b = [{ tile: 4, code: "B" }];
        expect(overlaysKey(a)).toBe(overlaysKey(b));
    });

    it("changes when a placement's tile, code or orientation differs", () => {
        const base = overlaysKey([{ tile: 4, code: "B" }]);
        expect(overlaysKey([{ tile: 5, code: "B" }])).not.toBe(base);
        expect(overlaysKey([{ tile: 4, code: "F" }])).not.toBe(base);
        expect(overlaysKey([{ tile: 4, code: "B", orientation: "ns" }])).not.toBe(base);
    });

    it("is the empty string for no overlays at all", () => {
        expect(overlaysKey(undefined)).toBe("");
        expect(overlaysKey([])).toBe("");
    });
});

describe("neighbourMask", () => {
    it("is 15 — every side matching — in the middle of a field of one code", () => {
        const field: TerrainField = { columns: 3, rows: 3, tileSize: 2, codes: "ggggggggg" };
        expect(neighbourMask(field, 1, 1)).toBe(15);
    });

    it("is 0 for a tile whose every neighbour differs", () => {
        const field: TerrainField = { columns: 3, rows: 3, tileSize: 2, codes: "gggghggg" };
        expect(neighbourMask(field, 1, 1)).toBe(0);
    });

    it("never treats off-grid as a match — a corner tile can't autotile as fully interior", () => {
        const field: TerrainField = { columns: 2, rows: 2, tileSize: 2, codes: "gggg" };
        expect(neighbourMask(field, 0, 0)).toBe(6); // east (2) and south (4) match; north and west are off-grid
    });

    it("sets exactly the bit for each matching side — north 1, east 2, south 4, west 8", () => {
        expect(neighbourMask({ columns: 1, rows: 2, tileSize: 2, codes: "gg" }, 0, 1)).toBe(1); // only a north neighbour, and it matches
        expect(neighbourMask({ columns: 2, rows: 1, tileSize: 2, codes: "gg" }, 0, 0)).toBe(2); // only an east neighbour, and it matches
        expect(neighbourMask({ columns: 1, rows: 2, tileSize: 2, codes: "gg" }, 0, 0)).toBe(4); // only a south neighbour, and it matches
        expect(neighbourMask({ columns: 2, rows: 1, tileSize: 2, codes: "gg" }, 1, 0)).toBe(8); // only a west neighbour, and it matches
    });
});

describe("the nine-slice masks the mapper imports under", () => {
    it("are exactly what a real 3×3 patch of map asks for, square by square", () => {
        // A 3×3 patch of woodland in a sea of grass. Each square of the patch
        // is one square of a nine-slice block, so the mask the compositor
        // computes for it has to be the mask `mask16FromNineSlice` filed that
        // block's square under — otherwise every imported sheet is rotated or
        // mirrored and nobody finds out until the art looks wrong.
        const field: TerrainField = { columns: 5, rows: 5, tileSize: 2, codes: "ggggg" + "gwwwg" + "gwwwg" + "gwwwg" + "ggggg" };
        for (let slot = 0; slot < 9; slot++) {
            const col = 1 + (slot % 3);
            const row = 1 + Math.floor(slot / 3);
            expect(neighbourMask(field, col, row)).toBe(NINE_SLICE_MASKS[slot]);
        }
    });
});

describe("neighbourMask8", () => {
    it("is every bit set in the middle of a field of one code", () => {
        const field: TerrainField = { columns: 3, rows: 3, tileSize: 2, codes: "ggggggggg" };
        expect(neighbourMask8(field, 1, 1)).toBe(255);
    });

    it("never treats off-grid as a match, diagonals included", () => {
        const field: TerrainField = { columns: 2, rows: 2, tileSize: 2, codes: "gggg" };
        // From the top-left square only east, south and south-east exist.
        expect(neighbourMask8(field, 0, 0)).toBe(NEIGHBOUR_BITS.east | NEIGHBOUR_BITS.south | NEIGHBOUR_BITS.southEast);
    });

    it("sets exactly the bit for each neighbour, clockwise from north", () => {
        // A 3×3 of one code with a single different square in each position.
        const around: [number, number, number][] = [
            [1, 0, NEIGHBOUR_BITS.north], [2, 0, NEIGHBOUR_BITS.northEast], [2, 1, NEIGHBOUR_BITS.east], [2, 2, NEIGHBOUR_BITS.southEast],
            [1, 2, NEIGHBOUR_BITS.south], [0, 2, NEIGHBOUR_BITS.southWest], [0, 1, NEIGHBOUR_BITS.west], [0, 0, NEIGHBOUR_BITS.northWest],
        ];
        for (const [col, row, bit] of around) {
            const codes = [..."ggggggggg"];
            codes[row * 3 + col] = "h";
            expect(neighbourMask8({ columns: 3, rows: 3, tileSize: 2, codes: codes.join("") }, 1, 1)).toBe(255 & ~bit);
        }
    });

    it("tells an inner corner from the plain interior tile — the whole reason mask47 exists", () => {
        // Woodland everywhere but the north-east diagonal, which is grass. All
        // four sides still match, so mask16 calls this 15 — the fully-interior
        // tile — and draws no corner at all.
        const field: TerrainField = { columns: 3, rows: 3, tileSize: 2, codes: "wwgwwwwww" };
        expect(neighbourMask(field, 1, 1)).toBe(15);
        expect(blobIndexOf(neighbourMask8(field, 1, 1))).not.toBe(blobIndexOf(255));
    });

    it("ignores a diagonal whose sides are already open, so the same tile isn't drawn two ways", () => {
        // The north side is grass, so what sits beyond the north-east corner
        // can't be seen from this square: woodland or grass up there, this
        // tile is drawn the same. Only the north-east square differs.
        const openCorner: TerrainField = { columns: 3, rows: 3, tileSize: 2, codes: "wgwwwwwww" };
        const closedCorner: TerrainField = { columns: 3, rows: 3, tileSize: 2, codes: "wggwwwwww" };
        expect(blobIndexOf(neighbourMask8(openCorner, 1, 1))).toBe(blobIndexOf(neighbourMask8(closedCorner, 1, 1)));
    });
});

describe("a self-connecting overlay's own mask", () => {
    // Five squares of grass across, with a road (R) laid along the middle three.
    const FIELD: TerrainField = { columns: 5, rows: 1, tileSize: 2, codes: "ggggg" };
    const ROAD = [{ tile: 1, code: "R" }, { tile: 2, code: "R" }, { tile: 3, code: "R" }];

    it("masks against the other overlays around it, not against the ground under it", () => {
        // Every square of ground here is grass, so a mask taken from the
        // terrain would call all three of these fully interior. The road's own
        // run is what it has to read.
        const byTile = overlayCodesByTile(ROAD);
        expect(overlayMaskSlot("mask16", FIELD, byTile, 1)).toBe(2); // west end: only east continues
        expect(overlayMaskSlot("mask16", FIELD, byTile, 2)).toBe(2 | 8); // middle: east and west
        expect(overlayMaskSlot("mask16", FIELD, byTile, 3)).toBe(8); // east end: only west
    });

    it("treats a square with no overlay on it as no match, so a lone bridge reads as a lone bridge", () => {
        const byTile = overlayCodesByTile([{ tile: 2, code: "B" }]);
        expect(overlayMaskSlot("mask16", FIELD, byTile, 2)).toBe(0);
    });

    it("treats a different overlay code as no match — a road doesn't join a fence", () => {
        const byTile = overlayCodesByTile([{ tile: 1, code: "R" }, { tile: 2, code: "F" }]);
        expect(overlayMaskSlot("mask16", FIELD, byTile, 1)).toBe(0);
    });

    it("never treats off-grid as a match", () => {
        const byTile = overlayCodesByTile([{ tile: 0, code: "R" }, { tile: 1, code: "R" }]);
        expect(overlayMaskSlot("mask16", FIELD, byTile, 0)).toBe(2); // east only; nothing west of column 0
    });

    it("reads all eight neighbours for a mask47 overlay", () => {
        const field: TerrainField = { columns: 3, rows: 3, tileSize: 2, codes: "ggggggggg" };
        const every = overlayCodesByTile(Array.from({ length: 9 }, (_, tile) => ({ tile, code: "R" })));
        expect(overlayMaskSlot("mask47", field, every, 4)).toBe(blobIndexOf(255));
    });

    it("gives a tile carrying no overlay at all the empty slot rather than reading someone else's run", () => {
        expect(overlayMaskSlot("mask16", FIELD, overlayCodesByTile(ROAD), 0)).toBe(0);
    });
});

describe("overlayCodesByTile", () => {
    it("lets the last placement win a tile two of them claim, rather than throwing over a generated-world bug", () => {
        const byTile = overlayCodesByTile([{ tile: 4, code: "B" }, { tile: 4, code: "F" }]);
        expect(byTile.get(4)).toBe("F");
    });
});

describe("seededVariantIndex", () => {
    it("is always inside [0, count)", () => {
        for (let col = 0; col < 5; col++) {
            for (let row = 0; row < 5; row++) {
                const index = seededVariantIndex(col, row, 4);
                expect(index).toBeGreaterThanOrEqual(0);
                expect(index).toBeLessThan(4);
            }
        }
    });

    it("is deterministic — the same tile picks the same variant every time", () => {
        expect(seededVariantIndex(7, 3, 5)).toBe(seededVariantIndex(7, 3, 5));
    });

    it("is 0 for a count of zero rather than dividing by it", () => {
        expect(seededVariantIndex(1, 1, 0)).toBe(0);
    });

    it("varies across neighbouring tiles rather than picking the same variant everywhere", () => {
        const picks = new Set<number>();
        for (let col = 0; col < 8; col++) picks.add(seededVariantIndex(col, 0, 6));
        expect(picks.size).toBeGreaterThan(1);
    });
});
