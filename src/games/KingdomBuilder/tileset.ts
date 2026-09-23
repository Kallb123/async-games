// The tilesheet manifest (GDD §3.5.5): where the art lives, and which square of
// which sheet each registry entry draws. PR 10 shipped with no sheets at all —
// every area drew its registry `fallbackColour` and every overlay drew nothing
// (§3.5.6) — so this file only declared the sheet list and the pixel tile size
// the compositor draws at.
//
// PR 11 added the first sheet through the tileset mapper at
// `/admin/kingdombuilder-tiles`, and with it the other half of §3.5.5: which
// registry entry uses which tile, as one of these layouts:
//
// - `mask16` — sixteen tiles, picked by a tile's own 4-bit neighbour mask
//   (§3.5.5's autotiling): bit 0 = north matches, bit 1 = east, bit 2 = south,
//   bit 3 = west, "matches" meaning "that neighbour is the same registry
//   entry". Index 15 is the fully-interior tile; index 0 is an isolated one
//   with a border on every side. Off the edge of the grid never counts as a
//   match, so the map's own border always reads as a border.
// - `mask47` — the same idea asking about all eight neighbours instead of
//   four, so an area can draw the *inner* corner a `mask16` set cannot
//   describe: the square where two arms of woodland close around one square
//   of grass. Four sides and four diagonals are 256 raw combinations, but a
//   diagonal only changes the picture where both its adjacent sides already
//   match, which collapses them to the 47 distinct tiles a "blob" tilesheet
//   is drawn as. It looks strictly better than `mask16` and costs strictly
//   more art — a 3×3 nine-slice fills a `mask16` with aliases, a `mask47`
//   wants 47 drawn squares — so both layouts stay and the art decides.
// - `orientation` — a handful of tiles keyed by whatever orientation string
//   the placement carries (`OverlayPlacement.orientation`). Only two overlays
//   have a generator that actually sets one: Bridge and Ford get `"ns"` or
//   `"ew"` — the direction the crossing itself runs through that tile, north–
//   south or east–west (worldgen/graphConnectivity.ts) — and Pier gets one of
//   `"n"`/`"e"`/`"s"`/`"w"`, the side of the settlement site that faces the
//   water (worldgen/overlayVocabulary.ts). Every other overlay's placements
//   never carry one, so they always draw whichever key was declared first —
//   which is exactly how an entry with no real direction (Signpost, Ruins,
//   Standing stones, Shipwreck, Watchtower) is meant to use this layout: one
//   key (e.g. `"default"`) is enough, and a placement's own tile picks between
//   that key's variants (below) rather than between keys.
// - `variants` — a handful of interchangeable tiles, picked by a seeded hash
//   of the tile's own coordinates, so a big field of grass doesn't visibly
//   repeat and the pick is stable across renders and across players.
// - `single` — one tile, for a landmark that only looks one way.
//
// Any slot of a `mask16`/`mask47` entry, or any key of an `orientation` entry,
// may itself declare several interchangeable tiles instead of one — a
// `MaskSlotArt`, picked by the same seeded hash a `variants` area uses. That
// is the escape hatch for "there might be several different ruins" as much as
// it is for mask16's fully-interior slot (mask 15), where a single square of
// grass repeating across a whole field of it reads as an obvious tile rather
// than a texture. A plain `TileRef` still means exactly what it always did,
// so every existing entry keeps meaning what it printed.
//
// A `TileRef` is one square by default and may instead describe a **piece**
// several squares across: the walled town, the church, the two-square cliff
// face no single ground tile can hold. A piece states where its own anchor
// sits, because a building stands on one square of ground and rises over the
// squares behind it — "which square was this placed on" and "which squares
// does it cover" are different questions, and only the first is a placement.
// Only an overlay may declare a piece: an area is a ground fill, exactly one
// square per square of map, and the guard says so.
//
// Nothing else goes here: no weight, no placement rule, no cost. This file
// describes the art; AREAS and OVERLAYS (worldgen/areas.ts, worldgen/overlays.ts)
// are the game. An entry with no art yet — or every entry, before any sheet
// exists — is drawn in its fallback colour, which is what let PR 10 ship ahead
// of any art at all and is what still keeps a later, art-less registry entry
// shippable today.
//
// tileset.test.ts is the guard: every referenced sheet must exist, every piece
// must land wholly inside that sheet's derived bounds, every `mask16` entry
// that declares any tile must declare all sixteen and every `mask47` all
// forty-seven — see tilesetGuard.ts, which does the actual disk read and is
// kept out of this file on purpose (this one is imported by useTerrainImage.ts,
// a client component, and a `node:fs` import in its module graph would break
// the browser bundle).

