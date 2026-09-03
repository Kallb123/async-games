// Static board data for Fires Out: the 6×8 interior grid, its wall/door
// graph, the exterior perimeter, and the printed Family setup — from
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

// ─── Exterior perimeter (§3's "exterior parking track") ────────────────────
// The printed board wraps the house in a full ring of outdoor spaces — the
// numbered strips above and below it and the dice strips down either side —
// so the exterior here is that same ring: one space for every cell of the
// (ROWS + 2) × (COLS + 2) display grid that isn't part of the building. That
// makes the whole board art visible (nothing cropped off the sides), lets a
// firefighter walk round the outside, and lets a vehicle park anywhere on the
// perimeter, all of which the printed game allows and a top/bottom-only track
// did not.
//
// The numbering is append-only on purpose: 48-63 are still the top and bottom
// strips they always were, and the sides and corners take the indices after
// them, so a game saved before the ring existed keeps every space it already
// refers to — rules.ts's growBoardToCurrentLayout / boardAtCurrentLayout just
// append the blanks for the rest.
export const DISPLAY_ROWS = ROWS + 2;
export const DISPLAY_COLS = COLS + 2;

export const EXTERIOR_TOP_START = INTERIOR_SPACE_COUNT; // 48..55, above column 0..7
export const EXTERIOR_BOTTOM_START = EXTERIOR_TOP_START + COLS; // 56..63, below column 0..7
export const EXTERIOR_LEFT_START = EXTERIOR_BOTTOM_START + COLS; // 64..69, left of row 0..5
export const EXTERIOR_RIGHT_START = EXTERIOR_LEFT_START + ROWS; // 70..75, right of row 0..5
export const EXTERIOR_CORNER_START = EXTERIOR_RIGHT_START + ROWS; // 76..79, the four diagonal corners
export const SPACE_COUNT = EXTERIOR_CORNER_START + 4; // 80

export function exteriorTopSpace(col: number): number {
    return EXTERIOR_TOP_START + col;
}

export function exteriorBottomSpace(col: number): number {
    return EXTERIOR_BOTTOM_START + col;
}

export function exteriorLeftSpace(row: number): number {
    return EXTERIOR_LEFT_START + row;
}

export function exteriorRightSpace(row: number): number {
    return EXTERIOR_RIGHT_START + row;
}

/** The four corner spaces of the perimeter, in display order: top-left, top-right, bottom-left, bottom-right. */
export const EXTERIOR_CORNERS = {
    topLeft: EXTERIOR_CORNER_START,
    topRight: EXTERIOR_CORNER_START + 1,
    bottomLeft: EXTERIOR_CORNER_START + 2,
    bottomRight: EXTERIOR_CORNER_START + 3,
} as const;

export function isExteriorSpace(space: number): boolean {
    return space >= INTERIOR_SPACE_COUNT && space < SPACE_COUNT;
}

// ─── Display grid ───────────────────────────────────────────────────────────
// Where each space sits in the (ROWS + 2) × (COLS + 2) grid the board
// component renders — the one place that mapping lives, so FiresOutBoard.tsx
// walks display cells and asks for the space rather than re-deriving the ring
// layout, and so the perimeter's own adjacency (below) is derived from the
// same picture the player is looking at.

interface IDisplayCell {
    displayRow: number;
    displayCol: number;
}

const DISPLAY_CELL_OF: IDisplayCell[] = buildDisplayCells();
const SPACE_AT_DISPLAY_CELL: number[][] = buildSpaceAtDisplayCell();

