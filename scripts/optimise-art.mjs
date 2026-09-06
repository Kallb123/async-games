// Shrinks the oversized PNGs under `public/art` without touching what they
// look like or how big they are in pixels.
//
// Art arrives here as a straight export from whatever drew it, which for a
// full-colour illustration means a file that is almost entirely uncompressed:
// the wasteland Dice Cities faces landed at ~3MB each for a 1023x1537 card.
// Deflate has nothing left to give on those (a lossless re-pack saves ~2%), so
// this quantises each one to a 256-colour palette instead. That is the one
// lever that pays on this kind of image — around -65% — while keeping every
// pixel of the original resolution, which is what the art is kept at full size
// for. The error it introduces is far below what an eye can find: an RMSE of
// under 2 on a 0-255 channel.
//
// Nothing a player downloads is affected either way. Card art goes on screen
// through `next/image` (see DiceCities/components/CardArt.tsx), so the browser
// is already served a downscaled WebP; this is about the weight of the repo and
// of the deploy, both of which carry the source file as-committed.
//
// Run with `npm run optimise-art` after adding art, and commit what it writes.
// It is safe to re-run: a file it has already been through no longer clears the
// savings floor, so it is left alone.

import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ART = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'art');

/** Only files above this are candidates. A correctly exported card face is
 *  tens of KB, so this floor means a folder of good art is a no-op. */
const LARGE_BYTES = 400 * 1024;

/** Keep the re-encode only if it is at least this much smaller. Stops the
 *  script rewriting a file for a rounding error, and is what makes a second
 *  run leave an already-quantised file exactly as it is. */
const MIN_SAVING = 0.1;

/** Every .png under public/art, at any depth. */
async function pngsUnder(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const found = await Promise.all(entries.map(async (entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return pngsUnder(full);
        return entry.name.endsWith('.png') ? [full] : [];
    }));
    return found.flat();
}

const kb = (bytes) => `${Math.round(bytes / 1024)}KB`;

const files = (await pngsUnder(ART)).sort();
let saved = 0;

for (const file of files) {
    const before = (await stat(file)).size;
    if (before < LARGE_BYTES) continue;

    const optimised = await sharp(await readFile(file))
        .png({ palette: true, colours: 256, dither: 1, effort: 10 })
        .toBuffer();

    const name = path.relative(ART, file);
    if (optimised.length > before * (1 - MIN_SAVING)) {
        console.log(`  ${name}: already optimised (${kb(before)})`);
        continue;
    }

    await writeFile(file, optimised);
    saved += before - optimised.length;
    const cut = Math.round(100 * (1 - optimised.length / before));
    console.log(`  ${name}: ${kb(before)} -> ${kb(optimised.length)} (-${cut}%)`);
}

console.log(saved > 0 ? `Saved ${kb(saved)} across ${files.length} files.` : 'Nothing to optimise.');
