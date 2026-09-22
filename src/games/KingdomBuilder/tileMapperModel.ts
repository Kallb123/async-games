// Pure logic for the tileset mapper (§3.5.5, docs/admin-tools.md): everything
// that doesn't touch a canvas or the DOM, so it can be unit tested the way
// Race Cars's editorModel.ts is. The component (KingdomBuilderTileMapper.tsx)
// owns pointer handling and the panels; this owns the grid maths, the tile
// size suggestions and the printed `tileset.ts` source.

import { sheetColumns, sheetRows, type SheetDefinition, type TileArt, type TileRef } from "./tileset";

/** A sheet whose grid divides its image evenly on both axes, in the range a real tilesheet's tile size is likely to sit in. Sorted smallest first, so the UI can offer them as "did you mean" chips without the author counting squares themselves. */
export function suggestedTileSizes(imageWidth: number, imageHeight: number, margin: number, spacing: number, min = 8, max = 128): number[] {
    const divides = (size: number): boolean => {
        if (size <= 0) return false;
        const usableW = imageWidth - 2 * margin + spacing;
        const usableH = imageHeight - 2 * margin + spacing;
        return usableW > 0 && usableH > 0 && usableW % (size + spacing) === 0 && usableH % (size + spacing) === 0;
    };
    const sizes: number[] = [];
    for (let size = min; size <= max; size++) if (divides(size)) sizes.push(size);
    return sizes;
}

export interface GridFit {
    columns: number;
    rows: number;
    /** Pixels left over after the last full tile on each axis — a non-zero one means the current size leaves a partial row or column, the classic sign of an undeclared gutter. */
    leftoverX: number;
    leftoverY: number;
}

/** Wraps `sheetColumns`/`sheetRows` — the same grid derivation the compositor uses — with the mapper's own extra concern: how many pixels are left over past the last full tile on each axis, the classic sign of an undeclared gutter. */
export function gridFit(imageWidth: number, imageHeight: number, sheet: Pick<SheetDefinition, "tileWidth" | "tileHeight" | "margin" | "spacing">): GridFit {
    const columns = sheetColumns(sheet, imageWidth);
    const rows = sheetRows(sheet, imageHeight);
    const stepX = sheet.tileWidth + sheet.spacing;
    const stepY = sheet.tileHeight + sheet.spacing;
    const usableW = Math.max(0, imageWidth - 2 * sheet.margin + sheet.spacing);
    const usableH = Math.max(0, imageHeight - 2 * sheet.margin + sheet.spacing);
    return {
        columns: Math.max(0, columns),
        rows: Math.max(0, rows),
        leftoverX: stepX > 0 ? usableW % stepX : 0,
        leftoverY: stepY > 0 ? usableH % stepY : 0,
    };
}

export function maskFromSides(sides: { north: boolean; east: boolean; south: boolean; west: boolean }): number {
    return (sides.north ? 1 : 0) | (sides.east ? 2 : 0) | (sides.south ? 4 : 0) | (sides.west ? 8 : 0);
}

/**
 * The mapper's own in-progress shape for one registry entry's art — identical
 * to the shipped `TileArt` except a `mask16` entry may have holes while it's
 * still being clicked through. Never handed to the guard test or the running
 * app directly; `printTilesetDeclarations` is what turns a complete one into
 * real `TileArt` source, and leaves an incomplete one out with a note instead
 * of printing a hole no `TileRef` could describe.
 */
export type DraftTileArt =
    | { layout: "mask16"; tiles: readonly (TileRef | undefined)[] }
    | { layout: "orientation"; tiles: Readonly<Record<string, TileRef>> }
    | { layout: "variants"; tiles: readonly TileRef[] }
    | { layout: "single"; tile: TileRef };

/** How many of a mask16 entry's sixteen slots are still unassigned, for the panel's own "7 left" nudge. */
export function mask16Remaining(tiles: readonly (TileRef | undefined)[]): number {
    return 16 - tiles.filter(Boolean).length;
}

function quoteTileRef(ref: TileRef): string {
    return `{ sheet: "${ref.sheet}", index: ${ref.index} }`;
}

/** `null` for a `mask16` entry that hasn't had all sixteen of its masks clicked yet — nothing valid to print, so the caller falls back to a comment naming how many are left rather than a `TileArt` with a hole in it. */
function printTileArt(art: DraftTileArt): string | null {
    if (art.layout === "single") return `{ layout: "single", tile: ${quoteTileRef(art.tile)} }`;
    if (art.layout === "variants") return `{ layout: "variants", tiles: [${art.tiles.map(quoteTileRef).join(", ")}] }`;
    if (art.layout === "orientation") {
        const entries = Object.entries(art.tiles).map(([key, ref]) => `${JSON.stringify(key)}: ${quoteTileRef(ref)}`);
        return `{ layout: "orientation", tiles: { ${entries.join(", ")} } }`;
    }
    if (art.tiles.some(tile => !tile) || art.tiles.length !== 16) return null;
    return `{ layout: "mask16", tiles: [${art.tiles.map(tile => quoteTileRef(tile as TileRef)).join(", ")}] }`;
}

/**
 * Prints the finished `tileset.ts` body — the sheet list plus `AREA_ART` and
 * `OVERLAY_ART` — ready to paste over the hand-written declarations in the
 * real file (`sheetTilePixels`, the guard functions and every comment stay as
 * they are; only the data changes). Mirrors `printTrackFile`'s job for the
 * Race Cars editor: this screen produces a file a human commits, not
 * something the app reads back.
 */
export function printTilesetDeclarations(sheets: Readonly<Record<string, SheetDefinition>>, areaArt: Readonly<Record<string, DraftTileArt>>, overlayArt: Readonly<Record<string, DraftTileArt>>): string {
    const printSheets = Object.entries(sheets)
        .map(([name, sheet]) => `        ${name}: { path: "${sheet.path}", tileWidth: ${sheet.tileWidth}, tileHeight: ${sheet.tileHeight}, margin: ${sheet.margin}, spacing: ${sheet.spacing} },`)
        .join("\n");
    const printArt = (art: Readonly<Record<string, DraftTileArt>>) =>
        Object.entries(art)
            .map(([code, entry]) => {
                const printed = printTileArt(entry);
                if (printed) return `    ${code}: ${printed},`;
                const remaining = entry.layout === "mask16" ? mask16Remaining(entry.tiles) : 0;
                return `    // ${code}: not finished yet — ${remaining} of 16 mask tiles left to click`;
            })
            .join("\n") || `    // (none yet)`;

    return [
        `export const TILESET: TilesetManifest = {`,
        `    sheets: {`,
        printSheets,
        `    },`,
        `};`,
        ``,
        `export const AREA_ART: Readonly<Record<string, TileArt>> = {`,
        printArt(areaArt),
        `};`,
        ``,
        `export const OVERLAY_ART: Readonly<Record<string, TileArt>> = {`,
        printArt(overlayArt),
        `};`,
    ].join("\n");
}
