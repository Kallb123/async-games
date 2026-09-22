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
import { pointDistance } from "./landmass";
import type { RandomSource } from "./random";
import { BEACH_CODE, FIELDS_CODE, GRASS_CODE, HILLS_CODE, MOUNTAINS_CODE, OCEAN_CODE, WOODLAND_CODE, areaWeightForCode } from "./areas";
import { overlayCodesByTile, overlayForCode, type OverlayPlacement } from "./overlays";
import { tileAt, tileCentre, tileIndex, walkTileLine, type TerrainField } from "./terrainField";

const ROAD_CODE = "R";
const PIER_CODE = "P";
const SIGNPOST_CODE = "J";

const OCCUPIED_SITE_TYPES: ReadonlySet<SettlementSiteType> = new Set(["player-start", "barbarian"]);

/** A settlement site that is actually someone's — the "occupied settlements" the road table means, not an open expansion site nobody has founded yet. */
function isOccupiedSettlement(node: WorldNode | undefined): node is WorldNode {
    return node !== undefined && node.kind === "settlement" && OCCUPIED_SITE_TYPES.has(node.siteType);
}

/**
 * Roads (§3.5.3): the tiles under an edge between two occupied settlements,
 * at the Road registry entry's own weight — which is always ≤ any passable
 * area's own weight (the registry entry's comment is the guard for this), so
 * a road can only ever match or improve the ground it's laid on, never make
 * it slower. Tiles a bridge or ford already claims keep that overlay and its
 * own cost untouched; a road never overwrites one.
 */
export function deriveRoadOverlays(
    field: TerrainField,
    nodesById: ReadonlyMap<string, WorldNode>,
    edges: readonly WorldEdge[],
    existingOverlayByTile: ReadonlyMap<number, string>,
): { edges: WorldEdge[]; overlays: OverlayPlacement[] } {
    const roadMovement = overlayForCode(ROAD_CODE)!.movement;
    const roadWeight = roadMovement.kind === "weight" ? roadMovement.multiplier : 1;
    const roadTiles = new Map<number, OverlayPlacement>();

    const updatedEdges = edges.map((edge): WorldEdge => {
        const from = nodesById.get(edge.from);
        const to = nodesById.get(edge.to);
        if (!isOccupiedSettlement(from) || !isOccupiedSettlement(to)) return edge;

        let cost = 0;
        for (const segment of walkTileLine(field, from, to)) {
            const tile = tileIndex(field, segment.col, segment.row);
            const code = field.codes[tile];
            const weight = areaWeightForCode(code);
            const claimedBy = existingOverlayByTile.get(tile);

            if (weight === "impassable") {
                // Already a bridge or ford — every impassable tile on an edge
                // this graph offered at all is one, so this is never absent.
                const crossing = claimedBy ? overlayForCode(claimedBy) : undefined;
                const multiplier = crossing?.movement.kind === "passable" ? crossing.movement.multiplier : 1;
                cost += multiplier * segment.length;
                continue;
            }
            if (claimedBy) {
                // Some other overlay (a pier, a signpost) already owns this
                // tile — leave its ground cost alone rather than draw two
                // overlays on one square.
                cost += weight * segment.length;
                continue;
            }
            cost += Math.min(weight, roadWeight) * segment.length;
            if (!roadTiles.has(tile)) roadTiles.set(tile, { tile, code: ROAD_CODE });
        }
        return { ...edge, movementCost: cost };
    });

    return { edges: updatedEdges, overlays: [...roadTiles.values()] };
}

/** Expanding a ring search outward from (col, row), the nearest tile carrying `code` and not already claimed — deterministic, so the same field always finds the same tile. */
function nearestUnclaimedTile(field: TerrainField, col: number, row: number, code: string, radius: number, claimed: ReadonlySet<number>): number | undefined {
    for (let ring = 0; ring <= radius; ring++) {
        for (let dr = -ring; dr <= ring; dr++) {
            for (let dc = -ring; dc <= ring; dc++) {
                if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
                const c = col + dc, r = row + dr;
                if (c < 0 || c >= field.columns || r < 0 || r >= field.rows) continue;
                const tile = tileIndex(field, c, r);
                if (claimed.has(tile) || field.codes[tile] !== code) continue;
                return tile;
            }
        }
    }
    return undefined;
}

/** How far a landmark's own tile is from the nearest tile carrying `code` — infinite if none is within `radius`. */
function distanceToNearestCode(field: TerrainField, col: number, row: number, code: string, radius: number): number {
    for (let ring = 0; ring <= radius; ring++) {
        for (let dr = -ring; dr <= ring; dr++) {
            for (let dc = -ring; dc <= ring; dc++) {
                if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
                const c = col + dc, r = row + dr;
                if (c < 0 || c >= field.columns || r < 0 || r >= field.rows) continue;
                if (field.codes[tileIndex(field, c, r)] === code) return ring;
            }
        }
    }
    return Infinity;
}

const PIER_SEARCH_RADIUS = 2;

/** Piers (§3.5.3): a shore tile beside a settlement site on the coast — landmarks, not a route, so no cost changes. A site with no beach nearby simply gets none. */
export function derivePierOverlays(field: TerrainField, nodes: readonly WorldNode[], claimed: ReadonlySet<number>): OverlayPlacement[] {
    const placements: OverlayPlacement[] = [];
    const owned = new Set(claimed);
    for (const node of nodes) {
        if (node.kind !== "settlement") continue;
        const { col, row } = tileAt(field, node);
        const tile = nearestUnclaimedTile(field, col, row, BEACH_CODE, PIER_SEARCH_RADIUS, owned);
        if (tile === undefined) continue;
        placements.push({ tile, code: PIER_CODE });
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
            count: 6,
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
            count: 4,
            minimumSpacing: 8,
            eligible: (field, col, row) => {
                if (field.codes[tileIndex(field, col, row)] !== HILLS_CODE) return false;
                return distanceToNearestCode(field, col, row, FIELDS_CODE, AWAY_FROM_FIELDS_RADIUS) > AWAY_FROM_FIELDS_RADIUS;
            },
        },
        {
            code: "K",
            count: 4,
            minimumSpacing: 6,
            eligible: (field, col, row) => {
                if (field.codes[tileIndex(field, col, row)] !== OCEAN_CODE) return false;
                return distanceToNearestCode(field, col, row, BEACH_CODE, NEAR_SHORE_RADIUS) <= NEAR_SHORE_RADIUS;
            },
        },
        {
            code: "V",
            count: 3,
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

    const roads = deriveRoadOverlays(field, nodesById, edges, overlayCodesByTile(existingOverlays));
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
