// Pure logic for the tileset mapper (§3.5.5, docs/admin-tools.md): everything
// that doesn't touch a canvas or the DOM, so it can be unit tested the way
// Race Cars's editorModel.ts is. The component (KingdomBuilderTileMapper.tsx)
// owns pointer handling and the panels; this owns the grid maths, the tile
// size suggestions and the printed `tileset.ts` source.

import { blobIndexOf, blobKey, cellToIndex, indexToCell, isMaskSlotVariants, maskSlotRefs, MASK_LAYOUT_SIZES, NEIGHBOUR_BITS, isMaskLayout, sheetColumns, sheetRows, tileRefAnchor, tileRefSize, tileRefsOf, type MaskLayout, type MaskSlotArt, type SheetDefinition, type TileArt, type TileRef } from "./tileset";

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

/**
 * The width the sheet preview has to play with: the app column
 * (`--ag-app-width`, 480px) less `.ag-section`'s 20px of padding each side.
 * A sheet wider than this scrolls inside its frame rather than being squeezed
 * — see `previewScale`.
 */
export const PREVIEW_WIDTH = 440;

/** Never shrink pixel art below 1:1 in an editor — an 8px square at half size is unhittable, and the frame scrolls instead. Never blow it up past 4×, where a sheet stops fitting on screen at all. */
const MIN_PREVIEW_SCALE = 1;
const MAX_PREVIEW_SCALE = 4;

/**
 * How many screen pixels one sheet pixel is drawn at: fit the sheet's width to
 * the column, clamped, then multiplied by whatever the zoom stepper is on.
 *
 * Clamping at 1 rather than fitting unconditionally is the point. A 1024px
 * sheet fitted to a 440px column would draw a 16px square at 7 screen pixels,
 * which no one can click accurately; at 1:1 it overflows and the frame scrolls,
 * which is what the track editor's canvas does for the same reason.
 */
export function previewScale(naturalWidth: number, zoom = 1): number {
    if (naturalWidth <= 0) return MIN_PREVIEW_SCALE;
    const fitted = Math.min(MAX_PREVIEW_SCALE, Math.max(MIN_PREVIEW_SCALE, PREVIEW_WIDTH / naturalWidth));
    return fitted * zoom;
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
 * The four sides' "matches" for one square of a self-contained 3×3 "island"
 * of one entry, purely from its own (row, col) inside the block — the same
 * fixed patch `NINE_SLICE_MASKS` already lists by hand for `mask16`, asked
 * generically instead so the mapper's own preview can ask it of `mask47` too.
 * A neighbour outside the 3×3 never matches, the same rule a real map's edge
 * follows — an island square's neighbours are entirely decided by where it
 * sits in the block, never by anything an author has to tick.
 */
export function islandNeighbourSides(row: number, col: number): NeighbourSides {
    const onIsland = (r: number, c: number) => r >= 0 && r < 3 && c >= 0 && c < 3;
    return {
        north: onIsland(row - 1, col),
        northEast: onIsland(row - 1, col + 1),
        east: onIsland(row, col + 1),
        southEast: onIsland(row + 1, col + 1),
        south: onIsland(row + 1, col),
        southWest: onIsland(row + 1, col - 1),
        west: onIsland(row, col - 1),
        northWest: onIsland(row - 1, col - 1),
    };
}

/**
 * The nine slots a self-contained 3×3 island of one entry draws from, row
 * by row — the mapper's own "3×3 preview": every square of the block is
 * really this entry, so every one of the nine is a real, already-meaningful
 * slot (the centre is the fully-interior one) rather than a stand-in for a
 * neighbour the mapper doesn't actually know. Matches `NINE_SLICE_MASKS`
 * exactly for `mask16` — same fixed patch, read off the position instead of
 * listed by hand — and extends the idea to `mask47`, whose extra diagonals a
 * 3×3 block also fully decides (every neighbour of every island square, on or
 * off the island, is itself one of the nine or off the edge).
 */
export function islandMaskSlots(layout: MaskLayout): readonly number[] {
    const slots: number[] = [];
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
            const sides = islandNeighbourSides(row, col);
            slots.push(layout === "mask16" ? maskFromSides(sides) : blobIndexOf(mask8FromSides(sides)));
        }
    }
    return slots;
}

/** One mask slot's own preview tile: its first variant, for a slot declaring several — the preview shows one concrete picture rather than the whole rotation. `undefined` for a slot never clicked. */
export function previewRefOf(slot: MaskSlotArt | undefined): TileRef | undefined {
    if (slot === undefined) return undefined;
    return isMaskSlotVariants(slot) ? slot[0] : slot;
}

/**
 * The 4-bit masks a 3×3 nine-slice block actually draws, in the block's own
 * row-major order: top-left, top, top-right, left, centre, right, and so on.
 * A nine-slice is a *picture of a patch*, so each square's mask is the
 * neighbourhood that square has within the patch — the top-left corner of a
 * patch has neighbours to its east and south, and nothing to its north or
 * west, which is mask 6. `islandMaskSlots` computes exactly this same patch
 * from each square's own position rather than listing it by hand — asked for
 * `mask16` here so this stays the one array both the importer and a test
 * (which pins the two together) actually read.
 */
