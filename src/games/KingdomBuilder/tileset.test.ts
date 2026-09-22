import { describe, expect, it } from "vitest";

import { AREA_ART, blobKey, cellToIndex, indexToCell, isSingleSquare, NEIGHBOUR_BITS, OVERLAY_ART, sheetTilePixels, tilePieceParts, tileRefAnchor, tileRefSize, tilesetDeclarationErrors, TILESET, type TilesetManifest } from "./tileset";
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

describe("a TileRef's piece geometry", () => {
    it("is one square, anchored at its only square, for a plain ref", () => {
        const ref = { sheet: "ground", index: 3 };
        expect(tileRefSize(ref)).toEqual({ width: 1, height: 1 });
        expect(tileRefAnchor(ref)).toEqual({ x: 0, y: 0 });
        expect(isSingleSquare(ref)).toBe(true);
    });

    it("anchors a taller piece at its bottom-left by default — a building stands on its base", () => {
        expect(tileRefAnchor({ sheet: "town", index: 0, width: 2, height: 3 })).toEqual({ x: 0, y: 2 });
    });

    it("clamps a declared anchor inside the piece rather than drawing it somewhere off it", () => {
        expect(tileRefAnchor({ sheet: "town", index: 0, width: 2, height: 2, anchorX: 9, anchorY: -4 })).toEqual({ x: 1, y: 0 });
    });

    it("draws a one-square ref as one blit at the square it was placed on", () => {
        expect(tilePieceParts({ sheet: "ground", index: 5 }, 4)).toEqual([{ index: 5, offsetX: 0, offsetY: 0 }]);
    });

    it("draws a piece as one blit per square it covers, offset from its anchor", () => {
        // A 2×2 piece whose top-left is index 0 on a 4-column sheet: squares
        // 0, 1, 4, 5. Anchored bottom-left, so the placed square is the piece's
        // own bottom-left and the rest hangs above and to the right of it.
        expect(tilePieceParts({ sheet: "town", index: 0, width: 2, height: 2 }, 4)).toEqual([
            { index: 0, offsetX: 0, offsetY: -1 },
            { index: 1, offsetX: 1, offsetY: -1 },
            { index: 4, offsetX: 0, offsetY: 0 },
            { index: 5, offsetX: 1, offsetY: 0 },
        ]);
    });

    it("always covers the placed square itself, whatever the anchor", () => {
        for (const anchorX of [0, 1, 2]) {
            for (const anchorY of [0, 1, 2]) {
                const parts = tilePieceParts({ sheet: "town", index: 0, width: 3, height: 3, anchorX, anchorY }, 8);
                expect(parts.filter(part => part.offsetX === 0 && part.offsetY === 0)).toHaveLength(1);
            }
        }
    });
});

describe("blobKey", () => {
    it("leaves the four sides alone", () => {
        expect(blobKey(NEIGHBOUR_BITS.north)).toBe(NEIGHBOUR_BITS.north);
        expect(blobKey(NEIGHBOUR_BITS.north | NEIGHBOUR_BITS.south)).toBe(NEIGHBOUR_BITS.north | NEIGHBOUR_BITS.south);
    });

    it("is idempotent — a key run through it again is the same key", () => {
        for (let mask = 0; mask < 256; mask++) expect(blobKey(blobKey(mask))).toBe(blobKey(mask));
    });

    it("keeps a diagonal only where both its sides match", () => {
        expect(blobKey(NEIGHBOUR_BITS.north | NEIGHBOUR_BITS.east | NEIGHBOUR_BITS.northEast)).toBe(NEIGHBOUR_BITS.north | NEIGHBOUR_BITS.east | NEIGHBOUR_BITS.northEast);
        expect(blobKey(NEIGHBOUR_BITS.north | NEIGHBOUR_BITS.northEast)).toBe(NEIGHBOUR_BITS.north);
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
