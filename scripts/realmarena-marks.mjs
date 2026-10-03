// Renders Realm Arena's drawn marks from their SVG masters in
// `art-masters/realmarena` to the sheets the board and the page draw them from
// in `public/art/realmarena`: `effects.svg`, the status effects' marks
// (docs/games/realm-arena.md §20, cut by `EFFECT_ART`), and `items.svg`, the
// items and the smoke pot's cloud (§21, cut by `ITEM_ART` and `SMOKE_ART`),
// in src/games/RealmArena/art.ts.
//
// Run with `npm run ra-marks` after changing a master, and commit what it
// writes. The sheets are small enough that `npm run optimise-art` leaves them be.

import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MASTERS = path.join(ROOT, 'art-masters', 'realmarena');
const SHEETS = path.join(ROOT, 'public', 'art', 'realmarena');

for (const master of (await readdir(MASTERS)).filter(file => file.endsWith('.svg')).sort()) {
    const sheet = path.join(SHEETS, master.replace(/\.svg$/, '.png'));
    const { width, height, size } = await sharp(path.join(MASTERS, master)).png({ compressionLevel: 9, effort: 10 }).toFile(sheet);
    console.log(`${path.relative(ROOT, sheet)}: ${width}x${height}, ${Math.round(size / 1024)}KB`);
}
