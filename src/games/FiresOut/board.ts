// Static board data for Fires Out: the 6×8 interior grid, its wall/door
// graph, the exterior parking track, and the printed Family setup — from
// docs/games/fires-out-gdd.md §3, §6.1 and §17.4. No server-only imports:
// rules.ts (and, via it, the client action picker) depends on this module
// staying isomorphic, the same contract board.ts holds for every other game.
//
// §17.4 fixes the grid convention once, here, rather than letting the
// coordinate mapping and the CSS grid each invent their own: **row = the d6,
// column = the d8**. `ROWS`/`COLS` and `spaceForRoll` are the single source of
// truth for that; nothing else should re-derive it.

export const ROWS = 6; // the d6
export const COLS = 8; // the d8
export const INTERIOR_SPACE_COUNT = ROWS * COLS; // 48

/** Row-major index of an interior space, 0..47. */
export function spaceIndex(row: number, col: number): number {
    return row * COLS + col;
}

export function rowOf(space: number): number {
    return Math.floor(space / COLS);
}

export function colOf(space: number): number {
    return space % COLS;
}

export function isInteriorSpace(space: number): boolean {
    return space >= 0 && space < INTERIOR_SPACE_COUNT;
}

// ─── Exterior parking track ─────────────────────────────────────────────────
// One exterior space per column, above row 0 and below row `ROWS - 1` — the
// "grid of 8 x 6 ... plus an exterior parking track" of §3. Simplified from
// the printed board: every column has an entry point (an 'open' edge, below)
// rather than only the columns the art marks with a door icon, since which
// columns those are is an art-alignment question and out of scope this
// session (see AGENTS.md task note). Refining this to match specific printed
// entry points is a board.ts-only change; nothing downstream assumes more
// than "some exterior spaces border some interior spaces".
export const EXTERIOR_TOP_START = INTERIOR_SPACE_COUNT; // 48..55
export const EXTERIOR_BOTTOM_START = INTERIOR_SPACE_COUNT + COLS; // 56..63
export const SPACE_COUNT = INTERIOR_SPACE_COUNT + 2 * COLS; // 64

export function exteriorTopSpace(col: number): number {
    return EXTERIOR_TOP_START + col;
}

export function exteriorBottomSpace(col: number): number {
    return EXTERIOR_BOTTOM_START + col;
}

export function isExteriorSpace(space: number): boolean {
    return space >= INTERIOR_SPACE_COUNT && space < SPACE_COUNT;
}

/** Where a firefighter starts: the exterior space outside the front door (§6.1 step 5, simplified to one shared entry point — see the note above `EXTERIOR_TOP_START`). */
export const START_SPACE = exteriorTopSpace(0);

// §6.2 step 6, §17.6 step 9: "separate exterior parking spots" for the two
// vehicles — fixed rather than player-chosen (the printed game doesn't
// mandate specific spots either). One per track, at the far end from
// START_SPACE (top-left): since driving only ever moves a vehicle along its
// own track (vehicleTrackNeighbours), starting them on different tracks
// means they can never collide with each other, and neither track's end
// collides with where firefighters enter. Always populated in
// specificGameState, meaningless in a Family game — the same "always
// populated" pattern `difficulty` already uses.
export const ENGINE_START = exteriorTopSpace(COLS - 1);
export const AMBULANCE_START = exteriorBottomSpace(COLS - 1);

/**
 * The parking spot(s) a vehicle can drive to from `space` — one step along
 * its own exterior track row (§12: vehicles never enter the building, and
 * this simplified board's two tracks don't connect to each other — see the
 * note above `EXTERIOR_TOP_START`). Deliberately not built from `edgesOf`/
 * `neighboursOf`: those model the wall/door graph state lives on, and a
 * parking spot has none of that — it's always drivable.
 */
export function vehicleTrackNeighbours(space: number): number[] {
    const col = colOf(space);
    const neighbours: number[] = [];
    if (space >= EXTERIOR_TOP_START && space < EXTERIOR_TOP_START + COLS) {
        if (col > 0) neighbours.push(exteriorTopSpace(col - 1));
        if (col < COLS - 1) neighbours.push(exteriorTopSpace(col + 1));
    } else if (space >= EXTERIOR_BOTTOM_START && space < EXTERIOR_BOTTOM_START + COLS) {
        if (col > 0) neighbours.push(exteriorBottomSpace(col - 1));
        if (col < COLS - 1) neighbours.push(exteriorBottomSpace(col + 1));
    }
    return neighbours;
}

// ─── Dice → coordinate (§3's design note, §9.1) ─────────────────────────────

/** The d6/d8 roll's target interior space — 1-6 picks the row, 1-8 the column. */
export function spaceForRoll(d6: number, d8: number): number {
    return spaceIndex(d6 - 1, d8 - 1);
}

