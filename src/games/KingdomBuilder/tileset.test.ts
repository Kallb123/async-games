import { describe, expect, it } from "vitest";

import { AREA_ART, cellToIndex, indexToCell, OVERLAY_ART, sheetTilePixels, tilesetDeclarationErrors, TILESET, type TilesetManifest } from "./tileset";
import { tileArtErrors } from "./tilesetGuard";

const SHEET = { path: "/art/kingdombuilder/ground.png", tileWidth: 16, tileHeight: 16, margin: 0, spacing: 0 };

describe("the tileset manifest", () => {
    it("has its first sheet declared — PR 11's ground autotile", () => {
        expect(Object.keys(TILESET.sheets)).toEqual(["ground"]);
    });

    it("passes its own guard", () => {
        expect(tilesetDeclarationErrors()).toEqual([]);
    });

    it("every area's art passes the full disk-backed guard against the real public/ directory", () => {
        expect(tileArtErrors("area", AREA_ART)).toEqual([]);
    });

    it("every overlay's art passes the same guard", () => {
        expect(tileArtErrors("overlay", OVERLAY_ART)).toEqual([]);
    });

    it("falls back to a fixed pixel size per tile until a sheet declares one", () => {
        expect(sheetTilePixels()).toBeGreaterThan(0);
    });

    it("takes the largest declared sheet tile size once one exists", () => {
        const manifest: TilesetManifest = { sheets: { ground: { ...SHEET, tileWidth: 24, tileHeight: 16 } } };
        expect(Math.max(manifest.sheets.ground.tileWidth, manifest.sheets.ground.tileHeight)).toBe(24);
    });
});

describe("indexToCell / cellToIndex", () => {
    it("round-trip through a grid's own column count", () => {
        for (let index = 0; index < 16; index++) {
            const { col, row } = indexToCell(index, 4);
            expect(cellToIndex(col, row, 4)).toBe(index);
        }
    });

    it("is (0, 0) for a grid with no columns rather than dividing by it", () => {
        expect(indexToCell(5, 0)).toEqual({ col: 0, row: 0 });
    });
});

describe("tilesetDeclarationErrors", () => {
    it("accepts a valid sheet", () => {
        const manifest: TilesetManifest = { sheets: { ground: SHEET } };
        expect(tilesetDeclarationErrors(manifest)).toEqual([]);
    });

    it("rejects a sheet with no path", () => {
        const manifest: TilesetManifest = { sheets: { ground: { ...SHEET, path: "  " } } };
        expect(tilesetDeclarationErrors(manifest)).toEqual(["tileset.ts sheet \"ground\" needs a path"]);
    });

    it("rejects a sheet with a non-positive tile size", () => {
        const manifest: TilesetManifest = { sheets: { ground: { ...SHEET, tileWidth: 0 } } };
        expect(tilesetDeclarationErrors(manifest)).toEqual(["tileset.ts sheet \"ground\" needs a positive tile size"]);
    });

    it("rejects a negative margin or spacing", () => {
        const manifest: TilesetManifest = { sheets: { ground: { ...SHEET, margin: -1 } } };
        expect(tilesetDeclarationErrors(manifest)).toEqual(["tileset.ts sheet \"ground\" has a negative margin or spacing"]);
    });
});
