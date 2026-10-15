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

import { FACING_COUNT, FULL_HEIGHT, TERRAIN, type Facing, type TerrainLetter } from "@/utils/games/battlefield/terrain";
import { ISO_HALF_HEIGHT, ISO_HALF_WIDTH, ISO_STEP, type IsoRotation } from "@/utils/ui/isometric";
import { EFFECT_IDS, ITEM_IDS, type CharacterId, type ItemId } from "./characters";
import { CHARACTER_IDS } from "./roster";

export const ART_SHEETS = {
    /** Grass, rock, water and trees. */
    outdoors: { href: "/art/realmarena/outdoors.png", width: 640, height: 1024 },
    /** Brick walls, battlements and rubble. */
    walls: { href: "/art/realmarena/walls.png", width: 512, height: 1024 },
    /**
     * The status effects' marks (§20.2), one `MARK_PX` badge a cell in a
     * row, in `EFFECT_IDS` order, then the watch's (§13.4). Rendered from its SVG master,
     * `art-masters/realmarena/effects.svg`, by `npm run ra-marks`.
     */
    effects: { href: "/art/realmarena/effects.png", width: 768, height: 96 },
    /**
     * The items (§21.2), one `MARK_PX` badge a cell in `ITEM_IDS` order, and
     * then the smoke pot's cloud. Rendered from `art-masters/realmarena/items.svg`
     * by `npm run ra-marks`.
     */
    items: { href: "/art/realmarena/items.png", width: 480, height: 96 },
    /**
     * Scorched ground (§22): three kinds of what low cover leaves once it's
     * blasted away, a terrain cell each. Rendered from
     * `art-masters/realmarena/scorched.svg` by `npm run ra-marks`.
     */
    scorched: { href: "/art/realmarena/scorched.png", width: 192, height: 64 },
    /**
     * The battle visuals (§26): what flies, a `MARK_PX` cell each in
     * `MISSILE_IDS` order, then a strike's slash; under them the bursts, two
     * cells wide. Rendered from `art-masters/realmarena/fx.svg` by
     * `npm run ra-marks`.
     */
    fx: { href: "/art/realmarena/fx.png", width: 864, height: 192 },
    /**
     * The characters (`CHARACTER_ART`): every one in every pose, from all eight
     * facings. Rendered from the models in `art-masters/realmarena/characters`
     * by `npm run ra-characters`.
     */
    characters: { href: "/art/realmarena/characters.png", width: 1024, height: 5120 },
    /** The owner's colour on the characters, grey and shaded, cell for cell with `characters`: tinted per seat. */
    charactersTeam: { href: "/art/realmarena/characters-team.png", width: 1024, height: 5120 },
} as const;

export type ArtSheet = keyof typeof ART_SHEETS;

/** The characters' models as data, which the 3D board builds its figures from (three/characterModels.ts). Written by `npm run ra-characters`. */
export const CHARACTER_MODELS_HREF = "/art/realmarena/characters.json";

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
    /** The width of a square's diamond on its sheet, where it isn't `TILE_PX`: the characters are drawn at twice it. */
    tile?: number;
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
/** Blackened earth, ash and a few chips of brick: low cover blasted away, lying flat on the ground. */
const SCORCHED = [0, 1, 2].map(col => cell("scorched", col, 0));

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
 * first (`GRASS`). Scorched ground is drawn over that grass, a square at a
 * time, since it's only ever where low cover was (§22). Heights come from the
 * rules' own `TERRAIN`, so a tower drawn here is as tall as the tower the
 * rules play.
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
    "_": [{ sprites: SCORCHED, at: 0 }],
};

/**
 * What the 3D board skins a raised block with, cut from the same sheets as
 * `TERRAIN_ART`: a plain face of brick for its sides — the brick column, three
 * heights of it — and the top it is capped with: paved with the same brick
 * (the column's own top is a hollow tower mouth) or, for the tower's stair and
 * top, the grassed rock they are floored with. Trees are
 * built from primitives, and open and scorched ground are the ground's.
 */
