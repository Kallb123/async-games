// Generates every raster/vector app icon from one source of truth: the "clock
// die" mark. Four pips at 12, 3, 6 and 9 — a die face and a clock face at once
// — with the brass pip marking the seat in play.
//
// Run with `node scripts/generate-icons.mjs`. `sharp` comes in with Next's
// install, so there's nothing extra to add to package.json; the OG image needs
// Bricolage Grotesque installed as a system font (see WORDMARK_FONT below) and
// is skipped with a warning when it isn't.
//
// `public/icons/icon.svg` is the scalable master this writes, and it is what
// `src/components/ui/Brand.tsx` puts on screen — so the mark is defined here
// and nowhere else.

import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_ICONS = path.join(ROOT, 'public', 'icons');
const APP = path.join(ROOT, 'src', 'app');

// The `--ag-*` theme tokens, resolved to sRGB hex: SVG rasterisers don't
// understand the oklch() the stylesheet is written in.
const COLOURS = {
    terracotta: '#b74b21',
    brass: '#f7c28f',
    cream: '#f7f0eb',
    brown: '#3a221a',
    brownLift: '#492a1f',
    inkSoft: '#c8b3a6',
};

// Everything is a fraction of the box, so the mark redraws cleanly at any size.
// As the box shrinks the pips grow and their inset tightens so they don't
// dissolve, and below 24px the hub drops entirely — four dots in a rounded
// square still read as both die and clock.
const TIERS = [
    { min: 128, radius: 0.27, pip: 0.12, inset: 0.12, hub: 0.22 },
    { min: 40, radius: 0.27, pip: 0.13, inset: 0.12, hub: 0.23 },
    { min: 24, radius: 0.27, pip: 0.15, inset: 0.11, hub: 0.26 },
    { min: 0, radius: 0.25, pip: 0.22, inset: 0.09, hub: 0 },
];

const tierFor = (size) => TIERS.find((tier) => size >= tier.min);

/**
 * The mark as an SVG document.
 *
 * `scale` shrinks the pips and hub inside the box without shrinking the
 * background, which is how the maskable and Apple icons keep the mark clear of
 * the platform's own crop. `bleed` squares off the corners for the same reason
 * — those platforms round the icon themselves.
 */
function clockDieSvg({ size, scale = 1, bleed = false, tier = tierFor(size) }) {
    // Percentages of odd sizes produce coordinates like 419.84000000000003;
    // two decimals is finer than any renderer can tell apart at these sizes.
    const n = (value) => Number(value.toFixed(2));

    const inner = size * scale;
    const origin = (size - inner) / 2;
    const pipR = n((inner * tier.pip) / 2);
    const edge = n(origin + inner * tier.inset + (inner * tier.pip) / 2);
    const centre = n(size / 2);

    const pip = (cx, cy, fill) => `<circle cx="${cx}" cy="${cy}" r="${pipR}" fill="${fill}"/>`;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${bleed ? 0 : n(size * tier.radius)}" fill="${COLOURS.terracotta}"/>
  ${pip(centre, edge, COLOURS.cream)}
  ${pip(n(size - edge), centre, COLOURS.cream)}
  ${pip(centre, n(size - edge), COLOURS.cream)}
  ${pip(edge, centre, COLOURS.brass)}
  ${tier.hub ? `<circle cx="${centre}" cy="${centre}" r="${n((inner * tier.hub) / 2)}" fill="${COLOURS.brown}"/>` : ''}
</svg>`;
}

const png = (svg) => sharp(Buffer.from(svg)).png().toBuffer();

/**
 * Packs PNGs into an .ico. The format is a 6-byte header, one 16-byte directory
 * entry per image, then the image payloads — PNG payloads are legal in an .ico
 * and every browser we care about reads them.
 */
function ico(images) {
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0); // reserved
    header.writeUInt16LE(1, 2); // type: icon
    header.writeUInt16LE(images.length, 4);

    let offset = header.length + images.length * 16;
    const entries = images.map(({ size, data }) => {
        const entry = Buffer.alloc(16);
        entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 means 256)
        entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
        entry.writeUInt8(0, 2); // palette size
        entry.writeUInt8(0, 3); // reserved
        entry.writeUInt16LE(1, 4); // colour planes
        entry.writeUInt16LE(32, 6); // bits per pixel
        entry.writeUInt32LE(data.length, 8);
        entry.writeUInt32LE(offset, 12);
        offset += data.length;
        return entry;
    });

    return Buffer.concat([header, ...entries, ...images.map((image) => image.data)]);
}

// The landing hero, rendered as a share card: the mark and wordmark over the
// dark colourway, with the lifted die shape bleeding off the top right.
const WORDMARK_FONT = 'Bricolage Grotesque';

function ogImageSvg() {
    const mark = clockDieSvg({ size: 76 });
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${COLOURS.brown}"/>
  <rect x="900" y="-120" width="440" height="440" rx="119" fill="${COLOURS.brownLift}" transform="rotate(12 1120 100)"/>
  <g transform="translate(88 76)">${mark}</g>
  <text x="184" y="129" font-family="${WORDMARK_FONT}" font-weight="800" font-size="42" letter-spacing="-1.4" fill="${COLOURS.cream}">Async Games</text>
  <text x="88" y="332" font-family="${WORDMARK_FONT}" font-weight="800" font-size="82" letter-spacing="-2.9" fill="${COLOURS.cream}">Board games,</text>
  <text x="88" y="420" font-family="${WORDMARK_FONT}" font-weight="800" font-size="82" letter-spacing="-2.9" fill="${COLOURS.cream}">one turn at a time.</text>
  <text x="88" y="504" font-family="${WORDMARK_FONT}" font-weight="800" font-size="26" fill="${COLOURS.inkSoft}">Play with friends across timezones. Take your turn when you have five minutes.</text>
</svg>`;
}

