// The overlay vocabulary (GDD §3.5.3, PR 12): everything beyond the load-bearing
// bridge/ford PR 9 shipped. Two families:
//
// - **Derived, not load-bearing**: piers, roads and signposts. Each is worked
//   out from something the generator already knows — a coastal site, an edge
//   between two occupied settlements, a node where several edges meet — the
//   same "derived overlays are not a second source of truth" rule bridges and
//   fords already follow.
// - **Scattered**: ruins, standing stones, shipwrecks, watchtowers. A seeded
//   placement pass per landmark, so a world's landmarks are the same for
//   everyone who loads it, same as every other generation step.
//
// Every pass here only *appends* to the sparse overlay list and, for roads,
// adjusts the one edge it improves — nothing here changes how a bridge or a
// ford is found, and OVERLAYS/OVERLAY_BY_CODE stay the one place a code's
// meaning is declared.

import type { Point, SettlementSiteType, WorldEdge, WorldNode } from "./landmass";
import { WORLD_AREA_SCALE, pointDistance } from "./landmass";
import type { RandomSource } from "./random";
import { BEACH_CODE, FIELDS_CODE, GRASS_CODE, HILLS_CODE, MOUNTAINS_CODE, OCEAN_CODE, WOODLAND_CODE } from "./areas";
import type { OverlayPlacement } from "./overlays";
import { tileAt, tileCentre, tileIndex, tilesInRing, type TerrainField } from "./terrainField";
import { pathCost, travelGridFor } from "./tilePath";

const ROAD_CODE = "R";
const PIER_CODE = "P";
const SIGNPOST_CODE = "J";

const OCCUPIED_SITE_TYPES: ReadonlySet<SettlementSiteType> = new Set(["player-start", "barbarian"]);

/** A settlement site that is actually someone's — the "occupied settlements" the road table means, not an open expansion site nobody has founded yet. */
function isOccupiedSettlement(node: WorldNode | undefined): node is WorldNode {
    return node !== undefined && node.kind === "settlement" && OCCUPIED_SITE_TYPES.has(node.siteType);
}

/**
 * Roads (§3.5.3, §3.8): the tiles along the route of an edge between two
 * occupied settlements, at the Road registry entry's own weight — which is
 * always ≤ any passable area's own weight (the registry entry's comment is the
 * guard for this), so a road can only ever match or improve the ground it's
 * laid on. Every tile the road improves is one the pathfinder will now prefer,
 * so a road is a real shortcut, and the edge's cost is its route re-priced
 * with the road down. A tile some other overlay already claims — a bridge, a
 * ford — keeps it; a road never overwrites one.
 */
export function deriveRoadOverlays(
    field: TerrainField,
    nodesById: ReadonlyMap<string, WorldNode>,
    edges: readonly WorldEdge[],
    existingOverlays: readonly OverlayPlacement[],
): { edges: WorldEdge[]; overlays: OverlayPlacement[] } {
    const claimed = new Set(existingOverlays.map(overlay => overlay.tile));
    const roadTiles = new Map<number, OverlayPlacement>();
    const roadEdges = edges.filter(edge => edge.path && isOccupiedSettlement(nodesById.get(edge.from)) && isOccupiedSettlement(nodesById.get(edge.to)));
    for (const edge of roadEdges) {
        for (const tile of edge.path!) {
            if (!claimed.has(tile) && !roadTiles.has(tile)) roadTiles.set(tile, { tile, code: ROAD_CODE });
        }
    }
    if (roadTiles.size === 0) return { edges: [...edges], overlays: [] };

    const overlays = [...roadTiles.values()];
    const grid = travelGridFor(field, [...existingOverlays, ...overlays]);
    const repriced = new Set(roadEdges);
    return {
        edges: edges.map(edge => (repriced.has(edge) ? { ...edge, movementCost: pathCost(grid, edge.path!) } : edge)),
        overlays,
    };
}

/**
 * The one expanding-ring walk both proximity checks below need: every tile
 * within `radius` of (col, row), nearest ring first, off the grid never
 * visited — deterministic, so the same field always finds the same tile.
 * Stops at the first tile `accept` returns true for.
 */
