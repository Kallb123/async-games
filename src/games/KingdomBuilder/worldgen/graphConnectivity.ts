import { pointDistance, type EdgeTerrain, type Point, type TerrainNode, type WorldEdge, type WorldNode } from "./landmass";
import type { RandomSource } from "./random";

const edgeKey = (a: string, b: string): string => [a, b].sort().join("|");

function riverCrossing(from: Point, to: Point, centreX: number): { crosses: boolean; atBridge: boolean } {
    const crosses = (from.x - centreX) * (to.x - centreX) < 0;
    const midpointY = (from.y + to.y) / 2;
    return { crosses, atBridge: (midpointY >= 20 && midpointY <= 28) || (midpointY >= 43 && midpointY <= 51) };
}

function edgeTerrain(from: Point, to: Point, terrainNodes: readonly TerrainNode[], centreX: number): EdgeTerrain {
    const midpoint = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    // The landmass has one broad central river; its two bridge bands turn a
    // crossing into a known, costly route rather than an arbitrary label.
    const crossing = riverCrossing(from, to, centreX);
    if (crossing.crosses && crossing.atBridge) return "river-crossing";
    const nearest = [...terrainNodes].sort((a, b) => pointDistance(a, midpoint) - pointDistance(b, midpoint))[0];
    if (!nearest || pointDistance(nearest, midpoint) > 10) return "plains";
    if (nearest.terrain === "ore") return "mountain-pass";
    if (nearest.terrain === "quarry") return "hill";
    if (nearest.terrain === "forest") return "forest";
    return "plains";
}

export const movementCostFor = (terrain: EdgeTerrain): number => ({
    plains: 1,
    forest: 1.5,
    hill: 2,
    "mountain-pass": 3.5,
    "river-crossing": 2.5,
})[terrain];

export function connectWorldGraph(nodes: readonly WorldNode[], random: RandomSource, extraEdgeRatio = 0.3): WorldEdge[] {
    if (nodes.length < 2) return [];
    const connected = new Set<string>([nodes[0].id]);
    const edges: WorldEdge[] = [];
    const keys = new Set<string>();
    const terrainNodes = nodes.filter((node): node is TerrainNode => node.kind === "terrain");
    const centreX = nodes.reduce((sum, node) => sum + node.x, 0) / nodes.length;

    const addEdge = (from: WorldNode, to: WorldNode): void => {
        const terrain = edgeTerrain(from, to, terrainNodes, centreX);
        const key = edgeKey(from.id, to.id);
        keys.add(key);
        edges.push({ id: `edge-${edges.length}`, from: from.id, to: to.id, terrain, movementCost: movementCostFor(terrain), chokepoint: terrain === "mountain-pass" || terrain === "river-crossing" });
    };

    // Prim's algorithm gives the shortest available bridge into the connected component.
    while (connected.size < nodes.length) {
        let best: { from: WorldNode; to: WorldNode; distance: number } | undefined;
        for (const from of nodes) {
            if (!connected.has(from.id)) continue;
            for (const to of nodes) {
                if (connected.has(to.id)) continue;
                const crossing = riverCrossing(from, to, centreX);
                if (crossing.crosses && !crossing.atBridge) continue;
                const candidateDistance = pointDistance(from, to);
                if (!best || candidateDistance < best.distance) best = { from, to, distance: candidateDistance };
            }
        }
        if (!best) throw new Error("Unable to connect world graph");
        addEdge(best.from, best.to);
        connected.add(best.to.id);
    }

    const candidates: { from: WorldNode; to: WorldNode; distance: number }[] = [];
    for (let first = 0; first < nodes.length; first++) {
        for (let second = first + 1; second < nodes.length; second++) {
            const crossing = riverCrossing(nodes[first], nodes[second], centreX);
            if (!keys.has(edgeKey(nodes[first].id, nodes[second].id)) && (!crossing.crosses || crossing.atBridge)) {
                candidates.push({ from: nodes[first], to: nodes[second], distance: pointDistance(nodes[first], nodes[second]) });
            }
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