export const BLOCK_SKIN: Readonly<Partial<Record<TerrainLetter, { side: Sprite; top?: Sprite }>>> = {
    ",": { side: BRICK_COLUMN },
    "o": { side: BRICK_COLUMN },
    "#": { side: BRICK_COLUMN },
    "P": { side: BRICK_COLUMN },
    "s": { side: BRICK_COLUMN, top: MOSSY_ROCK },
    "^": { side: BRICK_COLUMN, top: MOSSY_ROCK },
};

const LAYERS = Object.values(TERRAIN_ART).flat();

/** The width and height of an effect's or an item's mark on its sheet. */
const MARK_PX = 96;

const mark = (sheet: ArtSheet, index: number): Sprite => ({ sheet, x: index * MARK_PX, y: 0, width: MARK_PX, height: MARK_PX });

/** One mark for each of `ids`, cut left to right along a row of `sheet`. */
const marks = <Id extends string>(sheet: ArtSheet, ids: readonly Id[]) =>
    Object.fromEntries(ids.map((id, index) => [id, mark(sheet, index)])) as Readonly<Record<Id, Sprite>>;

/** The mark a figure wears for each effect on it (§20.2), and its box beside the effect's name. */
export const EFFECT_ART = marks("effects", EFFECT_IDS);

/** The mark a figure on watch wears (§13.4), AP banked for overwatch or guard: after the effects' on their sheet, and in their column. */
export const WATCH_ART = mark("effects", EFFECT_IDS.length);

/** Each item's mark (§21.2): by the shoulder of a figure carrying it, and beside its name wherever it's named. */
export const ITEM_ART = marks("items", ITEM_IDS);

/**
 * A puff of the smoke pot's cloud (§21.2), drawn over each square the cloud
 * covers: its foot is along its cell's bottom edge, like a terrain sprite's.
 */
export const SMOKE_ART = mark("items", ITEM_IDS.length);

/** Something thrown: never the draught, which is drunk. */
export type ThrownItem = Exclude<ItemId, "healingDraught">;

/** What flies (§26.1): the Archer's arrow, the Mage's bolt and fireball, a thrown flask or pot, the Spitter's acid and the Sapper's dynamite. */
export type Missile = "arrow" | "bolt" | "fireball" | ThrownItem | "acid" | "dynamite";

/** What a burst looks like (§26.1): the fireball's and the fire flask's flame, the thunder flask's flash, the smoke pot's puff, the Bloater's acid, dynamite's blast. */
export type BurstKind = "fire" | "thunder" | "smoke" | "acid" | "blast";

/** The order what flies is drawn in along the top of the fx sheet. */
const MISSILE_IDS: readonly Missile[] = ["arrow", "bolt", "fireball", "fireFlask", "thunderFlask", "smokePot", "acid", "dynamite"];

/**
 * Each missile as it flies (§26.1). An arrow, a bolt or a fireball points
 * right, its front at its cell's right edge, for the board to turn along its
 * flight; a flask, a pot or a stick of dynamite is upright in its cell, to tumble.
 */
export const MISSILE_ART = marks("fx", MISSILE_IDS);

/** A melee strike's slash across its target (§26.1). */
export const SLASH_ART = mark("fx", MISSILE_IDS.length);

/**
 * Each burst (§26.1), lying flat on the ground, twice as wide as it's deep:
 * the board stretches it over the square or the 3×3 it went off on. The
 * smoke pot's is its cloud.
 */
