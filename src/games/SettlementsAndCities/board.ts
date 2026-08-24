import type { SACExpansions } from './expansions';
import { shuffle as shuffleArray } from '@/utils/games/shuffle';

// ─── Resource / Terrain / Card types ──────────────────────────────────────────

export type SAC_Resource = 'lumber' | 'wool' | 'grain' | 'brick' | 'ore';

// An all-zero resource hand. The response only carries a player's `resources`
// when they are the one asking (see apiModels), so viewer-side code reads it as
// `ps.resources ?? NO_RESOURCES` rather than repeating this literal.
export const NO_RESOURCES: Record<SAC_Resource, number> =
    { lumber: 0, wool: 0, grain: 0, brick: 0, ore: 0 };
export type SAC_Terrain  = 'forest' | 'pasture' | 'fields' | 'hills' | 'mountains' | 'desert';
export type SAC_DevCard  = 'knight' | 'victoryPoint' | 'roadBuilding' | 'yearOfPlenty' | 'monopoly';
export type SAC_Harbor   = '3to1' | 'lumber' | 'wool' | 'grain' | 'brick' | 'ore';

// ─── Per-tile / per-piece state interfaces ────────────────────────────────────

export interface ISACHex {
    terrain: SAC_Terrain;
    numberToken: number | null;
}

export interface ISACVertex {
    building: 'settlement' | 'city' | null;
    owner: string | null;
}

export interface ISACEdge {
    hasRoad: boolean;
    owner: string | null;
}

export interface ISACHarbor {
    type: SAC_Harbor;
    vertices: [number, number];
}

// ─── Player state ─────────────────────────────────────────────────────────────

export interface ISACResources {
    lumber: number;
    wool: number;
    grain: number;
    brick: number;
    ore: number;
}

export interface ISACDevCards {
    knight: number;
    victoryPoint: number;
    roadBuilding: number;
    yearOfPlenty: number;
    monopoly: number;
}

export interface ISACPlayerState {
    resources: ISACResources;
    devCards: ISACDevCards;
    newDevCards: ISACDevCards;
    knightsPlayed: number;
    remainingRoads: number;
    remainingSettlements: number;
    remainingCities: number;
    // Cumulative match-stat counters, tallied live as the game is played (see
    // SettlementsAndCitiesLogic.ts) because they can't be reconstructed from
    // final board/hand state alone. Boiled down into the GameResult read model
    // at game-end by computeSettlementsAndCitiesResultStats.
    devCardsBought: number;
    resourcesGathered: number;
    robberUses: number;
}

// ─── Full specific game state ─────────────────────────────────────────────────

export interface ISACSpecificGameState {
    hexes: ISACHex[];
    vertices: ISACVertex[];
    edges: ISACEdge[];
    harbors: ISACHarbor[];
    playerStates: Map<string, ISACPlayerState>;
    robberHexIndex: number;
    phase: 'setup' | 'main';
    setupStep: number;
    pendingRoadSetup: boolean;
    lastSetupSettlementVertex: number | null;
    hasRolled: boolean;
    lastRoll: number | null;
    lastRollDie1: number | null;
    lastRollDie2: number | null;
    pendingRobber: boolean;
    longestRoadOwner: string | null;
    largestArmyOwner: string | null;
    devCardDeck: SAC_DevCard[];
    pendingRoadBuilding: number;
    playedDevCard: boolean;
    // ─── 5–6 Player Extension: Special Build Phase (design doc §8.5) ───────────
    // After the active player ends their turn, every *other* player (in turn
    // order) gets one chance to build and trade with the bank before the dice
    // pass on. We model each such chance as its own currentTurn so the existing
    // async turn-passing + notification machinery drives it.
    //
    // `specialBuildActive` is true while the phase is running; `specialBuildQueue`
    // holds the userIds still owed a special-build turn (front = whose turn it is
    // now); `specialBuildMainPlayer` remembers the player whose main turn opened
    // the phase, so the dice can resume from the correct seat afterwards.
    specialBuildActive: boolean;
    specialBuildQueue: string[];
    specialBuildMainPlayer: string | null;
    // Which optional expansions are active for this game (design doc §8).
    expansions: SACExpansions;
    // VP needed to win. Base game is 10; expansions can raise it (§7, §8).
    victoryTarget: number;
}

// ─── Hex positions (axial coordinates) ───────────────────────────────────────

