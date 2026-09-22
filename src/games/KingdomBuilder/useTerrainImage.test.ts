import { describe, expect, it } from "vitest";

import { overlaysKey, terrainFieldMatchesGrid } from "./useTerrainImage";
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
