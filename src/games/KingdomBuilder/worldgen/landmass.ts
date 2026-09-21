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

export const pointDistance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

function interpolate(a: number, b: number, amount: number): number {
    const eased = amount * amount * (3 - 2 * amount);
    return a + (b - a) * eased;
}

/**
 * A coherent value-noise grid: a coarse random lattice, bilinearly
 * interpolated up to `columns` × `rows`. Shared by the landmass's own
 * elevation field and terrainField.ts's moisture field, so both terrain
 * inputs are the same kind of noise rather than two hand-rolled generators.
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

/** Builds a coherent value-noise island, with ocean forced around every edge. */
export function generateLandmass(random: RandomSource, options: LandmassOptions = {}): Landmass {
    const width = options.width ?? 100;
    const height = options.height ?? 70;
    const resolution = options.resolution ?? 48;
    const landThreshold = options.landThreshold ?? 0.31;
    const noise = coherentNoiseGrid(random, resolution, resolution);
    const values: number[] = [];

    for (let row = 0; row < resolution; row++) {
        for (let column = 0; column < resolution; column++) {
            const nx = (column / (resolution - 1)) * 2 - 1;
            const ny = (row / (resolution - 1)) * 2 - 1;
            const islandFalloff = Math.max(0, 1 - Math.pow(Math.hypot(nx, ny * 1.15), 1.7));
            values.push(islandFalloff * (0.58 + noise[row * resolution + column] * 0.42));
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
