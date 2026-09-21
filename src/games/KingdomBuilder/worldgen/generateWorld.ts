import { connectWorldGraph, isConnected } from "./graphConnectivity";
import { generateLandmass, type Landmass, type WorldEdge, type WorldNode } from "./landmass";
import { createRandom } from "./random";
import { assignFairStartingSites, placeSettlementSites, type FairnessReport, type SettlementOptions } from "./settlementSites";
import { placeTerrainNodes, type TerrainNodeOptions } from "./terrainNodes";

export interface GeneratedWorld {
    seed: string;
    generationAttempt: number;
    landmass: Landmass;
    nodes: WorldNode[];
    edges: WorldEdge[];
    fairness: FairnessReport;
}

export interface GenerateWorldOptions {
    maximumAttempts?: number;
    terrain?: TerrainNodeOptions;
    settlements?: SettlementOptions;
}

/**
 * Generates the complete immutable world map. Failed layouts are retried with
 * derived seeds, keeping the result reproducible from the stored root seed.
 */
export function generateWorld(seed: string, options: GenerateWorldOptions = {}): GeneratedWorld {
    const maximumAttempts = options.maximumAttempts ?? 80;
    let lastFailure = "no attempts made";

    for (let attempt = 0; attempt < maximumAttempts; attempt++) {
        try {
            const random = createRandom(`${seed}:${attempt}`);
            const landmass = generateLandmass(random);
            const terrainNodes = placeTerrainNodes(landmass, random, options.terrain);
            const requestedStarts = options.settlements?.playerStarts ?? 10;
            const settlementSites = placeSettlementSites(landmass, terrainNodes, random, options.settlements);
            const nodes = [...terrainNodes, ...settlementSites];
            const edges = connectWorldGraph(nodes, random);
            if (!isConnected(nodes, edges)) {
                lastFailure = "graph was disconnected";
                continue;
            }
            const assignment = assignFairStartingSites(settlementSites, terrainNodes, edges, random, requestedStarts, options.settlements);
            if (!assignment) {
                lastFailure = "no starting-site assignment passed the fairness constraints";
                continue;
            }
            return { seed, generationAttempt: attempt, landmass, nodes: [...terrainNodes, ...assignment.sites], edges, fairness: assignment.fairness };
        } catch (error) {
            lastFailure = error instanceof Error ? error.message : String(error);
        }
    }

    throw new Error(`Unable to generate a fair world from seed "${seed}" after ${maximumAttempts} attempts: ${lastFailure}`);
}
