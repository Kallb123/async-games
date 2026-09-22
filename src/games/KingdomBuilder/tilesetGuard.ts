// The disk-reading half of the tileset manifest's guard (§3.5.5). Split out of
// tileset.ts on purpose: that file is imported by useTerrainImage.ts, a client
// component, and a `node:fs` import anywhere in its module graph would break
// the browser bundle. This file is imported only by tileset.test.ts, which
// runs under Node.

import { readFileSync } from "node:fs";
import path from "node:path";

import { indexToCell, isMaskArt, isMaskLayout, isSingleSquare, MASK_LAYOUT_SIZES, sheetColumns, sheetRows, tileRefAnchor, tileRefSize, tileRefsOf, TILESET, type TileArt, type TileRef, type TilesetManifest } from "./tileset";

/**
 * Reads a PNG's own declared width/height straight from its IHDR chunk — the
 * eight-byte signature, then a 4-byte length, a 4-byte "IHDR" tag, and the
 * width/height as two big-endian uint32s right after. No image-decoding
 * dependency is worth adding just so a guard test can check an index is in
 * bounds; every PNG carries its own dimensions in its first 24 bytes.
 */
function pngDimensions(filePath: string): { width: number; height: number } {
    const buffer = readFileSync(filePath);
    if (buffer.length < 24 || buffer.readUInt32BE(12) !== 0x49484452 /* "IHDR" */) {
        throw new Error(`"${filePath}" doesn't look like a PNG`);
    }
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/** A ref that declares a piece bigger than one square where only one is allowed, or an anchor outside itself — the shape errors that don't need the sheet's dimensions to spot. `singleSquareBecause` is null where a piece is allowed, and otherwise says why it isn't, so the message names the actual rule being broken. */
function pieceShapeErrors(label: string, code: string, ref: TileRef, singleSquareBecause: string | null): string[] {
    const errors: string[] = [];
    const { width, height } = tileRefSize(ref);

    if (singleSquareBecause && !isSingleSquare(ref)) {
        errors.push(`tileset.ts ${label} "${code}" declares a ${width}×${height} piece, but ${singleSquareBecause}`);
    }
    if ((ref.width !== undefined && ref.width !== width) || (ref.height !== undefined && ref.height !== height)) {
        errors.push(`tileset.ts ${label} "${code}" declares a piece size of ${ref.width}×${ref.height}, which isn't a whole number of squares of at least one`);
    }

    const anchor = tileRefAnchor(ref);
    if ((ref.anchorX !== undefined && ref.anchorX !== anchor.x) || (ref.anchorY !== undefined && ref.anchorY !== anchor.y)) {
        errors.push(`tileset.ts ${label} "${code}" anchors at (${ref.anchorX}, ${ref.anchorY}), which is outside its own ${width}×${height} piece`);
    }
    return errors;
}

/**
 * The full guard (§3.5.5): every sheet a `TileArt` map points at exists in the
 * manifest, every piece it uses lands wholly inside that sheet's real, on-disk
 * bounds, a mask entry that declares any tile declares all of them (sixteen
 * for `mask16`, forty-seven for `mask47`), and — for an area — every ref is
 * one square, because an area fills the grid rather than standing on it.
 * `publicDir` is overridable so the test can point it at a fixture directory
 * instead of walking the real `public/`.
 */
export function tileArtErrors(
    label: string,
    artByCode: Readonly<Record<string, TileArt>>,
    manifest: TilesetManifest = TILESET,
    publicDir: string = path.join(process.cwd(), "public"),
    /** True for `AREA_ART`, whose refs are all one square — an area fills the grid rather than standing on it. */
    areaArt = false,
): string[] {
    const errors: string[] = [];
    const dimensionsBySheet = new Map<string, { width: number; height: number } | null>();

    for (const [code, art] of Object.entries(artByCode)) {
        if (isMaskArt(art)) {
            const expected = MASK_LAYOUT_SIZES[art.layout];
            if (art.tiles.length !== expected) {
                errors.push(`tileset.ts ${label} "${code}" declares a ${art.layout} entry with ${art.tiles.length} tile(s), not all ${expected}`);
            }
        }

        for (const ref of tileRefsOf(art)) {
            // A mask tile is picked per square of map, so it is one square of
            // art whatever kind of entry declares it — a road that autotiles
            // is still laid one square at a time.
            const singleSquareBecause =
                areaArt ? "an area is a ground fill — exactly one square of art per square of map" :
                isMaskArt(art) ? `a ${art.layout} tile is picked one square of map at a time` :
                null;
            errors.push(...pieceShapeErrors(label, code, ref, singleSquareBecause));

            const sheet = manifest.sheets[ref.sheet];
            if (!sheet) {
                errors.push(`tileset.ts ${label} "${code}" points at sheet "${ref.sheet}", which isn't declared`);
                continue;
            }

            let dimensions = dimensionsBySheet.get(ref.sheet);
            if (dimensions === undefined) {
                try {
                    dimensions = pngDimensions(path.join(publicDir, sheet.path));
                } catch {
                    dimensions = null;
                }
                dimensionsBySheet.set(ref.sheet, dimensions);
            }
            if (!dimensions) {
                errors.push(`tileset.ts ${label} "${code}" points at sheet "${ref.sheet}", which couldn't be read from disk`);
                continue;
            }

            const columns = sheetColumns(sheet, dimensions.width);
            const rows = sheetRows(sheet, dimensions.height);
            if (ref.index < 0 || ref.index >= columns * rows) {
                errors.push(`tileset.ts ${label} "${code}" index ${ref.index} is outside sheet "${ref.sheet}"'s ${columns}×${rows} grid`);
                continue;
            }

            // A piece is a rectangle on the sheet, so it has to fit within the
            // row it starts on as well as within the sheet: a 3-wide piece
            // starting two squares from the right edge would otherwise wrap
            // onto the next row and quietly draw someone else's art.
            const { width, height } = tileRefSize(ref);
            const { col, row } = indexToCell(ref.index, Math.max(1, columns));
            if (col + width > columns || row + height > rows) {
                errors.push(`tileset.ts ${label} "${code}" is a ${width}×${height} piece at (${col}, ${row}), which runs off sheet "${ref.sheet}"'s ${columns}×${rows} grid`);
            }
        }
    }
    return errors;
}
