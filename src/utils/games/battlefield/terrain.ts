// The ground a squad battle is fought over (docs/games/realm-arena.md §13.1,
// §25): a grid of squares, each holding one kind of terrain at a height, so a
// map is a plain grid of letters to draw by hand, with an optional grid of
// ground levels under it for anything that isn't flat. Game-agnostic, like
// DiceRoll.ts and Cards.ts — Defender of the Realm is committed to fighting on
// the same ground (realm-arena.md §10, §17.1) — and pure, so the server's
// rules and the board's tap-to-move shading read the same numbers.
//
// Heights are whole quarters of a full height — a character's own — so a
// height is always a whole number, and what it means is plain: a step up of a
// quarter is nothing, half or three quarters is a climb and half cover, and a
// full height is a wall.

/** The cover a square gives a character standing next to it, or a character has against one attacker. */
export type Cover = "none" | "half" | "full";

/** A full height — a character's own — in quarters: the unit every height on a battlefield is counted in. */
export const FULL_HEIGHT = 4;
/** Half a height: the least that's a climb, gives cover, or is the high ground. */
export const HALF_HEIGHT = FULL_HEIGHT / 2;

export interface Terrain {
    name: string;
    /**
     * Movement points to step onto the square orthogonally, before any climb
     * (`pathfinding.ts`); a diagonal step costs 1.5 times as much. `Infinity`
     * where nothing can enter it. Always a whole number of at least 1, which
     * keeps every path's cost a whole number of half-points and every step at
     * least two of them (the search in `pathfinding.ts` relies on both).
     */
    moveCost: number;
    /** Whether a move may end here. Low cover is climbed over, never stood on (§11.6, answer 1). */
    standable: boolean;
    /** How high it stands above the ground it's on, in quarters (`FULL_HEIGHT`). */
    height: number;
    /**
     * Cover it gives a character next to it whatever the heights: trees hide
     * a character however tall they are. Everything else's cover comes from
     * how far it rises above the character (`coverOfRise`).
     */
    cover: Cover;
    /** Whether it blocks sight whatever the heights, as trees do. Everything else blocks it by standing a full height above both ends (`lineOfSight.ts`). */
    blocksSight: boolean;
    /** A stair: a step onto or off it is never a climb, by as much as its own height (`pathfinding.ts`). */
    stairs?: true;
}

const OPEN: Terrain = { name: "Open ground", moveCost: 1, standable: true, height: 0, cover: "none", blocksSight: false };
const LOW_COVER: Omit<Terrain, "name" | "height"> = { moveCost: 1, standable: false, cover: "none", blocksSight: false };

/**
 * Every terrain, by the letter a map draws it with. Letters that play the same
 * are still told apart — a wall and a tree block alike but aren't drawn alike.
 * Low cover gives half cover, and a wall full, by its height alone; climbing
 * onto either costs what any climb does.
 */
export const TERRAIN = {
    ".": OPEN,
    ",": { name: "Rubble", ...LOW_COVER, height: 2 },
    "o": { name: "Low wall", ...LOW_COVER, height: 3 },
    "T": { name: "Trees", moveCost: Infinity, standable: false, height: 6, cover: "full", blocksSight: true },
    "#": { name: "Wall", moveCost: Infinity, standable: false, height: FULL_HEIGHT, cover: "none", blocksSight: false },
    "s": { ...OPEN, name: "Tower stair", moveCost: 2, height: 3, stairs: true },
    "^": { ...OPEN, name: "Tower top", height: 6 },
} as const satisfies Record<string, Terrain>;

export type TerrainLetter = keyof typeof TERRAIN;

/** One square of a battlefield: everything known about it. */
export interface Tile {
    terrain: Terrain;
    /** The top of the square, in quarters: the ground it's on and whatever stands on that. */
    elevation: number;
}

/** The cover a square gives a character next to it by rising above it: none for a quarter, half for a half or three quarters, full for a full height. */
export function coverOfRise(rise: number): Cover {
    return rise >= FULL_HEIGHT ? "full" : rise >= HALF_HEIGHT ? "half" : "none";
}

/** Whether a square stands a full height above both of two others: a wall between them, to see past or cut a corner by. */
export function towersOver(field: Battlefield, square: Square, a: Square, b: Square): boolean {
    return field.tiles[square].elevation >= Math.max(field.tiles[a].elevation, field.tiles[b].elevation) + FULL_HEIGHT;
}

/** How much higher one square's top is than another's, in quarters; below it, negative. */
export function riseOf(field: Battlefield, square: Square, above: Square): number {
    return field.tiles[square].elevation - field.tiles[above].elevation;
}

/** A rectangle of squares, by its top-left square and its size. */
export interface Area {
    col: number;
    row: number;
    width: number;
    height: number;
}

/**
 * A battlefield as it's written down: what a map file exports, and — being
 * plain data — what a generated map would store. Each kind of fact about a
 * square is its own layer, a string per row with a character per square,
 * rather than an object per square: a layer can be read and drawn by hand,
 * and a new fact about squares is a new optional layer, read into a new
 * field of `Tile`.
 */