export const HEX_POSITIONS: readonly { q: number; r: number }[] = [
    // r = -2
    { q: 0, r: -2 }, { q: 1, r: -2 }, { q: 2, r: -2 },
    // r = -1
    { q: -1, r: -1 }, { q: 0, r: -1 }, { q: 1, r: -1 }, { q: 2, r: -1 },
    // r = 0
    { q: -2, r: 0 }, { q: -1, r: 0 }, { q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 },
    // r = 1
    { q: -2, r: 1 }, { q: -1, r: 1 }, { q: 0, r: 1 }, { q: 1, r: 1 },
    // r = 2
    { q: -2, r: 2 }, { q: -1, r: 2 }, { q: 0, r: 2 },
] as const;

// Vertex offsets from hex center in integer coordinate space
// Vertex indices 0–5 go clockwise from the top vertex
const VERTEX_DX = [0, 1, 1, 0, -1, -1] as const;
const VERTEX_DY = [-2, -1, 1, 2, 1, -1] as const;

// ─── Board topology ───────────────────────────────────────────────────────────

export interface BoardTopology {
    numVertices: number;
    numEdges: number;
    /** hexVertices[hexId][0..5] = vertex IDs of the hex's 6 corners (CW from top) */
    hexVertices: number[][];
    /** hexEdges[hexId][0..5] = edge IDs of the hex's 6 sides */
    hexEdges: number[][];
    /** vertexHexes[vertexId] = hex IDs that touch this vertex */
    vertexHexes: number[][];
    /** vertexEdges[vertexId] = edge IDs connected to this vertex */
    vertexEdges: number[][];
    /** vertexAdjacent[vertexId] = adjacent vertex IDs */
    vertexAdjacent: number[][];
    /** edges[edgeId] = [vertexId1, vertexId2] */
    edges: [number, number][];
    /** Integer (xi, yi) used for computing pixel positions via
     *  pixel_x = cx + SIZE * √3/2 * xi
     *  pixel_y = cy + SIZE/2  * yi
     */
    vertexIntCoords: { x: number; y: number }[];
    /** Integer centre coords for each hex: xi = 2q+r, yi = 3r */
    hexIntCoords: { x: number; y: number }[];
}

function computeBoardTopology(): BoardTopology {
    const vertexKeyToId = new Map<string, number>();
    const vertexIntCoords: { x: number; y: number }[] = [];
    const hexVertices: number[][] = [];

    const edgeKeyToId = new Map<string, number>();
    const edgesList: [number, number][] = [];
    const hexEdges: number[][] = [];

    for (let hexId = 0; hexId < HEX_POSITIONS.length; hexId++) {
        const { q, r } = HEX_POSITIONS[hexId];
        const vids: number[] = [];

        for (let vi = 0; vi < 6; vi++) {
            const xi = 2 * q + r + VERTEX_DX[vi];
            const yi = 3 * r + VERTEX_DY[vi];
            const key = `${xi},${yi}`;
            if (!vertexKeyToId.has(key)) {
                vertexKeyToId.set(key, vertexKeyToId.size);
                vertexIntCoords.push({ x: xi, y: yi });
            }
            vids.push(vertexKeyToId.get(key)!);
        }
        hexVertices.push(vids);

        const eids: number[] = [];
        for (let ei = 0; ei < 6; ei++) {
            const v1 = vids[ei];
            const v2 = vids[(ei + 1) % 6];
            const lo = Math.min(v1, v2);
            const hi = Math.max(v1, v2);
            const eKey = `${lo}-${hi}`;
            if (!edgeKeyToId.has(eKey)) {
                edgeKeyToId.set(eKey, edgeKeyToId.size);
                edgesList.push([lo, hi]);
            }
            eids.push(edgeKeyToId.get(eKey)!);
        }
        hexEdges.push(eids);
    }

    const numVertices = vertexIntCoords.length;
    const numEdges    = edgesList.length;

    const vertexHexes: number[][] = Array.from({ length: numVertices }, () => []);
    for (let h = 0; h < HEX_POSITIONS.length; h++) {
        for (const vid of hexVertices[h]) vertexHexes[vid].push(h);
    }

    const vertexEdges: number[][] = Array.from({ length: numVertices }, () => []);
    for (let eid = 0; eid < numEdges; eid++) {
        const [v1, v2] = edgesList[eid];
        vertexEdges[v1].push(eid);
        vertexEdges[v2].push(eid);
    }

    const vertexAdjacent: number[][] = Array.from({ length: numVertices }, () => []);
    for (const [v1, v2] of edgesList) {
        vertexAdjacent[v1].push(v2);
        vertexAdjacent[v2].push(v1);
    }

    const hexIntCoords = HEX_POSITIONS.map(({ q, r }) => ({ x: 2 * q + r, y: 3 * r }));

    return {
        numVertices,
        numEdges,
        hexVertices,
        hexEdges,
        vertexHexes,
        vertexEdges,
        vertexAdjacent,
        edges: edgesList,
        vertexIntCoords,
        hexIntCoords,
    };
}

