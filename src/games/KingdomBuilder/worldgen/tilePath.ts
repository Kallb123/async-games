// Travel over the tile grid (GDD §3.8): the one pathfinder the generator, the
// fairness score and — from PR 19 — armies all use. Movement is eight-way;
// a step's cost is its length times the average weight of the two tiles it
// joins (half the step is spent in each), so a path costs the same in either
// direction and prices ground exactly as §3.5.4's straight-line walk did — a
// tile's area weight, or the overlay's where one overrides it.

import { areaWeightForCode } from "./areas";
import { overlayCodesByTile, overlayForCode, type OverlayPlacement } from "./overlays";
import type { Point } from "./landmass";
import type { TerrainField } from "./terrainField";

export interface TravelGrid {
    columns: number;
    rows: number;
    tileSize: number;
    /** Each tile's movement weight; `Infinity` where nothing can cross it. */
    weights: Float64Array;
    /** Tiles a diagonal step may not slip past the corner of. Defaults to the impassable ones. */
    cornerBlocked: Uint8Array;
}

export interface TilePath {
    /** Every tile from the start to the goal, both included. */
    tiles: number[];
    cost: number;
}

/**
 * One tile's travel weight: the area's own, unless an overlay on it says
 * otherwise — a bridge or ford makes its water crossable at the overlay's
 * multiplier, a road caps the ground's weight at its own. A code the registry
 * doesn't know reads at grass weight (areaForCode's rolling-deploy rule); a
 * field too short for its own dimensions is impassable past its end rather
 * than read as something it isn't.
 */
function tileWeight(code: string | undefined, overlayCode: string | undefined): number {
    if (code === undefined) return Infinity;
    const area = areaWeightForCode(code);
    const movement = overlayCode === undefined ? undefined : overlayForCode(overlayCode)?.movement;
    if (movement?.kind === "passable" && movement.appliesTo.includes(code)) return movement.multiplier;
    if (area === "impassable") return Infinity;
    if (movement?.kind === "weight") return Math.min(area, movement.multiplier);
    return area;
}

/** The grid a search runs over: the field's ground with its overlays applied. */
export function travelGridFor(field: TerrainField, overlays: readonly OverlayPlacement[] = []): TravelGrid {
    const size = field.columns * field.rows;
    const overlayByTile = overlayCodesByTile(overlays);
    const weights = new Float64Array(size);
    const cornerBlocked = new Uint8Array(size);
    for (let tile = 0; tile < size; tile++) {
        weights[tile] = tileWeight(field.codes[tile], overlayByTile.get(tile));
        cornerBlocked[tile] = weights[tile] === Infinity ? 1 : 0;
    }
    return { columns: field.columns, rows: field.rows, tileSize: field.tileSize, weights, cornerBlocked };
}

export function isPassableTile(grid: TravelGrid, tile: number): boolean {
    return Number.isInteger(tile) && tile >= 0 && tile < grid.weights.length && grid.weights[tile] !== Infinity;
}

/** How far, in rings of tiles, a node may be moved to find ground of its own before generation gives up on the attempt. */
const SNAP_SEARCH_RINGS = 8;

/**
 * Stands every point on a tile of its own (§3.8): the one under it when that
 * is passable and free, otherwise the nearest one that is — so a node the
 * noise dropped in a river steps onto its bank. `x`/`y` become the tile's
 * centre. `taken` holds tiles already spoken for and gains each one chosen,
 * so a second call can keep clear of the first's.
 */
