import { WORLD_AREA_SCALE, isLand, pointDistance, type Landmass, type Point, type SettlementNode, type TerrainNode, type WorldEdge } from "./landmass";
import type { RandomSource } from "./random";
import { graphDistances } from "./graphConnectivity";
import type { TerrainField } from "./terrainField";
import { snapToTiles, tileCostsFrom, travelGridFor, type TravelGrid } from "./tilePath";

export interface SettlementOptions {
    playerStarts?: number;
    expansionSites?: number;
    minimumStartHops?: number;
    /** How far a start's resource score looks, in travel cost over the tiles (§3.8) — the units an edge's `movementCost` is in. */
    resourceReach?: number;
    parityTolerance?: number;
}

/**
 * Roughly three typical routes' worth of travel (a route costs about eight) —
 * the "three hops" this score used to count. Before §3.8 the reach was the
 * bare number 3 in cost units, which reached no resource at all from almost
 * any start, so every score was zero and the parity band never bit.
 */
const DEFAULT_RESOURCE_REACH = 24;

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

/**
 * Total yield reachable within a travel-cost budget (§3.3) — a flood over the
 * tiles from the site's own (§3.8), the same search an army will make, rather
 * than a walk of the edges someone happened to draw.
 */
function resourceScore(grid: TravelGrid, site: SettlementNode, terrainNodes: readonly TerrainNode[], resourceReach: number): number {
    const costs = tileCostsFrom(grid, site.tile, resourceReach);
    return terrainNodes.reduce((total, node) => total + (costs[node.tile] <= resourceReach ? node.resourceYield : 0), 0);
}

export function checkSettlementFairness(
    sites: readonly SettlementNode[],
    terrainNodes: readonly TerrainNode[],
    edges: readonly WorldEdge[],
    grid: TravelGrid,
    options: Pick<SettlementOptions, "minimumStartHops" | "resourceReach" | "parityTolerance"> = {},
): FairnessReport {
    const minimumHops = options.minimumStartHops ?? 3;
    const resourceReach = options.resourceReach ?? DEFAULT_RESOURCE_REACH;
    const parityTolerance = options.parityTolerance ?? 0.35;
    const starts = sites.filter(site => site.siteType === "player-start");
    // Separation and cornering are topology (how many edges apart), so they stay hop-based; only the resource score is time-weighted.
    const hopMaps = new Map(starts.map(site => [site.id, graphDistances(site.id, edges)]));
    const scores = Object.fromEntries(starts.map(site => [site.id, resourceScore(grid, site, terrainNodes, resourceReach)]));
    const ordered = Object.values(scores).sort((a, b) => a - b);
    const median = ordered[Math.floor(ordered.length / 2)] ?? 0;
    const reasons: string[] = [];

    for (const start of starts) {
        const distances = hopMaps.get(start.id)!;
        if (median > 0 && Math.abs(scores[start.id] - median) / median > parityTolerance) reasons.push(`${start.id} falls outside the resource-parity band`);
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
    terrainNodes: readonly TerrainNode[],
    edges: readonly WorldEdge[],
    grid: TravelGrid,
    random: RandomSource,
    playerStarts = 10,
    options: Pick<SettlementOptions, "minimumStartHops" | "resourceReach" | "parityTolerance"> = {},
): { sites: SettlementNode[]; fairness: FairnessReport } | undefined {
    const resourceReach = options.resourceReach ?? DEFAULT_RESOURCE_REACH;
    const tolerance = options.parityTolerance ?? 0.35;
    const minimumHops = options.minimumStartHops ?? 3;
    const distances = new Map(sites.map(site => [site.id, graphDistances(site.id, edges)]));
    const candidateScores = new Map(sites.map(site => [site.id, resourceScore(grid, site, terrainNodes, resourceReach)]));
    const orderedScores = [...candidateScores.values()].sort((a, b) => a - b);
    const median = orderedScores[Math.floor(orderedScores.length / 2)] ?? 0;
    const eligible = sites.filter(site => median === 0 || Math.abs(candidateScores.get(site.id)! - median) / median <= tolerance);

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
        const fairness = checkSettlementFairness(classified, terrainNodes, edges, grid, options);
        if (fairness.valid) return { sites: classified, fairness };
    }
    return undefined;
}
