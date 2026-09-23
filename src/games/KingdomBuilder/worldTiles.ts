// Worlds generated before PR 16 (GDD §3.8, "Old worlds"): their nodes carry
// no `tile` and their edges no `path`. A world with a terrain field (PR 9 on)
// can have both worked out from what it already stores — each node stood on
// the nearest free passable tile, each edge re-drawn as the cheapest path
// between its two nodes — and worldView saves the result once, so nothing
// downstream (the map, and from PR 18/19 catchments and armies) needs to
// know a world was ever any other shape. A world older than the terrain
// field has no ground to path over: its nodes get the tile under them, read
// as if the whole map were grass, and its edges stay straight lines. Those
// are testing worlds, and §9.1 is how they get cleared out.

import type { StoredWorldNode } from "./KingdomBuilderWorldModel";
import { TERRAIN_FIELD_TILE_SIZE, findTilePath, routeFields, snapToTiles, travelGridFor, type Landmass, type OverlayPlacement, type TerrainField, type TravelGrid, type WorldEdge, type WorldNode } from "./worldgen";

export interface WorldOnTiles {
    nodes: WorldNode[];
    edges: WorldEdge[];
    /** Whether anything had to be worked out — and so whether a world with a field has something worth saving. */
    changed: boolean;
}

/** The whole map as grass: somewhere to put a node when there is no real ground to read. */
function openGround(landmass: Landmass): TravelGrid {
    const columns = Math.round(landmass.width / TERRAIN_FIELD_TILE_SIZE);
    const rows = Math.round(landmass.height / TERRAIN_FIELD_TILE_SIZE);
    return travelGridFor({ columns, rows, tileSize: TERRAIN_FIELD_TILE_SIZE, codes: "g".repeat(columns * rows) });
}

function snapNodes(nodes: readonly StoredWorldNode[], grid: TravelGrid): WorldNode[] {
    const taken = new Set(nodes.flatMap(node => (node.tile === undefined ? [] : [node.tile])));
    return nodes.map(node => (node.tile === undefined ? snapToTiles([node], grid, taken)[0] : node) as WorldNode);
}

export function worldOnTiles(world: { landmass: Landmass; terrainField?: TerrainField; overlays?: OverlayPlacement[]; nodes: StoredWorldNode[]; edges: WorldEdge[] }): WorldOnTiles {
    const needsTiles = world.nodes.some(node => node.tile === undefined);
    const needsPaths = world.terrainField !== undefined && world.edges.some(edge => edge.path === undefined);
    if (!needsTiles && !needsPaths) return { nodes: world.nodes as WorldNode[], edges: world.edges, changed: false };

    const field = world.terrainField;
    if (!field) return { nodes: snapNodes(world.nodes, openGround(world.landmass)), edges: world.edges, changed: true };

    const grid = travelGridFor(field, world.overlays);
    let nodes: WorldNode[];
    try {
        nodes = snapNodes(world.nodes, grid);
    } catch {
        // Nowhere free to stand near some node — ground this odd has nothing to
        // path over either, so it is placed as a world with no field would be,
        // and saved like one: working it out again on every view gains nothing.
        return { nodes: snapNodes(world.nodes, openGround(world.landmass)), edges: world.edges, changed: true };
    }
    const tileOf = new Map(nodes.map(node => [node.id, node.tile]));
    const edges = world.edges.map((edge): WorldEdge => {
        if (edge.path) return edge;
        const from = tileOf.get(edge.from), to = tileOf.get(edge.to);
        const route = from === undefined || to === undefined ? undefined : findTilePath(grid, from, to);
        // An edge the ground can't carry any more keeps its straight line and its old cost.
        if (!route) return edge;
        return { ...edge, ...routeFields(field, route) };
    });
    return { nodes, edges, changed: true };
}