export interface SheetDefinition {
    /** Served path under `public/`, e.g. "/art/kingdombuilder/ground-basic.png". */
    path: string;
    /** Pixel size of one tile on this sheet — sheets can disagree with each other (§3.5.5). */
    tileWidth: number;
    tileHeight: number;
    /** The sheet's outer border and inter-tile gutter, in pixels. */
    margin: number;
    spacing: number;
}

export interface TilesetManifest {
    /** Keyed by the sheet's own name. */
    sheets: Readonly<Record<string, SheetDefinition>>;
}

/**
 * One piece of one sheet, addressed the way the mapper hands them out: a flat,
 * row-major index into that sheet's own grid. A bare `{ sheet, index }` is one
 * square, which is what every area tile and most overlays are; `width`/`height`
 * make it a rectangle of squares with `index` as its top-left.
 */
export interface TileRef {
    sheet: string;
    index: number;
    /** Size of the piece in sheet squares, `index` being its top-left. Both default to 1, so a plain `{ sheet, index }` is one square and every existing entry keeps meaning exactly what it did. */
    width?: number;
    height?: number;
    /**
     * Which square *of the piece* sits on the map square it was placed on, as
     * a column/row offset from the piece's own top-left. Defaults to the
     * bottom-left corner — a building stands on its base and rises over the
     * ground behind it, so the placement names the square it occupies and the
     * rest of the art hangs above and to the right of it. A one-square piece
     * has only (0, 0) either way, so the default changes nothing for one.
     */
    anchorX?: number;
    anchorY?: number;
}

/** One mask slot's art: a single tile, as every slot used to be, or several interchangeable ones — see the file header. */
export type MaskSlotArt = TileRef | readonly TileRef[];

export type TileArt =
    | { layout: "mask16"; tiles: readonly MaskSlotArt[] }
    | { layout: "mask47"; tiles: readonly MaskSlotArt[] }
    | { layout: "orientation"; tiles: Readonly<Record<string, MaskSlotArt>> }
    | { layout: "variants"; tiles: readonly TileRef[] }
    | { layout: "single"; tile: TileRef };

/** True for a mask slot declaring several interchangeable tiles rather than one. */
export function isMaskSlotVariants(slot: MaskSlotArt): slot is readonly TileRef[] {
    return Array.isArray(slot);
}

/** Every `TileRef` a mask slot could ever draw — itself, for a plain slot, or all of a variant slot's — so the guard can check each one lands in bounds. */
export function maskSlotRefs(slot: MaskSlotArt): readonly TileRef[] {
    return isMaskSlotVariants(slot) ? slot : [slot];
}

/**
 * A deterministic pick in `[0, count)` from a tile's own coordinates — no
 * `Math.random`, so a `variants` area's texture (and a mask slot's own
 * variants) are stable across renders and identical for every player looking
 * at the same world.
 */
export function seededVariantIndex(col: number, row: number, count: number): number {
    if (count <= 0) return 0;
    const h = Math.imul(col, 374761393) ^ Math.imul(row, 668265263);
    const mixed = Math.imul(h ^ (h >>> 13), 1274126177);
    return Math.abs(mixed ^ (mixed >>> 16)) % count;
}

/** The one `TileRef` a mask slot draws for a particular square of map: itself, for a plain slot, or one of its variants, picked the same stable way a `variants` area's own tile is. Undefined only where a slot's variants array is empty — the guard rejects that, so a real manifest never reaches it. */
export function pickMaskSlotTile(slot: MaskSlotArt, col: number, row: number): TileRef | undefined {
    if (!isMaskSlotVariants(slot)) return slot;
    return slot.length > 0 ? slot[seededVariantIndex(col, row, slot.length)] : undefined;
}

