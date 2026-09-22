// Pure logic for the tileset mapper (§3.5.5, docs/admin-tools.md): everything
// that doesn't touch a canvas or the DOM, so it can be unit tested the way
// Race Cars's editorModel.ts is. The component (KingdomBuilderTileMapper.tsx)
// owns pointer handling and the panels; this owns the grid maths, the tile
// size suggestions and the printed `tileset.ts` source.

import { blobKey, cellToIndex, indexToCell, MASK_LAYOUT_SIZES, NEIGHBOUR_BITS, isMaskLayout, sheetColumns, sheetRows, tileRefAnchor, tileRefSize, type MaskLayout, type SheetDefinition, type TileArt, type TileRef } from "./tileset";

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

export interface NeighbourSides {
    north: boolean;
    northEast: boolean;
    east: boolean;
    southEast: boolean;
    south: boolean;
    southWest: boolean;
    west: boolean;
    northWest: boolean;
}

export type DiagonalName = "northEast" | "southEast" | "southWest" | "northWest";

/** The checkboxes read straight off, before `blobKey` has had its say. */
function rawMask8(sides: NeighbourSides): number {
    let mask = 0;
    for (const [name, bit] of Object.entries(NEIGHBOUR_BITS)) {
        if (sides[name as keyof NeighbourSides]) mask |= bit;
    }
    return mask;
}

/** The 8-bit mask a `mask47` role is picked by, from the mapper's eight "matches" checkboxes. Run through `blobKey` because a diagonal that can't matter must not read as a different slot from the same tile with it unticked. */
export function mask8FromSides(sides: NeighbourSides): number {
    return blobKey(rawMask8(sides));
}

/**
 * Whether a diagonal can change this tile's picture at all — it can only where
 * both the sides beside it already match, which is what collapses 256
 * combinations to 47. The mapper greys out the ones that can't, so a role is
 * never entered that no map square could ever ask for.
 *
 * Asked of `blobKey` rather than re-listing which sides each diagonal needs:
 * that table lives in `tileset.ts` and is the one the compositor actually
 * picks slots with, so a second copy here could only ever drift from it.
 */
export function diagonalApplies(sides: NeighbourSides, diagonal: DiagonalName): boolean {
    const bit = NEIGHBOUR_BITS[diagonal];
    return (blobKey(rawMask8(sides) | bit) & bit) !== 0;
}

/**
 * The 4-bit masks a 3×3 nine-slice block actually draws, in the block's own
 * row-major order: top-left, top, top-right, left, centre, right, and so on.
 * A nine-slice is a *picture of a patch*, so each square's mask is the
 * neighbourhood that square has within the patch — the top-left corner of a
 * patch has neighbours to its east and south, and nothing to its north or
 * west, which is mask 6.
 */
export const NINE_SLICE_MASKS: readonly number[] = [6, 14, 12, 7, 15, 13, 3, 11, 9];

/**
 * The declared mask that stands in best for one a 3×3 block never drew.
 *
 * A nine-slice covers 9 of the 16 neighbourhoods; the other seven — an
 * isolated square, the end of a peninsula, a one-square-wide strip — simply
 * aren't in the art. Rather than leave holes the guard would reject, each is
 * aliased onto the closest tile the block does have, "closest" weighing the
 * two ways a substitute can be wrong differently:
 *
 * - The art shows open ground where there should be an edge: a hard seam
 *   where the patch meets whatever is beside it. The obvious defect, weight 2.
 * - The art draws an edge where the patch actually continues: a stray fringe
 *   line *inside* the patch. Reads as texture far more often than as a bug,
 *   weight 1.
 *
 * Ties break to the lowest mask so the aliasing is deterministic and a
 * re-import of the same block prints the same file.
 */
export function nearestDeclaredMask(wanted: number, declared: readonly number[] = NINE_SLICE_MASKS): number {
    const popcount = (bits: number): number => {
        let count = 0;
        for (let rest = bits; rest !== 0; rest >>>= 1) count += rest & 1;
        return count;
    };
    const cost = (candidate: number): number => popcount(candidate & ~wanted) * 2 + popcount(wanted & ~candidate);
    return [...declared].sort((a, b) => cost(a) - cost(b) || a - b)[0];
}

/**
 * Sixteen tiles from one 3×3 block of a sheet, given the block's top-left
 * square — the whole point of the "import a nine-slice" button. Nine slots
 * come straight from the block; the remaining seven alias onto them via
 * `nearestDeclaredMask`, which is the honest thing to do with art that was
 * never drawn rather than a reason to refuse the import.
 *
 * Returns null if the block would run off the sheet, which is the one way a
 * click near an edge can go wrong.
 */
