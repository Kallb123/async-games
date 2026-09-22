import path from "node:path";
import { describe, expect, it } from "vitest";

import type { TileArt, TilesetManifest } from "./tileset";
import { tileArtErrors } from "./tilesetGuard";

const FIXTURES = path.join(__dirname, "__fixtures__");
// A real, on-disk 1×1 PNG — enough to exercise the disk-backed half of the
// guard without shipping a bigger fixture just for the test.
const TINY_SHEET: TilesetManifest = { sheets: { tiny: { path: "tiny.png", tileWidth: 1, tileHeight: 1, margin: 0, spacing: 0 } } };
// A 4×4px fixture cut into 2×2px squares, so there is a 2×2 grid for a piece
// bigger than one square to fit inside — or to run off the edge of.
const GRID_SHEET: TilesetManifest = { sheets: { grid: { path: "grid4.png", tileWidth: 2, tileHeight: 2, margin: 0, spacing: 0 } } };

describe("tileArtErrors", () => {
    it("accepts a single tile that lands inside its sheet's real bounds", () => {
        const art: Record<string, TileArt> = { g: { layout: "single", tile: { sheet: "tiny", index: 0 } } };
        expect(tileArtErrors("area", art, TINY_SHEET, FIXTURES)).toEqual([]);
    });

    it("rejects an index outside the sheet's derived grid", () => {
        const art: Record<string, TileArt> = { g: { layout: "single", tile: { sheet: "tiny", index: 1 } } };
        expect(tileArtErrors("area", art, TINY_SHEET, FIXTURES)).toEqual([
            'tileset.ts area "g" index 1 is outside sheet "tiny"\'s 1×1 grid',
        ]);
    });

    it("rejects a reference to a sheet that isn't declared", () => {
        const art: Record<string, TileArt> = { g: { layout: "single", tile: { sheet: "missing", index: 0 } } };
        expect(tileArtErrors("area", art, TINY_SHEET, FIXTURES)).toEqual([
            'tileset.ts area "g" points at sheet "missing", which isn\'t declared',
        ]);
    });

    it("rejects a sheet path that can't be read from disk", () => {
        const manifest: TilesetManifest = { sheets: { tiny: { ...TINY_SHEET.sheets.tiny, path: "nope.png" } } };
        const art: Record<string, TileArt> = { g: { layout: "single", tile: { sheet: "tiny", index: 0 } } };
        expect(tileArtErrors("area", art, manifest, FIXTURES)).toEqual([
            'tileset.ts area "g" points at sheet "tiny", which couldn\'t be read from disk',
        ]);
    });

    it("rejects a mask16 entry that doesn't declare all sixteen", () => {
        const art: Record<string, TileArt> = {
            g: { layout: "mask16", tiles: [{ sheet: "tiny", index: 0 }] },
        };
        expect(tileArtErrors("area", art, TINY_SHEET, FIXTURES)).toEqual([
            'tileset.ts area "g" declares a mask16 entry with 1 tile(s), not all 16',
        ]);
    });

    it("rejects a mask47 entry that doesn't declare all forty-seven", () => {
        const art: Record<string, TileArt> = {
            g: { layout: "mask47", tiles: [{ sheet: "tiny", index: 0 }] },
        };
        expect(tileArtErrors("area", art, TINY_SHEET, FIXTURES)).toEqual([
            'tileset.ts area "g" declares a mask47 entry with 1 tile(s), not all 47',
        ]);
    });

    it("accepts a multi-square overlay piece that fits inside its sheet", () => {
        const art: Record<string, TileArt> = { T: { layout: "single", tile: { sheet: "grid", index: 0, width: 2, height: 2 } } };
        expect(tileArtErrors("overlay", art, GRID_SHEET, FIXTURES)).toEqual([]);
    });

    it("rejects a piece that runs off the right-hand edge of its sheet rather than letting it wrap onto the next row", () => {
        // index 1 is the top-right square of a 2×2 sheet, so a 2-wide piece there has nowhere to go.
        const art: Record<string, TileArt> = { T: { layout: "single", tile: { sheet: "grid", index: 1, width: 2, height: 1 } } };
        expect(tileArtErrors("overlay", art, GRID_SHEET, FIXTURES)).toEqual([
            'tileset.ts overlay "T" is a 2×1 piece at (1, 0), which runs off sheet "grid"\'s 2×2 grid',
        ]);
    });

    it("rejects a piece that runs off the bottom of its sheet", () => {
        const art: Record<string, TileArt> = { T: { layout: "single", tile: { sheet: "grid", index: 2, width: 1, height: 2 } } };
        expect(tileArtErrors("overlay", art, GRID_SHEET, FIXTURES)).toEqual([
            'tileset.ts overlay "T" is a 1×2 piece at (0, 1), which runs off sheet "grid"\'s 2×2 grid',
        ]);
    });

    it("rejects an area declaring a piece at all — an area is a ground fill, one square of art per square of map", () => {
        const art: Record<string, TileArt> = { g: { layout: "single", tile: { sheet: "grid", index: 0, width: 2, height: 2 } } };
        expect(tileArtErrors("area", art, GRID_SHEET, FIXTURES, true)).toEqual([
            'tileset.ts area "g" declares a 2×2 piece, but an area is a ground fill — exactly one square of art per square of map',
        ]);
    });

    it("rejects a piece on a mask entry whoever declares it — a mask tile is picked one square at a time", () => {
        const tiles = Array.from({ length: 16 }, () => ({ sheet: "grid", index: 0 }));
        tiles[0] = { sheet: "grid", index: 0, width: 2, height: 2 } as typeof tiles[0];
        const art: Record<string, TileArt> = { R: { layout: "mask16", tiles } };
        expect(tileArtErrors("overlay", art, GRID_SHEET, FIXTURES)).toEqual([
            'tileset.ts overlay "R" declares a 2×2 piece, but a mask16 tile is picked one square of map at a time',
        ]);
    });

    it("rejects an anchor outside the piece it belongs to", () => {
        const art: Record<string, TileArt> = { T: { layout: "single", tile: { sheet: "grid", index: 0, width: 2, height: 2, anchorX: 5, anchorY: 0 } } };
        expect(tileArtErrors("overlay", art, GRID_SHEET, FIXTURES)).toEqual([
            'tileset.ts overlay "T" anchors at (5, 0), which is outside its own 2×2 piece',
        ]);
    });

    it("rejects a fractional or zero piece size rather than quietly rounding it", () => {
        const art: Record<string, TileArt> = { T: { layout: "single", tile: { sheet: "grid", index: 0, width: 0, height: 1 } } };
        expect(tileArtErrors("overlay", art, GRID_SHEET, FIXTURES)).toEqual([
            'tileset.ts overlay "T" declares a piece size of 0×1, which isn\'t a whole number of squares of at least one',
        ]);
    });

    it("checks every tile an orientation or variants entry declares", () => {
        const orientation: Record<string, TileArt> = { B: { layout: "orientation", tiles: { ns: { sheet: "tiny", index: 0 }, ew: { sheet: "tiny", index: 3 } } } };
        expect(tileArtErrors("overlay", orientation, TINY_SHEET, FIXTURES)).toEqual([
            'tileset.ts overlay "B" index 3 is outside sheet "tiny"\'s 1×1 grid',
        ]);

        const variants: Record<string, TileArt> = { g: { layout: "variants", tiles: [{ sheet: "tiny", index: 0 }, { sheet: "tiny", index: 5 }] } };
        expect(tileArtErrors("area", variants, TINY_SHEET, FIXTURES)).toEqual([
            'tileset.ts area "g" index 5 is outside sheet "tiny"\'s 1×1 grid',
        ]);
    });
});