export const BOARD_TOPOLOGY: BoardTopology = computeBoardTopology();

// ─── Harbor definitions ────────────────────────────────────────────────────────
// Each entry is (hex array index, edge index 0–5) for an outer sea-facing edge.
// The two vertices of that edge are the harbour access points.
const HARBOR_HEX_EDGES: readonly { hexIdx: number; edgeIdx: number }[] = [
    { hexIdx: 0,  edgeIdx: 5 }, // hex (0,-2)   NW outer edge
    { hexIdx: 1,  edgeIdx: 0 }, // hex (1,-2)   NE outer edge
    { hexIdx: 2,  edgeIdx: 1 }, // hex (2,-2)   E  outer edge
    { hexIdx: 6,  edgeIdx: 1 }, // hex (2,-1)   E  outer edge
    { hexIdx: 11, edgeIdx: 2 }, // hex (2, 0)   SE outer edge
    { hexIdx: 15, edgeIdx: 2 }, // hex (1, 1)   SE outer edge
    { hexIdx: 17, edgeIdx: 2 }, // hex (-1,2)   SE outer edge
    { hexIdx: 16, edgeIdx: 3 }, // hex (-2,2)   SW outer edge
    { hexIdx: 7,  edgeIdx: 4 }, // hex (-2,0)   W  outer edge
] as const;

// ─── Static distributions ─────────────────────────────────────────────────────

const TERRAIN_POOL: SAC_Terrain[] = [
    'forest', 'forest', 'forest', 'forest',
    'pasture', 'pasture', 'pasture', 'pasture',
    'fields', 'fields', 'fields', 'fields',
    'hills', 'hills', 'hills',
    'mountains', 'mountains', 'mountains',
    'desert',
];

const NUMBER_TOKEN_POOL: number[] = [
    2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12,
];

const HARBOR_TYPE_POOL: SAC_Harbor[] = [
    '3to1', '3to1', '3to1', '3to1', 'lumber', 'wool', 'grain', 'brick', 'ore',
];

export const DEV_CARD_DECK: SAC_DevCard[] = [
    ...Array<SAC_DevCard>(14).fill('knight'),
    ...Array<SAC_DevCard>(5).fill('victoryPoint'),
    ...Array<SAC_DevCard>(2).fill('roadBuilding'),
    ...Array<SAC_DevCard>(2).fill('yearOfPlenty'),
    ...Array<SAC_DevCard>(2).fill('monopoly'),
];

export const TERRAIN_TO_RESOURCE: Partial<Record<SAC_Terrain, SAC_Resource>> = {
    forest:    'lumber',
    pasture:   'wool',
    fields:    'grain',
    hills:     'brick',
    mountains: 'ore',
};

// ─── Board generation ─────────────────────────────────────────────────────────

export interface GeneratedBoard {
    hexes: ISACHex[];
    harbors: ISACHarbor[];
    desertHexIndex: number;
}

export function generateBoard(): GeneratedBoard {
    const terrains = shuffleArray(TERRAIN_POOL);
    const tokens   = shuffleArray(NUMBER_TOKEN_POOL);

    let tokenIdx = 0;
    const hexes: ISACHex[] = terrains.map(terrain => {
        if (terrain === 'desert') return { terrain, numberToken: null };
        return { terrain, numberToken: tokens[tokenIdx++] };
    });

    const harborTypes = shuffleArray(HARBOR_TYPE_POOL);
    const harbors: ISACHarbor[] = HARBOR_HEX_EDGES.map(({ hexIdx, edgeIdx }, i) => {
        const v1 = BOARD_TOPOLOGY.hexVertices[hexIdx][edgeIdx];
        const v2 = BOARD_TOPOLOGY.hexVertices[hexIdx][(edgeIdx + 1) % 6];
        return { type: harborTypes[i], vertices: [v1, v2] };
    });

    const desertHexIndex = terrains.indexOf('desert');

    return { hexes, harbors, desertHexIndex };
}

// ─── Initial player state factory ─────────────────────────────────────────────

export function createInitialPlayerState(): ISACPlayerState {
    return {
        // Spread, not shared: a player's hand is mutated in place all game.
        resources: { ...NO_RESOURCES },
        devCards:    { knight: 0, victoryPoint: 0, roadBuilding: 0, yearOfPlenty: 0, monopoly: 0 },
        newDevCards: { knight: 0, victoryPoint: 0, roadBuilding: 0, yearOfPlenty: 0, monopoly: 0 },
        knightsPlayed: 0,
        remainingRoads: 15,
        remainingSettlements: 5,
        remainingCities: 4,
        devCardsBought: 0,
        resourcesGathered: 0,
        robberUses: 0,
    };
}

