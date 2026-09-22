import { describe, expect, it } from "vitest";

import {
    gridFit,
    mask16Remaining,
    maskFromSides,
    printTilesetDeclarations,
    suggestedTileSizes,
    type DraftTileArt,
} from "./tileMapperModel";

describe("suggestedTileSizes", () => {
    it("offers every size in range that divides both axes evenly", () => {
        // 128x128, no margin/spacing: 8, 16, 32, 64, 128 all divide evenly in [8,128].
        expect(suggestedTileSizes(128, 128, 0, 0)).toEqual(expect.arrayContaining([8, 16, 32, 64, 128]));
    });

    it("excludes a size that leaves a partial row or column on either axis", () => {
        expect(suggestedTileSizes(100, 128, 0, 0, 8, 128)).not.toContain(32); // 100/32 doesn't divide evenly
    });

    it("accounts for margin and spacing, not just the raw image size", () => {
        // 132px wide, 2px margin each side, 4px spacing: usable = 132-4+4=132, so 33 still fits at size 29 (29+4=33). Sanity: also confirm plain 33 fits with no spacing.
        expect(suggestedTileSizes(70, 70, 2, 0, 8, 128)).toContain(33); // usable 66, 66/33=2
    });
});

describe("gridFit", () => {
    it("fits a clean grid with no leftover", () => {
        expect(gridFit(128, 64, { tileWidth: 32, tileHeight: 32, margin: 0, spacing: 0 })).toEqual({ columns: 4, rows: 2, leftoverX: 0, leftoverY: 0 });
    });

    it("flags a partial column or row as leftover pixels", () => {
        const fit = gridFit(100, 64, { tileWidth: 32, tileHeight: 32, margin: 0, spacing: 0 });
        expect(fit.columns).toBe(3);
        expect(fit.leftoverX).toBe(4);
    });

    it("accounts for margin and spacing", () => {
        // usable width = 132 - 2*2 + 4 = 132, /(32+4) = 3.67 -> 3 columns, leftover 132 - 3*36 = 24
        expect(gridFit(132, 132, { tileWidth: 32, tileHeight: 32, margin: 2, spacing: 4 })).toEqual({ columns: 3, rows: 3, leftoverX: 24, leftoverY: 24 });
    });
});

describe("maskFromSides", () => {
    it("sets exactly the bit for each matching side — north 1, east 2, south 4, west 8", () => {
        expect(maskFromSides({ north: true, east: false, south: false, west: false })).toBe(1);
        expect(maskFromSides({ north: false, east: true, south: false, west: false })).toBe(2);
        expect(maskFromSides({ north: false, east: false, south: true, west: false })).toBe(4);
        expect(maskFromSides({ north: false, east: false, south: false, west: true })).toBe(8);
    });

    it("15 is every side matching, 0 is none", () => {
        expect(maskFromSides({ north: true, east: true, south: true, west: true })).toBe(15);
        expect(maskFromSides({ north: false, east: false, south: false, west: false })).toBe(0);
    });
});

describe("mask16Remaining", () => {
    it("is 16 for a wholly unassigned entry", () => {
        expect(mask16Remaining(new Array(16).fill(undefined))).toBe(16);
    });

    it("counts down as tiles are assigned", () => {
        const tiles = new Array(16).fill(undefined);
        tiles[0] = { sheet: "ground", index: 0 };
        tiles[15] = { sheet: "ground", index: 15 };
        expect(mask16Remaining(tiles)).toBe(14);
    });
});

describe("printTilesetDeclarations", () => {
    it("prints a sheet, an area entry and an overlay entry in the shape tileset.ts expects", () => {
        const sheets = { ground: { path: "/art/kingdombuilder/ground-basic.png", tileWidth: 32, tileHeight: 32, margin: 0, spacing: 0 } };
        const areaArt: Record<string, DraftTileArt> = { g: { layout: "mask16", tiles: Array.from({ length: 16 }, (_, index) => ({ sheet: "ground", index })) } };
        const overlayArt: Record<string, DraftTileArt> = { B: { layout: "orientation", tiles: { ns: { sheet: "ground", index: 0 } } } };

        const printed = printTilesetDeclarations(sheets, areaArt, overlayArt);
        expect(printed).toContain(`ground: { path: "/art/kingdombuilder/ground-basic.png", tileWidth: 32, tileHeight: 32, margin: 0, spacing: 0 },`);
        expect(printed).toContain(`g: { layout: "mask16", tiles: [{ sheet: "ground", index: 0 }`);
        expect(printed).toContain(`B: { layout: "orientation", tiles: { "ns": { sheet: "ground", index: 0 } } },`);
    });

    it("prints an empty comment rather than an empty object literal when nothing is assigned yet", () => {
        const printed = printTilesetDeclarations({}, {}, {});
        expect(printed).toContain("// (none yet)");
    });

    it("leaves an incomplete mask16 entry out as a comment naming how many are left, rather than printing a hole", () => {
        const areaArt: Record<string, DraftTileArt> = {
            g: { layout: "mask16", tiles: [{ sheet: "ground", index: 0 }, ...new Array(15).fill(undefined)] },
        };
        const printed = printTilesetDeclarations({}, areaArt, {});
        expect(printed).toContain("// g: not finished yet — 15 of 16 mask tiles left to click");
        expect(printed).not.toContain(`g: { layout: "mask16"`);
    });
});
