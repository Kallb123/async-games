import { pointDistance, type EdgeTerrain, type Point, type WorldEdge, type WorldNode } from "./landmass";
import type { RandomSource } from "./random";
import { areaWeightForCode } from "./areas";
import { overlaysCrossing, type OverlayPlacement } from "./overlays";
import { tileIndex, walkTileLine, type TerrainField } from "./terrainField";

const edgeKey = (a: string, b: string): string => [a, b].sort().join("|");

export interface EdgeCostResult {
    cost: number;
    terrain: EdgeTerrain;
    passable: boolean;
    /** Impassable tiles this edge crosses that only an overlay makes crossable — a bridge over river, a ford over lake. */
    crossings: { tile: number; overlayCode: string }[];
}

/** §6.2's bands, read off the weight a tile actually carries rather than which area it is by name. */
function edgeTerrainForWeight(weight: number): EdgeTerrain {
    if (weight <= 1) return "plains";
    if (weight <= 1.75) return "forest";
    if (weight <= 3) return "hill";
    return "mountain-pass";
}

/**
 * §3.5.4: an edge's cost is a walk of the tiles its straight line crosses,
 * weighted by each tile's area (or the overlay overriding it), summed by the
 * length of line inside each — a short edge over mountains can cost more
 * than a long one over grass. A tile that is impassable with nothing able to
 * cross it (ocean; a river or lake tile with no bridge/ford yet) makes the
 * whole edge impassable, which is what keeps connectivity honestly
 * water-aware rather than a label applied after the fact.
 */
export function edgeCostFor(field: TerrainField, from: Point, to: Point): EdgeCostResult {
    const segments = walkTileLine(field, from, to);
    const lengthByWeight = new Map<number, number>();
    const crossings: EdgeCostResult["crossings"] = [];
    let cost = 0;

    for (const segment of segments) {
        const tile = tileIndex(field, segment.col, segment.row);
        const code = field.codes[tile];
        const weight = areaWeightForCode(code);
        if (weight === "impassable") {
            const [overlay] = overlaysCrossing(code);
            if (!overlay || overlay.movement.kind !== "passable") {
                return { cost: Infinity, terrain: "plains", passable: false, crossings: [] };
            }
            cost += overlay.movement.multiplier * segment.length;
            crossings.push({ tile, overlayCode: overlay.code });
            continue;
        }
        cost += weight * segment.length;
        lengthByWeight.set(weight, (lengthByWeight.get(weight) ?? 0) + segment.length);
    }

    if (crossings.length > 0) return { cost, terrain: "river-crossing", passable: true, crossings };

    const entries = [...lengthByWeight.entries()];
    if (entries.length === 0) return { cost, terrain: "plains", passable: true, crossings: [] };
    const totalLength = entries.reduce((sum, [, length]) => sum + length, 0);
    const meaningful = entries.filter(([, length]) => length / totalLength >= 0.2);
    const dominant = meaningful.length > 0
        ? meaningful.reduce((best, entry) => (entry[0] > best[0] ? entry : best))
        : entries.reduce((best, entry) => (entry[1] > best[1] ? entry : best));
    return { cost, terrain: edgeTerrainForWeight(dominant[0]), passable: true, crossings: [] };
}

export interface ConnectedGraph {
    edges: WorldEdge[];
    /** The bridge/ford this pass wrote on every crossing it used — §3.5.3's derived overlays are not a second source of truth. */
    overlays: OverlayPlacement[];
}

/**
 * Builds the world graph over the generated ground: a minimum spanning tree
 * first (so nothing is an island), then extra edges for redundancy and
 * chokepoints, exactly as before — the only change is that "can this edge
 * exist at all, and what does it cost" now comes from walking real terrain
 * (§3.5.4) instead of a nearest-node guess and a hard-coded river band.
 */
/**
 * Which way a crossing runs through the tiles its edge crosses — the
 * direction whoever travels it moves in, not the water's own direction, per
 * §3.5.5's "a bridge across a river runs the way the crossing runs". A
 * straight edge has one direction for its whole length, so this is computed
 * once per edge and stamped onto every crossing tile that edge contributes,
 * rather than re-derived per tile.
 */
function crossingOrientation(from: Point, to: Point): "ns" | "ew" {
    return Math.abs(to.x - from.x) >= Math.abs(to.y - from.y) ? "ew" : "ns";
}

