import { catchmentFor, catchmentScore, missingResources, type KingdomBuilderCatchment } from "./catchment";
import { WORLD_AREA_SCALE, isLand, pointDistance, type Landmass, type Point, type SettlementNode, type TerrainNode, type WorldEdge } from "./landmass";
import type { RandomSource } from "./random";
import { graphDistances } from "./graphConnectivity";
import type { TerrainField } from "./terrainField";
import { snapToTiles, travelGridFor } from "./tilePath";

export interface SettlementOptions {
    playerStarts?: number;
    expansionSites?: number;
    minimumStartHops?: number;
    parityTolerance?: number;
}

type FairnessOptions = Pick<SettlementOptions, "minimumStartHops" | "parityTolerance">;

export interface FairnessReport {
    valid: boolean;
    scores: Record<string, number>;
    reasons: string[];
}

/**
 * Places settlement candidates on the mainland, each on a tile of its own that
 * no terrain node stands on (§3.8); topology later decides which become starts.
 */
export function placeSettlementSites(
    landmass: Landmass,
    field: TerrainField,
    onMainland: (point: Point) => boolean,
    terrainNodes: readonly TerrainNode[],
    random: RandomSource,
    options: SettlementOptions = {},
): SettlementNode[] {
    const playerStarts = options.playerStarts ?? 10;
    // Ten seats however big the world is (§1); only the open ground between them grows.
    const expansionSites = options.expansionSites ?? 14 * WORLD_AREA_SCALE;
    const total = playerStarts + expansionSites;
    const minimumDistance = 8;
    const candidates: Point[] = [];

    for (let attempt = 0; attempt < total * 1000 && candidates.length < total * 3; attempt++) {
        const candidate = { x: random.between(4, landmass.width - 4), y: random.between(4, landmass.height - 4) };
        if (!isLand(landmass, candidate) || !onMainland(candidate)) continue;
        if (terrainNodes.some(node => pointDistance(node, candidate) < 2.5)) continue;
        if (candidates.some(point => pointDistance(point, candidate) < minimumDistance * 0.7)) continue;
        candidates.push(candidate);
    }
    if (candidates.length < total) throw new Error(`Could only find ${candidates.length} settlement candidates`);

    const sites = random.shuffle(candidates).slice(0, total).map((point, index): Omit<SettlementNode, "tile"> => ({
        id: `settlement-site-${index}`, kind: "settlement", siteType: "expansion", ...point,
    }));
    return snapToTiles(sites, travelGridFor(field), new Set(terrainNodes.map(node => node.tile)));
}

/** Each site's land (§4.6), read once — the same tiers the settlement founded there will store. */
function catchmentsOf(sites: readonly SettlementNode[], field: TerrainField): Map<string, KingdomBuilderCatchment> {
    return new Map(sites.map(site => [site.id, catchmentFor(field, site.tile)]));
}

/**
 * Scores player starts on the land around them (§3.3, §4.6): the total of
 * their yield tiers must sit in the parity band — composition may differ, a
 * Rich woodland start and a Rich mountain one are both fair — and every start
 * must yield all four resources at least Poorly, since a start with no wheat
 * or no iron can never train a single unit.
 */
export function checkSettlementFairness(
    sites: readonly SettlementNode[],
    edges: readonly WorldEdge[],
    field: TerrainField,
    options: FairnessOptions = {},
    catchments: ReadonlyMap<string, KingdomBuilderCatchment> = catchmentsOf(sites, field),
): FairnessReport {
    const minimumHops = options.minimumStartHops ?? 3;
    const parityTolerance = options.parityTolerance ?? 0.35;
    const starts = sites.filter(site => site.siteType === "player-start");
    // Separation and cornering are topology (how many edges apart), so they stay hop-based; the resource score is the land's.
    const hopMaps = new Map(starts.map(site => [site.id, graphDistances(site.id, edges)]));
    const scores = Object.fromEntries(starts.map(site => [site.id, catchmentScore(catchments.get(site.id)!)]));
    const ordered = Object.values(scores).sort((a, b) => a - b);
    const median = ordered[Math.floor(ordered.length / 2)] ?? 0;
    const reasons: string[] = [];

    for (const start of starts) {
        const distances = hopMaps.get(start.id)!;
        if (median > 0 && Math.abs(scores[start.id] - median) / median > parityTolerance) reasons.push(`${start.id} falls outside the resource-parity band`);
        const missing = missingResources(catchments.get(start.id)!);
        if (missing.length > 0) reasons.push(`${start.id} has no ${missing.join(" or ")} in its land`);
        for (const other of starts) {
            if (start.id < other.id && (distances.get(other.id) ?? Infinity) < minimumHops) reasons.push(`${start.id} and ${other.id} are too close`);
        }
        const nearest = sites.filter(site => site.id !== start.id).sort((a, b) => (distances.get(a.id) ?? Infinity) - (distances.get(b.id) ?? Infinity)).slice(0, 3);
        if (nearest.filter(site => site.siteType === "player-start").length > 2) reasons.push(`${start.id} is cornered by other starts`);
    }

    return { valid: reasons.length === 0, scores, reasons };
}

/** Chooses which already-placed sites are starts once graph distances are known. */
export function assignFairStartingSites(
    sites: readonly SettlementNode[],
    edges: readonly WorldEdge[],
    field: TerrainField,
    random: RandomSource,
    playerStarts = 10,
    options: FairnessOptions = {},
): { sites: SettlementNode[]; fairness: FairnessReport } | undefined {
    const tolerance = options.parityTolerance ?? 0.35;
    const minimumHops = options.minimumStartHops ?? 3;
    const distances = new Map(sites.map(site => [site.id, graphDistances(site.id, edges)]));
    const catchments = catchmentsOf(sites, field);
    // Only land yielding all four resources can hold a start, so the band is
    // centred on those sites alone.
    const complete = sites.filter(site => missingResources(catchments.get(site.id)!).length === 0);
    const candidateScores = new Map(complete.map(site => [site.id, catchmentScore(catchments.get(site.id)!)]));
    const orderedScores = [...candidateScores.values()].sort((a, b) => a - b);
    const median = orderedScores[Math.floor(orderedScores.length / 2)] ?? 0;
    const eligible = complete.filter(site => median === 0 || Math.abs(candidateScores.get(site.id)! - median) / median <= tolerance);

    for (let attempt = 0; attempt < 250; attempt++) {
        const chosen: SettlementNode[] = [];
        for (const site of random.shuffle(eligible)) {
            if (chosen.every(other => (distances.get(site.id)!.get(other.id) ?? Infinity) >= minimumHops)) chosen.push(site);
            if (chosen.length === playerStarts) break;
        }
        if (chosen.length < playerStarts) continue;
        const selected = new Set(chosen.map(site => site.id));
        const classified = sites.map((site): SettlementNode => ({
            ...site,
            siteType: selected.has(site.id) ? "player-start" : "expansion",
        }));
        const fairness = checkSettlementFairness(classified, edges, field, options, catchments);
        if (fairness.valid) return { sites: classified, fairness };
    }
    return undefined;
}