export function snapToTiles<T extends Point>(points: readonly T[], grid: TravelGrid, taken: Set<number> = new Set()): (T & { tile: number })[] {
    return points.map(point => {
        const col = Math.max(0, Math.min(grid.columns - 1, Math.floor(point.x / grid.tileSize)));
        const row = Math.max(0, Math.min(grid.rows - 1, Math.floor(point.y / grid.tileSize)));
        const centreOf = (tile: number): Point => ({ x: (tile % grid.columns + 0.5) * grid.tileSize, y: (Math.floor(tile / grid.columns) + 0.5) * grid.tileSize });
        let best: { tile: number; distance: number } | undefined;
        // Rings are square, so the nearest free tile by straight-line distance
        // can sit one ring further out than the first ring with any at all.
        for (let ring = 0; ring <= SNAP_SEARCH_RINGS && (best === undefined || ring <= best.distance / grid.tileSize + 1); ring++) {
            for (let dr = -ring; dr <= ring; dr++) {
                for (let dc = -ring; dc <= ring; dc++) {
                    if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
                    const c = col + dc, r = row + dr;
                    if (c < 0 || c >= grid.columns || r < 0 || r >= grid.rows) continue;
                    const tile = r * grid.columns + c;
                    if (taken.has(tile) || grid.weights[tile] === Infinity) continue;
                    const centre = centreOf(tile);
                    const distance = Math.hypot(centre.x - point.x, centre.y - point.y);
                    if (!best || distance < best.distance) best = { tile, distance };
                }
            }
        }
        if (!best) throw new Error(`No free passable tile near (${point.x.toFixed(1)}, ${point.y.toFixed(1)})`);
        taken.add(best.tile);
        return { ...point, ...centreOf(best.tile), tile: best.tile };
    });
}