/** How many tiles a mask layout must declare — the length its `tiles` array is guarded at, and the number of slots the mapper counts down from. */
export const MASK_LAYOUT_SIZES = { mask16: 16, mask47: 47 } as const;

export type MaskLayout = keyof typeof MASK_LAYOUT_SIZES;

export function isMaskLayout(layout: string): layout is MaskLayout {
    return layout in MASK_LAYOUT_SIZES;
}

/**
 * Why art of this kind and layout has to be exactly one square, or null where
 * it may be a piece. Stated once and asked twice: the mapper doesn't offer the
 * piece controls where this is non-null, and the guard rejects a piece there —
 * so the screen and the test can't come to disagree about what is legal.
 */
export function singleSquareReason(kind: "area" | "overlay", layout: TileArt["layout"]): string | null {
    if (kind === "area") return "an area is a ground fill — exactly one square of art per square of map";
    if (isMaskLayout(layout)) return `a ${layout} tile is picked one square of map at a time`;
    return null;
}

/** True for the layouts picked per square of map by a neighbour mask, as opposed to by a placement's own direction or a seeded hash. */
export function isMaskArt(art: TileArt): art is Extract<TileArt, { layout: MaskLayout }> {
    return isMaskLayout(art.layout);
}


        mountains: { path: "/art/kingdombuilder/overworld-mountains.png", tileWidth: 32, tileHeight: 32, margin: 0, spacing: 0 },

export const AREA_ART: Readonly<Record<string, TileArt>> = {
    m: { layout: "mask16", tiles: [{ sheet: "mountains", index: 7 }, { sheet: "mountains", index: 13 }, { sheet: "mountains", index: 6 }, { sheet: "mountains", index: 12 }, { sheet: "mountains", index: 1 }, { sheet: "mountains", index: 6 }, { sheet: "mountains", index: 0 }, { sheet: "mountains", index: 6 }, { sheet: "mountains", index: 8 }, { sheet: "mountains", index: 14 }, { sheet: "mountains", index: 13 }, { sheet: "mountains", index: 13 }, { sheet: "mountains", index: 2 }, { sheet: "mountains", index: 8 }, { sheet: "mountains", index: 1 }, { sheet: "mountains", index: 7 }] },
};

export const TILESET: TilesetManifest = {
    sheets: {
        // https://opengameart.org/content/worldmapoverworld-tileset
        mountains: { path: "/art/kingdombuilder/overworld-mountains.png", tileWidth: 32, tileHeight: 32, margin: 0, spacing: 0 },
        ground: { path: "/art/kingdombuilder/overworld-grass.png", tileWidth: 16, tileHeight: 16, margin: 0, spacing: 0 },
    },
};

