// The tilesheet manifest (GDD §3.5.5): declares which pixel tile, on which
// sheet, draws each area or overlay. This is the "art describes itself"
// registry — no weight, no placement rule, no cost, just where the art
// lives — and same "nothing branches on it by name" rule as AREAS/OVERLAYS.
//
// PR 10 ships with no sheets at all: every area draws its registry
// `fallbackColour` and every overlay draws nothing, which is what lets the
// areas be shippable before any art exists (§3.5.6). PR 11 is the first PR
// to add a sheet, through the tileset mapper at `/admin/kingdombuilder-tiles`
// — this file just needs to already be in the shape that lands into.
//
// tileset.test.ts is the guard, in its lenient PR 10 form: what is declared
// must be valid, but nothing need be declared yet. PR 11 tightens it to
// require every declared `mask16` entry's full sixteen variants.

import { AREA_BY_CODE } from "./worldgen/areas";
import { OVERLAY_BY_CODE } from "./worldgen/overlays";

export interface SheetDefinition {
    /** Served path under `public/art/kingdombuilder/`. */
    path: string;
    /** Pixel size of one tile on this sheet — sheets can disagree with each other (§3.5.5). */
    tileWidth: number;
    tileHeight: number;
    /** The sheet's outer border and inter-tile gutter, in pixels. */
    margin: number;
    spacing: number;
}

/**
 * The four shapes a registry entry's art reference can take (§3.5.5), shared
 * by areas and overlays alike.
 */
export type TileLayout =
    /** Sixteen variants picked by the neighbour mask — areas, and anything (like a road) that connects to itself. */
    | { kind: "mask16"; sheet: string; indices: readonly number[] }
    /** Variants picked by the direction of the thing the tile sits on, e.g. a bridge across a river. */
    | { kind: "orientation"; sheet: string; indices: Readonly<Record<string, number>> }
    /** A handful of interchangeable tiles, picked by a seeded hash of the tile's coordinates. */
    | { kind: "variants"; sheet: string; indices: readonly number[] }
    /** One tile, for a landmark that only ever looks one way. */
    | { kind: "single"; sheet: string; index: number };

export interface TilesetManifest {
    /** Keyed by the sheet's own name, referenced from a layout's `sheet`. */
    sheets: Readonly<Record<string, SheetDefinition>>;
    /** By area code — an area with no entry here draws its fallback colour. */
    areas: Readonly<Record<string, TileLayout>>;
    /** By overlay code — an overlay with no entry here draws nothing at all. */
    overlays: Readonly<Record<string, TileLayout>>;
}

/** No sheet has landed yet — see PR 11. */
export const TILESET: TilesetManifest = {
    sheets: {},
    areas: {},
    overlays: {},
};

/** The composite canvas's fallback tile size, in pixels, for as long as no sheet declares one — the largest declared sheet tile size once one does (§3.5.5), so a later, more detailed sheet is never downsampled to match. */
const FALLBACK_TILE_PIXELS = 16;

export function sheetTilePixels(): number {
    const sizes = Object.values(TILESET.sheets).map(sheet => Math.max(sheet.tileWidth, sheet.tileHeight));
    return sizes.length > 0 ? Math.max(...sizes) : FALLBACK_TILE_PIXELS;
}

function layoutSheetIsKnown(manifest: TilesetManifest, layout: TileLayout): boolean {
    return layout.sheet in manifest.sheets;
}

function layoutIndicesAreValid(layout: TileLayout): boolean {
    switch (layout.kind) {
        case "mask16":
        case "variants":
            return layout.indices.every(index => Number.isInteger(index) && index >= 0);
        case "orientation":
            return Object.values(layout.indices).every(index => Number.isInteger(index) && index >= 0);
        case "single":
            return Number.isInteger(layout.index) && layout.index >= 0;
    }
}

/**
 * Every sheet a layout points at exists, every code it's filed under is a
 * real registry entry, and every index it declares is at least a valid
 * non-negative integer. Lenient by design (§3.5.5's PR 10 form): nothing
 * need be declared, so an empty manifest always passes. Takes a manifest
 * rather than always reading `TILESET` so the rule itself is testable
 * against fixtures, not just against "nothing declared".
 */
export function tilesetDeclarationErrors(manifest: TilesetManifest = TILESET): string[] {
    const errors: string[] = [];
    for (const [code, layout] of Object.entries(manifest.areas)) {
        if (!AREA_BY_CODE.has(code)) errors.push(`tileset.ts declares area art for unknown code "${code}"`);
        if (!layoutSheetIsKnown(manifest, layout)) errors.push(`tileset.ts area "${code}" references undeclared sheet "${layout.sheet}"`);
        if (!layoutIndicesAreValid(layout)) errors.push(`tileset.ts area "${code}" has an invalid tile index`);
    }
    for (const [code, layout] of Object.entries(manifest.overlays)) {
        if (!OVERLAY_BY_CODE.has(code)) errors.push(`tileset.ts declares overlay art for unknown code "${code}"`);
        if (!layoutSheetIsKnown(manifest, layout)) errors.push(`tileset.ts overlay "${code}" references undeclared sheet "${layout.sheet}"`);
        if (!layoutIndicesAreValid(layout)) errors.push(`tileset.ts overlay "${code}" has an invalid tile index`);
    }
    for (const [name, sheet] of Object.entries(manifest.sheets)) {
        if (sheet.tileWidth <= 0 || sheet.tileHeight <= 0) errors.push(`tileset.ts sheet "${name}" needs a positive tile size`);
        if (sheet.margin < 0 || sheet.spacing < 0) errors.push(`tileset.ts sheet "${name}" has a negative margin or spacing`);
    }
    return errors;
}
