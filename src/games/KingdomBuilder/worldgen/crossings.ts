// Bridges and fords (GDD §3.8, "Crossings follow the paths"). They used to
// appear wherever a straight edge happened to cross water; with the tiles as
// the travel network a crossing has to exist *before* anything is pathed, so
// this pass runs over the rivers themselves — a bridge at a narrow point every
// so often along each one — and then adds one wherever two neighbouring sites
// would otherwise be forced the long way round. A crossing is just a tile the
// pathfinder can use, so §3.5.3's rule that a derived overlay can't disagree
// with movement holds by construction.

import { RIVER_CODE, areaWeightForCode } from "./areas";
import { pointDistance, type Point } from "./landmass";
import { overlaysCrossing, type OverlayPlacement } from "./overlays";
import { connectedRegions, type TerrainField } from "./terrainField";
import { findTilePath, travelGridFor } from "./tilePath";

/** Tiles along a river between one bridge and the next. */
export const RIVER_CROSSING_SPACING = 12;
/** A route this many times dearer than one with its own crossing gets that crossing. */
export const DETOUR_THRESHOLD = 1.6;
/** How many of its nearest neighbours each site is checked against for a detour. */
const DETOUR_NEIGHBOURS = 3;

/** The longest run of water a single crossing spans, in tiles. */
const MAXIMUM_CROSSING_SPAN = 2;

const inField = (field: TerrainField, col: number, row: number): boolean => col >= 0 && col < field.columns && row >= 0 && row < field.rows;
const isDry = (field: TerrainField, col: number, row: number): boolean =>
    inField(field, col, row) && areaWeightForCode(field.codes[row * field.columns + col]) !== "impassable";

interface CrossingSpan {
    tiles: number[];
    orientation: "ns" | "ew";
}

/**
 * The shortest straight crossing through `tile`, if there is one: the run of
 * water it sits in, north–south or east–west, at most MAXIMUM_CROSSING_SPAN
 * tiles long, every tile of it crossable (river or lake, never sea), with dry
 * ground at both ends. A river traced as a staircase has few straight
 * stretches a single tile wide, so a crossing at a bend spans the bend's two
 * tiles — which is still the narrowest way over it there.
 */
function crossingSpan(field: TerrainField, tile: number): CrossingSpan | undefined {
    const col = tile % field.columns, row = Math.floor(tile / field.columns);
    let best: CrossingSpan | undefined;
    for (const [dc, dr, orientation] of [[0, 1, "ns"], [1, 0, "ew"]] as const) {
        const tiles = [tile];
        let dryEnds = 0;
        for (const direction of [-1, 1]) {
            let c = col + dc * direction, r = row + dr * direction;
            while (tiles.length <= MAXIMUM_CROSSING_SPAN && inField(field, c, r) && !isDry(field, c, r) && overlaysCrossing(field.codes[r * field.columns + c]).length > 0) {
                tiles.push(r * field.columns + c);
                c += dc * direction; r += dr * direction;
            }
            if (isDry(field, c, r)) dryEnds++;
        }
        if (dryEnds === 2 && tiles.length <= MAXIMUM_CROSSING_SPAN && (!best || tiles.length < best.tiles.length)) best = { tiles, orientation };
    }
    return best;
}

/** Each of a river's tiles with how many steps along the river it lies from one of its ends. */
function alongRiver(field: TerrainField, tiles: readonly number[]): { tile: number; distance: number }[] {
    const members = new Set(tiles);
    const neighbours = (tile: number): number[] => {
        const col = tile % field.columns, row = Math.floor(tile / field.columns);
        const found: number[] = [];
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const c = col + dc, r = row + dr;
                if ((dr || dc) && c >= 0 && c < field.columns && r >= 0 && r < field.rows && members.has(r * field.columns + c)) found.push(r * field.columns + c);
            }
        }
        return found;
    };
    // An end is a tile with the fewest river neighbours — a source or a mouth.
    const end = tiles.reduce((best, tile) => (neighbours(tile).length < neighbours(best).length ? tile : best));
    const distance = new Map([[end, 0]]);
    const queue = [end];
    for (let head = 0; head < queue.length; head++) {
        for (const next of neighbours(queue[head])) {
            if (distance.has(next)) continue;
            distance.set(next, distance.get(queue[head])! + 1);
            queue.push(next);
        }
    }
    return queue.map(tile => ({ tile, distance: distance.get(tile)! }));
}

/**
 * A crossing at a narrow point roughly every RIVER_CROSSING_SPACING tiles of
 * each river, the first half that far from its end — so no stretch of river
 * is a wall much longer than the spacing. A river shorter than half the
 * spacing is one an army simply walks round. Each tile of a crossing gets
 * whichever overlay crosses its own water — a bridge over river, a ford
 * where a span reaches into a lake.
 */