export const NINE_SLICE_MASKS: readonly number[] = islandMaskSlots("mask16");

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
    | { layout: "mask16"; tiles: readonly (MaskSlotArt | undefined)[] }
    | { layout: "mask47"; tiles: readonly (MaskSlotArt | undefined)[] }
    | { layout: "orientation"; tiles: Readonly<Record<string, TileRef>> }
    | { layout: "variants"; tiles: readonly TileRef[] }
    | { layout: "single"; tile: TileRef };

/** `tileset.ts`'s `isMaskArt` for the mapper's own in-progress shape — the same question asked of a draft that may still have holes in it. */
export function isDraftMaskArt(art: DraftTileArt): art is Extract<DraftTileArt, { layout: MaskLayout }> {
    return isMaskLayout(art.layout);
}

/**
 * A mask entry's own `tiles`, straight back from the JSON round trip the
 * draft takes through `useStoredValue`'s localStorage string — every reload,
 * but also every render, since nothing here keeps a live object between
 * writes. JSON has no `undefined`, so every hole `withMaskSlotAssigned`
 * leaves as `undefined` comes back as `null` instead, and every reader that
 * trusts `undefined` — `draftTileRefsOf`'s own hole check chief among them —
 * mishandles a `null` it wasn't expecting. Folding `null` back to `undefined`
 * once, right where the round trip happens (`parseDraft`, in the component),
 * is simpler than teaching every reader the two mean the same thing.
 */
export function normalizeDraftArt(art: DraftTileArt): DraftTileArt {
    if (!isDraftMaskArt(art)) return art;
    return { layout: art.layout, tiles: art.tiles.map(tile => tile ?? undefined) };
}

/** How many of a mask entry's slots are still unassigned, for the panel's own "7 of 16 left" nudge. A slot counts as assigned whether it holds one tile or several variants. */
export function maskRemaining(layout: MaskLayout, tiles: readonly (MaskSlotArt | undefined)[]): number {
    return MASK_LAYOUT_SIZES[layout] - tiles.filter(Boolean).length;
}

/** How many interchangeable tiles a mask slot already holds — 0 for one not yet clicked, 1 for a plain slot, or however many variants its array has. Powers the mapper's own "N variant(s) so far" hint next to a mask role. */
export function maskSlotVariantCount(slot: MaskSlotArt | undefined): number {
    if (slot === undefined) return 0;
    return isMaskSlotVariants(slot) ? slot.length : 1;
}

/**
 * Writes one clicked square back into a mask entry's slot — replacing
 * whatever was there, or, with `appendVariant`, folding it in alongside what
 * was there instead: the slot's existing single tile becomes a two-tile
 * variant array, and an existing variant array just grows by one. That is
 * the mapper's own version of what a `variants` area already does by simply
 * appending to its list — a mask slot's "list" is just one slot deep inside
 * its sixteen (or forty-seven).
 */
export function withMaskSlotAssigned(tiles: readonly (MaskSlotArt | undefined)[], slot: number, ref: TileRef, appendVariant: boolean): readonly (MaskSlotArt | undefined)[] {
    const next = [...tiles];
    const existing = next[slot];
    next[slot] = appendVariant && existing !== undefined ? [...(isMaskSlotVariants(existing) ? existing : [existing]), ref] : ref;
    return next;
}

/** Every real `TileRef` a draft entry points at so far — holes skipped, a mask slot's variants flattened — for the mapper's own "already assigned" overlay on the sheet preview. */
export function draftTileRefsOf(art: DraftTileArt): TileRef[] {
    if (art.layout === "single") return [art.tile];
    if (art.layout === "orientation") return Object.values(art.tiles);
    if (art.layout === "variants") return [...art.tiles];
    return art.tiles.flatMap(slot => (slot === undefined ? [] : maskSlotRefs(slot)));
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

/** A mask slot's own printed form: a bare ref, or `[ref, ref, …]` for one holding several variants. */
function quoteMaskSlot(slot: MaskSlotArt): string {
    return isMaskSlotVariants(slot) ? `[${slot.map(quoteTileRef).join(", ")}]` : quoteTileRef(slot);
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
    return `{ layout: "${art.layout}", tiles: [${art.tiles.map(tile => quoteMaskSlot(tile as MaskSlotArt)).join(", ")}] }`;
}

/**
 * Every entry of a registry's art map (`AREA_ART` or `OVERLAY_ART`) that
 * points at least one of its tiles at the given sheet — the mapper's "load a
 * previously configured sheet" pull. Picking up a sheet again should mean
 * picking up whatever mapping was already pointed at it too, so continuing an
 * entry that's already fully declared doesn't mean re-clicking it from
 * scratch. A `TileArt` is itself a valid `DraftTileArt` (its mask arrays just
 * happen to have no holes), so the caller can fold this straight into the
 * draft's own `areaArt`/`overlayArt`.
 */
export function entriesUsingSheet(art: Readonly<Record<string, TileArt>>, sheetName: string): Record<string, TileArt> {
    const entries: Record<string, TileArt> = {};
    for (const [code, entry] of Object.entries(art)) {
        if (tileRefsOf(entry).some(ref => ref.sheet === sheetName)) entries[code] = entry;
    }
    return entries;
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
