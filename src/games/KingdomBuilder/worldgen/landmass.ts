import type { RandomSource } from "./random";

export type TerrainNodeType = "forest" | "quarry" | "ore";
export type SettlementSiteType = "player-start" | "expansion" | "barbarian";
export type EdgeTerrain = "plains" | "forest" | "hill" | "mountain-pass" | "river-crossing";

export interface Point {
    x: number;
    y: number;
}

interface BaseWorldNode extends Point {
    id: string;
    /**
     * The tile the node stands on (§3.8), row-major into the terrain field —
     * passable, and nobody else's. `x`/`y` are that tile's centre.
     */
    tile: number;
}

export interface TerrainNode extends BaseWorldNode {
    kind: "terrain";
    terrain: TerrainNodeType;
    resourceYield: number;
}

export interface SettlementNode extends BaseWorldNode {
    kind: "settlement";
    siteType: SettlementSiteType;
}

export type WorldNode = TerrainNode | SettlementNode;

export interface WorldEdge {
    id: string;
    from: string;
    to: string;
    terrain: EdgeTerrain;
    movementCost: number;
    chokepoint: boolean;
}

export interface Landmass {
    width: number;
    height: number;
    resolution: number;
    values: number[];
    landThreshold: number;
}

export interface LandmassOptions {
    width?: number;
    height?: number;
    resolution?: number;
    landThreshold?: number;
}

/**
 * The world's size in world units. Doubled in both directions from the
 * original 100×70 — four times the ground for the same ten seats — with every
 * count that fills it (terrain nodes, expansion sites, rivers, landmarks)
 * scaled by WORLD_AREA_SCALE so the map is as dense as before, just bigger.
 */
export const WORLD_WIDTH = 200;
export const WORLD_HEIGHT = 140;
/** How many times the original 100×70 world's area this one is. */
export const WORLD_AREA_SCALE = (WORLD_WIDTH * WORLD_HEIGHT) / (100 * 70);

/**
 * The coarse lattice size for a noise grid spanning `width` world units, so
 * a feature (a hill range, a wet patch) stays the same size in world units
 * however big the world is — rather than the same fraction of it, which is
 * all a fixed lattice would give a bigger world: the old map, magnified.
 */
export function noiseLatticeFor(width: number): number {
    return Math.max(2, Math.round((8 * width) / 100) + 1);
}

export const pointDistance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

function interpolate(a: number, b: number, amount: number): number {
    const eased = amount * amount * (3 - 2 * amount);
    return a + (b - a) * eased;
}

/**
 * A coherent value-noise grid: a coarse random lattice, bilinearly
 * interpolated up to `columns` × `rows`. Shared by the land mask, its warp,
 * and terrainField.ts's lowland and moisture fields, so every terrain input is
 * the same kind of noise rather than several hand-rolled generators.
 */
export function coherentNoiseGrid(random: RandomSource, columns: number, rows: number, coarseSize = 9): number[] {
    const coarse = Array.from({ length: coarseSize * coarseSize }, () => random.next());
    const values: number[] = [];

    for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
            const gx = (column / (columns - 1)) * (coarseSize - 1);
            const gy = (row / (rows - 1)) * (coarseSize - 1);
            const x0 = Math.min(Math.floor(gx), coarseSize - 2);
            const y0 = Math.min(Math.floor(gy), coarseSize - 2);
            const tx = gx - x0;
            const ty = gy - y0;
            const top = interpolate(coarse[y0 * coarseSize + x0], coarse[y0 * coarseSize + x0 + 1], tx);
            const bottom = interpolate(coarse[(y0 + 1) * coarseSize + x0], coarse[(y0 + 1) * coarseSize + x0 + 1], tx);
            values.push(interpolate(top, bottom, ty));
        }
    }
    return values;
}

/**
 * The overall outline a world's land takes (§3.7) — one continent, two joined
 * by an isthmus, or a large island with an archipelago offshore. Each is a
 * handful of shapes in the map's -1…1 space whose falloffs are max-combined,
 * so none of them is a special case anywhere past this table.
 */
export const LAND_SHAPE_PRESETS = ["continent", "twin-continents", "archipelago"] as const;
export type LandShapePreset = (typeof LAND_SHAPE_PRESETS)[number];

/** A blob of land: an ellipse (`from === to`) or a capsule stretched between two points, in the map's -1…1 space. */
interface LandShape {
    from: Point;
    to: Point;
    radiusX: number;
    radiusY: number;
}

const blob = (x: number, y: number, radiusX: number, radiusY: number): LandShape => ({ from: { x, y }, to: { x, y }, radiusX, radiusY });

