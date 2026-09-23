import { pointDistance, type EdgeTerrain, type WorldEdge, type WorldNode } from "./landmass";
import type { RandomSource } from "./random";
import { areaWeightForCode } from "./areas";
import type { TerrainField } from "./terrainField";
import { findTilePath, tileCostsFrom, type TilePath, type TravelGrid } from "./tilePath";

const edgeKey = (a: string, b: string): string => [a, b].sort().join("|");

/** §6.2's bands, read off the weight a tile actually carries rather than which area it is by name. */
function edgeTerrainForWeight(weight: number): EdgeTerrain {
    if (weight <= 1) return "plains";
    if (weight <= 1.75) return "forest";
    if (weight <= 3) return "hill";
    return "mountain-pass";
}

/**
 * What a route is, for the map's reading of it: "river-crossing" if it takes a
 * bridge or ford anywhere, otherwise the heaviest ground that makes up at
 * least a fifth of its length (or simply the most common, if none does).
 * Each step's length is split between the two tiles it joins, as its cost is.
 */
export function routeTerrain(field: TerrainField, path: readonly number[]): EdgeTerrain {
    const lengthByWeight = new Map<number, number>();
    for (const [step, tile] of path.entries()) {
        const weight = areaWeightForCode(field.codes[tile]);
        if (weight === "impassable") return "river-crossing";
        const length = (step > 0 ? 0.5 : 0) + (step < path.length - 1 ? 0.5 : 0);
        lengthByWeight.set(weight, (lengthByWeight.get(weight) ?? 0) + length);
    }
    const entries = [...lengthByWeight.entries()];
    const totalLength = entries.reduce((sum, [, length]) => sum + length, 0);
    if (totalLength === 0) return "plains";
    const meaningful = entries.filter(([, length]) => length / totalLength >= 0.2);
    const dominant = meaningful.length > 0
        ? meaningful.reduce((best, entry) => (entry[0] > best[0] ? entry : best))
        : entries.reduce((best, entry) => (entry[1] > best[1] ? entry : best));
    return edgeTerrainForWeight(dominant[0]);
}

/** An edge's route and everything read off it: the path, what it costs, what it crosses, and whether that makes it a chokepoint. */
export function routeFields(field: TerrainField, route: TilePath): Pick<WorldEdge, "terrain" | "movementCost" | "chokepoint" | "path"> {
    const terrain = routeTerrain(field, route.tiles);
    return { terrain, movementCost: route.cost, chokepoint: terrain === "mountain-pass" || terrain === "river-crossing", path: route.tiles };
}

/**
 * Builds the world's routes (§3.8): a minimum spanning tree over the nodes by
 * straight-line distance (so nothing is left out), then extra edges for
 * redundancy — exactly the shape the graph always had. What changed is what
 * an edge *is*: the cheapest tile path between its two nodes, stored as
 * `path`, costing what that path costs. Edges are for reading the map and for
 * §3.3's hop counts; nothing moves along one. A node the grid can't reach
 * from the first — on an island, or walled in by water with no crossing —
 * fails the attempt, since "is there a path" is now the connectivity question.
 */
export function connectWorldGraph(nodes: readonly WorldNode[], field: TerrainField, grid: TravelGrid, random: RandomSource, extraEdgeRatio = 0.3): WorldEdge[] {
    if (nodes.length < 2) return [];
    const reach = tileCostsFrom(grid, nodes[0].tile);
    if (nodes.some(node => reach[node.tile] === Infinity)) throw new Error("Unable to connect world graph");

    const edges: WorldEdge[] = [];
    const keys = new Set<string>();
    const addEdge = (from: WorldNode, to: WorldNode): void => {
        const route = findTilePath(grid, from.tile, to.tile);
        if (!route) throw new Error("Unable to connect world graph");
        keys.add(edgeKey(from.id, to.id));
        edges.push({ id: `edge-${edges.length}`, from: from.id, to: to.id, ...routeFields(field, route) });
    };

    // Prim's algorithm: each node outside the tree remembers its nearest link
    // in, refreshed as each new node joins, so a step is a scan of that table.
    const inTree = nodes.map((_, index) => index === 0);
    const bestLink: ({ from: number; distance: number } | undefined)[] = nodes.map(() => undefined);
    const offerLinksFrom = (from: number): void => {
        for (let to = 0; to < nodes.length; to++) {
            if (inTree[to]) continue;
            const distance = pointDistance(nodes[from], nodes[to]);
            const current = bestLink[to];
            if (!current || distance < current.distance) bestLink[to] = { from, distance };
        }
    };
    offerLinksFrom(0);
    for (let joined = 1; joined < nodes.length; joined++) {
        let next = -1;
        for (let index = 0; index < nodes.length; index++) {
            if (!inTree[index] && (next === -1 || bestLink[index]!.distance < bestLink[next]!.distance)) next = index;
        }
        addEdge(nodes[bestLink[next]!.from], nodes[next]);
        inTree[next] = true;
        offerLinksFrom(next);
    }

    const candidates: { from: WorldNode; to: WorldNode; distance: number }[] = [];
    for (let first = 0; first < nodes.length; first++) {
        for (let second = first + 1; second < nodes.length; second++) {
            if (keys.has(edgeKey(nodes[first].id, nodes[second].id))) continue;
            candidates.push({ from: nodes[first], to: nodes[second], distance: pointDistance(nodes[first], nodes[second]) });
        }
    }
    const extras = Math.round((nodes.length - 1) * extraEdgeRatio);
    for (const candidate of random.shuffle(candidates.sort((a, b) => a.distance - b.distance).slice(0, extras * 4)).slice(0, extras)) {
        addEdge(candidate.from, candidate.to);
    }
    return edges;
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

export function isConnected(nodes: readonly WorldNode[], edges: readonly WorldEdge[]): boolean {
    return nodes.length === 0 || graphDistances(nodes[0].id, edges).size === nodes.length;
}