function findInRings(field: TerrainField, col: number, row: number, radius: number, accept: (tile: number) => boolean): number | undefined {
    for (let ring = 0; ring <= radius; ring++) {
        const found = tilesInRing(field, col, row, ring).find(accept);
        if (found !== undefined) return found;
    }
    return undefined;
}

/** The nearest tile carrying `code` and not already claimed, within `radius`. */
function nearestUnclaimedTile(field: TerrainField, col: number, row: number, code: string, radius: number, claimed: ReadonlySet<number>): number | undefined {
    return findInRings(field, col, row, radius, tile => !claimed.has(tile) && field.codes[tile] === code);
}

/** Whether a tile carrying `code` sits within `radius` — every call site here only ever asks a yes/no question, never how far. */
function isCodeNearby(field: TerrainField, col: number, row: number, code: string, radius: number): boolean {
    return findInRings(field, col, row, radius, tile => field.codes[tile] === code) !== undefined;
}

const PIER_SEARCH_RADIUS = 2;

/** Which compass side (col, row) sits on relative to (fromCol, fromRow) — a pier's own `orientation`, the side of the settlement site that faces the water it points out into. */
function compassDirection(fromCol: number, fromRow: number, col: number, row: number): "n" | "e" | "s" | "w" {
    const dc = col - fromCol, dr = row - fromRow;
    if (Math.abs(dc) >= Math.abs(dr)) return dc >= 0 ? "e" : "w";
    return dr >= 0 ? "s" : "n"; // row increases downward on the grid
}

/** Piers (§3.5.3): a shore tile beside a settlement site on the coast — landmarks, not a route, so no cost changes. A site with no beach nearby simply gets none. */
export function derivePierOverlays(field: TerrainField, nodes: readonly WorldNode[], claimed: ReadonlySet<number>): OverlayPlacement[] {
    const placements: OverlayPlacement[] = [];
    const owned = new Set(claimed);
    for (const node of nodes) {
        if (node.kind !== "settlement") continue;
        const { col, row } = tileAt(field, node);
        const tile = nearestUnclaimedTile(field, col, row, BEACH_CODE, PIER_SEARCH_RADIUS, owned);
        if (tile === undefined) continue;
        const orientation = compassDirection(col, row, tile % field.columns, Math.floor(tile / field.columns));
        placements.push({ tile, code: PIER_CODE, orientation });
        owned.add(tile);
    }
    return placements;
}

/** Signposts (§3.5.3): a tile where three or more edges meet — every node's own degree in the final graph, not a route by itself. */
export function deriveSignpostOverlays(field: TerrainField, nodes: readonly WorldNode[], edges: readonly WorldEdge[], claimed: ReadonlySet<number>): OverlayPlacement[] {
    const degree = new Map<string, number>();
    for (const edge of edges) {
        degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
        degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
    }

    const placements: OverlayPlacement[] = [];
    const owned = new Set(claimed);
    for (const node of nodes) {
        if ((degree.get(node.id) ?? 0) < 3) continue;
        const { col, row } = tileAt(field, node);
        const tile = tileIndex(field, col, row);
        if (owned.has(tile)) continue;
        placements.push({ tile, code: SIGNPOST_CODE });
        owned.add(tile);
    }
    return placements;
}

interface ScatteredRule {
    code: string;
    count: number;
    /** Minimum world-unit distance between two placements of this same rule, so it reads as scattered rather than clumped. */
    minimumSpacing: number;
    eligible: (field: TerrainField, col: number, row: number) => boolean;
}

/** One landmark's own seeded rejection sampling (the same shape terrainNodes.ts and settlementSites.ts already use) — decorative, so a shortfall on an unlucky/small world is fine rather than a generation failure. */
function placeScattered(field: TerrainField, rule: ScatteredRule, random: RandomSource, claimed: ReadonlySet<number>): OverlayPlacement[] {
    const placements: OverlayPlacement[] = [];
    const chosen: Point[] = [];
    const owned = new Set(claimed);
    const maxAttempts = rule.count * 300;

    for (let attempt = 0; attempt < maxAttempts && placements.length < rule.count; attempt++) {
        const col = random.integer(field.columns);
        const row = random.integer(field.rows);
        const tile = tileIndex(field, col, row);
        if (owned.has(tile) || !rule.eligible(field, col, row)) continue;
        const centre = tileCentre(col, row);
        if (chosen.some(other => pointDistance(other, centre) < rule.minimumSpacing)) continue;

        placements.push({ tile, code: rule.code });
        chosen.push(centre);
        owned.add(tile);
    }
    return placements;
}

