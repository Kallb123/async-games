import { isLand, pointDistance, type Landmass, type TerrainNode, type TerrainNodeType } from "./landmass";
import type { RandomSource } from "./random";
import { areaCodeAt, type TerrainField } from "./terrainField";

export interface TerrainNodeOptions {
    count?: number;
    minimumDistance?: number;
    maximumAttempts?: number;
}

/**
 * Which node type belongs on which ground (§3.5.4): a forest node on
 * woodland, a quarry on hills, ore on mountains — read off the generated
 * field instead of an elevation-and-a-die-roll, which could previously put a
 * forest on bare grass.
 */
const TERRAIN_TYPE_BY_AREA_CODE: Partial<Record<string, TerrainNodeType>> = {
    w: "forest",
    h: "quarry",
    m: "ore",
};

/** Poisson-disc-style rejection sampling over the generated land, one node per matching patch of ground. */
export function placeTerrainNodes(landmass: Landmass, field: TerrainField, random: RandomSource, options: TerrainNodeOptions = {}): TerrainNode[] {
    const count = options.count ?? 32;
    const minimumDistance = options.minimumDistance ?? 5.5;
    const maximumAttempts = options.maximumAttempts ?? count * 2000;
    const nodes: TerrainNode[] = [];

    for (let attempt = 0; attempt < maximumAttempts && nodes.length < count; attempt++) {
        const point = { x: random.between(3, landmass.width - 3), y: random.between(3, landmass.height - 3) };
        if (!isLand(landmass, point) || nodes.some(node => pointDistance(node, point) < minimumDistance)) continue;
        const terrain = TERRAIN_TYPE_BY_AREA_CODE[areaCodeAt(field, point)];
        if (!terrain) continue;
        nodes.push({
            id: `terrain-${nodes.length}`,
            kind: "terrain",
            ...point,
            terrain,
            resourceYield: terrain === "ore" ? 4 : terrain === "quarry" ? 3 : 2,
        });
    }

    if (nodes.length !== count) throw new Error(`Could only place ${nodes.length} of ${count} terrain nodes`);
    return nodes;
}