// ─── Longest road calculation ─────────────────────────────────────────────────

function dfsRoad(
    vertexId: number,
    visitedEdges: Set<number>,
    vertices: ISACVertex[],
    edges: ISACEdge[],
    playerId: string,
): number {
    let best = 0;
    for (const eid of BOARD_TOPOLOGY.vertexEdges[vertexId]) {
        if (visitedEdges.has(eid)) continue;
        const edge = edges[eid];
        if (!edge.hasRoad || edge.owner !== playerId) continue;

        const [v1, v2] = BOARD_TOPOLOGY.edges[eid];
        const nextVertex = v1 === vertexId ? v2 : v1;

        // An opponent's building on nextVertex breaks the road
        const nv = vertices[nextVertex];
        if (nv.owner !== null && nv.owner !== playerId && nv.building !== null) continue;

        visitedEdges.add(eid);
        const len = 1 + dfsRoad(nextVertex, visitedEdges, vertices, edges, playerId);
        visitedEdges.delete(eid);
        if (len > best) best = len;
    }
    return best;
}

export function calculateLongestRoad(
    playerId: string,
    vertices: ISACVertex[],
    edges: ISACEdge[],
): number {
    let best = 0;
    const visited = new Set<number>();
    for (let vid = 0; vid < BOARD_TOPOLOGY.numVertices; vid++) {
        const len = dfsRoad(vid, visited, vertices, edges, playerId);
        if (len > best) best = len;
    }
    return best;
}

// ─── Victory point calculation (excluding hidden VP cards) ────────────────────

export function calculateVisibleVP(
    playerId: string,
    vertices: ISACVertex[],
    longestRoadOwner: string | null,
    largestArmyOwner: string | null,
): number {
    let vp = 0;
    for (const vertex of vertices) {
        if (vertex.owner !== playerId) continue;
        if (vertex.building === 'settlement') vp += 1;
        if (vertex.building === 'city') vp += 2;
    }
    if (longestRoadOwner === playerId) vp += 2;
    if (largestArmyOwner === playerId) vp += 2;
    return vp;
}

export function calculateTotalVP(
    playerId: string,
    vertices: ISACVertex[],
    devCards: { victoryPoint: number },
    longestRoadOwner: string | null,
    largestArmyOwner: string | null,
): number {
    return calculateVisibleVP(playerId, vertices, longestRoadOwner, largestArmyOwner)
        + devCards.victoryPoint;
}

// ─── Placement validation helpers ─────────────────────────────────────────────

/** Returns true if a settlement can be placed at vertexId (distance rule). */
export function isValidSettlementVertex(
    vertexId: number,
    vertices: ISACVertex[],
): boolean {
    if (vertices[vertexId].building !== null) return false;
    for (const adj of BOARD_TOPOLOGY.vertexAdjacent[vertexId]) {
        if (vertices[adj].building !== null) return false;
    }
    return true;
}

/** Returns true if an edge can have a road placed by playerId. */
export function isValidRoadEdge(
    edgeId: number,
    playerId: string,
    vertices: ISACVertex[],
    edges: ISACEdge[],
): boolean {
    if (edges[edgeId].hasRoad) return false;
    const [v1, v2] = BOARD_TOPOLOGY.edges[edgeId];
    for (const vid of [v1, v2]) {
        const vertex = vertices[vid];
        // Own settlement/city on this vertex
        if (vertex.owner === playerId && vertex.building !== null) return true;
        // Own road connects through this vertex (no opponent blocking)
        if (vertex.owner !== null && vertex.owner !== playerId && vertex.building !== null) continue;
        for (const adjEdge of BOARD_TOPOLOGY.vertexEdges[vid]) {
            if (adjEdge === edgeId) continue;
            if (edges[adjEdge].hasRoad && edges[adjEdge].owner === playerId) return true;
        }
    }
    return false;
}

/** Returns true if a road can be placed adjacent to a specific vertex (setup). */
export function isValidSetupRoadEdge(
    edgeId: number,
    settlementVertexId: number,
    edges: ISACEdge[],
): boolean {
    if (edges[edgeId].hasRoad) return false;
    const [v1, v2] = BOARD_TOPOLOGY.edges[edgeId];
    return v1 === settlementVertexId || v2 === settlementVertexId;
}