export const AREA_ART: Readonly<Record<string, TileArt>> = {
    g: { layout: "mask16", tiles: [{ sheet: "ground", index: 0 }, { sheet: "ground", index: 0 }, { sheet: "ground", index: 0 }, { sheet: "ground", index: 0 }, { sheet: "ground", index: 0 }, { sheet: "ground", index: 0 }, { sheet: "ground", index: 0 }, { sheet: "ground", index: 0 }, { sheet: "ground", index: 0 }, { sheet: "ground", index: 0 }, { sheet: "ground", index: 0 }, { sheet: "ground", index: 0 }, { sheet: "ground", index: 0 }, { sheet: "ground", index: 0 }, { sheet: "ground", index: 0 }, [{ sheet: "ground", index: 0 }, { sheet: "ground", index: 1 }, { sheet: "ground", index: 2 }, { sheet: "ground", index: 3 }, { sheet: "ground", index: 4 }, { sheet: "ground", index: 12 }, { sheet: "ground", index: 24 }, { sheet: "ground", index: 36 }, { sheet: "ground", index: 25 }, { sheet: "ground", index: 26 }]] },
    r: { layout: "mask16", tiles: [{ sheet: "ground", index: 61 }, { sheet: "ground", index: 72 }, { sheet: "ground", index: 72 }, { sheet: "ground", index: 72 }, { sheet: "ground", index: 48 }, { sheet: "ground", index: 60 }, { sheet: "ground", index: 48 }, { sheet: "ground", index: 60 }, { sheet: "ground", index: 74 }, { sheet: "ground", index: 74 }, { sheet: "ground", index: 73 }, { sheet: "ground", index: 73 }, { sheet: "ground", index: 50 }, { sheet: "ground", index: 62 }, { sheet: "ground", index: 49 }, { sheet: "ground", index: 61 }] },
    w: { layout: "mask16", tiles: [{ sheet: "ground", index: 95 }, { sheet: "ground", index: 95 }, { sheet: "ground", index: 95 }, { sheet: "ground", index: 81 }, { sheet: "ground", index: 95 }, { sheet: "ground", index: 69 }, { sheet: "ground", index: 57 }, { sheet: "ground", index: 69 }, { sheet: "ground", index: 95 }, { sheet: "ground", index: 83 }, { sheet: "ground", index: 82 }, { sheet: "ground", index: 82 }, { sheet: "ground", index: 59 }, { sheet: "ground", index: 71 }, { sheet: "ground", index: 58 }, { sheet: "ground", index: 70 }] },
    s: { layout: "mask16", tiles: [{ sheet: "ground", index: 64 }, { sheet: "ground", index: 75 }, { sheet: "ground", index: 75 }, { sheet: "ground", index: 75 }, { sheet: "ground", index: 51 }, { sheet: "ground", index: 63 }, { sheet: "ground", index: 51 }, { sheet: "ground", index: 63 }, { sheet: "ground", index: 77 }, { sheet: "ground", index: 77 }, { sheet: "ground", index: 76 }, { sheet: "ground", index: 76 }, { sheet: "ground", index: 53 }, { sheet: "ground", index: 65 }, { sheet: "ground", index: 52 }, { sheet: "ground", index: 64 }] },
    f: { layout: "mask16", tiles: [{ sheet: "ground", index: 215 }, { sheet: "ground", index: 215 }, { sheet: "ground", index: 215 }, { sheet: "ground", index: 177 }, { sheet: "ground", index: 215 }, { sheet: "ground", index: 215 }, { sheet: "ground", index: 177 }, { sheet: "ground", index: 177 }, { sheet: "ground", index: 215 }, { sheet: "ground", index: 179 }, { sheet: "ground", index: 178 }, { sheet: "ground", index: 178 }, { sheet: "ground", index: 179 }, { sheet: "ground", index: 179 }, { sheet: "ground", index: 178 }, { sheet: "ground", index: 178 }] },
    o: { layout: "mask16", tiles: [{ sheet: "ground", index: 61 }, { sheet: "ground", index: 72 }, { sheet: "ground", index: 72 }, { sheet: "ground", index: 72 }, { sheet: "ground", index: 48 }, { sheet: "ground", index: 60 }, { sheet: "ground", index: 48 }, { sheet: "ground", index: 60 }, { sheet: "ground", index: 74 }, { sheet: "ground", index: 74 }, { sheet: "ground", index: 73 }, { sheet: "ground", index: 73 }, { sheet: "ground", index: 50 }, { sheet: "ground", index: 62 }, { sheet: "ground", index: 49 }, { sheet: "ground", index: 61 }] },
    l: { layout: "mask16", tiles: [{ sheet: "ground", index: 61 }, { sheet: "ground", index: 72 }, { sheet: "ground", index: 72 }, { sheet: "ground", index: 72 }, { sheet: "ground", index: 48 }, { sheet: "ground", index: 60 }, { sheet: "ground", index: 48 }, { sheet: "ground", index: 60 }, { sheet: "ground", index: 74 }, { sheet: "ground", index: 74 }, { sheet: "ground", index: 73 }, { sheet: "ground", index: 73 }, { sheet: "ground", index: 50 }, { sheet: "ground", index: 62 }, { sheet: "ground", index: 49 }, { sheet: "ground", index: 61 }] },
    b: { layout: "mask16", tiles: [{ sheet: "ground", index: 61 }, { sheet: "ground", index: 72 }, { sheet: "ground", index: 72 }, { sheet: "ground", index: 72 }, { sheet: "ground", index: 48 }, { sheet: "ground", index: 60 }, { sheet: "ground", index: 48 }, { sheet: "ground", index: 60 }, { sheet: "ground", index: 74 }, { sheet: "ground", index: 74 }, { sheet: "ground", index: 73 }, { sheet: "ground", index: 73 }, { sheet: "ground", index: 50 }, { sheet: "ground", index: 62 }, { sheet: "ground", index: 49 }, { sheet: "ground", index: 61 }] },
    h: { layout: "mask16", tiles: [{ sheet: "ground", index: 39 }, { sheet: "ground", index: 39 }, { sheet: "ground", index: 39 }, { sheet: "ground", index: 39 }, { sheet: "ground", index: 39 }, { sheet: "ground", index: 39 }, { sheet: "ground", index: 39 }, { sheet: "ground", index: 39 }, { sheet: "ground", index: 39 }, { sheet: "ground", index: 39 }, { sheet: "ground", index: 39 }, { sheet: "ground", index: 39 }, { sheet: "ground", index: 39 }, { sheet: "ground", index: 39 }, { sheet: "ground", index: 39 }, { sheet: "ground", index: 39 }] },
    // m: { layout: "mask16", tiles: [{ sheet: "ground", index: 115 }, { sheet: "ground", index: 115 }, { sheet: "ground", index: 115 }, { sheet: "ground", index: 115 }, { sheet: "ground", index: 115 }, { sheet: "ground", index: 115 }, { sheet: "ground", index: 115 }, { sheet: "ground", index: 115 }, { sheet: "ground", index: 115 }, { sheet: "ground", index: 115 }, { sheet: "ground", index: 115 }, { sheet: "ground", index: 115 }, { sheet: "ground", index: 115 }, { sheet: "ground", index: 115 }, { sheet: "ground", index: 115 }, { sheet: "ground", index: 115 }] },
    m: { layout: "mask16", tiles: [{ sheet: "mountains", index: 7 }, { sheet: "mountains", index: 13 }, { sheet: "mountains", index: 6 }, { sheet: "mountains", index: 12 }, { sheet: "mountains", index: 1 }, { sheet: "mountains", index: 6 }, { sheet: "mountains", index: 0 }, { sheet: "mountains", index: 6 }, { sheet: "mountains", index: 8 }, { sheet: "mountains", index: 14 }, { sheet: "mountains", index: 13 }, { sheet: "mountains", index: 13 }, { sheet: "mountains", index: 2 }, { sheet: "mountains", index: 8 }, { sheet: "mountains", index: 1 }, [{ sheet: "mountains", index: 7 }, { sheet: "mountains", index: 10 }]] },
};

