// The tilesheet manifest (GDD §3.5.5): where the art lives, and which square of
// which sheet each registry entry draws. PR 10 shipped with no sheets at all —
// every area drew its registry `fallbackColour` and every overlay drew nothing
// (§3.5.6) — so this file only declared the sheet list and the pixel tile size
// the compositor draws at.
//
// PR 11 is the first PR to add a sheet, through the tileset mapper at
// `/admin/kingdombuilder-tiles`, and with it the other half of §3.5.5: which
// registry entry uses which tile, as one of four layouts:
//
// - `mask16` — sixteen tiles, picked by a tile's own 4-bit neighbour mask
//   (§3.5.5's autotiling): bit 0 = north matches, bit 1 = east, bit 2 = south,
//   bit 3 = west, "matches" meaning "that neighbour is the same registry
//   entry". Index 15 is the fully-interior tile; index 0 is an isolated one
//   with a border on every side. Off the edge of the grid never counts as a
//   match, so the map's own border always reads as a border.
// - `orientation` — a handful of tiles keyed by whatever orientation string
//   the placement carries (a bridge's `OverlayPlacement.orientation`).
// - `variants` — a handful of interchangeable tiles, picked by a seeded hash
//   of the tile's own coordinates, so a big field of grass doesn't visibly
//   repeat and the pick is stable across renders and across players.
// - `single` — one tile, for a landmark that only looks one way.
//
// Nothing else goes here: no weight, no placement rule, no cost. This file
// describes the art; AREAS and OVERLAYS (worldgen/areas.ts, worldgen/overlays.ts)
// are the game. An entry with no art yet — or every entry, before any sheet
// exists — is drawn in its fallback colour, which is what let PR 10 ship ahead
// of any art at all and is what still keeps a later, art-less registry entry
// shippable today.
//
// tileset.test.ts is the guard, tightened from PR 10's lenient form: every
// referenced sheet must exist, every index must land inside that sheet's
// derived bounds, and every `mask16` entry that declares any tile must declare
// all sixteen — see tilesetGuard.ts, which does the actual disk read and is
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

/** One square of one sheet, addressed the way the mapper hands them out: a flat, row-major index into that sheet's own grid. */
export interface TileRef {
    sheet: string;
    index: number;
}

export type TileArt =
    | { layout: "mask16"; tiles: readonly TileRef[] }
    | { layout: "orientation"; tiles: Readonly<Record<string, TileRef>> }
    | { layout: "variants"; tiles: readonly TileRef[] }
    | { layout: "single"; tile: TileRef };

/** No sheet had landed as of PR 10 — PR 11 adds the first. */
export const TILESET: TilesetManifest = {
    sheets: {
        ground: { path: "/art/kingdombuilder/ground-basic.png", tileWidth: 32, tileHeight: 32, margin: 0, spacing: 0 },
    },
};

/** Which registry entry (by area code) uses which art, and how. An area with no entry here still draws its `fallbackColour` (§3.5.6). */
export const AREA_ART: Readonly<Record<string, TileArt>> = {
    // Grass, drawn as a 16-tile autotile blob so its edge against whatever
    // borders it (fields, woodland, the beach) reads as ground giving way
    // rather than a hard rectangle. Laid out 4 columns × 4 rows on the sheet,
    // row-major, so tile index == mask index.
    g: { layout: "mask16", tiles: Array.from({ length: 16 }, (_, index) => ({ sheet: "ground", index })) },
};

/** Same idea as `AREA_ART`, keyed by overlay code. Empty until PR 12 brings the scattered/decorative vocabulary art alongside it. */
export const OVERLAY_ART: Readonly<Record<string, TileArt>> = {};

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
export function sheetColumns(sheet: SheetDefinition, imageWidth: number): number {
    return Math.floor((imageWidth - 2 * sheet.margin + sheet.spacing) / (sheet.tileWidth + sheet.spacing));
}

export function sheetRows(sheet: SheetDefinition, imageHeight: number): number {
    return Math.floor((imageHeight - 2 * sheet.margin + sheet.spacing) / (sheet.tileHeight + sheet.spacing));
}

/** The source rectangle a tile index resolves to on its sheet's own image, for `drawImage`'s source args. */
export function sheetSourceRect(sheet: SheetDefinition, imageWidth: number, index: number): { sx: number; sy: number; sw: number; sh: number } {
    const columns = Math.max(1, sheetColumns(sheet, imageWidth));
    const col = index % columns;
    const row = Math.floor(index / columns);
    return {
        sx: sheet.margin + col * (sheet.tileWidth + sheet.spacing),
        sy: sheet.margin + row * (sheet.tileHeight + sheet.spacing),
        sw: sheet.tileWidth,
        sh: sheet.tileHeight,
    };
}

/** Every `TileRef` a `TileArt` entry can hand out, for validating each one lands in bounds without a caller re-deriving the shape per layout. */
export function tileRefsOf(art: TileArt): readonly TileRef[] {
    if (art.layout === "single") return [art.tile];
    if (art.layout === "orientation") return Object.values(art.tiles);
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
