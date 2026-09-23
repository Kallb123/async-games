// Mountain ranges as ridge lines (GDD §3.7). Elevation used to be the land
// mask read twice — far from the sea meant high — so every world grew one
// block of mountains in the middle. A range is now placed on purpose: a short
// seeded polyline anywhere on land, with no pull towards the centre, whose
// height falls away with distance from its spine. That makes a range long and
// thin, with foothills on both flanks, and lets it end rather than fill a
// region. Each long enough range gets a pass or two cut into it, so every
// range has the chokepoint §3.2 wanted rather than hoping an edge finds one.
//
// Pure: a range is data, and its profile is a function of a point — the
// elevation field in terrainField.ts samples it per tile, and nothing here
// knows what a tile is.

import { isLand, landValueAt, pointDistance, type Landmass, type Point } from "./landmass";
import type { RandomSource } from "./random";
import { HILLS_CODE, MOUNTAINS_CODE, elevationFloorOf } from "./areas";

export interface MountainRange {
    /** The spine, in world units, each point about RIDGE_STEP from the last. */
    ridge: Point[];
    /** Where a gap is cut into the ridge, each on the spine itself. */
    passes: Point[];
    /** Scales how wide this range's mountains and foothills spread — no two ranges are quite the same thickness. */
    width: number;
}

export interface MountainRangeOptions {
    /** The share of the land the ranges' mountain cores should cover between them; defaults to a seeded pick inside §3.7's mountain band. */
    mountainShare?: number;
}

const RIDGE_STEP = 3;
const MINIMUM_LENGTH = 26;
const MAXIMUM_LENGTH = 64;
/** The most a ridge may turn between one step and the next, in radians — enough to curve, never enough to curl back on itself. */
const MAXIMUM_TURN = 0.35;
/** A range at least this long gets a pass; one at least PASS_TWO_LENGTH gets two. */
const PASS_ONE_LENGTH = 26;
const PASS_TWO_LENGTH = 44;

/** Half-widths, in world units at `width` 1: the mountain core either side of the spine, then the foothills beyond it, then the slope back down to the lowlands. */
const CORE_HALF_WIDTH = 2.4;
const FOOTHILL_WIDTH = 1.4;
const SLOPE_WIDTH = 3;
/** The last stretch of a range, at either end, over which it narrows to nothing — so a range tapers off rather than stopping at a wall. */
const TAPER_LENGTH = 8;
/** A pass is fully open within this far of its point on the spine, and back to full height this much further out. */
const PASS_OPEN_RADIUS = 2.5;
const PASS_EDGE_WIDTH = 2.5;

const MOUNTAIN_FLOOR = elevationFloorOf(MOUNTAINS_CODE);
const HILLS_FLOOR = elevationFloorOf(HILLS_CODE);
/** How high the ground stays in a pass's notch: the middle of the hills band — slow going, but not a mountain. */
const PASS_FLOOR = (HILLS_FLOOR + MOUNTAIN_FLOOR) / 2;

/** How close one range's spine may come to another's — far enough that their foothills don't close the valley between them, so ranges read as ranges rather than merging into a massif. */
const MINIMUM_RANGE_SEPARATION = 14;
/**
 * Mountain tiles per world unit of spine, measured off generated worlds
 * rather than derived: the taper, the passes and the tile grid all eat into
 * the 2 × CORE_HALF_WIDTH a straight, untapered core would cover. Retune it
 * (with `npm run kb-worlds`) whenever the profile above changes.
 */
const MOUNTAIN_AREA_PER_LENGTH = 2.75;

/** How far from the coast a range may start, in the land mask's own units above the coastline — so a range starts inland rather than on the beach. */
const INLAND_MARGIN = 0.08;