export const OVERLAY_ART: Readonly<Record<string, TileArt>> = {
    B: { layout: "orientation", tiles: { "ew": { sheet: "ground", index: 108, width: 3, height: 2 } } },
    R: { layout: "mask16", tiles: [{ sheet: "ground", index: 30 }, { sheet: "ground", index: 40 }, { sheet: "ground", index: 5 }, { sheet: "ground", index: 41 }, { sheet: "ground", index: 16 }, { sheet: "ground", index: 28 }, { sheet: "ground", index: 17 }, { sheet: "ground", index: 29 }, { sheet: "ground", index: 7 }, { sheet: "ground", index: 43 }, { sheet: "ground", index: 6 }, { sheet: "ground", index: 42 }, { sheet: "ground", index: 19 }, { sheet: "ground", index: 31 }, { sheet: "ground", index: 18 }, { sheet: "ground", index: 30 }] },
    J: { layout: "orientation", tiles: { "default": { sheet: "ground", index: 198 } } },
    U: { layout: "orientation", tiles: { "default": { sheet: "ground", index: 148, width: 3, height: 4 } } },
    T: { layout: "orientation", tiles: { "default": { sheet: "ground", index: 197 } } },
    V: { layout: "orientation", tiles: { "default": { sheet: "ground", index: 151, width: 2, height: 4 } } },
};

/** The composite canvas's fallback tile size, in pixels, for as long as no sheet declares one — the largest declared sheet tile size once one does (§3.5.5), so a later, more detailed sheet is never downsampled to match. */
const FALLBACK_TILE_PIXELS = 16;

