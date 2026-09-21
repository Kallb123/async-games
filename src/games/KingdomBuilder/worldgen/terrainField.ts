// The generated ground (GDD §3.5): a square grid of area codes over the same
// 100×70 coordinate space the world graph already occupies, painted from the
// landmass's own elevation field plus a second, independently generated
// moisture field. This is what makes movement cost something observed off the
// ground an edge crosses (§3.5.4) rather than a guess at the nearest node.
//
// Generation order, per §3.5.2: noise → windows → passes → smoothing. The
// windows and the water/river/beach passes only need the landmass; the fields
// pass needs settlement sites to exist first, so it — and the smoothing that
// follows it — runs as a second step once `generateWorld` has placed them.

import { coherentNoiseGrid, isLand, landValueAt, pointDistance, type Landmass, type Point } from "./landmass";
import type { RandomSource } from "./random";
import { BEACH_CODE, FIELDS_CODE, GRASS_CODE, LAND_WINDOW_CODES, OCEAN_CODE, PROVISIONAL_WATER_CODE, RIVER_CODE, windowAreaFor } from "./areas";

/** A world tile is 2×2 world units of ground, and never changes (§3.5.5). */
export const TERRAIN_FIELD_TILE_SIZE = 2;

export interface TerrainField {
    columns: number;
    rows: number;
    tileSize: number;
    /** One character per tile, row-major — the persisted wire format (§3.5.2). */
    codes: string;
}

const BEACH_ELIGIBLE_CODES = new Set(["g", "w", "s"]);

const gridColumns = (width: number): number => Math.round(width / TERRAIN_FIELD_TILE_SIZE);
const gridRows = (height: number): number => Math.round(height / TERRAIN_FIELD_TILE_SIZE);

function tileCentre(col: number, row: number): Point {
    return { x: col * TERRAIN_FIELD_TILE_SIZE + TERRAIN_FIELD_TILE_SIZE / 2, y: row * TERRAIN_FIELD_TILE_SIZE + TERRAIN_FIELD_TILE_SIZE / 2 };
}

export function tileIndex(field: Pick<TerrainField, "columns">, col: number, row: number): number {
    return row * field.columns + col;
}

export function tileAt(field: TerrainField, point: Point): { col: number; row: number } {
    const col = Math.max(0, Math.min(field.columns - 1, Math.floor(point.x / field.tileSize)));
    const row = Math.max(0, Math.min(field.rows - 1, Math.floor(point.y / field.tileSize)));
    return { col, row };
}

/** The area code under a world point — clamped to the grid, never out of range. */
export function areaCodeAt(field: TerrainField, point: Point): string {
    const { col, row } = tileAt(field, point);
    return field.codes[tileIndex(field, col, row)];
}

function neighboursOf(col: number, row: number, columns: number, rows: number): number[] {
    const candidates: [number, number][] = [[col + 1, row], [col - 1, row], [col, row + 1], [col, row - 1]];
    return candidates.filter(([c, r]) => c >= 0 && c < columns && r >= 0 && r < rows).map(([c, r]) => r * columns + c);
}

/**
 * Border flood fill (§3.5.2's "pass" placement for Ocean and Lake): every
 * provisional water tile reachable from the map's edge becomes ocean;
 * whatever is left enclosed keeps the lake code it already carries.
 */
export function runWaterSplitPass(codes: string[], columns: number, rows: number): void {
    const queue: number[] = [];
    const queued = new Uint8Array(columns * rows);
    const enqueue = (col: number, row: number): void => {
        if (col < 0 || col >= columns || row < 0 || row >= rows) return;
        const index = row * columns + col;
        if (queued[index] || codes[index] !== PROVISIONAL_WATER_CODE) return;
        queued[index] = 1;
        queue.push(index);
    };
    for (let col = 0; col < columns; col++) { enqueue(col, 0); enqueue(col, rows - 1); }
    for (let row = 0; row < rows; row++) { enqueue(0, row); enqueue(columns - 1, row); }

    for (let head = 0; head < queue.length; head++) {
        const index = queue[head];
        codes[index] = OCEAN_CODE;
        const col = index % columns, row = Math.floor(index / columns);
        for (const neighbour of neighboursOf(col, row, columns, rows)) enqueue(neighbour % columns, Math.floor(neighbour / columns));
    }
}