function buildDisplayCells(): IDisplayCell[] {
    const cells: IDisplayCell[] = new Array(SPACE_COUNT);
    for (let space = 0; space < INTERIOR_SPACE_COUNT; space++) {
        cells[space] = { displayRow: rowOf(space) + 1, displayCol: colOf(space) + 1 };
    }
    for (let col = 0; col < COLS; col++) {
        cells[exteriorTopSpace(col)] = { displayRow: 0, displayCol: col + 1 };
        cells[exteriorBottomSpace(col)] = { displayRow: DISPLAY_ROWS - 1, displayCol: col + 1 };
    }
    for (let row = 0; row < ROWS; row++) {
        cells[exteriorLeftSpace(row)] = { displayRow: row + 1, displayCol: 0 };
        cells[exteriorRightSpace(row)] = { displayRow: row + 1, displayCol: DISPLAY_COLS - 1 };
    }
    cells[EXTERIOR_CORNERS.topLeft] = { displayRow: 0, displayCol: 0 };
    cells[EXTERIOR_CORNERS.topRight] = { displayRow: 0, displayCol: DISPLAY_COLS - 1 };
    cells[EXTERIOR_CORNERS.bottomLeft] = { displayRow: DISPLAY_ROWS - 1, displayCol: 0 };
    cells[EXTERIOR_CORNERS.bottomRight] = { displayRow: DISPLAY_ROWS - 1, displayCol: DISPLAY_COLS - 1 };
    return cells;
}

function buildSpaceAtDisplayCell(): number[][] {
    const grid: number[][] = Array.from({ length: DISPLAY_ROWS }, () => new Array<number>(DISPLAY_COLS));
    DISPLAY_CELL_OF.forEach((cell, space) => { grid[cell.displayRow][cell.displayCol] = space; });
    return grid;
}

/** The space in one cell of the display grid. Total over the grid — every one of its `DISPLAY_ROWS × DISPLAY_COLS` cells is a space — so callers index it directly; nothing asks for a cell beyond the perimeter. */
export function spaceAtDisplayCell(displayRow: number, displayCol: number): number {
    return SPACE_AT_DISPLAY_CELL[displayRow][displayCol];
}

/** Where a firefighter starts, and where a knocked-down one is put back (§6.1 step 5, §10.3): the perimeter space outside the building's top-left corner — on the ring, and one step from the interior, so a knocked-down firefighter is never stranded on a corner with no way back in. */
export const START_SPACE = exteriorTopSpace(0);

// §6.2 step 6, §17.6 step 9: "separate exterior parking spots" for the two
// vehicles. Fixed rather than player-chosen (the printed game doesn't mandate
// specific spots either), on opposite sides of the building from each other
// and from where the crew arrives, and — since the perimeter is now one
// connected ring — never allowed to be driven onto each other (applyDrive and
// legalDriveTargets both exclude the other vehicle's spot).
export const ENGINE_START = exteriorTopSpace(COLS - 1);
export const AMBULANCE_START = exteriorBottomSpace(COLS - 1);

/**
 * The parking spot(s) a vehicle can drive to from `space` — one step round the
 * exterior perimeter (§12: vehicles never enter the building). Read straight
 * off the edge graph rather than re-derived from the ring geometry, so
 * "adjacent, and still outside" means exactly the same thing here as it does
 * for a firefighter walking round the outside.
 */