export interface BattlefieldMap {
    name: string;
    /** The terrain: one string per row, top first; one `TERRAIN` letter per square. */
    rows: readonly string[];
    /**
     * The ground each square's terrain stands on, in quarters, as one base-36
     * digit per square (`0`–`9`, then `a`–`z`), in rows like `rows`. Left out,
     * the map is flat. A square's top is its ground plus its terrain's height.
     */
    elevation?: readonly string[];
    /** Where each seat's squad musters, in seat order. Every square in one must be standable. */
    deployments: readonly Area[];
    /** The named areas a mission scores, e.g. the centre of Hold the Centre (§13.7). */
    objectives: Readonly<Record<string, Area>>;
}

/** A square, by its index: `row * width + col`. A plain number, so it keys a Set and persists as itself. */
export type Square = number;

/** A map read into the form every other battlefield function takes. */
export interface Battlefield {
    name: string;
    width: number;
    height: number;
    /** Each square, by `Square`. */
    tiles: readonly Tile[];
    deployments: readonly (readonly Square[])[];
    objectives: Readonly<Record<string, readonly Square[]>>;
}

/**
 * Reads a map, and throws on anything a hand-drawn grid can get wrong: a
 * ragged row, an unknown letter or ground level, an elevation layer of
 * another size, an area off the edge, or a deployment square nobody could
 * stand on. Call it once, at module load, so a bad map fails the
 * first test that touches it.
 */
export function buildBattlefield(map: BattlefieldMap): Battlefield {
    const height = map.rows.length;
    const width = map.rows[0]?.length ?? 0;
    if (width === 0) throw new Error(`${map.name}: a battlefield needs at least one square`);

    if (map.elevation && map.elevation.length !== height) throw new Error(`${map.name}: the elevation has ${map.elevation.length} rows, not ${height}`);
    const tiles = map.rows.flatMap((row, r) => {
        if (row.length !== width) throw new Error(`${map.name}: row ${r} is ${row.length} squares wide, not ${width}`);
        const levels = map.elevation?.[r] ?? "0".repeat(width);
        if (levels.length !== width) throw new Error(`${map.name}: elevation row ${r} is ${levels.length} squares wide, not ${width}`);
        return [...row].map((letter, c): Tile => {
            if (!Object.hasOwn(TERRAIN, letter)) throw new Error(`${map.name}: unknown terrain "${letter}" at column ${c}, row ${r}`);
            const ground = /^[0-9a-z]$/.test(levels[c]) ? parseInt(levels[c], 36) : NaN;
            if (Number.isNaN(ground)) throw new Error(`${map.name}: unknown ground level "${levels[c]}" at column ${c}, row ${r}`);
            const terrain: Terrain = TERRAIN[letter as TerrainLetter];
            return { terrain, elevation: ground + terrain.height };
        });
    });

    const squaresIn = (area: Area, label: string): Square[] => {
        const { col, row, width: w, height: h } = area;
        if (![col, row, w, h].every(Number.isInteger) || col < 0 || row < 0 || w < 1 || h < 1 || col + w > width || row + h > height) {
            throw new Error(`${map.name}: ${label} doesn't fit on the map`);
        }
        return Array.from({ length: w * h }, (_, i) => (row + Math.floor(i / w)) * width + col + (i % w));
    };

    const deployments = map.deployments.map((area, seat) => {
        const squares = squaresIn(area, `deployment ${seat}`);
        if (squares.some(square => !tiles[square].terrain.standable)) throw new Error(`${map.name}: deployment ${seat} has a square nobody can stand on`);
        return squares;
    });
    const objectives = Object.fromEntries(Object.entries(map.objectives).map(([id, area]) => {
        const squares = squaresIn(area, `objective "${id}"`);
        if (!squares.some(square => tiles[square].terrain.standable)) throw new Error(`${map.name}: objective "${id}" has nowhere to stand`);
        return [id, squares];
    }));

    return { name: map.name, width, height, tiles, deployments, objectives };
}

/** The square at a column and row, or undefined off the map. */
export function squareAt(field: Pick<Battlefield, "width" | "height">, col: number, row: number): Square | undefined {
    return col >= 0 && row >= 0 && col < field.width && row < field.height ? row * field.width + col : undefined;
}

export function coordsOf(field: Pick<Battlefield, "width">, square: Square): { col: number; row: number } {
    return { col: square % field.width, row: Math.floor(square / field.width) };
}

/** Whether two squares touch, along a side or at a corner. */
export function isNeighbour(field: Pick<Battlefield, "width">, a: Square, b: Square): boolean {
    const one = coordsOf(field, a), other = coordsOf(field, b);
    return Math.max(Math.abs(one.col - other.col), Math.abs(one.row - other.row)) === 1;
}

/**
 * How far apart two squares' centres are, in squares, as the crow flies — so
 * a range of 10 reaches out in a circle, not a square. What a weapon's range
 * and an ability's reach are measured in.
 */
export function distance(field: Pick<Battlefield, "width">, a: Square, b: Square): number {
    const one = coordsOf(field, a), other = coordsOf(field, b);
    return Math.hypot(one.col - other.col, one.row - other.row);
}