export const BURST_ART: Readonly<Record<BurstKind, Sprite>> = {
    fire: { sheet: "fx", x: 0, y: MARK_PX, width: 2 * MARK_PX, height: MARK_PX },
    thunder: { sheet: "fx", x: 2 * MARK_PX, y: MARK_PX, width: 2 * MARK_PX, height: MARK_PX },
    acid: { sheet: "fx", x: 4 * MARK_PX, y: MARK_PX, width: 2 * MARK_PX, height: MARK_PX },
    blast: { sheet: "fx", x: 6 * MARK_PX, y: MARK_PX, width: 2 * MARK_PX, height: MARK_PX },
    smoke: SMOKE_ART,
};

/** The poses a character is drawn in, in the order their rows come down the characters' sheet. */
export const CHARACTER_POSES = ["standing", "fallen"] as const;

export type CharacterPose = typeof CHARACTER_POSES[number];

/** A character's cell: a square's diamond twice the tile sheets' across, so a figure stays sharp zoomed in, and room above it for what it holds up. */
export const CHARACTER_CELL = { tile: 2 * TILE_PX, width: 2 * TILE_PX, height: 160 } as const;

/** One character in one pose: its figure from each facing, in `Facing` order as the board is drawn, and the owner's colour on each. */
export interface CharacterArt {
    body: readonly Sprite[];
    team: readonly Sprite[];
}

/** A row of a character sheet's cells, one a facing. */
const characterCells = (sheet: ArtSheet, row: number) => Array.from({ length: FACING_COUNT }, (_, facing): Sprite => ({
    sheet, x: facing * CHARACTER_CELL.width, y: row * CHARACTER_CELL.height,
    width: CHARACTER_CELL.width, height: CHARACTER_CELL.height, tile: CHARACTER_CELL.tile,
}));

/**
 * Every character in every pose (`CHARACTER_POSES`): a row of the
 * characters' sheet each — every character standing, in `CHARACTERS` order,
 * then every one fallen — and a cell a facing along it. The team sheet
 * holds the owner's colour in the same cells.
 */
export const CHARACTER_ART = Object.fromEntries(CHARACTER_IDS.map((character, index) => {
    const poses = {} as Record<CharacterPose, CharacterArt>;
    CHARACTER_POSES.forEach((pose, p) => {
        const row = p * CHARACTER_IDS.length + index;
        poses[pose] = { body: characterCells("characters", row), team: characterCells("charactersTeam", row) };
    });
    return [character, poses];
})) as Readonly<Record<CharacterId, Readonly<Record<CharacterPose, CharacterArt>>>>;

/**
 * Which of a character's cells a figure facing `facing` on the grid is drawn
 * with, on a board turned `rotation` quarters: the cells go round as the
 * facings do, and a quarter turn of the board is two of them.
 */
export function facingCell(facing: Facing, rotation: IsoRotation): number {
    return (facing + 2 * rotation) % FACING_COUNT;
}

/** Every sprite the board draws, once each, by the number it defines it under up front. */
export const SPRITES: ReadonlyMap<Sprite, number> = new Map(
    [...new Set([
        ...GRASS, ...LAYERS.flatMap(layer => layer.sprites), ...Object.values(EFFECT_ART), WATCH_ART, ...Object.values(ITEM_ART), SMOKE_ART,
        ...Object.values(MISSILE_ART), SLASH_ART, ...Object.values(BURST_ART),
        ...Object.values(CHARACTER_ART).flatMap(poses => Object.values(poses).flatMap(art => [...art.body, ...art.team])),
    ])].map((sprite, index) => [sprite, index]),
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
    const tile = sprite.tile ?? TILE_PX;
    const scale = TILE_SCALE * (TILE_PX / tile) * (layer.scale ?? 1);
    // The footprint's middle — a quarter of a diamond's width above the
    // cell's foot — goes on the middle of the square, so a sprite drawn
    // smaller still stands where it did.
    const middle = ISO_HALF_HEIGHT - foot * ISO_STEP;
    return {
        x: -(sprite.width / 2) * scale,
        y: middle - (sprite.height - tile / 4) * scale,
        width: sprite.width * scale,
        height: sprite.height * scale,
    };
}
