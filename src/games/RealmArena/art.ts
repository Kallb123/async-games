// The battlefield's tile art (docs/games/realm-arena.md §17.3 PR 9): which
// cell of which sheet each terrain is drawn with, and how it stands on its
// square. Pure data, so the board decides only where a square is and this
// decides what it looks like there.
//
// Both sheets are served whole from `public/art/realmarena` — their untouched
// masters are in `art-masters/realmarena` — and every sprite is a cell of one.
// Every cell follows one convention: a square's footprint is the 2:1 diamond
// 64px across along the cell's foot, so the diamond's front corner is the
// middle of the cell's bottom edge. That's the same diamond the board draws a
// square as (`src/utils/ui/isometric.ts`), so a sprite scaled by
// `TILE_SCALE` lands on its square exactly, and a full height
// (`FULL_HEIGHT`) is 32px of the sheet: the cube the outdoor sheet's blocks
// are drawn as.

import { FULL_HEIGHT, TERRAIN, type TerrainLetter } from "@/utils/games/battlefield/terrain";
import { ISO_HALF_HEIGHT, ISO_HALF_WIDTH, ISO_STEP } from "@/utils/ui/isometric";

export const ART_SHEETS = {
    /** Grass, rock, water and trees. */
    outdoors: { href: "/art/realmarena/outdoors.png", width: 640, height: 1024 },
    /** Brick walls, battlements and rubble. */
    walls: { href: "/art/realmarena/walls.png", width: 512, height: 1024 },
} as const;

export type ArtSheet = keyof typeof ART_SHEETS;

/** The width of a square's diamond on a sheet. */
const TILE_PX = 64;
/** Board units per pixel of a sheet. */
const TILE_SCALE = (2 * ISO_HALF_WIDTH) / TILE_PX;

/** A cell of a sheet, in its pixels. */
export interface Sprite {
    sheet: ArtSheet;
    x: number;
    y: number;
    width: number;
    height: number;
    /**
     * How tall the block it draws stands, in quarters, from its footprint to
     * its top face: what a layer that cuts it down (`ArtLayer.clip`) lines its
     * top up by.
     */
    rise?: number;
}

const cell = (sheet: ArtSheet, col: number, row: number, height = 1, rise?: number): Sprite =>
    ({ sheet, x: col * TILE_PX, y: row * TILE_PX, width: TILE_PX, height: height * TILE_PX, rise });

/** Grass, one diamond a cell: 18 kinds, so open ground is never a visible repeat. */
export const GRASS: readonly Sprite[] = [
    ...[0, 1, 2, 3, 4, 5, 6].map(col => cell("outdoors", col, 0)),
    ...[0, 1, 2, 3, 4, 5, 6, 7].map(col => cell("outdoors", col, 1)),
    ...[0, 1, 2].map(col => cell("outdoors", col, 2)),
];

/** A full-height block of rock with grass grown over its top: the top is what a tower or a stair is floored with. */
const MOSSY_ROCK = cell("outdoors", 1, 7, 1, FULL_HEIGHT);
const TREES = [cell("outdoors", 2, 12, 2), cell("outdoors", 3, 12, 2), cell("outdoors", 2, 14, 2)];
/** A tall square column of brick, three heights and more: cut down to whatever a tower or a stair stands. */
const BRICK_COLUMN = cell("walls", 3, 6, 2, 12);
/** A full height of wall with battlements along the top. */
const BATTLEMENTS = [0, 2].map(col => cell("walls", col, 10, 2));
/** A broken wall a little under a height. */
const LOW_WALLS = [2, 3].map(col => cell("walls", col, 4, 2));
/** A heap of fallen brick. */
const RUBBLE = [5, 6, 7].map(col => cell("walls", col, 6, 2));

/** One sprite standing on a square: one of `sprites`, picked by the square, so a run of one terrain isn't one picture repeated. */
export interface ArtLayer {
    sprites: readonly Sprite[];
    /** How high above the square's ground it stands, in quarters. */
    at: number;
    /**
     * Cut down to this many quarters above `at`: the sprite's top face is
     * lifted to there, and everything of it below `at` is cut away along the
     * square's edges. Left out, the sprite stands on `at` whole.
     */
    clip?: number;
    /** Drawn smaller than the sheet, about the middle of its square. */
    scale?: number;
}