/**
 * Downhill trace (§3.5.2): from high ground, step to the lowest unvisited
 * neighbour until the water's edge, carving a one-tile river. Gives up on a
 * local minimum on land rather than looping — a river need not reach the sea
 * on every attempt, and `generateWorld`'s retry loop absorbs a world where
 * the resulting graph can't connect.
 */
export function runRiverTracePass(codes: string[], elevations: readonly number[], columns: number, rows: number, random: RandomSource, riverCount = 1): void {
    const isWater = (index: number): boolean => codes[index] === OCEAN_CODE || codes[index] === PROVISIONAL_WATER_CODE;
    const sources = random.shuffle(elevations.map((elevation, index) => index).filter(index => !isWater(index) && elevations[index] >= 0.6)).slice(0, riverCount);

    for (const source of sources) {
        let current = source;
        const visited = new Set<number>([current]);
        for (let step = 0; step < columns + rows; step++) {
            const col = current % columns, row = Math.floor(current / columns);
            const neighbours = neighboursOf(col, row, columns, rows);
            if (neighbours.some(isWater)) break;
            let next: number | undefined;
            let lowest = elevations[current];
            for (const neighbour of neighbours) {
                if (visited.has(neighbour) || elevations[neighbour] >= lowest) continue;
                lowest = elevations[neighbour];
                next = neighbour;
            }
            if (next === undefined) break;
            codes[next] = RIVER_CODE;
            visited.add(next);
            current = next;
        }
    }
}

/** Shore band (§3.5.2): the land tiles touching ocean become beach — a derived label, not a noise window. */
export function runBeachPass(codes: string[], columns: number, rows: number): void {
    const original = [...codes];
    for (let index = 0; index < codes.length; index++) {
        if (!BEACH_ELIGIBLE_CODES.has(original[index])) continue;
        const col = index % columns, row = Math.floor(index / columns);
        if (neighboursOf(col, row, columns, rows).some(neighbour => original[neighbour] === OCEAN_CODE)) codes[index] = BEACH_CODE;
    }
}

/** Fields radius (§3.5.2): grass within a short walk of an occupied or barbarian site — run only once sites are known. */
export function runFieldsPass(codes: string[], columns: number, rows: number, sites: readonly Point[], radius = 6): void {
    for (let index = 0; index < codes.length; index++) {
        if (codes[index] !== GRASS_CODE) continue;
        const col = index % columns, row = Math.floor(index / columns);
        if (sites.some(site => pointDistance(site, tileCentre(col, row)) <= radius)) codes[index] = FIELDS_CODE;
    }
}

/** A couple of rounds of majority-of-neighbours smoothing, restricted to the elevation windows — one stray mountain tile in a field is noise, not terrain. */
export function runSmoothingPass(codes: string[], columns: number, rows: number, rounds = 2): void {
    for (let round = 0; round < rounds; round++) {
        const next = [...codes];
        for (let index = 0; index < codes.length; index++) {
            if (!LAND_WINDOW_CODES.has(codes[index])) continue;
            const col = index % columns, row = Math.floor(index / columns);
            const counts = new Map<string, number>();
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    if (dr === 0 && dc === 0) continue;
                    const c = col + dc, r = row + dr;
                    if (c < 0 || c >= columns || r < 0 || r >= rows) continue;
                    const neighbourCode = codes[r * columns + c];
                    if (!LAND_WINDOW_CODES.has(neighbourCode)) continue;
                    counts.set(neighbourCode, (counts.get(neighbourCode) ?? 0) + 1);
                }
            }
            let bestCode = codes[index];
            let bestCount = counts.get(bestCode) ?? 0;
            for (const [code, count] of counts) {
                if (count > bestCount) { bestCode = code; bestCount = count; }
            }
            if (bestCode !== codes[index] && bestCount >= 5) next[index] = bestCode;
        }
        codes.splice(0, codes.length, ...next);
    }
}

