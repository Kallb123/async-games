// The disk-reading half of the tileset manifest's guard (§3.5.5). Split out of
// tileset.ts on purpose: that file is imported by useTerrainImage.ts, a client
// component, and a `node:fs` import anywhere in its module graph would break
// the browser bundle. This file is imported only by tileset.test.ts, which
// runs under Node.

import { readFileSync } from "node:fs";
import path from "node:path";

import { sheetColumns, sheetRows, tileRefsOf, TILESET, type TileArt, type TilesetManifest } from "./tileset";

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

/**
 * The full guard (§3.5.5): every sheet a `TileArt` map points at exists in the
 * manifest, every index it uses lands inside that sheet's real, on-disk
 * bounds, and a `mask16` entry that declares any tile declares all sixteen.
 * `publicDir` is overridable so the test can point it at a fixture directory
 * instead of walking the real `public/`.
 */
export function tileArtErrors(
    label: string,
    artByCode: Readonly<Record<string, TileArt>>,
    manifest: TilesetManifest = TILESET,
    publicDir: string = path.join(process.cwd(), "public"),
): string[] {
    const errors: string[] = [];
    const dimensionsBySheet = new Map<string, { width: number; height: number } | null>();

    for (const [code, art] of Object.entries(artByCode)) {
        if (art.layout === "mask16" && art.tiles.length !== 16) {
            errors.push(`tileset.ts ${label} "${code}" declares a mask16 entry with ${art.tiles.length} tile(s), not all sixteen`);
        }

        for (const ref of tileRefsOf(art)) {
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
            }
        }
    }
    return errors;
}