function hasWordmarkFont() {
    // librsvg silently falls back to some default face for a family it doesn't
    // have, so ask fontconfig first rather than shipping a card set in the
    // wrong type.
    try {
        const matched = execFileSync('fc-match', ['-f', '%{family}', WORDMARK_FONT], { encoding: 'utf8' });
        return matched.toLowerCase().includes(WORDMARK_FONT.toLowerCase());
    } catch {
        return false;
    }
}

async function main() {
    await mkdir(PUBLIC_ICONS, { recursive: true });

    const write = async (file, data) => {
        await writeFile(file, data);
        console.log(`wrote ${path.relative(ROOT, file)}`);
    };

    // Scalable master — the manifest's "any purpose" icon, and the copy to hand
    // anyone who asks for the logo.
    await write(path.join(PUBLIC_ICONS, 'icon.svg'), clockDieSvg({ size: 512 }));

    // Browser tab. Each entry is drawn at its own tier rather than downscaled
    // from one big render, which is the whole point of the size ladder.
    await write(
        path.join(APP, 'favicon.ico'),
        ico(await Promise.all([16, 32, 48].map(async (size) => ({
            size,
            data: await png(clockDieSvg({ size })),
        })))),
    );

    // Installed-app icons. Android masks its own shape out of `maskable`, so
    // that one bleeds to the edges with the mark pulled into the safe zone.
    for (const size of [192, 512]) {
        await write(path.join(PUBLIC_ICONS, `icon-${size}.png`), await png(clockDieSvg({ size })));
    }
    await write(
        path.join(PUBLIC_ICONS, 'maskable-512.png'),
        await png(clockDieSvg({ size: 512, scale: 0.72, bleed: true })),
    );
    await write(
        path.join(APP, 'apple-icon.png'),
        await png(clockDieSvg({ size: 180, scale: 0.84, bleed: true })),
    );
    await write(
        path.join(PUBLIC_ICONS, 'mstile-150.png'),
        await png(clockDieSvg({ size: 150, scale: 0.8, bleed: true })),
    );

    if (hasWordmarkFont()) {
        await write(path.join(PUBLIC_ICONS, 'og-image.png'), await png(ogImageSvg()));
    } else {
        console.warn(`skipped og-image.png — install the "${WORDMARK_FONT}" system font and re-run`);
    }
}

await main();
