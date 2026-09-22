import { describe, expect, it } from "vitest";

import {
    crossMaskSlots,
    diagonalApplies,
    draftTileRefsOf,
    entriesUsingSheet,
    fillMaskWithTile,
    gridFit,
    innerCornerMaskSlots,
    islandMaskSlots,
    islandNeighbourSides,
    isDraftMaskArt,
    mask16FromNineSlice,
    mask8FromSides,
    maskFromSides,
    maskRemaining,
    maskSlotVariantCount,
    nearestDeclaredMask,
    NINE_SLICE_MASKS,
    normalizeDraftArt,
    PREVIEW_WIDTH,
    previewRefOf,
    previewScale,
    printTilesetDeclarations,
    suggestedTileSizes,
    withMaskSlotAssigned,
    withOrientationKeyAssigned,
    type DraftTileArt,
    type NeighbourSides,
} from "./tileMapperModel";
import { blobIndexOf, BLOB_47_KEYS, NEIGHBOUR_BITS, type TileArt } from "./tileset";

const NO_NEIGHBOURS: NeighbourSides = { north: false, northEast: false, east: false, southEast: false, south: false, southWest: false, west: false, northWest: false };

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

describe("previewScale", () => {
    it("scales a small sheet up to fill the column", () => {
        // The attached-tileset case: 192px across in a 440px column.
        expect(previewScale(192)).toBeCloseTo(PREVIEW_WIDTH / 192);
        expect(previewScale(192) * 192).toBeCloseTo(PREVIEW_WIDTH);
    });

    it("never shrinks a big sheet below 1:1 — it scrolls instead of becoming unclickable", () => {
        expect(previewScale(1024)).toBe(1);
        expect(previewScale(4000)).toBe(1);
    });

    it("never blows a tiny sheet up past 4x", () => {
        expect(previewScale(16)).toBe(4);
        expect(previewScale(1)).toBe(4);
    });

    it("multiplies by the zoom the stepper is on", () => {
        expect(previewScale(1024, 2)).toBe(2);
        expect(previewScale(1024, 0.5)).toBe(0.5);
    });

    it("keeps a sheet's aspect ratio by construction — one scale for both axes", () => {
        // The bug this replaced sized the frame from a stale measurement, so a
        // 192×336 sheet was drawn in a 128×128 box. One scalar applied to both
        // axes cannot do that, whatever the sheet's shape.
        const scale = previewScale(192);
        expect((192 * scale) / (336 * scale)).toBeCloseTo(192 / 336);
    });

    it("is a sane scale rather than Infinity for a width of zero", () => {
        expect(previewScale(0)).toBe(1);
        expect(Number.isFinite(previewScale(0))).toBe(true);
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

describe("maskRemaining", () => {
    it("is the layout's full count for a wholly unassigned entry", () => {
        expect(maskRemaining("mask16", new Array(16).fill(undefined))).toBe(16);
        expect(maskRemaining("mask47", new Array(47).fill(undefined))).toBe(47);
    });

    it("counts down as tiles are assigned", () => {
        const tiles = new Array(16).fill(undefined);
        tiles[0] = { sheet: "ground", index: 0 };
        tiles[15] = { sheet: "ground", index: 15 };
        expect(maskRemaining("mask16", tiles)).toBe(14);
    });
});

describe("maskSlotVariantCount", () => {
    it("is 0 for a slot never clicked", () => {
        expect(maskSlotVariantCount(undefined)).toBe(0);
    });

    it("is 1 for a plain slot", () => {
        expect(maskSlotVariantCount({ sheet: "ground", index: 0 })).toBe(1);
    });

    it("is the array's own length for a slot holding several variants", () => {
        expect(maskSlotVariantCount([{ sheet: "ground", index: 0 }, { sheet: "ground", index: 1 }, { sheet: "ground", index: 2 }])).toBe(3);
    });
});

describe("withMaskSlotAssigned", () => {
    const EMPTY = new Array(16).fill(undefined);

    it("assigns a bare ref to an empty slot, appendVariant or not", () => {
        const tiles = withMaskSlotAssigned(EMPTY, 15, { sheet: "ground", index: 0 }, true);
        expect(tiles[15]).toEqual({ sheet: "ground", index: 0 });
    });

    it("replaces a slot's existing tile when appendVariant is false", () => {
        const first = withMaskSlotAssigned(EMPTY, 15, { sheet: "ground", index: 0 }, false);
        const second = withMaskSlotAssigned(first, 15, { sheet: "ground", index: 1 }, false);
        expect(second[15]).toEqual({ sheet: "ground", index: 1 });
    });

    it("turns a slot's single tile into a two-tile variant array when appendVariant is true", () => {
        const first = withMaskSlotAssigned(EMPTY, 15, { sheet: "ground", index: 0 }, false);
        const second = withMaskSlotAssigned(first, 15, { sheet: "ground", index: 1 }, true);
        expect(second[15]).toEqual([{ sheet: "ground", index: 0 }, { sheet: "ground", index: 1 }]);
    });

    it("keeps growing an existing variant array rather than nesting it", () => {
        let tiles = withMaskSlotAssigned(EMPTY, 15, { sheet: "ground", index: 0 }, false);
        tiles = withMaskSlotAssigned(tiles, 15, { sheet: "ground", index: 1 }, true);
        tiles = withMaskSlotAssigned(tiles, 15, { sheet: "ground", index: 2 }, true);
        expect(tiles[15]).toEqual([{ sheet: "ground", index: 0 }, { sheet: "ground", index: 1 }, { sheet: "ground", index: 2 }]);
    });

    it("leaves every other slot untouched", () => {
        const tiles = withMaskSlotAssigned(EMPTY, 15, { sheet: "ground", index: 0 }, true);
        expect(tiles[0]).toBeUndefined();
    });
});

describe("withOrientationKeyAssigned", () => {
    it("assigns a bare ref to a new key", () => {
        expect(withOrientationKeyAssigned({}, "ns", { sheet: "ground", index: 0 }, true)).toEqual({ ns: { sheet: "ground", index: 0 } });
    });

    it("replaces a key's existing tile when appendVariant is false", () => {
        const first = withOrientationKeyAssigned({}, "ns", { sheet: "ground", index: 0 }, false);
        const second = withOrientationKeyAssigned(first, "ns", { sheet: "ground", index: 1 }, false);
        expect(second.ns).toEqual({ sheet: "ground", index: 1 });
    });

    it("turns a key's single tile into a two-tile variant array when appendVariant is true — same idea as a mask slot's own", () => {
        const first = withOrientationKeyAssigned({}, "ns", { sheet: "ground", index: 0 }, false);
        const second = withOrientationKeyAssigned(first, "ns", { sheet: "ground", index: 1 }, true);
        expect(second.ns).toEqual([{ sheet: "ground", index: 0 }, { sheet: "ground", index: 1 }]);
    });

    it("leaves every other key untouched", () => {
        const tiles = withOrientationKeyAssigned({ ew: { sheet: "ground", index: 5 } }, "ns", { sheet: "ground", index: 0 }, true);
        expect(tiles.ew).toEqual({ sheet: "ground", index: 5 });
    });
});

describe("normalizeDraftArt", () => {
    it("folds a JSON round trip's null holes back to undefined for a mask entry", () => {
        // JSON.parse(JSON.stringify(...)) turns an `undefined` array element
        // into `null` — exactly what the draft comes back as from localStorage.
        const tiles: (undefined | { sheet: string; index: number })[] = new Array(16).fill(undefined);
        tiles[15] = { sheet: "ground", index: 0 };
        const roundTripped: { layout: string; tiles: unknown[] } = JSON.parse(JSON.stringify({ layout: "mask16", tiles }));
        expect(roundTripped.tiles[0]).toBeNull(); // the round trip really did turn it into null

        const normalized = normalizeDraftArt(roundTripped as DraftTileArt);
        expect(normalized).toEqual({ layout: "mask16", tiles });
        expect(draftTileRefsOf(normalized)).toEqual([{ sheet: "ground", index: 0 }]); // no crash walking it, and no phantom null ref
    });

    it("leaves a wholly unassigned mask entry as all-undefined", () => {
        const roundTripped = JSON.parse(JSON.stringify({ layout: "mask47", tiles: new Array(47).fill(undefined) })) as DraftTileArt;
        const normalized = normalizeDraftArt(roundTripped);
        expect(isDraftMaskArt(normalized) && normalized.tiles.every(tile => tile === undefined)).toBe(true);
    });

    it("passes non-mask art through unchanged", () => {
        const single: DraftTileArt = { layout: "single", tile: { sheet: "town", index: 4 } };
        expect(normalizeDraftArt(single)).toEqual(single);
    });

    it("leaves a real tile in place", () => {
        const tiles = new Array(16).fill(undefined);
        tiles[0] = { sheet: "ground", index: 2 };
        const art: DraftTileArt = { layout: "mask16", tiles };
        expect(normalizeDraftArt(art)).toEqual(art);
    });
});

describe("draftTileRefsOf", () => {
    it("flattens a mask entry's variant slots alongside its plain ones", () => {
        const tiles = new Array(16).fill(undefined);
        tiles[0] = { sheet: "ground", index: 0 };
        tiles[15] = [{ sheet: "ground", index: 1 }, { sheet: "ground", index: 2 }];
        const art: DraftTileArt = { layout: "mask16", tiles };
        expect(draftTileRefsOf(art)).toEqual([
            { sheet: "ground", index: 0 },
            { sheet: "ground", index: 1 },
            { sheet: "ground", index: 2 },
        ]);
    });

    it("skips holes rather than throwing on an entry still being clicked through", () => {
        const tiles = new Array(16).fill(undefined);
        tiles[0] = { sheet: "ground", index: 0 };
        expect(draftTileRefsOf({ layout: "mask16", tiles })).toEqual([{ sheet: "ground", index: 0 }]);
    });

    it("handles single, variants and orientation the same way tileset.ts's own tileRefsOf does", () => {
        expect(draftTileRefsOf({ layout: "single", tile: { sheet: "town", index: 4 } })).toEqual([{ sheet: "town", index: 4 }]);
        expect(draftTileRefsOf({ layout: "variants", tiles: [{ sheet: "ground", index: 0 }, { sheet: "ground", index: 1 }] })).toEqual([{ sheet: "ground", index: 0 }, { sheet: "ground", index: 1 }]);
        expect(draftTileRefsOf({ layout: "orientation", tiles: { ns: { sheet: "ground", index: 0 } } })).toEqual([{ sheet: "ground", index: 0 }]);
    });

    it("flattens an orientation key holding several variants, same as a mask slot's own", () => {
        const refs = draftTileRefsOf({ layout: "orientation", tiles: { ns: { sheet: "ground", index: 0 }, ew: [{ sheet: "ground", index: 1 }, { sheet: "ground", index: 2 }] } });
        expect(refs).toEqual(expect.arrayContaining([{ sheet: "ground", index: 0 }, { sheet: "ground", index: 1 }, { sheet: "ground", index: 2 }]));
        expect(refs).toHaveLength(3);
    });
});

describe("mask8FromSides", () => {
    it("is 0 with nothing matching, and every bit with everything matching", () => {
        expect(mask8FromSides(NO_NEIGHBOURS)).toBe(0);
        expect(mask8FromSides({ north: true, northEast: true, east: true, southEast: true, south: true, southWest: true, west: true, northWest: true })).toBe(255);
    });

    it("drops a diagonal whose two sides don't both match, so it can't enter a slot no map square could ask for", () => {
        // NE ticked but east open: the tile is already drawn with an edge on
        // its east side, so what lies past the corner can't be seen.
        const sides = { ...NO_NEIGHBOURS, north: true, northEast: true };
        expect(mask8FromSides(sides)).toBe(NEIGHBOUR_BITS.north);
        expect(mask8FromSides(sides)).toBe(mask8FromSides({ ...sides, northEast: false }));
    });

    it("keeps a diagonal whose two sides both match — the inner corner mask16 can't describe", () => {
        const open = { ...NO_NEIGHBOURS, north: true, east: true };
        const closed = { ...open, northEast: true };
        expect(mask8FromSides(closed)).not.toBe(mask8FromSides(open));
    });
});

describe("diagonalApplies", () => {
    it("is true only where both the sides beside the diagonal match", () => {
        expect(diagonalApplies({ ...NO_NEIGHBOURS, north: true, east: true }, "northEast")).toBe(true);
        expect(diagonalApplies({ ...NO_NEIGHBOURS, north: true }, "northEast")).toBe(false);
        expect(diagonalApplies({ ...NO_NEIGHBOURS, south: true, west: true }, "southWest")).toBe(true);
        expect(diagonalApplies({ ...NO_NEIGHBOURS, south: true, west: true }, "southEast")).toBe(false);
    });
});

describe("islandNeighbourSides", () => {
    it("the centre of a 3×3 island matches on every side — the fully-interior tile", () => {
        const sides = islandNeighbourSides(1, 1);
        expect(sides).toEqual({ north: true, northEast: true, east: true, southEast: true, south: true, southWest: true, west: true, northWest: true });
    });

    it("a top-left corner only matches the two sides that stay on the island", () => {
        const sides = islandNeighbourSides(0, 0);
        expect(sides).toMatchObject({ north: false, west: false, east: true, south: true });
        expect(sides.northWest).toBe(false); // off the island on both axes
        expect(sides.southEast).toBe(true); // the middle square, on the island
    });

    it("a top-centre edge matches three sides and both diagonals the island still has", () => {
        const sides = islandNeighbourSides(0, 1);
        expect(sides).toMatchObject({ north: false, east: true, south: true, west: true, southEast: true, southWest: true });
    });
});

describe("islandMaskSlots", () => {
    it("is exactly NINE_SLICE_MASKS for mask16 — the same fixed patch, read off the position instead of listed by hand", () => {
        expect(islandMaskSlots("mask16")).toEqual(NINE_SLICE_MASKS);
    });

    it("its centre is mask47's fully-interior slot too", () => {
        expect(islandMaskSlots("mask47")[4]).toBe(BLOB_47_KEYS.indexOf(255));
    });

    it("is nine slots, every one of them a real, distinct neighbourhood", () => {
        const slots = islandMaskSlots("mask47");
        expect(slots).toHaveLength(9);
        expect(new Set(slots).size).toBe(9);
    });
});

describe("crossMaskSlots", () => {
    it("the centre is the isolated tile — mask16's 0, and mask47's own isolated slot", () => {
        expect(crossMaskSlots("mask16").centre).toBe(0);
        expect(crossMaskSlots("mask47").centre).toBe(blobIndexOf(0));
    });

    it("each arm only matches on the side leading back to the centre, for mask16", () => {
        const cross = crossMaskSlots("mask16");
        expect(cross.north).toBe(maskFromSides({ ...NO_NEIGHBOURS, south: true }));
        expect(cross.east).toBe(maskFromSides({ ...NO_NEIGHBOURS, west: true }));
        expect(cross.south).toBe(maskFromSides({ ...NO_NEIGHBOURS, north: true }));
        expect(cross.west).toBe(maskFromSides({ ...NO_NEIGHBOURS, east: true }));
    });

    it("mask47 reads the same lone-side neighbourhoods — no diagonal can ever apply to a peninsula tip", () => {
        const cross = crossMaskSlots("mask47");
        expect(cross.north).toBe(blobIndexOf(NEIGHBOUR_BITS.south));
        expect(cross.east).toBe(blobIndexOf(NEIGHBOUR_BITS.west));
        expect(cross.south).toBe(blobIndexOf(NEIGHBOUR_BITS.north));
        expect(cross.west).toBe(blobIndexOf(NEIGHBOUR_BITS.east));
    });

    it("is five distinct slots", () => {
        expect(new Set(Object.values(crossMaskSlots("mask16"))).size).toBe(5);
    });
});

describe("innerCornerMaskSlots", () => {
    it("is four distinct mask47 slots, none of them the fully-interior one", () => {
        const values = Object.values(innerCornerMaskSlots());
        expect(new Set(values).size).toBe(4);
        expect(values).not.toContain(blobIndexOf(255));
    });

    it("each corner is the fully-interior neighbourhood with just that one diagonal left open", () => {
        const corners = innerCornerMaskSlots();
        expect(corners.northEast).toBe(blobIndexOf(255 & ~NEIGHBOUR_BITS.northEast));
        expect(corners.southEast).toBe(blobIndexOf(255 & ~NEIGHBOUR_BITS.southEast));
        expect(corners.southWest).toBe(blobIndexOf(255 & ~NEIGHBOUR_BITS.southWest));
        expect(corners.northWest).toBe(blobIndexOf(255 & ~NEIGHBOUR_BITS.northWest));
    });
});

describe("fillMaskWithTile", () => {
    it("points every slot of a mask16 entry at the same ref", () => {
        const ref = { sheet: "ground", index: 3 };
        const art = fillMaskWithTile("mask16", ref);
        expect(art.layout).toBe("mask16");
        expect(isDraftMaskArt(art) ? art.tiles : []).toHaveLength(16);
        expect(isDraftMaskArt(art) && art.tiles.every(tile => tile === ref)).toBe(true);
    });

    it("points every slot of a mask47 entry at the same ref", () => {
        const art = fillMaskWithTile("mask47", { sheet: "ground", index: 7 });
        expect(isDraftMaskArt(art) ? art.tiles : []).toHaveLength(47);
    });
});

describe("previewRefOf", () => {
    it("is undefined for a slot never clicked", () => {
        expect(previewRefOf(undefined)).toBeUndefined();
    });

    it("is the ref itself for a plain slot", () => {
        expect(previewRefOf({ sheet: "ground", index: 4 })).toEqual({ sheet: "ground", index: 4 });
    });

    it("is the first variant for a slot holding several — one concrete picture, not the whole rotation", () => {
        expect(previewRefOf([{ sheet: "ground", index: 1 }, { sheet: "ground", index: 2 }])).toEqual({ sheet: "ground", index: 1 });
    });
});

describe("NINE_SLICE_MASKS", () => {
    it("is nine distinct masks, one per square of a 3×3 block", () => {
        expect(NINE_SLICE_MASKS).toHaveLength(9);
        expect(new Set(NINE_SLICE_MASKS).size).toBe(9);
    });

    it("reads as a picture of a patch — its centre is the fully-interior tile and its corners have exactly two neighbours", () => {
        expect(NINE_SLICE_MASKS[4]).toBe(15);
        for (const corner of [NINE_SLICE_MASKS[0], NINE_SLICE_MASKS[2], NINE_SLICE_MASKS[6], NINE_SLICE_MASKS[8]]) {
            expect(corner.toString(2).replace(/0/g, "")).toHaveLength(2);
        }
    });
});

describe("nearestDeclaredMask", () => {
    it("returns a mask the block actually drew, for every one of the sixteen", () => {
        for (let mask = 0; mask < 16; mask++) {
            expect(NINE_SLICE_MASKS).toContain(nearestDeclaredMask(mask));
        }
    });

    it("returns a mask unchanged when the block already has it", () => {
        for (const mask of NINE_SLICE_MASKS) expect(nearestDeclaredMask(mask)).toBe(mask);
    });

    it("prefers a substitute that draws a spare edge over one that leaves a hard seam", () => {
        // Mask 5 is a north-south strip: east and west are borders. Both 7
        // (N,E,S) and 13 (N,S,W) cost one open side that should be an edge;
        // neither 15 (two of them) nor a corner (missing a real neighbour) wins.
        expect([7, 13]).toContain(nearestDeclaredMask(5));
        expect(nearestDeclaredMask(5)).not.toBe(15);
    });

    it("is deterministic, so re-importing the same block prints the same file", () => {
        for (let mask = 0; mask < 16; mask++) expect(nearestDeclaredMask(mask)).toBe(nearestDeclaredMask(mask));
    });
});

describe("mask16FromNineSlice", () => {
    it("fills all sixteen slots from one 3×3 block", () => {
        const tiles = mask16FromNineSlice("ground", 0, 4, 4);
        expect(tiles).toHaveLength(16);
        expect(tiles!.every(tile => tile && tile.sheet === "ground")).toBe(true);
    });

    it("takes the nine it has straight from the block, row-major from the clicked square", () => {
        // A 4-column sheet: the block's squares are 0,1,2 / 4,5,6 / 8,9,10.
        const tiles = mask16FromNineSlice("ground", 0, 4, 4)!;
        expect(tiles[NINE_SLICE_MASKS[0]].index).toBe(0); // top-left
        expect(tiles[NINE_SLICE_MASKS[4]].index).toBe(5); // centre
        expect(tiles[NINE_SLICE_MASKS[8]].index).toBe(10); // bottom-right
    });

    it("draws every slot from inside the block and nowhere else", () => {
        const tiles = mask16FromNineSlice("ground", 0, 4, 4)!;
        const block = new Set([0, 1, 2, 4, 5, 6, 8, 9, 10]);
        for (const tile of tiles) expect(block.has(tile.index)).toBe(true);
    });

    it("starts the block at the clicked square rather than at the sheet's origin", () => {
        const tiles = mask16FromNineSlice("ground", 5, 8, 8)!;
        expect(tiles[NINE_SLICE_MASKS[0]].index).toBe(5);
        expect(tiles[NINE_SLICE_MASKS[8]].index).toBe(5 + 2 + 2 * 8);
    });

    it("refuses a block that would run off the right-hand edge or the bottom rather than wrapping onto the next row", () => {
        expect(mask16FromNineSlice("ground", 2, 4, 4)).toBeNull(); // starts at column 2 of 4
        expect(mask16FromNineSlice("ground", 8, 4, 4)).toBeNull(); // starts at row 2 of 4
    });
});

describe("BLOB_47_KEYS", () => {
    it("is exactly 47 distinct neighbourhoods — the whole point of collapsing the diagonals", () => {
        expect(BLOB_47_KEYS).toHaveLength(47);
        expect(new Set(BLOB_47_KEYS).size).toBe(47);
    });

    it("gives every one of the 256 raw masks a slot inside the forty-seven", () => {
        for (let mask = 0; mask < 256; mask++) {
            const slot = blobIndexOf(mask);
            expect(slot).toBeGreaterThanOrEqual(0);
            expect(slot).toBeLessThan(47);
        }
    });

    it("puts the empty neighbourhood first and the fully-enclosed one last", () => {
        expect(BLOB_47_KEYS[0]).toBe(0);
        expect(BLOB_47_KEYS[46]).toBe(255);
    });
});

describe("entriesUsingSheet", () => {
    const g: TileArt = { layout: "single", tile: { sheet: "ground", index: 0 } };
    const t: TileArt = { layout: "variants", tiles: [{ sheet: "town", index: 1 }, { sheet: "town", index: 2 }] };
    const mixed: TileArt = { layout: "orientation", tiles: { ns: { sheet: "ground", index: 5 }, ew: { sheet: "town", index: 6 } } };

    it("keeps only the entries with at least one tile on the given sheet", () => {
        expect(entriesUsingSheet({ g, t }, "ground")).toEqual({ g });
        expect(entriesUsingSheet({ g, t }, "town")).toEqual({ t });
    });

    it("keeps an entry that mixes sheets, since it does have a tile on the one asked about", () => {
        expect(entriesUsingSheet({ mixed }, "ground")).toEqual({ mixed });
        expect(entriesUsingSheet({ mixed }, "town")).toEqual({ mixed });
    });

    it("is empty for a sheet nothing points at", () => {
        expect(entriesUsingSheet({ g, t }, "castle")).toEqual({});
    });

    it("is empty for an empty registry", () => {
        expect(entriesUsingSheet({}, "ground")).toEqual({});
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

    it("prints an orientation key holding several variants as an array, same as a mask slot's own", () => {
        const overlayArt: Record<string, DraftTileArt> = { B: { layout: "orientation", tiles: { ns: [{ sheet: "ground", index: 0 }, { sheet: "ground", index: 1 }] } } };
        expect(printTilesetDeclarations({}, {}, overlayArt)).toContain(`B: { layout: "orientation", tiles: { "ns": [{ sheet: "ground", index: 0 }, { sheet: "ground", index: 1 }] } },`);
    });

    it("prints a multi-square piece's size, and its anchor only where it isn't the default bottom-left", () => {
        const plain: Record<string, DraftTileArt> = { T: { layout: "single", tile: { sheet: "town", index: 4, width: 3, height: 2 } } };
        expect(printTilesetDeclarations({}, {}, plain)).toContain(`T: { layout: "single", tile: { sheet: "town", index: 4, width: 3, height: 2 } },`);

        const anchored: Record<string, DraftTileArt> = { T: { layout: "single", tile: { sheet: "town", index: 4, width: 3, height: 2, anchorX: 1, anchorY: 0 } } };
        expect(printTilesetDeclarations({}, {}, anchored)).toContain(`index: 4, width: 3, height: 2, anchorX: 1, anchorY: 0 }`);
    });

    it("leaves a one-square ref exactly as it always printed, so nothing already committed changes shape", () => {
        const art: Record<string, DraftTileArt> = { T: { layout: "single", tile: { sheet: "town", index: 4 } } };
        expect(printTilesetDeclarations({}, {}, art)).toContain(`T: { layout: "single", tile: { sheet: "town", index: 4 } },`);
    });

    it("prints a finished mask47 entry under its own layout name", () => {
        const tiles = Array.from({ length: 47 }, (_, index) => ({ sheet: "ground", index }));
        const areaArt: Record<string, DraftTileArt> = { w: { layout: "mask47", tiles } };
        expect(printTilesetDeclarations({}, areaArt, {})).toContain(`w: { layout: "mask47", tiles: [{ sheet: "ground", index: 0 }`);
    });

    it("names the right total when a mask47 entry is still unfinished", () => {
        const areaArt: Record<string, DraftTileArt> = {
            w: { layout: "mask47", tiles: [{ sheet: "ground", index: 0 }, ...new Array(46).fill(undefined)] },
        };
        expect(printTilesetDeclarations({}, areaArt, {})).toContain("// w: not finished yet — 46 of 47 mask tiles left to click");
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

    it("prints a mask slot holding several variants as an array, and a plain slot as a bare ref either way", () => {
        const tiles = Array.from({ length: 16 }, (_, index) => ({ sheet: "ground", index }));
        (tiles as unknown[])[15] = [{ sheet: "ground", index: 15 }, { sheet: "ground", index: 16 }, { sheet: "ground", index: 17 }];
        const areaArt: Record<string, DraftTileArt> = { g: { layout: "mask16", tiles } };
        const printed = printTilesetDeclarations({}, areaArt, {});
        expect(printed).toContain(`[{ sheet: "ground", index: 15 }, { sheet: "ground", index: 16 }, { sheet: "ground", index: 17 }]`);
        expect(printed).toContain(`{ sheet: "ground", index: 0 },`); // slot 0 is still a bare ref
    });
});
