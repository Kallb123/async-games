// Builds the Kingdom Builder world-map art the app serves from the v2 kit's
// masters in /art-masters/kingdombuilder/v2:
//
//   public/art/kingdombuilder/v2/tiles.png       every pre-rendered tile, in one sheet
//   public/art/kingdombuilder/v2/badges/*.png    the map badges' painted scenes
//   src/games/KingdomBuilder/terrainAtlas.json   where each tile sits in the sheet
//
// The masters are drawn at 128px a tile (a 218x234 image around a 160x113
// ground footprint). A 100x70 world at that size is a 16058x8031 map, which
// phones refuse to draw, so the map is built at the kit's 64px size instead
// (in bands; see useTerrainImage.ts) and the sheet holds each tile already
// shrunk to it. One sheet rather than
// ~500 files is one request, and composing a world from it is a loop of
// drawImage copies, not the seconds of per-pixel generation the kit's own
// script takes in the browser.
//
// The badges are drawn by the kit's own generator (badges/map-badges-2d.js)
// rather than read from its exports, because the village is rendered with its
// ring left see-through: the map paints each owner's colour beneath it, and
// the level shield over it, as live SVG (components/MapBadge.tsx). One image
// per scene serves every seat colour and every level.
//
// Run with `npm run kb-atlas` after changing the masters, and commit what it
// writes. It rebuilds everything from scratch each time.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

import { pngsUnder } from './lib/pngsUnder.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MASTERS = path.join(ROOT, 'art-masters', 'kingdombuilder', 'v2');
const SERVED = path.join(ROOT, 'public', 'art', 'kingdombuilder', 'v2');
const MANIFEST = path.join(ROOT, 'src', 'games', 'KingdomBuilder', 'terrainAtlas.json');

/** The tile resolution the map is drawn at. */
const TILE_RESOLUTION = 64;
/** Big enough to stay sharp at BoardZoom's deepest step on a 3x screen. */
const BADGE_SIZE = 192;
/** The badge scenes the map draws — kept in step with MapBadgeKind in components/MapBadge.tsx. */
const BADGES = ['village', 'barbarian', 'forest', 'quarry', 'iron', 'plot'];
const SHEET_COLUMNS = 16;

/** The kit's own tile geometry for a resolution — `dims()` in source/terrain-tiles.js. */
function dims(T) {
    const Wt = Math.round(T * 1.25), Ht = Math.round(Wt * Math.SQRT1_2), Z = Math.round(Wt * Math.SQRT1_2);
    return { Wt, Ht, PX: Math.round(Wt * 0.18), HR: Math.round(Z * 0.95), BP: Math.round(Ht * 0.12) };
}

const master = JSON.parse(await readFile(path.join(MASTERS, 'manifest.json'), 'utf8'));
const from = master.dims;
const to = dims(TILE_RESOLUTION);
const cell = { width: to.Wt + 2 * to.PX, height: to.Ht + to.HR + to.BP };

// Shrinking the whole master to the cell would misplace the ground by up to
// half a pixel (218/54 and 234/58 aren't the footprint's own 160/40 and
// 113/28), and that half pixel shows as a hairline seam between tiles. So cut
// the master to exactly the region that maps onto the cell at the footprint's
// scale, then shrink that: the ground lands on whole pixels.
const scaleX = from.Wt / to.Wt, scaleY = from.Ht / to.Ht;
const margin = 8;
const crop = {
    left: Math.round(from.PX - to.PX * scaleX) + margin,
    top: Math.round(from.HR - to.HR * scaleY) + margin,
    width: Math.round(cell.width * scaleX),
    height: Math.round(cell.height * scaleY),
};

async function shrinkTile(file) {
    const padded = await sharp(file)
        .extend({ top: margin, bottom: margin, left: margin, right: margin, background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .toBuffer();
    const { data, info } = await sharp(padded).extract(crop).resize(cell.width, cell.height, { fit: 'fill', kernel: 'lanczos3' })
        .raw().toBuffer({ resolveWithObject: true });
    // The ground covers its footprint edge to edge in the master, but its edge
    // pixels come out of the shrink part-transparent. Two neighbours' edges
    // stacked still let ~5% of the board behind through, as a dark grid of
    // hairlines — so the footprint is made solid.
    for (let y = to.HR; y < to.HR + to.Ht; y++) {
        for (let x = to.PX; x < to.PX + to.Wt; x++) data[(y * info.width + x) * 4 + 3] = 255;
    }
    // Only the shape: handing back all of `info` passes its `premultiplied`
    // flag, and sharp divides the colour by alpha a second time — every
    // part-transparent edge pixel comes out white.
    return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).png().toBuffer();
}

const tilesDir = path.join(MASTERS, 'tiles');
const files = (await pngsUnder(tilesDir)).sort();
const cells = files.map(file => path.relative(tilesDir, file).replace(/\\/g, '/').replace(/\.png$/, ''));
const rows = Math.ceil(files.length / SHEET_COLUMNS);

const composites = await Promise.all(files.map(async (file, index) => ({
    input: await shrinkTile(file),
    left: (index % SHEET_COLUMNS) * cell.width,
    top: Math.floor(index / SHEET_COLUMNS) * cell.height,
})));

await mkdir(path.join(SERVED, 'badges'), { recursive: true });
const sheet = await sharp({ create: { width: SHEET_COLUMNS * cell.width, height: rows * cell.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(composites)
    .png({ compressionLevel: 9, effort: 10 })
    .toBuffer();
await writeFile(path.join(SERVED, 'tiles.png'), sheet);

await writeFile(MANIFEST, `${JSON.stringify({ resolution: TILE_RESOLUTION, dims: to, cell, columns: SHEET_COLUMNS, cells }, null, 2)}\n`);

const MapBadges = createRequire(import.meta.url)(path.join(MASTERS, 'badges', 'map-badges-2d.js'));
for (const key of BADGES) {
    const svg = MapBadges.build(key, { size: BADGE_SIZE, ...(key === 'village' ? { ring: 'none' } : {}) });
    const badge = await sharp(Buffer.from(svg)).png({ palette: true, colours: 256, dither: 1, effort: 10 }).toBuffer();
    await writeFile(path.join(SERVED, 'badges', `${key}.png`), badge);
}

console.log(`tiles.png: ${cells.length} tiles, ${SHEET_COLUMNS * cell.width}x${rows * cell.height}, ${Math.round(sheet.length / 1024)}KB`);
console.log(`badges: ${BADGES.length} at ${BADGE_SIZE}x${BADGE_SIZE}`);
