import { connectWorldGraph, isConnected } from "./graphConnectivity";
import { generateLandmass, type Landmass, type WorldEdge, type WorldNode } from "./landmass";
import type { OverlayPlacement } from "./overlays";
import { createRandom } from "./random";
import { assignFairStartingSites, placeSettlementSites, type FairnessReport, type SettlementOptions } from "./settlementSites";
import { applySitesToTerrainField, generateBaseTerrainField, type TerrainField } from "./terrainField";
import { placeTerrainNodes, type TerrainNodeOptions } from "./terrainNodes";

export interface GeneratedWorld {
    seed: string;
    generationAttempt: number;
    landmass: Landmass;
    terrainField: TerrainField;
    overlays: OverlayPlacement[];
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
 *
 * Generation order (§3.5.2): the landmass and its ground come first — windows,
 * then the water/river/beach passes — so terrain nodes can be placed on
 * matching ground (§3.5.4) before settlement sites are chosen. Only once
 * sites exist can the fields pass and the closing smoothing run, and only
 * once the ground is final can the graph be connected over it.
 */
export function generateWorld(seed: string, options: GenerateWorldOptions = {}): GeneratedWorld {
    const maximumAttempts = options.maximumAttempts ?? 80;
    let lastFailure = "no attempts made";

    for (let attempt = 0; attempt < maximumAttempts; attempt++) {
        try {
            const random = createRandom(`${seed}:${attempt}`);
            const landmass = generateLandmass(random);
            const { field: baseField } = generateBaseTerrainField(landmass, random);
            const terrainNodes = placeTerrainNodes(landmass, baseField, random, options.terrain);
            const requestedStarts = options.settlements?.playerStarts ?? 10;
            const settlementSites = placeSettlementSites(landmass, terrainNodes, random, options.settlements);
            const terrainField = applySitesToTerrainField(baseField, settlementSites);
            const nodes = [...terrainNodes, ...settlementSites];
            const { edges, overlays } = connectWorldGraph(nodes, terrainField, random);
            if (!isConnected(nodes, edges)) {
                lastFailure = "graph was disconnected";
                continue;
            }
            const assignment = assignFairStartingSites(settlementSites, terrainNodes, edges, random, requestedStarts, options.settlements);
            if (!assignment) {
                lastFailure = "no starting-site assignment passed the fairness constraints";
                continue;
            }
            return {
                seed,
                generationAttempt: attempt,
                landmass,
                terrainField,
                overlays,
                nodes: [...terrainNodes, ...assignment.sites],
                edges,
                fairness: assignment.fairness,
            };
        } catch (error) {
            lastFailure = error instanceof Error ? error.message : String(error);
        }
    }

    throw new Error(`Unable to generate a fair world from seed "${seed}" after ${maximumAttempts} attempts: ${lastFailure}`);
}
