// Renders Realm Arena's status effect marks (docs/games/realm-arena.md §20)
// from their master, `art-masters/realmarena/effects.svg`, to the sheet the
// board and the unit boxes draw them from, `public/art/realmarena/effects.png`
// (`ART_SHEETS.effects`, cut by `EFFECT_ART`, in src/games/RealmArena/art.ts).
//
// Run with `npm run ra-effects` after changing the master, and commit what it
// writes. The sheet is small enough that `npm run optimise-art` leaves it be.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MASTER = path.join(ROOT, 'art-masters', 'realmarena', 'effects.svg');
const SHEET = path.join(ROOT, 'public', 'art', 'realmarena', 'effects.png');

const { width, height, size } = await sharp(MASTER).png({ compressionLevel: 9, effort: 10 }).toFile(SHEET);
console.log(`${path.relative(ROOT, SHEET)}: ${width}x${height}, ${Math.round(size / 1024)}KB`);