const STEPS: readonly (readonly [number, number])[] = [
    [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/**
 * Calls `visit` for every step out of `tile`: onto passable ground, and — for
 * a diagonal — never past the corner of a blocked tile, so an army can't
 * squeeze between two river squares that only touch at a corner.
 */
function forEachStep(grid: TravelGrid, tile: number, visit: (next: number, cost: number) => void): void {
    const col = tile % grid.columns, row = Math.floor(tile / grid.columns);
    for (const [dc, dr] of STEPS) {
        const c = col + dc, r = row + dr;
        if (c < 0 || c >= grid.columns || r < 0 || r >= grid.rows) continue;
        const next = r * grid.columns + c;
        if (grid.weights[next] === Infinity) continue;
        const diagonal = dc !== 0 && dr !== 0;
        if (diagonal && (grid.cornerBlocked[row * grid.columns + c] || grid.cornerBlocked[r * grid.columns + col])) continue;
        visit(next, stepCost(grid, tile, next, diagonal));
    }
}

/** Half the step spent on each tile, at that tile's weight. */
function stepCost(grid: TravelGrid, from: number, to: number, diagonal: boolean): number {
    return (grid.tileSize * (diagonal ? Math.SQRT2 : 1) * (grid.weights[from] + grid.weights[to])) / 2;
}

/**
 * What an already-chosen path costs on `grid` — for a route whose ground has
 * changed under it since it was found, as a road laid along it does.
 */
export function pathCost(grid: TravelGrid, tiles: readonly number[]): number {
    let cost = 0;
    for (let step = 1; step < tiles.length; step++) {
        const from = tiles[step - 1], to = tiles[step];
        const diagonal = from % grid.columns !== to % grid.columns && Math.floor(from / grid.columns) !== Math.floor(to / grid.columns);
        cost += stepCost(grid, from, to, diagonal);
    }
    return cost;
}

/** A binary min-heap of tiles keyed by priority — the frontier both searches below share. */
class TileQueue {
    private readonly tiles: number[] = [];
    private readonly priorities: number[] = [];

    get size(): number {
        return this.tiles.length;
    }

    push(tile: number, priority: number): void {
        let index = this.tiles.length;
        this.tiles.push(tile);
        this.priorities.push(priority);
        while (index > 0) {
            const parent = (index - 1) >> 1;
            if (this.priorities[parent] <= priority) break;
            this.tiles[index] = this.tiles[parent];
            this.priorities[index] = this.priorities[parent];
            index = parent;
        }
        this.tiles[index] = tile;
        this.priorities[index] = priority;
    }

    pop(): number {
        const top = this.tiles[0];
        const lastTile = this.tiles.pop()!;
        const lastPriority = this.priorities.pop()!;
        if (this.tiles.length > 0) {
            let index = 0;
            const length = this.tiles.length;
            while (true) {
                const left = index * 2 + 1, right = left + 1;
                let smallest = index;
                let smallestPriority = lastPriority;
                if (left < length && this.priorities[left] < smallestPriority) { smallest = left; smallestPriority = this.priorities[left]; }
                if (right < length && this.priorities[right] < smallestPriority) smallest = right;
                if (smallest === index) break;
                this.tiles[index] = this.tiles[smallest];
                this.priorities[index] = this.priorities[smallest];
                index = smallest;
            }
            this.tiles[index] = lastTile;
            this.priorities[index] = lastPriority;
        }
        return top;
    }
}

/** The cheapest weight any passable tile carries — what keeps A*'s estimate from ever overshooting. */
function cheapestWeight(grid: TravelGrid): number {
    let cheapest = Infinity;
    for (const weight of grid.weights) if (weight < cheapest) cheapest = weight;
    return cheapest;
}

/**
 * The cheapest path between two tiles (§3.8), by A* with the octile distance
 * times the cheapest weight on the grid as its estimate. Undefined when either
 * end is off the grid or impassable, or no path joins them — an island.
 */
export function findTilePath(grid: TravelGrid, from: number, to: number): TilePath | undefined {
    if (!isPassableTile(grid, from) || !isPassableTile(grid, to)) return undefined;
    const floor = cheapestWeight(grid) * grid.tileSize;
    const goalCol = to % grid.columns, goalRow = Math.floor(to / grid.columns);
    const estimate = (tile: number): number => {
        const dc = Math.abs(tile % grid.columns - goalCol), dr = Math.abs(Math.floor(tile / grid.columns) - goalRow);
        return floor * (Math.max(dc, dr) + (Math.SQRT2 - 1) * Math.min(dc, dr));
    };

    const costs = new Float64Array(grid.weights.length).fill(Infinity);
    const cameFrom = new Int32Array(grid.weights.length).fill(-1);
    const closed = new Uint8Array(grid.weights.length);
    const queue = new TileQueue();
    costs[from] = 0;
    queue.push(from, estimate(from));

    while (queue.size > 0) {
        const tile = queue.pop();
        if (closed[tile]) continue;
        if (tile === to) break;
        closed[tile] = 1;
        forEachStep(grid, tile, (next, stepCost) => {
            const candidate = costs[tile] + stepCost;
            if (candidate >= costs[next]) return;
            costs[next] = candidate;
            cameFrom[next] = tile;
            queue.push(next, candidate + estimate(next));
        });
    }

    if (costs[to] === Infinity) return undefined;
    const tiles = [to];
    while (tiles[tiles.length - 1] !== from) tiles.push(cameFrom[tiles[tiles.length - 1]]);
    return { tiles: tiles.reverse(), cost: costs[to] };
}

/**
 * The flood-fill variant: what it costs to reach every tile from `from`
 * (`Infinity` for anything unreachable, or everything when `from` itself is).
 * `maximumCost` stops the flood at the edge of what the caller cares about —
 * §3.3's fairness score only asks what lies within reach of a start.
 */
export function tileCostsFrom(grid: TravelGrid, from: number, maximumCost = Infinity): Float64Array {
    const costs = new Float64Array(grid.weights.length).fill(Infinity);
    if (!isPassableTile(grid, from)) return costs;
    const closed = new Uint8Array(grid.weights.length);
    const queue = new TileQueue();
    costs[from] = 0;
    queue.push(from, 0);

    while (queue.size > 0) {
        const tile = queue.pop();
        if (closed[tile]) continue;
        closed[tile] = 1;
        forEachStep(grid, tile, (next, stepCost) => {
            const candidate = costs[tile] + stepCost;
            if (candidate > maximumCost || candidate >= costs[next]) return;
            costs[next] = candidate;
            queue.push(next, candidate);
        });
    }
    return costs;
}
