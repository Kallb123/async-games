// The tilesheet manifest (GDD §3.5.5): where the art lives. PR 10 ships with
// no sheets at all — every area draws its registry `fallbackColour` and every
// overlay draws nothing, which is what lets the areas be shippable before any
// art exists (§3.5.6) — so this file only needs the one piece PR 10 actually
// reads: the sheet list, and the pixel tile size the compositor draws at.
//
// PR 11 is the first PR to add a sheet, through the tileset mapper at
// `/admin/kingdombuilder-tiles`, and with it the other half of §3.5.5: which
// registry entry uses which tile, as one of four layouts (`mask16`,
// `orientation`, `variants`, `single`). That shape isn't declared here yet —
// nothing in PR 10 would read it, and the GDD assigns it to PR 11 by name.
//
// tileset.test.ts is the guard, in its lenient PR 10 form: what is declared
// must be valid, but nothing need be declared yet.

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

export interface TilesetManifest {
    /** Keyed by the sheet's own name. */
    sheets: Readonly<Record<string, SheetDefinition>>;
}

/** No sheet has landed yet — see PR 11. */
export const TILESET: TilesetManifest = {
    sheets: {},
};

/** The composite canvas's fallback tile size, in pixels, for as long as no sheet declares one — the largest declared sheet tile size once one does (§3.5.5), so a later, more detailed sheet is never downsampled to match. */
const FALLBACK_TILE_PIXELS = 16;

export function sheetTilePixels(): number {
    const sizes = Object.values(TILESET.sheets).map(sheet => Math.max(sheet.tileWidth, sheet.tileHeight));
    return sizes.length > 0 ? Math.max(...sizes) : FALLBACK_TILE_PIXELS;
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
