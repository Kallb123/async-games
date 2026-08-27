// Generic symmetric adjacency graph builder, shared by every game whose
// board is a fixed set of named nodes connected by an edge list transcribed
// from a rulebook (World Domination's territories, Outbreak's cities, ...).
// One tested implementation instead of a hand-copied one per game's board.ts.

/**
 * Builds a symmetric adjacency list from a one-directional edge dictionary
 * keyed by node name (a name pair only needs to appear once — each edge is
 * closed into both directions).
 *
 * @param nodeNames Node names in id order; a node's id is its index here.
 * @param rawAdjacency Edge list as transcribed from the source rulebook.
 * @returns adjacency[nodeId] = sorted array of directly-connected node ids.
 */
export function buildSymmetricAdjacency(
    nodeNames: string[],
    rawAdjacency: Record<string, string[]>,
): number[][] {
    const nameToId: Record<string, number> = {};
    nodeNames.forEach((name, id) => { nameToId[name] = id; });

    const adjacency: Set<number>[] = nodeNames.map(() => new Set<number>());
    for (const [fromName, toNames] of Object.entries(rawAdjacency)) {
        const fromId = nameToId[fromName];
        for (const toName of toNames) {
            const toId = nameToId[toName];
            adjacency[fromId].add(toId);
            adjacency[toId].add(fromId); // symmetric closure — guards against one-directional gaps
        }
    }
    return adjacency.map(s => [...s].sort((a, b) => a - b));
}

export function isAdjacentIn(adjacency: number[][], a: number, b: number): boolean {
    return adjacency[a]?.includes(b) ?? false;
}
