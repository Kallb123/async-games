// Draws Realm Arena's characters from every direction a figure can face, from
// their masters in `art-masters/realmarena/characters` — each a model built
// out of simple solids, in code (see kit.mjs there) — into the sheets the
// board will draw them from in `public/art/realmarena`:
//
//   characters.png       a row per character, in `CHARACTERS` order, and a
//                        column per facing, in `FACINGS` order (se, s, sw, w,
//                        nw, n, ne, e): `s` faces the viewer
//   characters-team.png  the same grid, white wherever the owner's colour
//                        goes: what the board tints with each seat's colour
//
// Each cell keeps every Realm Arena sheet's convention (src/games/RealmArena/art.ts):
// its width is a square's diamond, and that diamond lies along the cell's
// foot with its front corner at the middle of the bottom edge, so a cell
// scaled to the board stands its figure in the middle of its square. The
// drawing is scripts/lib/isoRender.mjs: the board's own projection, lit from
// the upper left like the tile art.
//
// Run with `npm run ra-characters` after changing a master, and commit what it
// writes. Two options help while drawing one:
//
//   --only <characterId>   draw just one character, and write only the preview
//   --preview <file.png>   also write the sheet tinted in the seat colours,
//                          each figure standing on a square, to look at

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import sharp from 'sharp';

import { CHARACTERS } from '../src/games/RealmArena/characters.ts';
import { PLAYER_COLOURS } from '../src/utils/ui/playerColours.ts';
import { FACINGS, renderCell } from './lib/isoRender.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MASTERS = path.join(ROOT, 'art-masters', 'realmarena', 'characters');
const SHEETS = path.join(ROOT, 'public', 'art', 'realmarena');

/** A square's diamond across a cell: twice the tile sheets' 64px, so a figure stays sharp zoomed in. */
const TILE_PX = 128;
/** Room above the diamond for the figure and whatever it holds up. */
const CELL = { width: TILE_PX, height: 160 };
/** Samples per pixel along each side, for smooth edges. */
const SUPERSAMPLE = 4;

const { values: options } = parseArgs({ options: { only: { type: 'string' }, preview: { type: 'string' } } });

const ids = Object.keys(CHARACTERS).filter(id => !options.only || id === options.only);
if (ids.length === 0) throw new Error(`No character "${options.only}": pick one of ${Object.keys(CHARACTERS).join(', ')}`);
const { MATERIALS, OUTLINE } = await import(pathToFileURL(path.join(MASTERS, 'kit.mjs')).href);

const sheetWidth = CELL.width * FACINGS.length, sheetHeight = CELL.height * ids.length;
const sheet = Buffer.alloc(sheetWidth * sheetHeight * 4);
const team = Buffer.alloc(sheetWidth * sheetHeight * 4);

for (const [row, id] of ids.entries()) {
    const { parts } = await import(pathToFileURL(path.join(MASTERS, `${id}.mjs`)).href);
    for (const facing of FACINGS.keys()) {
        const cell = renderCell(parts, MATERIALS, {
            facing, ...CELL, pxPerUnit: TILE_PX / Math.SQRT2, supersample: SUPERSAMPLE, outline: OUTLINE,
        });
        for (let y = 0; y < CELL.height; y++) {
            for (let x = 0; x < CELL.width; x++) {
                const from = y * CELL.width + x;
                const to = ((row * CELL.height + y) * sheetWidth + facing * CELL.width + x) * 4;
                sheet.set(cell.pixels.subarray(from * 4, from * 4 + 4), to);
                team.set([255, 255, 255, cell.team[from]], to);
            }
        }
    }
    console.log(`${id}: ${parts.length} parts`);
}

const png = (pixels, width = sheetWidth, height = sheetHeight) =>
    sharp(pixels, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9, effort: 10 });

if (!options.only) {
    await mkdir(SHEETS, { recursive: true });
    for (const [name, pixels] of [['characters.png', sheet], ['characters-team.png', team]]) {
        const file = path.join(SHEETS, name);
        const { size } = await png(pixels).toFile(file);
        console.log(`${path.relative(ROOT, file)}: ${sheetWidth}x${sheetHeight}, ${Math.round(size / 1024)}KB`);
    }
}

if (options.preview) {
    await png(preview()).toFile(options.preview);
    console.log(`Preview: ${options.preview}`);
} else if (options.only) {
    console.log('Nothing written: --only draws one character for a --preview, and leaves the sheets as they are.');
}

/**
 * The sheet as the board would show it: each row in the next seat's colour,
 * multiplied over the team mask, every figure on a grass diamond.
 */
function preview() {
    const out = Buffer.alloc(sheet.length);
    const grass = [122, 150, 84], ground = [236, 230, 214];
    const half = { w: CELL.width / 2, h: CELL.width / 4 };
    for (let y = 0; y < sheetHeight; y++) {
        const row = Math.floor(y / CELL.height), cy = y % CELL.height;
        const tint = PLAYER_COLOURS[row % PLAYER_COLOURS.length].match(/\w\w/g).map(h => parseInt(h, 16) / 255);
        for (let x = 0; x < sheetWidth; x++) {
            const cx = x % CELL.width, i = (y * sheetWidth + x) * 4;
            const onSquare = Math.abs(cx - half.w) / half.w + Math.abs(cy - (CELL.height - half.h)) / half.h <= 1;
            const back = onSquare ? grass : ground;
            const a = sheet[i + 3] / 255, m = team[i + 3] / 255;
            for (let c = 0; c < 3; c++) {
                const figure = sheet[i + c] * (1 - m + m * tint[c]);
                out[i + c] = Math.round(figure * a + back[c] * (1 - a));
            }
            out[i + 3] = 255;
        }
    }
    return out;
}