export function sheetTilePixels(): number {
    const sizes = Object.values(TILESET.sheets).map(sheet => Math.max(sheet.tileWidth, sheet.tileHeight));
    return sizes.length > 0 ? Math.max(...sizes) : FALLBACK_TILE_PIXELS;
}

/**
 * The columns a sheet's own image resolves to, from its declared tile size,
 * margin and spacing and the image's real pixel width — the same maths the
 * mapper and the compositor both need, so a sheet's grid is derived once.
 */
type SheetGeometry = Pick<SheetDefinition, "tileWidth" | "tileHeight" | "margin" | "spacing">;

export function sheetColumns(sheet: SheetGeometry, imageWidth: number): number {
    return Math.floor((imageWidth - 2 * sheet.margin + sheet.spacing) / (sheet.tileWidth + sheet.spacing));
}

export function sheetRows(sheet: SheetGeometry, imageHeight: number): number {
    return Math.floor((imageHeight - 2 * sheet.margin + sheet.spacing) / (sheet.tileHeight + sheet.spacing));
}

/** A tile index's own column/row on a sheet's grid, row-major — the one indexing formula every consumer of a flat `TileRef.index` needs, so the mapper (picking an index from a click) and the compositor (picking pixels from an index) read it off the same place. */
export function indexToCell(index: number, columns: number): { col: number; row: number } {
    return columns > 0 ? { col: index % columns, row: Math.floor(index / columns) } : { col: 0, row: 0 };
}

export function cellToIndex(col: number, row: number, columns: number): number {
    return row * columns + col;
}

/** The source rectangle a tile index resolves to on its sheet's own image, for `drawImage`'s source args. */
export function sheetSourceRect(sheet: SheetDefinition, imageWidth: number, index: number): { sx: number; sy: number; sw: number; sh: number } {
    const { col, row } = indexToCell(index, Math.max(1, sheetColumns(sheet, imageWidth)));
    return {
        sx: sheet.margin + col * (sheet.tileWidth + sheet.spacing),
        sy: sheet.margin + row * (sheet.tileHeight + sheet.spacing),
        sw: sheet.tileWidth,
        sh: sheet.tileHeight,
    };
}

/** A ref's size in sheet squares, defaulted — one square unless it says otherwise. */
export function tileRefSize(ref: TileRef): { width: number; height: number } {
    return { width: Math.max(1, Math.floor(ref.width ?? 1)), height: Math.max(1, Math.floor(ref.height ?? 1)) };
}

/** The square of a piece that lands on the map square it was placed on — its declared anchor, or the bottom-left corner (see `TileRef.anchorX`). */
export function tileRefAnchor(ref: TileRef): { x: number; y: number } {
    const { width, height } = tileRefSize(ref);
    return {
        x: Math.min(width - 1, Math.max(0, Math.floor(ref.anchorX ?? 0))),
        y: Math.min(height - 1, Math.max(0, Math.floor(ref.anchorY ?? height - 1))),
    };
}

/** True for a ref that is exactly one square — what an area's art always is, and what the guard holds `AREA_ART` to. */
export function isSingleSquare(ref: TileRef): boolean {
    const { width, height } = tileRefSize(ref);
    return width === 1 && height === 1;
}

/** One square of a drawn piece: which sheet index it comes from, and where it goes relative to the map square the piece was placed on. */
export interface TilePiecePart {
    index: number;
    offsetX: number;
    offsetY: number;
}

/**
 * The squares a piece is drawn from, one per sheet square it covers. Drawing a
 * multi-square piece a square at a time rather than as one big `drawImage` is
 * what lets a sheet with a `spacing` gutter hold pieces at all: blitting the
 * whole rectangle in one call would drag the gutter pixels along with it.
 */
export function tilePieceParts(ref: TileRef, columns: number): TilePiecePart[] {
    const { width, height } = tileRefSize(ref);
    const anchor = tileRefAnchor(ref);
    const origin = indexToCell(ref.index, columns);
    const parts: TilePiecePart[] = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            parts.push({ index: cellToIndex(origin.col + x, origin.row + y, columns), offsetX: x - anchor.x, offsetY: y - anchor.y });
        }
    }
    return parts;
}

