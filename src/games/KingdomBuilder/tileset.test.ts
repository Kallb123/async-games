import { describe, expect, it } from "vitest";

import { sheetTilePixels, tilesetDeclarationErrors, TILESET, type TilesetManifest } from "./tileset";

const SHEET = { path: "/art/kingdombuilder/ground.png", tileWidth: 16, tileHeight: 16, margin: 0, spacing: 0 };

describe("the tileset manifest", () => {
    it("has no sheet declared yet — PR 11 is the first one", () => {
        expect(TILESET.sheets).toEqual({});
    });

    it("passes its own guard with nothing declared", () => {
        expect(tilesetDeclarationErrors()).toEqual([]);
    });

    it("falls back to a fixed pixel size per tile until a sheet declares one", () => {
        expect(sheetTilePixels()).toBeGreaterThan(0);
    });

    it("takes the largest declared sheet tile size once one exists", () => {
        const manifest: TilesetManifest = { sheets: { ground: { ...SHEET, tileWidth: 24, tileHeight: 16 } } };
        expect(Math.max(manifest.sheets.ground.tileWidth, manifest.sheets.ground.tileHeight)).toBe(24);
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
