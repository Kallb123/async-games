import { describe, expect, it } from "vitest";

import { neighbourMask, overlaysKey, seededVariantIndex, terrainFieldMatchesGrid } from "./useTerrainImage";
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