function walkRidge(landmass: Landmass, random: RandomSource): Point[] | undefined {
    const start = { x: random.between(0, landmass.width), y: random.between(0, landmass.height) };
    if (landValueAt(landmass, start) < landmass.landThreshold + INLAND_MARGIN) return undefined;
    const targetLength = random.between(MINIMUM_LENGTH, MAXIMUM_LENGTH);
    let heading = random.between(0, Math.PI * 2);
    const ridge = [start];
    for (let walked = 0; walked + RIDGE_STEP <= targetLength; walked += RIDGE_STEP) {
        heading += random.between(-MAXIMUM_TURN, MAXIMUM_TURN);
        const last = ridge[ridge.length - 1];
        const next = { x: last.x + Math.cos(heading) * RIDGE_STEP, y: last.y + Math.sin(heading) * RIDGE_STEP };
        // A range that reaches the sea just ends there — it never runs out over the water.
        if (!isLand(landmass, next)) break;
        ridge.push(next);
    }
    return ridgeLength(ridge) >= MINIMUM_LENGTH ? ridge : undefined;
}

export function ridgeLength(ridge: readonly Point[]): number {
    let length = 0;
    for (let index = 1; index < ridge.length; index++) length += pointDistance(ridge[index - 1], ridge[index]);
    return length;
}

/** The point `distance` along a ridge from its start. */
function pointAlong(ridge: readonly Point[], distance: number): Point {
    let remaining = distance;
    for (let index = 1; index < ridge.length; index++) {
        const segment = pointDistance(ridge[index - 1], ridge[index]);
        if (remaining <= segment) {
            const t = segment === 0 ? 0 : remaining / segment;
            return { x: ridge[index - 1].x + (ridge[index].x - ridge[index - 1].x) * t, y: ridge[index - 1].y + (ridge[index].y - ridge[index - 1].y) * t };
        }
        remaining -= segment;
    }
    return ridge[ridge.length - 1];
}

/** One pass on a range long enough for one, two on a long one — kept off the ends, where the taper already lets travellers round it, and apart from each other. */
export function placePasses(ridge: readonly Point[], random: RandomSource): Point[] {
    const length = ridgeLength(ridge);
    if (length < PASS_ONE_LENGTH) return [];
    if (length < PASS_TWO_LENGTH) return [pointAlong(ridge, length * random.between(0.35, 0.65))];
    return [pointAlong(ridge, length * random.between(0.22, 0.4)), pointAlong(ridge, length * random.between(0.6, 0.78))];
}

/** The land mask's area in world units² — what the ranges' length budget is a share of. */
function landArea(landmass: Landmass): number {
    const cellArea = (landmass.width / landmass.resolution) * (landmass.height / landmass.resolution);
    return landmass.values.filter(value => value >= landmass.landThreshold).length * cellArea;
}

function nearestRidgeDistance(ridges: readonly (readonly Point[])[], ridge: readonly Point[]): number {
    let nearest = Infinity;
    for (const other of ridges) {
        for (const point of ridge) nearest = Math.min(nearest, nearestOnRidge(other, point).distance);
    }
    return nearest;
}

/**
 * Seeds the world's ranges anywhere on land — no bias towards the centre,
 * which is the whole point (§3.7). Ranges are added until their spines are
 * long enough, between them, for their mountain cores to cover the target
 * share of the land: a budget of ridge length rather than a count of ranges,
 * so a small continent gets a few and a big one more, and the mountain share
 * lands in its band on most seeds rather than by luck. A walk that starts on
 * the coast, runs into the sea before it is long enough, or comes too close to
 * a range already placed is thrown away and another tried.
 */
export function placeMountainRanges(landmass: Landmass, random: RandomSource, options: MountainRangeOptions = {}): MountainRange[] {
    const mountainShare = options.mountainShare ?? random.between(0.065, 0.085);
    const budget = (landArea(landmass) * mountainShare) / MOUNTAIN_AREA_PER_LENGTH;
    const ranges: MountainRange[] = [];
    let placed = 0;
    for (let attempt = 0; attempt < 2000 && placed < budget; attempt++) {
        const ridge = walkRidge(landmass, random);
        if (!ridge || nearestRidgeDistance(ranges.map(range => range.ridge), ridge) < MINIMUM_RANGE_SEPARATION) continue;
        ranges.push({ ridge, passes: placePasses(ridge, random), width: random.between(0.8, 1.25) });
        placed += ridgeLength(ridge);
    }
    return ranges;
}