export function mask16FromNineSlice(sheet: string, topLeftIndex: number, columns: number, rows: number): TileRef[] | null {
    const { col, row } = indexToCell(topLeftIndex, Math.max(1, columns));
    if (col + 3 > columns || row + 3 > rows) return null;

    const bySliceMask = new Map<number, TileRef>();
    NINE_SLICE_MASKS.forEach((mask, slot) => {
        bySliceMask.set(mask, { sheet, index: cellToIndex(col + (slot % 3), row + Math.floor(slot / 3), columns) });
    });
    return Array.from({ length: 16 }, (_, mask) => bySliceMask.get(mask) ?? bySliceMask.get(nearestDeclaredMask(mask))!);
}

/**
 * The mapper's own in-progress shape for one registry entry's art — identical
 * to the shipped `TileArt` except a mask entry may have holes while it's
 * still being clicked through. Never handed to the guard test or the running
 * app directly; `printTilesetDeclarations` is what turns a complete one into
 * real `TileArt` source, and leaves an incomplete one out with a note instead
 * of printing a hole no `TileRef` could describe.
 */
export type DraftTileArt =
    | { layout: "mask16"; tiles: readonly (TileRef | undefined)[] }
    | { layout: "mask47"; tiles: readonly (TileRef | undefined)[] }
    | { layout: "orientation"; tiles: Readonly<Record<string, TileRef>> }
    | { layout: "variants"; tiles: readonly TileRef[] }
    | { layout: "single"; tile: TileRef };

/** `tileset.ts`'s `isMaskArt` for the mapper's own in-progress shape — the same question asked of a draft that may still have holes in it. */
export function isDraftMaskArt(art: DraftTileArt): art is Extract<DraftTileArt, { layout: MaskLayout }> {
    return isMaskLayout(art.layout);
}

/** How many of a mask entry's slots are still unassigned, for the panel's own "7 of 16 left" nudge. */
export function maskRemaining(layout: MaskLayout, tiles: readonly (TileRef | undefined)[]): number {
    return MASK_LAYOUT_SIZES[layout] - tiles.filter(Boolean).length;
}

/** Prints only the piece fields a ref actually departs from the defaults on, so the overwhelmingly common one-square ref still prints as the `{ sheet, index }` it always did. */
function quoteTileRef(ref: TileRef): string {
    const { width, height } = tileRefSize(ref);
    const anchor = tileRefAnchor(ref);
    const parts = [`sheet: "${ref.sheet}"`, `index: ${ref.index}`];
    if (width !== 1) parts.push(`width: ${width}`);
    if (height !== 1) parts.push(`height: ${height}`);
    // The anchor only prints where it isn't the default bottom-left, so a
    // plain building that stands on its own base stays quiet about it.
    if (anchor.x !== 0) parts.push(`anchorX: ${anchor.x}`);
    if (anchor.y !== height - 1) parts.push(`anchorY: ${anchor.y}`);
    return `{ ${parts.join(", ")} }`;
}

/** `null` for a mask entry that hasn't had all its slots clicked yet — nothing valid to print, so the caller falls back to a comment naming how many are left rather than a `TileArt` with a hole in it. */
function printTileArt(art: DraftTileArt): string | null {
    if (art.layout === "single") return `{ layout: "single", tile: ${quoteTileRef(art.tile)} }`;
    if (art.layout === "variants") return `{ layout: "variants", tiles: [${art.tiles.map(quoteTileRef).join(", ")}] }`;
    if (art.layout === "orientation") {
        const entries = Object.entries(art.tiles).map(([key, ref]) => `${JSON.stringify(key)}: ${quoteTileRef(ref)}`);
        return `{ layout: "orientation", tiles: { ${entries.join(", ")} } }`;
    }
    if (art.tiles.some(tile => !tile) || art.tiles.length !== MASK_LAYOUT_SIZES[art.layout]) return null;
    return `{ layout: "${art.layout}", tiles: [${art.tiles.map(tile => quoteTileRef(tile as TileRef)).join(", ")}] }`;
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
                // printTileArt only ever declines a mask entry with holes in it.
                if (!isDraftMaskArt(entry)) return `    // ${code}: not finished yet`;
                return `    // ${code}: not finished yet — ${maskRemaining(entry.layout, entry.tiles)} of ${MASK_LAYOUT_SIZES[entry.layout]} mask tiles left to click`;
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