export function connectWorldGraph(nodes: readonly WorldNode[], field: TerrainField, random: RandomSource, extraEdgeRatio = 0.3): ConnectedGraph {
    if (nodes.length < 2) return { edges: [], overlays: [] };
    const connected = new Set<string>([nodes[0].id]);
    const edges: WorldEdge[] = [];
    const keys = new Set<string>();
    const overlaysByTile = new Map<number, OverlayPlacement>();

    const addEdge = (from: WorldNode, to: WorldNode, result: EdgeCostResult): void => {
        keys.add(edgeKey(from.id, to.id));
        if (result.crossings.length > 0) {
            const orientation = crossingOrientation(from, to);
            for (const crossing of result.crossings) {
                if (!overlaysByTile.has(crossing.tile)) overlaysByTile.set(crossing.tile, { tile: crossing.tile, code: crossing.overlayCode, orientation });
            }
        }
        edges.push({
            id: `edge-${edges.length}`,
            from: from.id,
            to: to.id,
            terrain: result.terrain,
            movementCost: result.cost,
            chokepoint: result.terrain === "mountain-pass" || result.terrain === "river-crossing",
        });
    };

    // Every pair's walk is computed once and shared by both passes below —
    // the walk is the expensive part, and a world of a couple of hundred
    // nodes would otherwise repeat it for every pair on every Prim step.
    const pairCosts = nodes.map((from, first) => nodes.map((to, second) =>
        second > first ? edgeCostFor(field, from, to) : undefined));
    const pairCost = (first: number, second: number): EdgeCostResult =>
        first < second ? pairCosts[first][second]! : pairCosts[second][first]!;

    // Prim's algorithm gives the shortest available bridge into the connected
    // component: each node outside it remembers its nearest passable link in,
    // refreshed as each new node joins, so a step is a scan of that table.
    const inTree = nodes.map((_, index) => index === 0);
    const bestLink: ({ from: number; distance: number } | undefined)[] = nodes.map(() => undefined);
    const offerLinksFrom = (from: number): void => {
        for (let to = 0; to < nodes.length; to++) {
            if (inTree[to] || !pairCost(from, to).passable) continue;
            const distance = pointDistance(nodes[from], nodes[to]);
            const current = bestLink[to];
            if (!current || distance < current.distance) bestLink[to] = { from, distance };
        }
    };
    offerLinksFrom(0);
    while (connected.size < nodes.length) {
        let next: number | undefined;
        for (let index = 0; index < nodes.length; index++) {
            const link = bestLink[index];
            if (!inTree[index] && link && (next === undefined || link.distance < bestLink[next]!.distance)) next = index;
        }
        if (next === undefined) throw new Error("Unable to connect world graph");
        const { from } = bestLink[next]!;
        addEdge(nodes[from], nodes[next], pairCost(from, next));
        connected.add(nodes[next].id);
        inTree[next] = true;
        offerLinksFrom(next);
    }

    const candidates: { from: WorldNode; to: WorldNode; distance: number; result: EdgeCostResult }[] = [];
    for (let first = 0; first < nodes.length; first++) {
        for (let second = first + 1; second < nodes.length; second++) {
            if (keys.has(edgeKey(nodes[first].id, nodes[second].id))) continue;
            const result = pairCost(first, second);
            if (!result.passable) continue;
            candidates.push({ from: nodes[first], to: nodes[second], distance: pointDistance(nodes[first], nodes[second]), result });
        }
    }
    const extras = Math.round((nodes.length - 1) * extraEdgeRatio);
    for (const candidate of random.shuffle(candidates.sort((a, b) => a.distance - b.distance).slice(0, extras * 4)).slice(0, extras)) {
        addEdge(candidate.from, candidate.to, candidate.result);
    }
    return { edges, overlays: [...overlaysByTile.values()] };
}

export function graphDistances(origin: string, edges: readonly WorldEdge[]): Map<string, number> {
    const distances = new Map([[origin, 0]]);
    const queue = [origin];
    while (queue.length) {
        const current = queue.shift()!;
        for (const edge of edges) {
            const neighbour = edge.from === current ? edge.to : edge.to === current ? edge.from : undefined;
            if (neighbour && !distances.has(neighbour)) {
                distances.set(neighbour, distances.get(current)! + 1);
                queue.push(neighbour);
            }
        }
    }
    return distances;
}

/**
 * Same shape as graphDistances, but in travel cost rather than hop count —
 * what §3.3's resource-parity scoring needs now that an edge's cost is
 * observed off the ground it crosses (§3.5.4) rather than a flat "one hop".
 */
export function weightedGraphDistances(origin: string, edges: readonly WorldEdge[]): Map<string, number> {
    const adjacency = new Map<string, { neighbour: string; cost: number }[]>();
    for (const edge of edges) {
        if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
        if (!adjacency.has(edge.to)) adjacency.set(edge.to, []);
        adjacency.get(edge.from)!.push({ neighbour: edge.to, cost: edge.movementCost });
        adjacency.get(edge.to)!.push({ neighbour: edge.from, cost: edge.movementCost });
    }

    const distances = new Map<string, number>([[origin, 0]]);
    const visited = new Set<string>();
    while (true) {
        let currentId: string | undefined;
        let currentDistance = Infinity;
        for (const [id, distance] of distances) {
            if (!visited.has(id) && distance < currentDistance) { currentId = id; currentDistance = distance; }
        }
        if (currentId === undefined) break;
        visited.add(currentId);
        for (const { neighbour, cost } of adjacency.get(currentId) ?? []) {
            const candidate = currentDistance + cost;
            if (candidate < (distances.get(neighbour) ?? Infinity)) distances.set(neighbour, candidate);
        }
    }
    return distances;
}

export function isConnected(nodes: readonly WorldNode[], edges: readonly WorldEdge[]): boolean {
    return nodes.length === 0 || graphDistances(nodes[0].id, edges).size === nodes.length;
}
