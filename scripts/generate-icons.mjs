// Generates every raster/vector app icon from one source of truth: the "clock
// die" mark. Four pips at 12, 3, 6 and 9 — a die face and a clock face at once
// — with the brass pip marking the seat in play.
//
// Also draws the share cards a link to the site unfurls to: one generic card,
// plus one per game, so a shared join link previews as the game it opens
// rather than as the site (see `/join`'s generateMetadata). Those read each
// game's own `meta` through `GAME_META`, so a new game gets a card by adding
// itself to the library and re-running this — nothing here lists the games.
//
// Run with `npm run icons`. It goes through `tsx` rather than bare node only
// so this file can import that TypeScript metadata (and the theme's colours)
// instead of keeping a second copy of either. `sharp` comes in with Next's
// install, so there is nothing extra to add to package.json; the cards need
// Bricolage Grotesque installed as a system font (see WORDMARK_FONT below) and
// are skipped with a warning when it isn't.
//
// `public/icons/icon.svg` is the scalable master this writes, and it is what
// `src/components/ui/Brand.tsx` puts on screen — so the mark is defined here
// and nowhere else.

import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

import { GAME_META, HEX_VERTICES, gameShareCard } from '../src/utils/ui/games.ts';
import { SRGB, accentHex } from '../src/utils/ui/colours.ts';
import { truncate } from '../src/utils/ui/text.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_ICONS = path.join(ROOT, 'public', 'icons');
const APP = path.join(ROOT, 'src', 'app');

