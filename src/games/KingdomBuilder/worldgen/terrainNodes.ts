import { isLand, landValueAt, pointDistance, type Landmass, type TerrainNode, type TerrainNodeType } from "./landmass";
import type { RandomSource } from "./random";

export interface TerrainNodeOptions {
    count?: number;
    minimumDistance?: number;
    maximumAttempts?: number;
}

function terrainFor(random: RandomSource, elevation: number, yRatio: number): TerrainNodeType {
    const roll = random.next();
    if (elevation > 0.66 || roll < 0.18) return "ore";
    if (yRatio > 0.58 ? roll < 0.6 : roll < 0.38) return "forest";
    return "quarry";
}

/** Poisson-disc-style rejection sampling over the generated land. */
export function placeTerrainNodes(landmass: Landmass, random: RandomSource, options: TerrainNodeOptions = {}): TerrainNode[] {
    const count = options.count ?? 32;
    const minimumDistance = options.minimumDistance ?? 5.5;
    const maximumAttempts = options.maximumAttempts ?? count * 500;
    const nodes: TerrainNode[] = [];

    for (let attempt = 0; attempt < maximumAttempts && nodes.length < count; attempt++) {
        const point = { x: random.between(3, landmass.width - 3), y: random.between(3, landmass.height - 3) };
        if (!isLand(landmass, point) || nodes.some(node => pointDistance(node, point) < minimumDistance)) continue;
        const terrain = terrainFor(random, landValueAt(landmass, point), point.y / landmass.height);
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