// ─── Rooms, walls and doors ─────────────────────────────────────────────────
// A room id per interior space, used only here to derive which of the 82
// wall segments (§17.4) are open (same room), a solid wall (different room,
// no doorway), or one of the 8 physical door markers (§3's component count) —
// not read anywhere else. Loosely follows the printed floorplan
// (public/art/fires-out/board.png): living room, bathroom and bedroom along
// the top, a kitchen and den through the middle, dining room, second bedroom
// and second bathroom along the bottom. Exact room shapes are a rendering
// concern (step 5 of the implementation plan) and can be adjusted here later
// without touching rules.ts. Only this one layout exists — §3 and §6.1 step 1
// describe a double-sided board, but only one side's art was ever uploaded;
// see fires-out-gdd.md §17.3's deviation note.
const ROOM_GRID: number[][] = [
    [0, 0, 0, 1, 2, 2, 2, 2],
    [0, 0, 0, 1, 2, 2, 2, 2],
    [3, 3, 3, 3, 3, 4, 4, 4],
    [3, 3, 3, 3, 3, 4, 4, 4],
    [5, 5, 5, 6, 6, 6, 7, 7],
    [5, 5, 5, 6, 6, 6, 7, 7],
];

function roomOf(space: number): number {
    return ROOM_GRID[rowOf(space)][colOf(space)];
}

/** The 8 interior doorways (§3: "Door markers, 8, double-sided"), each a `[room, room]` boundary picked to connect every room to the crew's route through the house. */
const DOOR_BOUNDARIES = new Set([
    key(spaceIndex(1, 2), spaceIndex(2, 2)), // Living ↔ Kitchen
    key(spaceIndex(1, 3), spaceIndex(1, 4)), // Bathroom ↔ Bedroom
    key(spaceIndex(1, 4), spaceIndex(2, 4)), // Bedroom ↔ Kitchen
    key(spaceIndex(3, 4), spaceIndex(3, 5)), // Kitchen ↔ Den
    key(spaceIndex(3, 1), spaceIndex(4, 1)), // Kitchen ↔ Dining
    key(spaceIndex(4, 2), spaceIndex(4, 3)), // Dining ↔ Bedroom 2
    key(spaceIndex(4, 5), spaceIndex(4, 6)), // Bedroom 2 ↔ Bathroom 2
    key(spaceIndex(3, 6), spaceIndex(4, 6)), // Den ↔ Bathroom 2
]);

function key(a: number, b: number): string {
    return a < b ? `${a}-${b}` : `${b}-${a}`;
}

// ─── Edges ───────────────────────────────────────────────────────────────────
// A flat, numbered array rather than a keyed map (§17.4: "a Record<string, …>
// … becomes Schema.Types.Mixed, the schema can't validate it, and it invites
// two different key orderings for the same wall"). Order: the 42 vertical
// segments (row-major), then the 40 horizontal segments (row-major), then the
// 16 exterior openings (top row, then bottom row) — 98 total.

export type EdgeKind = 'wall' | 'door' | 'open';

export interface EdgeDef {
    id: number;
    a: number;
    b: number;
    kind: EdgeKind;
}

function buildEdgeDefs(): EdgeDef[] {
    const edges: EdgeDef[] = [];
    let id = 0;

    // Vertical segments: between (row, col) and (row, col+1).
    for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS - 1; col++) {
            const a = spaceIndex(row, col);
            const b = spaceIndex(row, col + 1);
            edges.push({ id: id++, a, b, kind: edgeKindFor(a, b) });
        }
    }

    // Horizontal segments: between (row, col) and (row+1, col).
    for (let row = 0; row < ROWS - 1; row++) {
        for (let col = 0; col < COLS; col++) {
            const a = spaceIndex(row, col);
            const b = spaceIndex(row + 1, col);
            edges.push({ id: id++, a, b, kind: edgeKindFor(a, b) });
        }
    }

    // Exterior openings: top row, then bottom row.
    for (let col = 0; col < COLS; col++) {
        edges.push({ id: id++, a: exteriorTopSpace(col), b: spaceIndex(0, col), kind: 'open' });
    }
    for (let col = 0; col < COLS; col++) {
        edges.push({ id: id++, a: exteriorBottomSpace(col), b: spaceIndex(ROWS - 1, col), kind: 'open' });
    }

    return edges;
}

function edgeKindFor(a: number, b: number): EdgeKind {
    if (roomOf(a) === roomOf(b)) return 'open';
    return DOOR_BOUNDARIES.has(key(a, b)) ? 'door' : 'wall';
}

export const EDGE_DEFS: EdgeDef[] = buildEdgeDefs();
export const EDGE_COUNT = EDGE_DEFS.length; // 98

// space -> its incident edge ids, for neighbour walks (movement, explosions,
// flashover adjacency).
const EDGES_BY_SPACE: number[][] = Array.from({ length: SPACE_COUNT }, () => []);
for (const edge of EDGE_DEFS) {
    EDGES_BY_SPACE[edge.a].push(edge.id);
    EDGES_BY_SPACE[edge.b].push(edge.id);
}

/** The edge ids touching `space`. */
export function edgesOf(space: number): number[] {
    return EDGES_BY_SPACE[space];
}

const EDGE_BY_PAIR = new Map<string, number>(EDGE_DEFS.map(e => [key(e.a, e.b), e.id]));