export function placeRiverCrossings(field: TerrainField): OverlayPlacement[] {
    const { component, sizes } = connectedRegions(field.columns, field.rows, tile => field.codes[tile] === RIVER_CODE, true);
    const riverTiles: number[][] = sizes.map(() => []);
    component.forEach((river, tile) => { if (river >= 0) riverTiles[river].push(tile); });

    const placements: OverlayPlacement[] = [];
    const claimed = new Set<number>();
    for (const tiles of riverTiles) {
        let nextAt = RIVER_CROSSING_SPACING / 2;
        for (const { tile, distance } of alongRiver(field, tiles)) {
            if (distance < nextAt) continue;
            const span = crossingSpan(field, tile);
            if (!span || span.tiles.some(spanned => claimed.has(spanned))) continue;
            for (const spanned of span.tiles) {
                placements.push({ tile: spanned, code: overlaysCrossing(field.codes[spanned])[0].code, orientation: span.orientation });
                claimed.add(spanned);
            }
            nextAt = distance + RIVER_CROSSING_SPACING;
        }
    }
    return placements;
}

/**
 * The detour rule: for each site and its nearest few neighbours, compare the
 * best route over dry land and existing crossings with the best route that
 * may cross any river or lake. Where the dry one is more than DETOUR_THRESHOLD
 * times dearer — or there is none — the water that shorter route crosses gets
 * a bridge or ford, laid the way the route runs.
 */
export function placeDetourCrossings(field: TerrainField, sites: readonly (Point & { tile: number })[], existing: readonly OverlayPlacement[]): OverlayPlacement[] {
    // Every water tile some overlay could cross, as if it already had one —
    // existing placements last, so they keep their own tile.
    const hypothetical: OverlayPlacement[] = [];
    for (let tile = 0; tile < field.columns * field.rows; tile++) {
        const [crossing] = overlaysCrossing(field.codes[tile]);
        if (crossing) hypothetical.push({ tile, code: crossing.code });
    }
    let dry = travelGridFor(field, existing);
    // Water still blocks corners on the wet grid, so a route never needs a
    // diagonal between two crossing tiles that the dry grid wouldn't allow.
    const wet = { ...travelGridFor(field, [...hypothetical, ...existing]), cornerBlocked: dry.cornerBlocked };
    const crossingCode = new Map(hypothetical.map(placement => [placement.tile, placement.code]));

    const pairs = new Set<string>();
    for (const [index, site] of sites.entries()) {
        const nearest = sites.map((other, otherIndex) => ({ otherIndex, distance: pointDistance(site, other) }))
            .filter(({ otherIndex }) => otherIndex !== index)
            .sort((a, b) => a.distance - b.distance)
            .slice(0, DETOUR_NEIGHBOURS);
        for (const { otherIndex } of nearest) pairs.add(index < otherIndex ? `${index}:${otherIndex}` : `${otherIndex}:${index}`);
    }

    const claimed = new Set(existing.map(placement => placement.tile));
    const placements: OverlayPlacement[] = [];
    for (const pair of pairs) {
        const [from, to] = pair.split(":").map(index => sites[Number(index)].tile);
        const wetPath = findTilePath(wet, from, to);
        if (!wetPath) continue;
        const water = wetPath.tiles.filter(tile => crossingCode.has(tile) && !claimed.has(tile));
        if (water.length === 0) continue;
        const dryPath = findTilePath(dry, from, to);
        if (dryPath && dryPath.cost <= wetPath.cost * DETOUR_THRESHOLD) continue;
        for (const [step, tile] of wetPath.tiles.entries()) {
            if (!water.includes(tile)) continue;
            const previous = wetPath.tiles[step - 1];
            const dc = Math.abs(tile % field.columns - previous % field.columns);
            const dr = Math.abs(Math.floor(tile / field.columns) - Math.floor(previous / field.columns));
            placements.push({ tile, code: crossingCode.get(tile)!, orientation: dc >= dr ? "ew" : "ns" });
            claimed.add(tile);
        }
        dry = travelGridFor(field, [...existing, ...placements]);
    }
    return placements;
}

/** Every derived crossing on a world: the rivers' own bridges, then whatever the detour rule adds. */
export function deriveCrossings(field: TerrainField, sites: readonly (Point & { tile: number })[]): OverlayPlacement[] {
    const rivers = placeRiverCrossings(field);
    return [...rivers, ...placeDetourCrossings(field, sites, rivers)];
}