const TOWER = TERRAIN["^"].height;
const STAIR = TERRAIN["s"].height;
/** The parapet's battlements stand on brick a height below its top, so they rise from a tower's floor like the curtain wall's do from the ground. */
const PARAPET_FOOT = TERRAIN["P"].height - FULL_HEIGHT;

/**
 * What each terrain is drawn with, bottom up, standing on its square's
 * ground. Open ground has nothing: the board lays grass over the whole map
 * first (`GRASS`). Heights come from the rules' own `TERRAIN`, so a tower
 * drawn here is as tall as the tower the rules play.
 */
export const TERRAIN_ART: Readonly<Record<TerrainLetter, readonly ArtLayer[]>> = {
    ".": [],
    ",": [{ sprites: RUBBLE, at: 0 }],
    "o": [{ sprites: LOW_WALLS, at: 0 }],
    // A tree is drawn a little under its sheet's size, so its crown stays
    // close to the height that hides a character (§25) rather than a tree
    // twice that.
    "T": [{ sprites: TREES, at: 0, scale: 0.7 }],
    "#": [{ sprites: BATTLEMENTS, at: 0 }],
    "P": [{ sprites: [BRICK_COLUMN], at: 0, clip: PARAPET_FOOT }, { sprites: BATTLEMENTS, at: PARAPET_FOOT }],
    "s": [{ sprites: [BRICK_COLUMN], at: 0, clip: STAIR }, { sprites: [MOSSY_ROCK], at: STAIR, clip: 0 }],
    "^": [{ sprites: [BRICK_COLUMN], at: 0, clip: TOWER }, { sprites: [MOSSY_ROCK], at: TOWER, clip: 0 }],
};

const LAYERS = Object.values(TERRAIN_ART).flat();

/** Every sprite the board draws, once each, by the number it defines it under up front. */
export const SPRITES: ReadonlyMap<Sprite, number> = new Map(
    [...new Set([...GRASS, ...LAYERS.flatMap(layer => layer.sprites)])].map((sprite, index) => [sprite, index]),
);

/** The spans a clipped layer is cut to, as [low, high] quarters above the ground, once each. */
export const CLIPS: readonly (readonly [number, number])[] = (() => {
    const spans = new Map<string, readonly [number, number]>();
    for (const { at, clip } of LAYERS) {
        if (clip !== undefined) spans.set(`${at}:${at + clip}`, [at, at + clip]);
    }
    return [...spans.values()];
})();

/** Which of `count` kinds a square takes: scattered, but always the same for the same square. */
export function variantOf(square: number, count: number): number {
    return (Math.imul(square + 1, 2654435761) >>> 0) % count;
}

/**
 * The grass on a square of open ground. The board tiles a pattern of grass
 * rather than placing a diamond per square, and a pattern repeats; this is
 * the one choice of grass that repeats every six diagonals each way, which
 * holds all 18 kinds once each: the pattern's tile is that period, 3 squares
 * across and 3 down.
 */
export function grassOf(col: number, row: number): Sprite {
    const mod6 = (n: number) => ((n % 6) + 6) % 6;
    return GRASS[mod6(col + row) * 3 + Math.floor(mod6(col - row) / 2)];
}

/** Where a sprite goes, in its square's frame (`isoColumnOutline`): the layer's foot on the square's middle. */
export function spriteBox(sprite: Sprite, layer: Pick<ArtLayer, "at" | "clip" | "scale"> = { at: 0 }): { x: number; y: number; width: number; height: number } {
    const foot = layer.clip === undefined ? layer.at : layer.at + layer.clip - (sprite.rise ?? 0);
    const scale = TILE_SCALE * (layer.scale ?? 1);
    // The footprint's middle — a quarter of a diamond's width above the
    // cell's foot — goes on the middle of the square, so a sprite drawn
    // smaller still stands where it did.
    const middle = ISO_HALF_HEIGHT - foot * ISO_STEP;
    return {
        x: -(sprite.width / 2) * scale,
        y: middle - (sprite.height - TILE_PX / 4) * scale,
        width: sprite.width * scale,
        height: sprite.height * scale,
    };
}
