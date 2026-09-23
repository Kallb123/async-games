import { describe, expect, it } from "vitest";

import type { StoredWorldNode } from "./KingdomBuilderWorldModel";
import { generateWorld, type TerrainField, type WorldEdge } from "./worldgen";
import { worldOnTiles } from "./worldTiles";

const LANDMASS = { width: 10, height: 6, resolution: 1, values: [1], landThreshold: 0.3 };

/** Three rows of five: grass, a river with a bridge at its east end, grass. */
const FIELD: TerrainField = { columns: 5, rows: 3, tileSize: 2, codes: "ggggg" + "rrrrr" + "ggggg" };
const BRIDGE = [{ tile: 9, code: "B", orientation: "ns" }];

const oldNodes = (): StoredWorldNode[] => [
    { id: "north", kind: "settlement", siteType: "player-start", x: 1.4, y: 0.7 },
    // Generated before rivers vetoed a spot: standing in the water.
    { id: "south", kind: "settlement", siteType: "expansion", x: 1.2, y: 3.1 },
];
const oldEdge: WorldEdge = { id: "edge-0", from: "north", to: "south", terrain: "river-crossing", movementCost: 4, chokepoint: true };

describe("worldOnTiles", () => {
    it("leaves a world generated with tiles exactly as it is", () => {
        const world = generateWorld("already-on-tiles");
        const result = worldOnTiles(world);
        expect(result.changed).toBe(false);
        expect(result.nodes).toBe(world.nodes);
        expect(result.edges).toBe(world.edges);
    });

    it("stands an older world's nodes on free passable tiles, stepping one out of the river", () => {
        const { nodes, changed } = worldOnTiles({ landmass: LANDMASS, terrainField: FIELD, overlays: BRIDGE, nodes: oldNodes(), edges: [oldEdge] });
        expect(changed).toBe(true);
        expect(nodes.map(node => node.tile)).toEqual([0, 10]);
        expect(nodes[1]).toMatchObject({ x: 1, y: 5 });
    });

    it("re-draws an older world's straight edges as tile paths, costed and read off the ground they now cross", () => {
        const { edges } = worldOnTiles({ landmass: LANDMASS, terrainField: FIELD, overlays: BRIDGE, nodes: oldNodes(), edges: [oldEdge] });
        expect(edges[0].path).toContain(9);
        expect(edges[0].path![0]).toBe(0);
        expect(edges[0].path![edges[0].path!.length - 1]).toBe(10);
        expect(edges[0].movementCost).toBeGreaterThan(4);
        expect(edges[0]).toMatchObject({ id: "edge-0", from: "north", to: "south", terrain: "river-crossing", chokepoint: true });
    });

    it("keeps an edge the ground can no longer carry as the straight line it was", () => {
        const { edges } = worldOnTiles({ landmass: LANDMASS, terrainField: FIELD, overlays: [], nodes: oldNodes(), edges: [oldEdge] });
        expect(edges[0]).toEqual(oldEdge);
    });

    it("gives a world older than the terrain field the tile under each node, and leaves its edges straight", () => {
        const { nodes, edges, changed } = worldOnTiles({ landmass: LANDMASS, nodes: oldNodes(), edges: [oldEdge] });
        expect(changed).toBe(true);
        expect(nodes.map(node => node.tile)).toEqual([0, 5]);
        expect(edges).toEqual([oldEdge]);
    });
});
