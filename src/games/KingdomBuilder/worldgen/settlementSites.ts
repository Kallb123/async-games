import { isLand, pointDistance, type Landmass, type Point, type SettlementNode, type TerrainNode, type WorldEdge } from "./landmass";
import type { RandomSource } from "./random";
import { graphDistances } from "./graphConnectivity";

export interface SettlementOptions {
    playerStarts?: number;
    expansionSites?: number;
    minimumStartHops?: number;
    resourceHops?: number;
    parityTolerance?: number;
}

export interface FairnessReport {
    valid: boolean;
    scores: Record<string, number>;
    reasons: string[];
}

/** Places settlement candidates; topology later decides which become starts. */
export function placeSettlementSites(
    landmass: Landmass,
    terrainNodes: readonly TerrainNode[],
    random: RandomSource,
    options: SettlementOptions = {},
): SettlementNode[] {
    const playerStarts = options.playerStarts ?? 10;
    const expansionSites = options.expansionSites ?? 14;
    const total = playerStarts + expansionSites;
    const minimumDistance = 8;
    const candidates: Point[] = [];

    for (let attempt = 0; attempt < total * 1000 && candidates.length < total * 3; attempt++) {
        const candidate = { x: random.between(4, landmass.width - 4), y: random.between(4, landmass.height - 4) };
        if (!isLand(landmass, candidate)) continue;
        if (terrainNodes.some(node => pointDistance(node, candidate) < 2.5)) continue;
        if (candidates.some(point => pointDistance(point, candidate) < minimumDistance * 0.7)) continue;
        candidates.push(candidate);
    }
    if (candidates.length < total) throw new Error(`Could only find ${candidates.length} settlement candidates`);

    return random.shuffle(candidates).slice(0, total).map((point, index): SettlementNode => ({
        id: `settlement-site-${index}`, kind: "settlement", siteType: "expansion", ...point,
    }));
}

function resourceScore(distances: ReadonlyMap<string, number>, terrainNodes: readonly TerrainNode[], resourceHops: number): number {
    return terrainNodes.reduce((total, node) => {
        const hops = distances.get(node.id);
        return total + (hops !== undefined && hops <= resourceHops ? node.resourceYield : 0);
    }, 0);
}

export function checkSettlementFairness(
    sites: readonly SettlementNode[],
    terrainNodes: readonly TerrainNode[],
    edges: readonly WorldEdge[],
    options: Pick<SettlementOptions, "minimumStartHops" | "resourceHops" | "parityTolerance"> = {},
): FairnessReport {
    const minimumHops = options.minimumStartHops ?? 3;
    const resourceHops = options.resourceHops ?? 3;
    const parityTolerance = options.parityTolerance ?? 0.35;
    const starts = sites.filter(site => site.siteType === "player-start");
    const hopMaps = new Map(starts.map(site => [site.id, graphDistances(site.id, edges)]));
    const scores = Object.fromEntries(starts.map(site => [site.id, resourceScore(hopMaps.get(site.id)!, terrainNodes, resourceHops)]));
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
    random: RandomSource,
    playerStarts = 10,
    options: Pick<SettlementOptions, "minimumStartHops" | "resourceHops" | "parityTolerance"> = {},
): { sites: SettlementNode[]; fairness: FairnessReport } | undefined {
    const resourceHops = options.resourceHops ?? 3;
    const tolerance = options.parityTolerance ?? 0.35;
    const minimumHops = options.minimumStartHops ?? 3;
    const distances = new Map(sites.map(site => [site.id, graphDistances(site.id, edges)]));
    const candidateScores = new Map(sites.map(site => [site.id, resourceScore(distances.get(site.id)!, terrainNodes, resourceHops)]));
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
        const fairness = checkSettlementFairness(classified, terrainNodes, edges, options);
        if (fairness.valid) return { sites: classified, fairness };
    }
    return undefined;
}
