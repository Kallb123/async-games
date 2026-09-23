import { connectWorldGraph, isConnected } from "./graphConnectivity";
import { generateLandmass, type Landmass, type WorldEdge, type WorldNode } from "./landmass";
import type { OverlayPlacement } from "./overlays";
import { applyOverlayVocabulary } from "./overlayVocabulary";
import { createRandom } from "./random";
import { assignFairStartingSites, placeSettlementSites, type FairnessReport, type SettlementOptions } from "./settlementSites";
import { applySitesToTerrainField, generateBaseTerrainField, mainlandOf, type TerrainField } from "./terrainField";
import { placeTerrainNodes, type TerrainNodeOptions } from "./terrainNodes";
import { checkWorldShape } from "./worldShape";

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
    /** A wall-clock budget in milliseconds, on top of the attempt cap — real terrain rejects more edges than a nearest-node guess did, so a slow, unlucky run needs a deadline the way the tick sweeps do, not just a count. */
    budgetMs?: number;
    terrain?: TerrainNodeOptions;
    settlements?: SettlementOptions;
}

/** Leaves headroom under `/api/newgame/kingdombuilder`'s own `maxDuration` for the rest of its transaction (founding the host's settlement). */
const DEFAULT_GENERATION_BUDGET_MS = 45_000;

/**
 * Generates the complete immutable world map. Failed layouts are retried with
 * derived seeds, keeping the result reproducible from the stored root seed.
 *
 * Generation order (§3.5.2): the landmass and its ground come first — windows,
 * then the water/river/beach passes — so terrain nodes can be placed on
 * matching ground (§3.5.4) before settlement sites are chosen. Only once
 * sites exist can the fields pass and the closing smoothing run, and only
 * once the ground is final — and has passed §3.7's shape checks — can the
 * graph be connected over it.
 */
export function generateWorld(seed: string, options: GenerateWorldOptions = {}): GeneratedWorld {
    const maximumAttempts = options.maximumAttempts ?? 80;
    const deadline = Date.now() + (options.budgetMs ?? DEFAULT_GENERATION_BUDGET_MS);
    let lastFailure = "no attempts made";
    let attempt = 0;

    for (; attempt < maximumAttempts; attempt++) {
        if (Date.now() >= deadline) {
            lastFailure = `timed out after ${attempt} attempts`;
            break;
        }
        try {
            const random = createRandom(`${seed}:${attempt}`);
            const landmass = generateLandmass(random);
            const { field: baseField } = generateBaseTerrainField(landmass, random);
            const onMainland = mainlandOf(baseField);
            const terrainNodes = placeTerrainNodes(landmass, baseField, onMainland, random, options.terrain);
            const requestedStarts = options.settlements?.playerStarts ?? 10;
            const settlementSites = placeSettlementSites(landmass, baseField, onMainland, terrainNodes, random, options.settlements);
            const terrainField = applySitesToTerrainField(baseField, settlementSites);
            // §3.7's composition bands and mountain-region rule, checked
            // before the graph — the expensive step — so a world whose ground
            // drifted out of shape costs a retry, not a connection pass.
            const shapeFailures = checkWorldShape(terrainField);
            if (shapeFailures.length > 0) {
                lastFailure = `map shape: ${shapeFailures.join("; ")}`;
                continue;
            }
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
            const finalNodes = [...terrainNodes, ...assignment.sites];
            // The overlay vocabulary (§3.5.3, PR 12) runs last: piers, roads
            // and signposts all read the *final* site types and graph, which
            // only exist once the fairness assignment above has succeeded.
            const vocabulary = applyOverlayVocabulary(terrainField, finalNodes, edges, overlays, random);
            return {
                seed,
                generationAttempt: attempt,
                landmass,
                terrainField,
                overlays: vocabulary.overlays,
                nodes: finalNodes,
                edges: vocabulary.edges,
                fairness: assignment.fairness,
            };
        } catch (error) {
            lastFailure = error instanceof Error ? error.message : String(error);
        }
    }

    throw new Error(`Unable to generate a fair world from seed "${seed}" after ${attempt} of up to ${maximumAttempts} attempts: ${lastFailure}`);
}
