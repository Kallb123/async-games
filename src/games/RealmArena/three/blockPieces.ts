// What a raised square is built of in 3D (terrain3d.ts), as boxes: pure, so it's tested without a GPU.
//
// The isometric board draws its low cover as heaps of loose brick and its walls
// as crenellated courses, and a single box is neither. So a heap of rubble or a
// broken wall is a handful of chunks of different heights, each turned a little,
// and a wall or parapet is a box with a merlon or two along each edge that
// borders lower ground. Every piece carries its own skin (a flip, a drop and a
// slide across the side texture) so a run of squares isn't one picture repeated
// — the hedge's and the cottage's: the castle's stone is laid on by where it
// stands instead, and has no seam to hide (`stoneTexture`).

import { variantOf } from "@/games/RealmArena/art";
import { terrainLetter } from "@/games/RealmArena/ui";
import { groundOf, squareAt, type Battlefield, type Square, type TerrainLetter } from "@/utils/games/battlefield/terrain";
import { QUARTER } from "./iso3d";

/** One box of a block: its corner nearest the origin and its size in world units, turned `turn` radians about its own middle. */
export interface Piece {
    x: number; y: number; z: number;
    sx: number; sy: number; sz: number;
    turn: number;
    /** The side texture drawn mirrored. */
    flip: boolean;
    /** How far down the side texture the piece starts, a whole number of quarters, so the courses of brick line up as they were drawn. */
    drop: number;
    /** How far along the texture a piece narrower than it starts. */
    slide: number;
}

/** The terrains drawn as a heap of chunks, and how many chunks. */
const HEAPS: Partial<Record<TerrainLetter, number>> = { ",": 4, "o": 4 };
/** The terrains with merlons along their open edges. */
const BATTLEMENTED: ReadonlySet<TerrainLetter> = new Set(["#", "P"]);

/** The merlons' size: along the edge, in from it and up, in world units. */
const MERLON = { length: 0.22, depth: 0.2, rise: 1.2 * QUARTER };
/** Where along an edge the two merlons start, clear of the corners (a merlon on each edge would meet in them). */
const MERLON_AT = [0.2, 0.58];

/** A repeatable pseudo-random 0–1, per square, piece and use. */
const chance = (square: Square, piece: number, use: number) => variantOf(square * 31 + piece * 7 + use, 1000) / 1000;

/** A piece standing on the ground's `x`, `z` with a skin picked from the square: `rows` is how tall the side texture's picture is. */
function piece(square: Square, index: number, rows: number, at: Pick<Piece, "x" | "y" | "z" | "sx" | "sy" | "sz" | "turn">): Piece {
    const slack = Math.max(0, Math.floor((rows - at.sy) / QUARTER));
    return {
        ...at,
        flip: chance(square, index, 1) > 0.5,
        drop: Math.floor(chance(square, index, 2) * (slack + 1)) * QUARTER,
        slide: chance(square, index, 3) * Math.max(0, 1 - Math.min(at.sx, at.sz)),
    };
}

/** The pieces that make up the raised square `square` of `field`, which is not a tree. `rows` is how tall the side texture's picture is. */
export function piecesOf(field: Battlefield, square: Square, rows: number): Piece[] {
    const letter = terrainLetter(field, square);
    const col = square % field.width, row = Math.floor(square / field.width);
    // Standing on the ground under it, which a plinth of its own raises where the map does (`groundFaces`).
    const foot = groundOf(field, square) * QUARTER;
    const height = Math.max(field.tiles[square].terrain.height * QUARTER, 0.02);
    const heap = HEAPS[letter];
    if (heap) {
        // One chunk to a quarter of the square, one of them standing the full height and the rest lower, each nudged and turned.
        const tallest = Math.floor(chance(square, 0, 0) * heap);
        return Array.from({ length: heap }, (_, index) => {
            const sx = 0.34 + 0.14 * chance(square, index, 4), sz = 0.34 + 0.14 * chance(square, index, 5);
            const sy = index === tallest ? height : height * (0.4 + 0.5 * chance(square, index, 6));
            const cx = (index % 2) * 0.5 + 0.25 + (chance(square, index, 7) - 0.5) * 0.1;
            const cz = Math.floor(index / 2) * 0.5 + 0.25 + (chance(square, index, 8) - 0.5) * 0.1;
            return piece(square, index, rows, { x: col + cx - sx / 2, y: foot, z: row + cz - sz / 2, sx, sy, sz, turn: (chance(square, index, 9) - 0.5) * 0.8 });
        });
    }
    const pieces = [piece(square, 0, rows, { x: col, y: foot, z: row, sx: 1, sy: height, sz: 1, turn: 0 })];
    if (!BATTLEMENTED.has(letter)) return pieces;
    // Along each edge that borders lower ground (or the map's edge), two merlons on top.
    const lower = (dc: number, dr: number) => {
        const next = squareAt(field, col + dc, row + dr);
        return next === undefined || field.tiles[next].elevation < field.tiles[square].elevation;
    };
    const edges: [number, number, boolean][] = [[0, -1, true], [0, 1, true], [-1, 0, false], [1, 0, false]];
    for (const [dc, dr, alongX] of edges) {
        if (!lower(dc, dr)) continue;
        for (const start of MERLON_AT) {
            const sx = alongX ? MERLON.length : MERLON.depth, sz = alongX ? MERLON.depth : MERLON.length;
            const x = col + (alongX ? start : dc < 0 ? 0 : 1 - MERLON.depth), z = row + (alongX ? (dr < 0 ? 0 : 1 - MERLON.depth) : start);
            pieces.push(piece(square, pieces.length, rows, { x, y: foot + height, z, sx, sy: MERLON.rise, sz, turn: 0 }));
        }
    }
    return pieces;
}

/** Where a piece's matrix puts a unit box's corner, so that the piece turns about its own middle. */
export function pieceCorner(p: Piece): [number, number, number] {
    const [c, s] = [Math.cos(p.turn), Math.sin(p.turn)];
    const [hx, hz] = [p.sx / 2, p.sz / 2];
    return [p.x + hx - (hx * c + hz * s), p.y, p.z + hz - (-hx * s + hz * c)];
}
