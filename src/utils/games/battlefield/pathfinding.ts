// Moving over a battlefield (docs/games/realm-arena.md §13.1, §13.2, §25). A
// step onto a square costs its terrain's movement cost, plus `CLIMB_COST`
// when it climbs up or down half a height or more, and 1.5 times all that on a
// diagonal. A step of a quarter is an ordinary one; anything past the mover's
// climb (`DEFAULT_CLIMB`, three quarters) can't be taken at all, except onto
// or off a stair. A diagonal step never cuts past the corner of anything that
// can't be entered, or that stands a full height above both its ends. One
// search gives both the tap-to-move shading (what it costs to stop on every
// square in reach) and the path a tap then takes.
//
// Every cost is a whole number of half-points (terrain.ts), so the search is a
// bucket queue over half-points — exact, with no floating-point ties to break.

import { coordsOf, FULL_HEIGHT, isNeighbour, squareAt, type Battlefield, type Square } from "./terrain";

/** A diagonal step costs this many times the square it lands on. */
export const DIAGONAL_STEP = 1.5;

/** What a climb adds to a step, in movement points: a whole one, so every cost stays a whole number of half-points. */
export const CLIMB_COST = 1;

/** How far up or down a step can climb, in quarters, unless a mover says otherwise: anything short of a full height. */
export const DEFAULT_CLIMB = FULL_HEIGHT - 1;

export interface MoveRules {
    /** How far up or down one step can climb, in quarters: `DEFAULT_CLIMB` unless the mover climbs better. */
    climb?: number;
    /** Squares a move can't enter at all — an enemy's, say. */
    blocked?: ReadonlySet<Square>;
    /** Squares a move may cross but not end on — an ally's, say. */
    occupied?: ReadonlySet<Square>;
}

/** Everywhere one character could stop from where it stands, and the cheapest way to each. */
export interface Reach {
    from: Square;
    /** Movement points to stop on each square; `Infinity` where it can't stop, or can't get there within the budget. */
    costs: Float64Array;
    /** The square each cheapest path steps onto a square from; -1 at the start and wherever the search never reached. */
    cameFrom: Int32Array;
}

export interface Path {
    /** Every square from the start to the end, both included. */
    squares: Square[];
    cost: number;
}

// Orthogonal steps first, so that of two equally cheap paths the one taken
// is the one that looks straighter.
const STEPS: readonly (readonly [number, number])[] = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];

/** Whether anything can step onto a square — which, off the map, nothing can. */
function enterable(field: Battlefield, square: Square | undefined): square is Square {
    return square !== undefined && (field.tiles[square]?.terrain.moveCost ?? Infinity) !== Infinity;
}

/**
 * What one step between neighbouring squares costs, in movement points, or
 * undefined when it can't be taken: onto something that can't be entered, up
 * or down further than `climb` (a stair at either end aside), or diagonally
 * past the corner of something that can't be entered or stands a full height
 * above both ends.
 */
export function stepCost(field: Battlefield, from: Square, to: Square, climb = DEFAULT_CLIMB): number | undefined {
    const start = field.tiles[from];
    if (start === undefined || !enterable(field, to) || !isNeighbour(field, from, to)) return undefined;
    const end = field.tiles[to];
    const drop = Math.abs(end.elevation - start.elevation);
    const stair = start.terrain.stairs || end.terrain.stairs;
    if (drop > climb && !stair) return undefined;
    const cost = end.terrain.moveCost + (drop >= 2 && !stair ? CLIMB_COST : 0);
    const a = coordsOf(field, from), b = coordsOf(field, to);
    if (a.col === b.col || a.row === b.row) return cost;
    const top = Math.max(start.elevation, end.elevation);
    const walls = (corner: Square | undefined) => !enterable(field, corner) || field.tiles[corner].elevation >= top + FULL_HEIGHT;
    return walls(squareAt(field, b.col, a.row)) || walls(squareAt(field, a.col, b.row)) ? undefined : cost * DIAGONAL_STEP;
}

/**
 * Every square a character standing on `from` could stop on for at most
 * `budget` movement points, with the cheapest path to each. The start costs
 * nothing, so it's always in reach.
 */
export function reachFrom(field: Battlefield, from: Square, budget = Infinity, rules: MoveRules = {}): Reach {
    const size = field.tiles.length;
    const halves = new Float64Array(size).fill(Infinity);
    const cameFrom = new Int32Array(size).fill(-1);
    const limit = Math.floor(budget * 2);
    const buckets: Square[][] = [[from]];
    halves[from] = 0;

    for (let cost = 0; cost < buckets.length; cost++) {
        // Every step costs at least a whole point (two halves), so nothing is
        // ever pushed onto the bucket being read.
        for (const square of buckets[cost] ?? []) {
            if (halves[square] !== cost) continue; // reached more cheaply since it was queued
            const here = coordsOf(field, square);
            for (const [dc, dr] of STEPS) {
                const next = squareAt(field, here.col + dc, here.row + dr);
                if (next === undefined || rules.blocked?.has(next)) continue;
                const step = stepCost(field, square, next, rules.climb);
                if (step === undefined) continue;
                const reached = cost + step * 2;
                if (reached > limit || reached >= halves[next]) continue;
                halves[next] = reached;
                cameFrom[next] = square;
                (buckets[reached] ??= []).push(next);
            }
        }
    }

    const costs = halves.map((half, square) =>
        square !== from && (!field.tiles[square].terrain.standable || rules.occupied?.has(square)) ? Infinity : half / 2);
    return { from, costs, cameFrom };
}

/** The cheapest path to a square in reach, or undefined when it isn't. */
export function pathTo(reach: Reach, to: Square): Path | undefined {
    const cost = reach.costs[to];
    if (cost === undefined || cost === Infinity) return undefined;
    const squares = [to];
    while (squares[squares.length - 1] !== reach.from) squares.push(reach.cameFrom[squares[squares.length - 1]]);
    return { squares: squares.reverse(), cost };
}

/**
 * What walking a path costs, step by step, or undefined when any step can't be
 * taken. For checking a path someone else chose — one sent by a client, say —
 * rather than trusting it. Where it ends is the caller's to check.
 */
export function pathCost(field: Battlefield, squares: readonly Square[], climb = DEFAULT_CLIMB): number | undefined {
    let total = 0;
    for (let i = 1; i < squares.length; i++) {
        const step = stepCost(field, squares[i - 1], squares[i], climb);
        if (step === undefined) return undefined;
        total += step;
    }
    return total;
}

/** The cheapest path between two squares, or undefined when there's no way to stop on `to`. */
export function findPath(field: Battlefield, from: Square, to: Square, rules: MoveRules = {}): Path | undefined {
    return pathTo(reachFrom(field, from, Infinity, rules), to);
}