/**
 * The eight neighbour bits a `mask47` tile is picked by. The four sides carry
 * the same meaning (and deliberately not the same values) as `mask16`'s bits;
 * a diagonal sits between the two sides it touches, so the byte reads
 * clockwise from north.
 */
export const NEIGHBOUR_BITS = {
    north: 1,
    northEast: 2,
    east: 4,
    southEast: 8,
    south: 16,
    southWest: 32,
    west: 64,
    northWest: 128,
} as const;

const SIDE_BITS = NEIGHBOUR_BITS.north | NEIGHBOUR_BITS.east | NEIGHBOUR_BITS.south | NEIGHBOUR_BITS.west;

/** Each diagonal and the two sides that have to match before it can change the picture at all. */
const CORNER_BITS: readonly { corner: number; sides: number }[] = [
    { corner: NEIGHBOUR_BITS.northEast, sides: NEIGHBOUR_BITS.north | NEIGHBOUR_BITS.east },
    { corner: NEIGHBOUR_BITS.southEast, sides: NEIGHBOUR_BITS.south | NEIGHBOUR_BITS.east },
    { corner: NEIGHBOUR_BITS.southWest, sides: NEIGHBOUR_BITS.south | NEIGHBOUR_BITS.west },
    { corner: NEIGHBOUR_BITS.northWest, sides: NEIGHBOUR_BITS.north | NEIGHBOUR_BITS.west },
];

/**
 * Collapses a raw 8-bit neighbour mask onto the tile it actually needs. A
 * diagonal neighbour only changes what a tile looks like where both the sides
 * beside it already match: with a side open, that corner of the tile is
 * already drawn as an edge and what lies past it is hidden. Dropping the
 * diagonals that can't matter is what turns 256 combinations into 47.
 */
export function blobKey(mask8: number): number {
    let key = mask8 & SIDE_BITS;
    for (const { corner, sides } of CORNER_BITS) {
        if ((mask8 & sides) === sides && (mask8 & corner) !== 0) key |= corner;
    }
    return key;
}

/** Every distinct `blobKey`, ascending — the canonical order a `mask47` entry's 47 tiles are declared in, so slot N always means the same neighbourhood. */
export const BLOB_47_KEYS: readonly number[] = (() => {
    const keys = new Set<number>();
    for (let mask = 0; mask < 256; mask++) keys.add(blobKey(mask));
    return [...keys].sort((a, b) => a - b);
})();

const BLOB_INDEX_BY_KEY: ReadonlyMap<number, number> = new Map(BLOB_47_KEYS.map((key, index) => [key, index]));

/** Which of a `mask47` entry's 47 slots a raw 8-bit neighbour mask draws. */
export function blobIndexOf(mask8: number): number {
    return BLOB_INDEX_BY_KEY.get(blobKey(mask8)) ?? 0;
}

/** Every `TileRef` a `TileArt` entry can hand out, for validating each one lands in bounds without a caller re-deriving the shape per layout. */
export function tileRefsOf(art: TileArt): readonly TileRef[] {
    if (art.layout === "single") return [art.tile];
    if (art.layout === "orientation") return Object.values(art.tiles).flatMap(maskSlotRefs);
    if (isMaskArt(art)) return art.tiles.flatMap(maskSlotRefs);
    return art.tiles;
}

/**
 * Every declared sheet has a real path and a sane pixel size. Lenient by
 * design (§3.5.5's PR 10 form): nothing need be declared, so an empty
 * manifest always passes. Takes a manifest rather than always reading
 * `TILESET` so the rule itself is testable against fixtures, not just
 * against "nothing declared".
 */
export function tilesetDeclarationErrors(manifest: TilesetManifest = TILESET): string[] {
    const errors: string[] = [];
    for (const [name, sheet] of Object.entries(manifest.sheets)) {
        if (!sheet.path.trim()) errors.push(`tileset.ts sheet "${name}" needs a path`);
        if (sheet.tileWidth <= 0 || sheet.tileHeight <= 0) errors.push(`tileset.ts sheet "${name}" needs a positive tile size`);
        if (sheet.margin < 0 || sheet.spacing < 0) errors.push(`tileset.ts sheet "${name}" has a negative margin or spacing`);
    }
    return errors;
}
