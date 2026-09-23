// The generated ground (GDD §3.5): a square grid of area codes over the same
// WORLD_WIDTH × WORLD_HEIGHT coordinate space the world graph already occupies, painted from an
// elevation field — seeded mountain ranges over rolling lowland (§3.7) — plus
// a moisture field carrying those ranges' rain shadow. This is what makes movement cost something observed off the
// ground an edge crosses (§3.5.4) rather than a guess at the nearest node.
//
// Generation order, per §3.5.2: noise → windows → passes → smoothing. The
// windows and the water/river/beach passes only need the landmass; the fields
// pass needs settlement sites to exist first, so it — and the smoothing that
// follows it — runs as a second step once `generateWorld` has placed them.

import { WORLD_AREA_SCALE, coherentNoiseGrid, isLand, landValueAt, noiseLatticeFor, pointDistance, type Landmass, type Point } from "./landmass";
import { placeMountainRanges, rangeElevationGrid, type MountainRange } from "./mountainRanges";
import type { RandomSource } from "./random";
import { BEACH_CODE, FIELDS_CODE, GRASS_CODE, HILLS_CODE, LAND_WINDOW_CODES, OCEAN_CODE, PROVISIONAL_WATER_CODE, RIVER_CODE, elevationFloorOf, windowAreaFor } from "./areas";

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