/** The nearest point's distance to a polyline, and how far along it that nearest point sits. */
function nearestOnRidge(ridge: readonly Point[], point: Point): { distance: number; along: number } {
    let best = { distance: pointDistance(ridge[0], point), along: 0 };
    let walked = 0;
    for (let index = 1; index < ridge.length; index++) {
        const a = ridge[index - 1], b = ridge[index];
        const dx = b.x - a.x, dy = b.y - a.y;
        const segment = Math.hypot(dx, dy);
        const t = segment === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (segment * segment)));
        const distance = Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
        if (distance < best.distance) best = { distance, along: walked + segment * t };
        walked += segment;
    }
    return best;
}

/**
 * A range's height at a point, 0–1: peaks on the spine, falling through the
 * mountain band across the core, through the hills band across the
 * foothills, then back down to nothing. Narrows towards both ends, and is
 * capped in a pass's notch to the middle of the hills band.
 */
export function rangeElevationAt(range: MountainRange, length: number, point: Point): number {
    const { distance, along } = nearestOnRidge(range.ridge, point);
    const taper = Math.max(0.35, Math.min(1, Math.min(along, length - along) / TAPER_LENGTH));
    const core = CORE_HALF_WIDTH * range.width * taper;
    const foothills = FOOTHILL_WIDTH * range.width * taper;
    const slope = SLOPE_WIDTH * range.width;

    let elevation: number;
    if (distance <= core) elevation = 1 - (1 - MOUNTAIN_FLOOR) * (distance / core);
    else if (distance <= core + foothills) elevation = MOUNTAIN_FLOOR - (MOUNTAIN_FLOOR - HILLS_FLOOR) * ((distance - core) / foothills);
    else elevation = Math.max(0, HILLS_FLOOR * (1 - (distance - core - foothills) / slope));

    for (const pass of range.passes) {
        const open = Math.max(0, Math.min(1, (pointDistance(pass, point) - PASS_OPEN_RADIUS) / PASS_EDGE_WIDTH));
        elevation = Math.min(elevation, PASS_FLOOR + (1 - PASS_FLOOR) * open);
    }
    return elevation;
}

/**
 * Every range's height at every point of a `columns` × `rows` grid of sample
 * points — the highest range wins where two meet. Ranges are measured once
 * per sample here rather than per lookup, because the rain shadow reads this
 * grid many times over.
 */
export function rangeElevationGrid(ranges: readonly MountainRange[], samples: readonly Point[]): number[] {
    const lengths = ranges.map(range => ridgeLength(range.ridge));
    // A sample further than this from every point of a range can't be raised by it at all.
    const reach = (CORE_HALF_WIDTH + FOOTHILL_WIDTH + SLOPE_WIDTH) * 1.25 + RIDGE_STEP;
    const bounds = ranges.map(range => ({
        minX: Math.min(...range.ridge.map(point => point.x)) - reach,
        maxX: Math.max(...range.ridge.map(point => point.x)) + reach,
        minY: Math.min(...range.ridge.map(point => point.y)) - reach,
        maxY: Math.max(...range.ridge.map(point => point.y)) + reach,
    }));
    return samples.map(point => {
        let highest = 0;
        ranges.forEach((range, index) => {
            const box = bounds[index];
            if (point.x < box.minX || point.x > box.maxX || point.y < box.minY || point.y > box.maxY) return;
            highest = Math.max(highest, rangeElevationAt(range, lengths[index], point));
        });
        return highest;
    });
}
