// The ground a squad battle is fought over (docs/games/realm-arena.md §13.1):
// a grid of squares, each holding one kind of terrain, so a map is a plain
// grid of letters to draw by hand. Game-agnostic, like DiceRoll.ts and
// Cards.ts — Defender of the Realm is committed to fighting on the same ground
// (realm-arena.md §10, §17.1) — and pure, so the server's rules and the
// board's tap-to-move shading read the same numbers.

/** The cover a square gives a character standing next to it, or a character has against one attacker. */
export type Cover = "none" | "half" | "full";

export interface Terrain {
    name: string;
    /**
     * Movement points to step onto the square orthogonally; a diagonal step
     * costs 1.5 times this (`pathfinding.ts`). `Infinity` where nothing can
     * enter it. Always a whole number of at least 1, which keeps every path's
     * cost a whole number of half-points and every step at least two of them
     * (the search in `pathfinding.ts` relies on both).
     */
    moveCost: number;
    /** Whether a move may end here. Low cover is climbed over, never stood on (§11.6, answer 1). */
    standable: boolean;
    /** What the square gives a character next to it, against an attack from its side (`cover.ts`). */
    cover: Cover;
    blocksSight: boolean;
    /** High ground: a shot from here is easier (§13.3). */
    highGround: boolean;
}

const OPEN: Terrain = { name: "Open ground", moveCost: 1, standable: true, cover: "none", blocksSight: false, highGround: false };
const LOW_COVER: Omit<Terrain, "name"> = { moveCost: 3, standable: false, cover: "half", blocksSight: false, highGround: false };
const HIGH_COVER: Omit<Terrain, "name"> = { moveCost: Infinity, standable: false, cover: "full", blocksSight: true, highGround: false };

/**
 * Every terrain, by the letter a map draws it with. Letters that play the same
 * are still told apart — a wall and a tree block alike but aren't drawn alike.
 */
export const TERRAIN = {
    ".": OPEN,
    ",": { name: "Rubble", ...LOW_COVER },
    "o": { name: "Low wall", ...LOW_COVER },
    "T": { name: "Trees", ...HIGH_COVER },
    "#": { name: "Wall", ...HIGH_COVER },
    "s": { ...OPEN, name: "Tower stair", moveCost: 2 },
    "^": { ...OPEN, name: "Tower top", highGround: true },
} as const satisfies Record<string, Terrain>;

export type TerrainLetter = keyof typeof TERRAIN;

/** A rectangle of squares, by its top-left square and its size. */
export interface Area {
    col: number;
    row: number;
    width: number;
    height: number;
}

/** A battlefield as it's written down: what a map file exports. */
export interface BattlefieldMap {
    name: string;
    /** One string per row, top first; one `TERRAIN` letter per square. */
    rows: readonly string[];
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
    /** Each square's terrain, by `Square`. */
    terrain: readonly Terrain[];
    deployments: readonly (readonly Square[])[];
    objectives: Readonly<Record<string, readonly Square[]>>;
}

/**
 * Reads a map, and throws on anything a hand-drawn grid can get wrong: a
 * ragged row, an unknown letter, an area off the edge, or a deployment square
 * nobody could stand on. Call it once, at module load, so a bad map fails the
 * first test that touches it.
 */
export function buildBattlefield(map: BattlefieldMap): Battlefield {
    const height = map.rows.length;
    const width = map.rows[0]?.length ?? 0;
    if (width === 0) throw new Error(`${map.name}: a battlefield needs at least one square`);

    const terrain = map.rows.flatMap((row, r) => {
        if (row.length !== width) throw new Error(`${map.name}: row ${r} is ${row.length} squares wide, not ${width}`);
        return [...row].map((letter, c) => {
            if (!Object.hasOwn(TERRAIN, letter)) throw new Error(`${map.name}: unknown terrain "${letter}" at column ${c}, row ${r}`);
            return TERRAIN[letter as TerrainLetter];
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
        if (squares.some(square => !terrain[square].standable)) throw new Error(`${map.name}: deployment ${seat} has a square nobody can stand on`);
        return squares;
    });
    const objectives = Object.fromEntries(Object.entries(map.objectives).map(([id, area]) => {
        const squares = squaresIn(area, `objective "${id}"`);
        if (!squares.some(square => terrain[square].standable)) throw new Error(`${map.name}: objective "${id}" has nowhere to stand`);
        return [id, squares];
    }));

    return { name: map.name, width, height, terrain, deployments, objectives };
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
