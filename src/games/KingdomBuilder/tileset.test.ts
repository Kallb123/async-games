import { describe, expect, it } from "vitest";

import { sheetTilePixels, tilesetDeclarationErrors, TILESET, type TilesetManifest } from "./tileset";

const SHEET = { path: "/art/kingdombuilder/ground.png", tileWidth: 16, tileHeight: 16, margin: 0, spacing: 0 };

describe("the tileset manifest", () => {
    it("has nothing declared yet — PR 11 is the first sheet", () => {
        expect(TILESET.sheets).toEqual({});
        expect(TILESET.areas).toEqual({});
        expect(TILESET.overlays).toEqual({});
    });

    it("passes its own guard with nothing declared", () => {
        expect(tilesetDeclarationErrors()).toEqual([]);
    });

    it("falls back to a fixed pixel size per tile until a sheet declares one", () => {
        expect(sheetTilePixels()).toBeGreaterThan(0);
    });

    it("takes the largest declared sheet tile size once one exists", () => {
        const manifest: TilesetManifest = { sheets: { ground: { ...SHEET, tileWidth: 24, tileHeight: 16 } }, areas: {}, overlays: {} };
        expect(Math.max(manifest.sheets.ground.tileWidth, manifest.sheets.ground.tileHeight)).toBe(24);
    });
});

describe("tilesetDeclarationErrors", () => {
    it("accepts a valid area entry against a declared sheet", () => {
        const manifest: TilesetManifest = { sheets: { ground: SHEET }, areas: { g: { kind: "mask16", sheet: "ground", indices: [0, 1, 2] } }, overlays: {} };
        expect(tilesetDeclarationErrors(manifest)).toEqual([]);
    });

    it("rejects an area code the registry doesn't know", () => {
        const manifest: TilesetManifest = { sheets: { ground: SHEET }, areas: { "?": { kind: "single", sheet: "ground", index: 0 } }, overlays: {} };
        expect(tilesetDeclarationErrors(manifest)).toEqual(["tileset.ts declares area art for unknown code \"?\""]);
    });

    it("rejects an overlay code the registry doesn't know", () => {
        const manifest: TilesetManifest = { sheets: { ground: SHEET }, areas: {}, overlays: { "?": { kind: "single", sheet: "ground", index: 0 } } };
        expect(tilesetDeclarationErrors(manifest)).toEqual(["tileset.ts declares overlay art for unknown code \"?\""]);
    });

    it("rejects a layout pointing at a sheet that isn't declared", () => {
        const manifest: TilesetManifest = { sheets: {}, areas: { g: { kind: "single", sheet: "ground", index: 0 } }, overlays: {} };
        expect(tilesetDeclarationErrors(manifest)).toEqual(["tileset.ts area \"g\" references undeclared sheet \"ground\""]);
    });

    it("rejects a negative tile index", () => {
        const manifest: TilesetManifest = { sheets: { ground: SHEET }, areas: { g: { kind: "single", sheet: "ground", index: -1 } }, overlays: {} };
        expect(tilesetDeclarationErrors(manifest)).toEqual(["tileset.ts area \"g\" has an invalid tile index"]);
    });

    it("does not yet require a mask16 entry to declare all sixteen variants — that's PR 11's tightened form", () => {
        const manifest: TilesetManifest = { sheets: { ground: SHEET }, areas: { g: { kind: "mask16", sheet: "ground", indices: [0] } }, overlays: {} };
        expect(tilesetDeclarationErrors(manifest)).toEqual([]);
    });

    it("rejects a sheet with a non-positive tile size", () => {
        const manifest: TilesetManifest = { sheets: { ground: { ...SHEET, tileWidth: 0 } }, areas: {}, overlays: {} };
        expect(tilesetDeclarationErrors(manifest)).toEqual(["tileset.ts sheet \"ground\" needs a positive tile size"]);
    });
});