/** A tile's own centre in world units — shared by every pass that needs to measure distance from a tile rather than just walk its grid position. */
export function tileCentre(col: number, row: number): Point {
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

/** How many times a river may climb out of a hollow on its way to the sea before it gives up and pools there instead. */
const RIVER_MAXIMUM_CLIMBS = 4;

/**
 * Downhill trace (§3.5.2): from high ground, step to the lowest unvisited
 * neighbour until the water's edge, carving a one-tile river. A river caught
 * in a hollow short of the sea spills over its lowest rim a few times, then
 * ends in a small lake rather than looping — a river need not reach the sea on
 * every attempt, and `generateWorld`'s retry loop absorbs a world where the
 * resulting graph can't connect. A source with nowhere lower to go carves
 * nothing at all. `generateBaseTerrainField` asks for rivers in proportion to
 * the mountain ranges (§3.7), so they rise in several places and run to
 * different coasts.
 */
export function runRiverTracePass(codes: string[], elevations: readonly number[], columns: number, rows: number, random: RandomSource, riverCount = Math.round(WORLD_AREA_SCALE)): void {
    const isWater = (index: number): boolean => codes[index] === OCEAN_CODE || codes[index] === PROVISIONAL_WATER_CODE;
    const sources = random.shuffle(elevations.map((elevation, index) => index).filter(index => !isWater(index) && elevations[index] >= 0.6)).slice(0, riverCount);

    for (const source of sources) {
        let current = source;
        let climbs = 0;
        let reachedWater = false;
        const visited = new Set<number>([current]);
        for (let step = 0; step < columns + rows; step++) {
            const neighbours = neighboursOf(current % columns, Math.floor(current / columns), columns, rows);
            if (neighbours.some(isWater)) { reachedWater = true; break; }
            let next: number | undefined;
            for (const neighbour of neighbours) {
                if (!visited.has(neighbour) && (next === undefined || elevations[neighbour] < elevations[next])) next = neighbour;
            }
            const climbing = next !== undefined && elevations[next] >= elevations[current];
            if (next === undefined || (climbing && (current === source || climbs >= RIVER_MAXIMUM_CLIMBS))) break;
            if (climbing) climbs++;
            codes[next] = RIVER_CODE;
            visited.add(next);
            current = next;
        }
        if (!reachedWater && current !== source) poolAt(codes, current % columns, Math.floor(current / columns), columns, rows);
    }
}

/** Where a river gives up short of the sea it spreads into a small lake — the tile it stopped on and the eight around it. */
function poolAt(codes: string[], col: number, row: number, columns: number, rows: number): void {
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            const c = col + dc, r = row + dr;
            if (c >= 0 && c < columns && r >= 0 && r < rows && codes[r * columns + c] !== OCEAN_CODE) codes[r * columns + c] = PROVISIONAL_WATER_CODE;
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
 * The lowlands' own gentle rise and fall (§3.7): mostly below the hills band,
 * now and then just into it, never near a mountain. The noise is shifted per
 * world so that exactly this share of the land rolls up into hills of its own
 * — a fixed offset left that share to the luck of the noise, which swung the
 * hills from a tenth of the land to a fifth between seeds.
 */
const ROLLING_HILLS_SHARE = 0.09;
const LOWLAND_AMPLITUDE = 0.22;
/** How much higher the deep interior sits than the coast — a gentle tilt, so rivers leaving the ranges find their way down to the sea. */
const INLAND_RISE = 0.08;
/** How far the rain shadow looks along the wind for a range, and how much it wets or dries the ground it finds one from. */
const HILLS_FLOOR = elevationFloorOf(HILLS_CODE);
const RAIN_SHADOW_REACH = 24;
const RAIN_SHADOW_STRENGTH = 0.24;
/** The moisture noise, squeezed towards its middle and nudged wetter: more of the lowland reaches the woodland band without as much more reaching marsh. */
const MOISTURE_SPREAD = 0.75;
const MOISTURE_BIAS = 0.01;

/**
 * The rain shadow (§3.7): a range wrings the rain out of the prevailing wind,
 * so the ground with a range downwind of it — the windward side — is wetter,
 * and the ground with one upwind of it — the lee — is drier. Returns, per
 * tile, how much to add to its moisture: the height of the tallest range
 * downwind within reach, less the tallest upwind, both fading with distance.
 * `wind` is the direction the wind blows *towards*, as a unit vector.
 */
export function rainShadow(rangeHeights: readonly number[], columns: number, rows: number, wind: Point): number[] {
    const tiles = RAIN_SHADOW_REACH / TERRAIN_FIELD_TILE_SIZE;
    const heightAt = (col: number, row: number): number => {
        const c = Math.round(col), r = Math.round(row);
        return c < 0 || c >= columns || r < 0 || r >= rows ? 0 : rangeHeights[r * columns + c];
    };
    return rangeHeights.map((_, index) => {
        const col = index % columns, row = Math.floor(index / columns);
        let windward = 0, lee = 0;
        for (let step = 1; step <= tiles; step++) {
            const fade = 1 - (step - 1) / tiles;
            windward = Math.max(windward, heightAt(col + wind.x * step, row + wind.y * step) * fade);
            lee = Math.max(lee, heightAt(col - wind.x * step, row - wind.y * step) * fade);
        }
        return (windward - lee) * RAIN_SHADOW_STRENGTH;
    });
}

/**
 * Everything that only needs the landmass: the elevation/moisture windows,
 * then water-split, river-trace and beach-band. Elevation is its own field
 * (§3.7) — the seeded mountain ranges over a gently rolling lowland — rather
 * than the land mask read a second time, and moisture carries the ranges'
 * rain shadow. Returns the elevation grid alongside the field so anything
 * downstream can read the same samples without recomputing them.
 */
export function generateBaseTerrainField(landmass: Landmass, random: RandomSource): { field: TerrainField; elevations: number[]; ranges: MountainRange[] } {
    const columns = gridColumns(landmass.width);
    const rows = gridRows(landmass.height);
    const lattice = noiseLatticeFor(landmass.width);
    const centres = Array.from({ length: columns * rows }, (_, index) => tileCentre(index % columns, Math.floor(index / columns)));
    const ranges = placeMountainRanges(landmass, random);
    const rangeHeights = rangeElevationGrid(ranges, centres);
    const lowland = coherentNoiseGrid(random, columns, rows, lattice);
    const windAngle = random.between(0, Math.PI * 2);
    const shadow = rainShadow(rangeHeights, columns, rows, { x: Math.cos(windAngle), y: Math.sin(windAngle) });
    const moisture = coherentNoiseGrid(random, columns, rows, lattice);
    const elevations: number[] = [];
    const codes: string[] = [];

    const onLand = centres.map(point => isLand(landmass, point));
    const rolling = centres.map((point, index) => {
        const inland = Math.max(0, Math.min(1, (landValueAt(landmass, point) - landmass.landThreshold) / 0.4));
        return lowland[index] * LOWLAND_AMPLITUDE + inland * INLAND_RISE;
    });
    const landRolling = rolling.filter((_, index) => onLand[index]).sort((a, b) => a - b);
    const hillsLine = landRolling[Math.floor(landRolling.length * (1 - ROLLING_HILLS_SHARE))] ?? 0;
    const lowlandBase = HILLS_FLOOR - hillsLine;

    for (let index = 0; index < centres.length; index++) {
        const elevation = Math.max(rangeHeights[index], lowlandBase + rolling[index]);
        const wetness = 0.5 + (moisture[index] - 0.5) * MOISTURE_SPREAD + MOISTURE_BIAS + shadow[index];
        elevations.push(elevation);
        codes.push(onLand[index] ? windowAreaFor(elevation, wetness).code : PROVISIONAL_WATER_CODE);
    }

    runWaterSplitPass(codes, columns, rows);
    // Three rivers for every two ranges: enough water that a world's lakes and
    // rivers reach their §3.7 band, rising in the ranges rather than one massif.
    runRiverTracePass(codes, elevations, columns, rows, random, Math.max(1, Math.round(ranges.length * 1.5)));
    runBeachPass(codes, columns, rows);
    return { field: { columns, rows, tileSize: TERRAIN_FIELD_TILE_SIZE, codes: codes.join("") }, elevations, ranges };
}

/**
 * The tiles of the largest body of land — the ground every node goes on
 * (§3.7). A warped coast throws off the odd offshore island, and the
 * archipelago preset a whole ring of them; ocean is impassable, so a node on
 * one could never be linked to the rest, and would only burn a retry. Lakes,
 * rivers and beach all count as part of the land they sit in, because a
 * crossing can take a route over the first two.
 */
export function mainlandOf(field: TerrainField): (point: Point) => boolean {
    const component = new Int32Array(field.codes.length).fill(-1);
    const sizes: number[] = [];
    for (let start = 0; start < field.codes.length; start++) {
        if (component[start] !== -1 || field.codes[start] === OCEAN_CODE) continue;
        const id = sizes.length;
        const queue = [start];
        component[start] = id;
        for (let head = 0; head < queue.length; head++) {
            const index = queue[head];
            for (const neighbour of neighboursOf(index % field.columns, Math.floor(index / field.columns), field.columns, field.rows)) {
                if (component[neighbour] !== -1 || field.codes[neighbour] === OCEAN_CODE) continue;
                component[neighbour] = id;
                queue.push(neighbour);
            }
        }
        sizes.push(queue.length);
    }
    const largest = sizes.indexOf(Math.max(...sizes));
    return point => {
        const { col, row } = tileAt(field, point);
        return component[tileIndex(field, col, row)] === largest;
    };
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
