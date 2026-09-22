import path from "node:path";
import { describe, expect, it } from "vitest";

import type { TileArt, TilesetManifest } from "./tileset";
import { tileArtErrors } from "./tilesetGuard";

const FIXTURES = path.join(__dirname, "__fixtures__");
// A real, on-disk 1×1 PNG — enough to exercise the disk-backed half of the
// guard without shipping a bigger fixture just for the test.
const TINY_SHEET: TilesetManifest = { sheets: { tiny: { path: "tiny.png", tileWidth: 1, tileHeight: 1, margin: 0, spacing: 0 } } };

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
            'tileset.ts area "g" declares a mask16 entry with 1 tile(s), not all sixteen',
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