function landShapesFor(preset: LandShapePreset, random: RandomSource): LandShape[] {
    const jitter = (amount: number): number => random.between(-amount, amount);
    switch (preset) {
        case "continent":
            return [blob(jitter(0.1), jitter(0.08), random.between(0.9, 1), random.between(0.8, 0.9))];
        case "twin-continents": {
            const west = blob(-0.46 + jitter(0.05), jitter(0.15), random.between(0.5, 0.56), random.between(0.72, 0.84));
            const east = blob(0.46 + jitter(0.05), jitter(0.15), random.between(0.5, 0.56), random.between(0.72, 0.84));
            return [west, east, { from: west.from, to: east.from, radiusX: 0.16, radiusY: 0.16 }];
        }
        case "archipelago": {
            const main = blob(jitter(0.18), jitter(0.1), random.between(0.78, 0.88), random.between(0.7, 0.8));
            const islets = Array.from({ length: 4 + random.integer(4) }, () => {
                const angle = random.between(0, Math.PI * 2);
                return blob(Math.cos(angle) * 0.8, Math.sin(angle) * 0.72, random.between(0.1, 0.17), random.between(0.12, 0.2));
            });
            return [main, ...islets];
        }
    }
}

/** 1 at a shape's spine, falling to 0 at its rim — the same curve the original single island used. */
function shapeFalloff(shape: LandShape, point: Point): number {
    const dx = shape.to.x - shape.from.x, dy = shape.to.y - shape.from.y;
    const lengthSquared = dx * dx + dy * dy;
    const along = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - shape.from.x) * dx + (point.y - shape.from.y) * dy) / lengthSquared));
    const distance = Math.hypot((point.x - shape.from.x - dx * along) / shape.radiusX, (point.y - shape.from.y - dy * along) / shape.radiusY);
    return Math.max(0, 1 - Math.pow(distance, 1.7));
}

/**
 * Builds the land mask (§3.7): where there is land and where there is sea,
 * and nothing else. It is a seeded shape preset's falloff, read through a
 * domain warp — each sample offset by a second, low-frequency noise before the
 * falloff is read — so the coast grows bays, peninsulas and the odd offshore
 * island rather than a rounded blob, with ocean forced around every edge.
 * Height is not in here: that is terrainField.ts's own elevation field, built
 * from mountainRanges.ts, so being far from the sea no longer means being high.
 */
export function generateLandmass(random: RandomSource, options: LandmassOptions = {}): Landmass {
    const width = options.width ?? WORLD_WIDTH;
    const height = options.height ?? WORLD_HEIGHT;
    // The same ~2 world units per sample the original 100-wide, 48-sample map had.
    const resolution = options.resolution ?? Math.round((48 * width) / 100);
    const landThreshold = options.landThreshold ?? 0.31;
    const shapes = landShapesFor(LAND_SHAPE_PRESETS[random.integer(LAND_SHAPE_PRESETS.length)], random);
    const detail = coherentNoiseGrid(random, resolution, resolution, noiseLatticeFor(width));
    // Half the detail noise's frequency: a warp that wobbles as fast as the
    // coast's own detail only roughens it, where a slower one bends it.
    const warpLattice = Math.max(2, Math.round(noiseLatticeFor(width) / 2));
    const warpX = coherentNoiseGrid(random, resolution, resolution, warpLattice);
    const warpY = coherentNoiseGrid(random, resolution, resolution, warpLattice);
    const warpStrength = 0.28;
    const values: number[] = [];

    for (let row = 0; row < resolution; row++) {
        for (let column = 0; column < resolution; column++) {
            const index = row * resolution + column;
            const nx = (column / (resolution - 1)) * 2 - 1;
            const ny = (row / (resolution - 1)) * 2 - 1;
            const warped = { x: nx + (warpX[index] - 0.5) * 2 * warpStrength, y: ny + (warpY[index] - 0.5) * 2 * warpStrength };
            const falloff = Math.max(...shapes.map(shape => shapeFalloff(shape, warped)));
            // The border itself is always sea, however far the warp pulled a shape towards it.
            const border = Math.min(1, (1 - Math.abs(nx)) * 12, (1 - Math.abs(ny)) * 12);
            values.push(falloff * border * (0.58 + detail[index] * 0.42));
        }
    }

    return { width, height, resolution, values, landThreshold };
}

export function landValueAt(landmass: Landmass, point: Point): number {
    const column = Math.max(0, Math.min(landmass.resolution - 1, Math.round((point.x / landmass.width) * (landmass.resolution - 1))));
    const row = Math.max(0, Math.min(landmass.resolution - 1, Math.round((point.y / landmass.height) * (landmass.resolution - 1))));
    return landmass.values[row * landmass.resolution + column];
}

export function isLand(landmass: Landmass, point: Point): boolean {
    return landValueAt(landmass, point) >= landmass.landThreshold;
}