export function perimeterNeighbours(space: number): number[] {
    if (!isExteriorSpace(space)) return [];
    return neighboursOf(space).filter(isExteriorSpace);
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
// not read anywhere else.
//
// These are the rooms the board art actually draws
// (public/art/fires-out/board.png, measured against the grid the component
// lays over it): a living room down the left that turns the corner into the
// middle of the house, a bathroom and bedroom across the top, the kitchen
// through the middle with a games room beside it, and a dining room, second
// bedroom and second bathroom along the bottom. Every wall below is a wall the
// player can see, and every boundary the art leaves open is open here too —
// that agreement is the point of this table, so re-measure the art before
// changing it. Only this one layout exists — §3 and §6.1 step 1 describe a
// double-sided board, but only one side's art was ever uploaded; see
// fires-out-gdd.md §17.3's deviation note.
const ROOM_GRID: number[][] = [
    [0, 0, 0, 1, 1, 2, 2, 2],
    [0, 0, 0, 1, 1, 2, 2, 2],
    [0, 0, 3, 3, 3, 3, 4, 4],
    [0, 0, 3, 3, 3, 3, 4, 4],
    [5, 5, 5, 5, 5, 6, 6, 7],
    [5, 5, 5, 5, 5, 6, 6, 7],
];

function roomOf(space: number): number {
    return ROOM_GRID[rowOf(space)][colOf(space)];
}

/**
 * The 8 interior doorways (§3: "Door markers, 8, double-sided"). The first
 * four sit exactly where the art draws a gap in a wall; the other four are
 * ours to place, because the art draws those four rooms sealed — every room
 * has to be reachable, and a door marker rendered over a painted wall reads
 * better than a room nobody can enter.
 */
const DOOR_BOUNDARIES = new Set([
    key(spaceIndex(0, 2), spaceIndex(0, 3)), // Living room ↔ Bathroom (drawn)
    key(spaceIndex(1, 4), spaceIndex(1, 5)), // Bathroom ↔ Bedroom (drawn)
    key(spaceIndex(2, 1), spaceIndex(2, 2)), // Living room ↔ Kitchen (drawn)
    key(spaceIndex(5, 6), spaceIndex(5, 7)), // Second bedroom ↔ Second bathroom (drawn)
    key(spaceIndex(1, 6), spaceIndex(2, 6)), // Bedroom ↔ Games room
    key(spaceIndex(3, 5), spaceIndex(3, 6)), // Kitchen ↔ Games room
    key(spaceIndex(3, 2), spaceIndex(4, 2)), // Kitchen ↔ Dining room
    key(spaceIndex(4, 4), spaceIndex(4, 5)), // Dining room ↔ Second bedroom
]);

function key(a: number, b: number): string {
    return a < b ? `${a}-${b}` : `${b}-${a}`;
}

// ─── Edges ───────────────────────────────────────────────────────────────────
// A flat, numbered array rather than a keyed map (§17.4: "a Record<string, …>
// … becomes Schema.Types.Mixed, the schema can't validate it, and it invites
// two different key orderings for the same wall"). Order: the 42 vertical
// segments (row-major), then the 40 horizontal segments (row-major), then the
// 28 openings between the building and the perimeter (top, bottom, left,
// right), then the 32 segments joining one perimeter space to the next —
// 142 total. The order matters: it is what an edge id means, and a persisted
// game indexes its edge array by it, so new kinds of segment are appended
// after the ones that already existed rather than woven in among them.

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

    // Openings between the building and the perimeter: top, bottom, then the
    // two sides. Every face of the building is enterable, as the printed
    // board's four sets of doorways are.
    for (let col = 0; col < COLS; col++) {
        edges.push({ id: id++, a: exteriorTopSpace(col), b: spaceIndex(0, col), kind: 'open' });
    }
    for (let col = 0; col < COLS; col++) {
        edges.push({ id: id++, a: exteriorBottomSpace(col), b: spaceIndex(ROWS - 1, col), kind: 'open' });
    }
    for (let row = 0; row < ROWS; row++) {
        edges.push({ id: id++, a: exteriorLeftSpace(row), b: spaceIndex(row, 0), kind: 'open' });
    }
    for (let row = 0; row < ROWS; row++) {
        edges.push({ id: id++, a: exteriorRightSpace(row), b: spaceIndex(row, COLS - 1), kind: 'open' });
    }

    // Round the perimeter: every pair of orthogonally-adjacent outdoor cells
    // of the display grid, which is what lets a firefighter walk round the
    // building and a vehicle drive along any side of it.
    for (let displayRow = 0; displayRow < DISPLAY_ROWS; displayRow++) {
        for (let displayCol = 0; displayCol < DISPLAY_COLS; displayCol++) {
            const a = spaceAtDisplayCell(displayRow, displayCol);
            if (!isExteriorSpace(a)) continue;
            for (const [dRow, dCol] of [[0, 1], [1, 0]] as const) {
                const nextRow = displayRow + dRow;
                const nextCol = displayCol + dCol;
                if (nextRow >= DISPLAY_ROWS || nextCol >= DISPLAY_COLS) continue;
                const b = spaceAtDisplayCell(nextRow, nextCol);
                if (isExteriorSpace(b)) edges.push({ id: id++, a, b, kind: 'open' });
            }
        }
    }

    return edges;
}

