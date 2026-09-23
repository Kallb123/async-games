// Kingdom Builder's world contact sheet (GDD §3.7): generates N seeded worlds
// and writes them side by side as one PNG, each tile drawn in its area's
// registry fallback colour. A change to the generator is reviewed by looking
// at the before-and-after sheets, not by reading noise maths — so run this on
// the base branch and on yours with the same seeds and compare.
//
//   npm run kb-worlds                          # 12 worlds, seeds kb-0…kb-11
//   npm run kb-worlds -- --count 20 --prefix x --columns 5 --out sheet.png
//
// Alongside the sheet it prints, per world, the attempt that passed, how long
// generation took and each area's share of the land — the numbers §3.7's
// composition bands are tuned against. Like `npm run icons` it runs through
// `tsx` only so it can import the TypeScript generator and area registry
// rather than keep a second copy of either.

import path from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';

import { AREAS, areaForCode, OCEAN_CODE } from '../src/games/KingdomBuilder/worldgen/areas.ts';
import { generateWorld } from '../src/games/KingdomBuilder/worldgen/generateWorld.ts';

const { values: args } = parseArgs({
    options: {
        count: { type: 'string', default: '12' },
        columns: { type: 'string', default: '4' },
        prefix: { type: 'string', default: 'kb' },
        scale: { type: 'string', default: '2' },
        out: { type: 'string', default: 'kb-worlds.png' },
    },
});
const count = Number(args.count);
if (!Number.isInteger(count) || count < 1) throw new Error(`--count must be a whole number of worlds, at least 1 (got "${args.count}")`);
const sheetColumns = Math.min(count, Number(args.columns));
const scale = Number(args.scale);
const GUTTER = 4;

const rgbOf = hex => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));

const worlds = [];
for (let index = 0; index < count; index++) {
    const seed = `${args.prefix}-${index}`;
    const started = performance.now();
    const world = generateWorld(seed);
    const elapsed = performance.now() - started;
    worlds.push(world);

    const { codes } = world.terrainField;
    const counts = new Map();
    for (const code of codes) counts.set(code, (counts.get(code) ?? 0) + 1);
    const land = codes.length - (counts.get(OCEAN_CODE) ?? 0);
    const shares = AREAS.filter(area => area.code !== OCEAN_CODE)
        .map(area => `${area.name} ${(((counts.get(area.code) ?? 0) / land) * 100).toFixed(0)}%`)
        .join(', ');
    console.log(`${seed}: attempt ${world.generationAttempt}, ${elapsed.toFixed(0)}ms — ${shares}`);
}

const { columns, rows } = worlds[0].terrainField;
const cellWidth = columns * scale, cellHeight = rows * scale;
const sheetRows = Math.ceil(count / sheetColumns);
const width = sheetColumns * cellWidth + (sheetColumns + 1) * GUTTER;
const height = sheetRows * cellHeight + (sheetRows + 1) * GUTTER;
const pixels = Buffer.alloc(width * height * 3, 255);

worlds.forEach((world, index) => {
    const left = GUTTER + (index % sheetColumns) * (cellWidth + GUTTER);
    const top = GUTTER + Math.floor(index / sheetColumns) * (cellHeight + GUTTER);
    const field = world.terrainField;
    for (let tile = 0; tile < field.codes.length; tile++) {
        const [r, g, b] = rgbOf(areaForCode(field.codes[tile]).fallbackColour);
        const col = tile % field.columns, row = Math.floor(tile / field.columns);
        for (let dy = 0; dy < scale; dy++) {
            for (let dx = 0; dx < scale; dx++) {
                const offset = ((top + row * scale + dy) * width + left + col * scale + dx) * 3;
                pixels[offset] = r; pixels[offset + 1] = g; pixels[offset + 2] = b;
            }
        }
    }
});

const out = path.resolve(args.out);
await sharp(pixels, { raw: { width, height, channels: 3 } }).png({ compressionLevel: 9 }).toFile(out);
console.log(`Wrote ${count} worlds to ${out}`);