/**
 * Everything that only needs the landmass: the elevation/moisture windows,
 * then water-split, river-trace and beach-band. Returns the elevation grid
 * alongside the field so terrain-node placement (§3.5.4) can read the same
 * samples without recomputing them.
 */
export function generateBaseTerrainField(landmass: Landmass, random: RandomSource): { field: TerrainField; elevations: number[] } {
    const columns = gridColumns(landmass.width);
    const rows = gridRows(landmass.height);
    const moisture = coherentNoiseGrid(random, columns, rows);
    const elevations: number[] = [];
    const codes: string[] = [];

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < columns; col++) {
            const point = tileCentre(col, row);
            const elevation = landValueAt(landmass, point);
            elevations.push(elevation);
            codes.push(isLand(landmass, point) ? windowAreaFor(elevation, moisture[row * columns + col]).code : PROVISIONAL_WATER_CODE);
        }
    }

    runWaterSplitPass(codes, columns, rows);
    runRiverTracePass(codes, elevations, columns, rows, random);
    runBeachPass(codes, columns, rows);
    return { field: { columns, rows, tileSize: TERRAIN_FIELD_TILE_SIZE, codes: codes.join("") }, elevations };
}

/** The step that needs settlement sites: fields around them, then the smoothing pass that closes generation out. */
export function applySitesToTerrainField(field: TerrainField, sites: readonly Point[]): TerrainField {
    const codes = field.codes.split("");
    runFieldsPass(codes, field.columns, field.rows, sites);
    runSmoothingPass(codes, field.columns, field.rows);
    return { ...field, codes: codes.join("") };
}

export interface TileLineSegment {
    col: number;
    row: number;
    /** How much of the line's length falls inside this tile, in world units. */
    length: number;
}

/**
 * Walks the tiles a straight edge crosses, supercover-style (§3.5.4): every
 * tile the line passes through, with the exact length of line inside each —
 * no diagonal slips between two tiles sharing only a corner.
 */
export function walkTileLine(field: TerrainField, from: Point, to: Point): TileLineSegment[] {
    const segments: TileLineSegment[] = [];
    const x0 = from.x / field.tileSize, y0 = from.y / field.tileSize;
    const x1 = to.x / field.tileSize, y1 = to.y / field.tileSize;
    const dx = x1 - x0, dy = y1 - y0;
    // `t` below is a fraction of the path (0 to 1), invariant to the tile-space
    // scaling; the length each segment contributes is that fraction of the
    // line's real, world-unit length.
    const worldDistance = Math.hypot(to.x - from.x, to.y - from.y);
    if (dx === 0 && dy === 0) return segments;

    let col = Math.max(0, Math.min(field.columns - 1, Math.floor(x0)));
    let row = Math.max(0, Math.min(field.rows - 1, Math.floor(y0)));
    const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
    const tDeltaX = stepX !== 0 ? Math.abs(1 / dx) : Infinity;
    const tDeltaY = stepY !== 0 ? Math.abs(1 / dy) : Infinity;
    let tMaxX = stepX > 0 ? (col + 1 - x0) / dx : stepX < 0 ? (col - x0) / dx : Infinity;
    let tMaxY = stepY > 0 ? (row + 1 - y0) / dy : stepY < 0 ? (row - y0) / dy : Infinity;
    let t = 0;

    for (let guard = 0; guard < field.columns + field.rows + 4; guard++) {
        const nextT = Math.min(tMaxX, tMaxY, 1);
        const segmentLength = (nextT - t) * worldDistance;
        if (segmentLength > 1e-9 && col >= 0 && col < field.columns && row >= 0 && row < field.rows) {
            segments.push({ col, row, length: segmentLength });
        }
        if (nextT >= 1) break;
        if (tMaxX < tMaxY) { col += stepX; tMaxX += tDeltaX; } else { row += stepY; tMaxY += tDeltaY; }
        t = nextT;
    }
    return segments;
}