const AWAY_FROM_SITES_RADIUS = 6;
const NEAR_SHORE_RADIUS = 3;
const AWAY_FROM_FIELDS_RADIUS = 2;

/** The scattered pass's launch vocabulary (§3.5.3's table), one rule per landmark. */
function scatteredRules(nodes: readonly WorldNode[]): readonly ScatteredRule[] {
    return [
        {
            code: "U",
            count: 6 * WORLD_AREA_SCALE,
            minimumSpacing: 8,
            eligible: (field, col, row) => {
                const code = field.codes[tileIndex(field, col, row)];
                if (code !== GRASS_CODE && code !== WOODLAND_CODE) return false;
                const centre = tileCentre(col, row);
                return nodes.every(node => pointDistance(node, centre) >= AWAY_FROM_SITES_RADIUS);
            },
        },
        {
            code: "T",
            count: 4 * WORLD_AREA_SCALE,
            minimumSpacing: 8,
            eligible: (field, col, row) => {
                if (field.codes[tileIndex(field, col, row)] !== HILLS_CODE) return false;
                return !isCodeNearby(field, col, row, FIELDS_CODE, AWAY_FROM_FIELDS_RADIUS);
            },
        },
        {
            code: "K",
            count: 4 * WORLD_AREA_SCALE,
            minimumSpacing: 6,
            eligible: (field, col, row) => {
                if (field.codes[tileIndex(field, col, row)] !== OCEAN_CODE) return false;
                return isCodeNearby(field, col, row, BEACH_CODE, NEAR_SHORE_RADIUS);
            },
        },
        {
            code: "V",
            count: 3 * WORLD_AREA_SCALE,
            minimumSpacing: 10,
            eligible: (field, col, row) => field.codes[tileIndex(field, col, row)] === MOUNTAINS_CODE,
        },
    ];
}

/** The scattered pass: ruins, standing stones, shipwrecks, watchtowers, each placed independently by its own rule. */
export function placeScatteredLandmarks(field: TerrainField, nodes: readonly WorldNode[], random: RandomSource, claimed: ReadonlySet<number>): OverlayPlacement[] {
    const owned = new Set(claimed);
    const placements: OverlayPlacement[] = [];
    for (const rule of scatteredRules(nodes)) {
        const placed = placeScattered(field, rule, random, owned);
        for (const overlay of placed) owned.add(overlay.tile);
        placements.push(...placed);
    }
    return placements;
}

/**
 * The whole vocabulary in generation order: roads (which also adjust the
 * edges they improve), then piers, then signposts, then the scattered pass —
 * each reading the tiles every earlier step already claimed, so nothing here
 * ever draws two overlays on one square.
 */
export function applyOverlayVocabulary(
    field: TerrainField,
    nodes: readonly WorldNode[],
    edges: readonly WorldEdge[],
    existingOverlays: readonly OverlayPlacement[],
    random: RandomSource,
): { edges: WorldEdge[]; overlays: OverlayPlacement[] } {
    const nodesById = new Map(nodes.map(node => [node.id, node]));
    const claimed = new Set(existingOverlays.map(overlay => overlay.tile));

    const roads = deriveRoadOverlays(field, nodesById, edges, existingOverlays);
    for (const overlay of roads.overlays) claimed.add(overlay.tile);

    const piers = derivePierOverlays(field, nodes, claimed);
    for (const overlay of piers) claimed.add(overlay.tile);

    const signposts = deriveSignpostOverlays(field, nodes, edges, claimed);
    for (const overlay of signposts) claimed.add(overlay.tile);

    const scattered = placeScatteredLandmarks(field, nodes, random, claimed);

    return {
        edges: roads.edges,
        overlays: [...existingOverlays, ...roads.overlays, ...piers, ...signposts, ...scattered],
    };
}