function edgeKindFor(a: number, b: number): EdgeKind {
    if (roomOf(a) === roomOf(b)) return 'open';
    return DOOR_BOUNDARIES.has(key(a, b)) ? 'door' : 'wall';
}

export const EDGE_DEFS: EdgeDef[] = buildEdgeDefs();
export const EDGE_COUNT = EDGE_DEFS.length; // 142

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
// The coordinates below are the ones printed on the setup diagram, and the
// rulebook writes them 1-indexed as (row, column) — the same d6/d8 reading
// spaceForRoll uses. `spaceIndex` is 0-indexed, so every pair here is the
// printed one minus one on each axis; the trailing comment on each line is
// the printed pair, so the table can be checked against the rulebook without
// doing the arithmetic in your head.

/** §6.1 step 2: the ten printed starting fire markers — a cluster through the living room and kitchen, plus a second one in the far bedroom. */
export const FAMILY_STARTING_FIRE: number[] = [
    spaceIndex(1, 1), // 2,2
    spaceIndex(1, 2), // 2,3
    spaceIndex(2, 1), // 3,2
    spaceIndex(2, 2), // 3,3
    spaceIndex(2, 3), // 3,4
    spaceIndex(2, 4), // 3,5
    spaceIndex(3, 3), // 4,4
    spaceIndex(4, 5), // 5,6
    spaceIndex(4, 6), // 5,7
    spaceIndex(5, 5), // 6,6
];

/** §6.1 step 4: the printed setup coordinates for the first three POIs, drawn at random from the pool and placed "?" side up. */
export const FAMILY_STARTING_POI: number[] = [
    spaceIndex(1, 3), // 2,4
    spaceIndex(4, 0), // 5,1
    spaceIndex(4, 7), // 5,8
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

/**
 * The tier a game is set to, defaulting to the first (Recruit) rather than
 * trusting the stored string. The `!` this replaces was reachable from a
 * normal lobby: only `POST /api/newgame/firesout` validates `difficulty`
 * against this table, and that route is taken only when the host opens no
 * seats — with a seat open the client posts to `POST /api/lobby`, which
 * spreads its per-game `...gameSettings` into the invitation unchecked
 * against a `difficulty: String` schema. An unknown value then threw inside
 * `CreateGame` (reading `.explosions`) *before* the transaction consumed the
 * invitation, leaving it fully accepted with no game and every retry
 * throwing again — permanent for a named invite with no TTL — and threw
 * again on the read path in `formatFiresOutResultStats` (reading `.label`).
 * `CreateGame` normalises what it stores as well, so a game is never left
 * holding a value this has to paper over twice.
 *
 * (The missing per-game validation on `/api/lobby` itself is a wider issue
 * shared with Outbreak's own `epidemicCountFor`, and belongs with that route
 * rather than here.)
 */
export function difficultyTier(difficulty: DifficultyId): IFiresOutDifficultyTier {
    return DIFFICULTY_TIERS.find(d => d.id === difficulty) ?? DIFFICULTY_TIERS[0];
}

/** Narrows an arbitrary persisted/incoming value to a real ruleset id, for the normalising `CreateGame` does at setup. `difficulty`'s counterpart is `difficultyTier(...).id` — this one has no table to look itself up in. */
export function asRulesetId(value: unknown): RulesetId {
    return value === 'experienced' ? 'experienced' : 'family';
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