// The `--ag-*` theme tokens, resolved to sRGB hex: SVG rasterisers don't
// understand the oklch() the stylesheet is written in. `SRGB` and `accentHex`
// in `src/utils/ui/colours.ts` are where those live — this only adds the brass
// the mark's live pip is picked out in, which nothing on screen uses.
const COLOURS = {
    ...SRGB,
    terracotta: accentHex('terracotta'),
    brass: '#f7c28f',
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

const WORDMARK_FONT = 'Bricolage Grotesque';
// A game with no art of its own is drawn as its glyph, and most of those are
// emoji — a family librsvg only has if the system does.
const EMOJI_FONT = 'Noto Color Emoji';

// Every share card stands on the same ground: the dark colourway with the
// lifted die shape bleeding off the top right. One wrapper, so moving that
// shape moves it on all of them.
const CARD_W = 1200;
const CARD_H = 630;

function shareCard(inner) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  <rect width="${CARD_W}" height="${CARD_H}" fill="${COLOURS.brown}"/>
  <rect x="900" y="-120" width="440" height="440" rx="119" fill="${COLOURS.brownLift}" transform="rotate(12 1120 100)"/>
  ${inner}
</svg>`;
}

// The landing hero as a share card — what a link to anything but a specific
// game unfurls to.
function ogImageSvg() {
    const mark = clockDieSvg({ size: 76 });
    return shareCard(`<g transform="translate(88 76)">${mark}</g>
  <text x="184" y="129" font-family="${WORDMARK_FONT}" font-weight="800" font-size="42" letter-spacing="-1.4" fill="${COLOURS.cream}">Async Games</text>
  <text x="88" y="332" font-family="${WORDMARK_FONT}" font-weight="800" font-size="82" letter-spacing="-2.9" fill="${COLOURS.cream}">Board games,</text>
  <text x="88" y="420" font-family="${WORDMARK_FONT}" font-weight="800" font-size="82" letter-spacing="-2.9" fill="${COLOURS.cream}">one turn at a time.</text>
  <text x="88" y="504" font-family="${WORDMARK_FONT}" font-weight="800" font-size="26" fill="${COLOURS.inkSoft}">Play with friends across timezones. Take your turn when you have five minutes.</text>`);
}

// One share card per game, for a link that opens that game — today a join link
// (`/join?code=PLUM`), whose title and description carry the parts that change
// per lobby (who invited you, the code, seats left). The card only has to say
// *which game*, and that is a fixed set, so these are drawn once here rather
// than rendered per request.

// SVG has no auto-wrap, so the card does its own: a name long enough to run
// off the edge is cut, and a tagline is broken across at most two lines. Both
// limits are character counts measured against the widths this layout holds at
// the sizes below.
const MAX_NAME = 24;
const TAGLINE_LINE = 58;
const TAGLINE_LINES = 2;
const TAGLINE_LEADING = 36;

// Greedy line breaking on whitespace, at most `maxLines` of `maxChars`; the
// last line is cut if the text still doesn't fit. A word longer than a line
// gets its own line and is cut there rather than looping forever.
function wrap(text, maxChars, maxLines) {
    const lines = [''];
    for (const word of text.split(/\s+/)) {
        const line = lines[lines.length - 1];
        const candidate = line ? `${line} ${word}` : word;
        if (candidate.length <= maxChars || !line) {
            lines[lines.length - 1] = candidate;
        } else if (lines.length < maxLines) {
            lines.push(word);
        } else {
            lines[lines.length - 1] = candidate;
            break;
        }
    }
    return lines.map((line) => truncate(line, maxChars));
}

// XML, so a game whose name or tagline contains an ampersand ("Settlements &
// Cities") doesn't produce a document the rasteriser refuses.
const xml = (text) => text.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]);

// The plate the game's art (or its glyph) sits on, mirroring GameThumb: a
// rounded square, or a flat-top hexagon for the games whose theme calls for
// one. Same 200-unit box either way, so the text beside it never moves.
const PLATE = 200;
// The text column starts clear of the plate, so resizing the plate moves the
// text with it rather than leaving the two overlapping.
const TEXT_X = 88 + PLATE + 44;

function plateShape(meta, fill) {
    return meta.shape === 'hexagon'
        ? `<polygon points="${HEX_VERTICES.map(([x, y]) => `${x * PLATE},${y * PLATE}`).join(' ')}" fill="${fill}"/>`
        : `<rect width="${PLATE}" height="${PLATE}" rx="44" fill="${fill}"/>`;
}

async function gameShareCardSvg(meta) {
    const accent = accentHex(meta.accent);
    const tagline = wrap(meta.tagline, TAGLINE_LINE, TAGLINE_LINES);
    const mark = clockDieSvg({ size: 56 });
    const glyph = meta.glyph ?? '';
    // A lettered glyph ("1→100", "S?") is set in the heavy weight the rest of
    // the card is; an emoji is not. Asked for weight 800 fontconfig synthesises
    // one, and the emboldening closes the fine gaps in a detailed glyph — 🌍
    // comes out a featureless disc with its continents filled in.
    const glyphWeight = /\p{Extended_Pictographic}/u.test(glyph) ? 400 : 800;
    // Real art where the game has some; its glyph on the accent plate where it
    // doesn't — the same two cases, in the same order, that GameThumb draws.
    const art = meta.art
        ? `<image href="data:image/png;base64,${(await readFile(path.join(ROOT, 'public', meta.art))).toString('base64')}" x="0" y="0" width="${PLATE}" height="${PLATE}" clip-path="url(#plate)"/>`
        : `<text x="${PLATE / 2}" y="${PLATE / 2}" font-family="${WORDMARK_FONT}, ${EMOJI_FONT}" font-weight="${glyphWeight}" font-size="64" fill="${COLOURS.cream}" text-anchor="middle" dominant-baseline="central">${xml(glyph)}</text>`;

    return shareCard(`<defs><clipPath id="plate">${plateShape(meta, 'none')}</clipPath></defs>
  <rect width="24" height="${CARD_H}" fill="${accent}"/>
  <g transform="translate(88 64)">${mark}</g>
  <text x="160" y="102" font-family="${WORDMARK_FONT}" font-weight="800" font-size="30" letter-spacing="-1" fill="${COLOURS.inkSoft}">Async Games</text>
  <g transform="translate(88 232)">
    ${plateShape(meta, accent)}
    ${art}
  </g>
  <text x="${TEXT_X}" y="322" font-family="${WORDMARK_FONT}" font-weight="800" font-size="76" letter-spacing="-2.6" fill="${COLOURS.cream}">${xml(truncate(meta.name, MAX_NAME))}</text>
  <text x="${TEXT_X}" y="378" font-family="${WORDMARK_FONT}" font-weight="400" font-size="29" fill="${COLOURS.inkSoft}">${tagline.map((line, i) => `<tspan x="${TEXT_X}" dy="${i ? TAGLINE_LEADING : 0}">${xml(line)}</tspan>`).join('')}</text>
  <text x="${TEXT_X}" y="${378 + tagline.length * TAGLINE_LEADING + 22}" font-family="${WORDMARK_FONT}" font-weight="800" font-size="29" letter-spacing="0.4" fill="${accent}">${xml(meta.players)} · one turn at a time</text>`);
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
        // One per game in the library, from that game's own metadata — no list
        // of games here to fall behind the one in `GAME_META`.
        for (const meta of Object.values(GAME_META)) {
            await write(path.join(ROOT, 'public', gameShareCard(meta.url)), await png(await gameShareCardSvg(meta)));
        }
    } else {
        console.warn(`skipped the share cards — install the "${WORDMARK_FONT}" system font and re-run`);
    }
}

await main();