/** The edge between two orthogonally-adjacent spaces, or undefined if they aren't adjacent. */
export function edgeBetween(a: number, b: number): number | undefined {
    return EDGE_BY_PAIR.get(key(a, b));
}

/** The space on the far side of `edge` from `from`. */
export function otherSide(edge: EdgeDef, from: number): number {
    return edge.a === from ? edge.b : edge.a;
}

/** Every space orthogonally adjacent to `space` — walls and closed doors included, since adjacency for the fire table (§9.1) and flashover (§9.3) ignores both. */
export function neighboursOf(space: number): number[] {
    return edgesOf(space).map(id => otherSide(EDGE_DEFS[id], space));
}

// ─── Family setup (§6.1) ────────────────────────────────────────────────────

/** §6.1 step 2: a cluster of ten fire markers, centred on the kitchen/den. */
export const FAMILY_STARTING_FIRE: number[] = [
    spaceIndex(2, 1), spaceIndex(2, 2), spaceIndex(2, 3), spaceIndex(2, 4), spaceIndex(2, 5),
    spaceIndex(3, 1), spaceIndex(3, 2), spaceIndex(3, 3), spaceIndex(3, 4), spaceIndex(3, 5),
];

/** §6.1 step 4: the printed setup coordinates for the first three POIs. */
export const FAMILY_STARTING_POI: number[] = [
    spaceIndex(0, 0), spaceIndex(0, 6), spaceIndex(5, 6),
];

// §1's "1-6 players, solitaire supported by controlling multiple pawns" is
// two modes: this wires up the multiplayer one (2-6, one figure each).
// §17.3's deviation is deliberate — solitaire needs step 12's
// activeFirefighter/multi-pawn control and ships as a separate mode later,
// not as MIN_PLAYERS: 1 on the ordinary invite flow, which would let a
// one-firefighter game through the AP economy makes close to unwinnable.
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

// §5: the three end conditions.
export const VICTIMS_TO_WIN = 7;
export const VICTIMS_LOST_TO_LOSE = 4;
export const DAMAGE_TO_COLLAPSE = 24;

// §10.1: the POI pool — 10 victims, 5 false alarms — shuffled once at setup
// and drawn in order (§17.4's "the POI pool is shuffled once ... the way
// World Domination's territory deal is").
export const VICTIM_POI_COUNT = 10;
export const FALSE_ALARM_POI_COUNT = 5;

// ─── The Experienced game and its difficulty tiers (§6.2, §13) ─────────────
// Static setup configuration, alongside this file's other §3 component
// counts — rules.ts's applyExperiencedSetup (§17.6 step 8) is the behaviour
// that reads these, the same way it reads FAMILY_STARTING_FIRE/POI above.
// Mirrors Outbreak's DIFFICULTIES/OutbreakDifficulty in board.ts exactly.

export type RulesetId = 'family' | 'experienced';
export type DifficultyId = 'recruit' | 'veteran' | 'heroic';

export interface IFiresOutDifficultyTier {
    id: DifficultyId;
    label: string;
    /** §6.2 step 2: initial explosions resolved (with wall damage) before anyone's had a turn. */
    explosions: number;
    /** §6.2 step 3: hazmat markers placed at setup. */
    hazmats: number;
    description: string;
}

export const DIFFICULTY_TIERS: IFiresOutDifficultyTier[] = [
    { id: 'recruit', label: 'Recruit', explosions: 3, hazmats: 3, description: 'Comparable to the Family game.' },
    { id: 'veteran', label: 'Veteran', explosions: 3, hazmats: 4, description: 'Hard.' },
    { id: 'heroic', label: 'Heroic', explosions: 4, hazmats: 5, description: 'Very hard, with a larger hot spot reserve.' },
];

export function difficultyTier(difficulty: DifficultyId): IFiresOutDifficultyTier {
    return DIFFICULTY_TIERS.find(d => d.id === difficulty)!;
}

/** §3's component count — the total hot spot marker supply. Placed-on-board + reserve always equals this (a conservation invariant, like the POI pool and the damage markers — §17.7's testing note). */
export const TOTAL_HOTSPOT_MARKERS = 24;

// ─── Quadrants (§12.3, §17.6 step 9) ────────────────────────────────────────
// The deck gun targets "a quadrant of the building" — four equal 3-row ×
// 4-column regions, split at the grid's own midpoints. Interior spaces only;
// nothing calls quadrantOf on an exterior space.

export type Quadrant = 0 | 1 | 2 | 3;
export const QUADRANT_COUNT = 4;

export function quadrantOf(space: number): Quadrant {
    const top = rowOf(space) < ROWS / 2 ? 0 : 1;
    const left = colOf(space) < COLS / 2 ? 0 : 1;
    return (top * 2 + left) as Quadrant;
}

export function spacesInQuadrant(quadrant: Quadrant): number[] {
    const spaces: number[] = [];
    for (let space = 0; space < INTERIOR_SPACE_COUNT; space++) {
        if (quadrantOf(space) === quadrant) spaces.push(space);
    }
    return spaces;
}
