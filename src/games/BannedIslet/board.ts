// Static board data for Banned Islet: the 24 named tiles of
// docs/games/banned-islet.md §5.2, the 6 × 6 grid and the diamond mask that
// cuts 24 island positions out of its 36 cells (§5.1), the four treasures and
// their pairs of tiles, the six roles and their start tiles (§12), the water
// meter's flood-rate track (§11) and the four difficulty start levels (§13).
//
// No server-only imports: rules.ts (and, via it, the client action picker)
// depends on this module staying isomorphic, the same contract board.ts holds
// for every other game.
//
// §5.1 fixes the geometry convention once, here: a **position** is an index
// 0..23 into the diamond, numbered row-major, and is what a pawn stands on and
// what `positions` in the saved state is indexed by. A **tile** is one of the
// 24 named pieces of island shuffled *into* those positions at setup, and is
// what the flood deck holds. The two are deliberately different things — a
// sunk tile leaves its position behind as a hole (§5.1), which is the whole
// reason adjacency is arithmetic over the grid rather than a graph of names.

// ─── The grid and its diamond mask (§5.1) ───────────────────────────────────

export const GRID_SIZE = 6;

/** Row widths of the diamond, top to bottom — §5.1's 2 / 4 / 6 / 6 / 4 / 2. */
export const DIAMOND_ROW_WIDTHS = [2, 4, 6, 6, 4, 2] as const;

/** The leftmost column of the diamond in a grid row — each row is centred. */
function rowStartCol(row: number): number {
    return (GRID_SIZE - DIAMOND_ROW_WIDTHS[row]) / 2;
}

/** Whether a grid cell is part of the island at all, rather than open sea. */
export function isIslandCell(row: number, col: number): boolean {
    if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return false;
    const start = rowStartCol(row);
    return col >= start && col < start + DIAMOND_ROW_WIDTHS[row];
}

interface IGridCell {
    row: number;
    col: number;
}

// Positions, numbered row-major over the masked cells. Built once, from the
// mask, so the mask is the single source of truth for the island's shape —
// §18's "a second island shape ... costs one table" only holds if nothing
// else hard-codes 24 or the row widths.
const CELL_OF_POSITION: IGridCell[] = buildCells();
const POSITION_AT_CELL: (number | null)[][] = buildPositionGrid();

function buildCells(): IGridCell[] {
    const cells: IGridCell[] = [];
    for (let row = 0; row < GRID_SIZE; row++) {
        for (let col = 0; col < GRID_SIZE; col++) {
            if (isIslandCell(row, col)) cells.push({ row, col });
        }
    }
    return cells;
}

function buildPositionGrid(): (number | null)[][] {
    const grid: (number | null)[][] = Array.from({ length: GRID_SIZE }, () => new Array<number | null>(GRID_SIZE).fill(null));
    CELL_OF_POSITION.forEach((cell, position) => { grid[cell.row][cell.col] = position; });
    return grid;
}

/** §5.1: 24 island positions inside a 6 × 6 grid. */
export const POSITION_COUNT = CELL_OF_POSITION.length; // 24

export function rowOf(position: number): number {
    return CELL_OF_POSITION[position].row;
}

export function colOf(position: number): number {
    return CELL_OF_POSITION[position].col;
}

/** The position in a grid cell, or `null` for a cell the diamond doesn't cover. */
export function positionAt(row: number, col: number): number | null {
    if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return null;
    return POSITION_AT_CELL[row][col];
}

// ─── Adjacency (§5.1, §19) ──────────────────────────────────────────────────
// Row/column arithmetic over the mask rather than a transcribed edge list, for
// the reason §21.1's third non-use gives: the positions have no fixed names to
// key a `buildSymmetricAdjacency` dictionary on, and adjacency isn't static
// anyway — a sunk tile stops being adjacent to anything (§19) and the Explorer
// adds diagonals (§12), so any frozen array would be filtered on every call.
// Fires Out's `neighboursOf` is the precedent; this is the same shape.

const ORTHOGONAL_STEPS = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;

/**
 * The positions orthogonally next to `position` — up, down, left, right, and
 * never a diagonal (§5.1). Tile state is not consulted: this is the island's
 * fixed geometry, and rules.ts filters out the holes. The Explorer's diagonals
 * (§12) are the one exception to it and arrive with the rest of the roles.
 */
export function orthogonalNeighbours(position: number): number[] {
    const { row, col } = CELL_OF_POSITION[position];
    const neighbours: number[] = [];
    for (const [dRow, dCol] of ORTHOGONAL_STEPS) {
        const neighbour = positionAt(row + dRow, col + dCol);
        if (neighbour !== null) neighbours.push(neighbour);
    }
    return neighbours;
}

// ─── The tiles (§5.2) ───────────────────────────────────────────────────────
// Ids derived from the table rather than declared twice: 24 names written out
// once as data, with the id union read back off them, so a tile can't be added
// to one list and forgotten in the other.

const TILE_DEFS = [
    { id: 'beaconPier', name: 'Beacon Pier' },
    { id: 'cinderTemple', name: 'Cinder Temple' },
    { id: 'ashfallHollow', name: 'Ashfall Hollow' },
    { id: 'whistlingSpire', name: 'Whistling Spire' },
    { id: 'galeTerrace', name: 'Gale Terrace' },
    { id: 'coralVault', name: 'Coral Vault' },
    { id: 'weepingWell', name: 'Weeping Well' },
    { id: 'mossgrave', name: 'Mossgrave' },
    { id: 'deepwoodSteps', name: 'Deepwood Steps' },
    { id: 'brambleGate', name: 'Bramble Gate' },
    { id: 'twinPalms', name: 'Twin Palms' },
    { id: 'mistyShallows', name: 'Misty Shallows' },
    { id: 'lanternWalk', name: 'Lantern Walk' },
    { id: 'watchersRock', name: "Watcher's Rock" },
    { id: 'saltMarket', name: 'Salt Market' },
    { id: 'brokenCauseway', name: 'Broken Causeway' },
    { id: 'crabFlats', name: 'Crab Flats' },
    { id: 'theLongDune', name: 'The Long Dune' },
    { id: 'kelpStair', name: 'Kelp Stair' },
    { id: 'driftwoodCamp', name: 'Driftwood Camp' },
    { id: 'gullShelf', name: 'Gull Shelf' },
    { id: 'ternHollow', name: 'Tern Hollow' },
    { id: 'oldAnchorage', name: 'Old Anchorage' },
    { id: 'shellRoad', name: 'Shell Road' },
] as const;

export type BannedIsletTileId = (typeof TILE_DEFS)[number]['id'];

export interface IBannedIsletTileDef {
    id: BannedIsletTileId;
    name: string;
}

export const TILES: readonly IBannedIsletTileDef[] = TILE_DEFS;

/**
 * Every tile id, in the order §5.2 prints them. Doubles as the flood deck's
 * contents before it's shuffled (§5: one flood card per island tile) and as
 * the canonical ordering `resolveSwim`'s last tie-break reads (§21.3's
 * "lowest tile id").
 */
export const TILE_IDS: readonly BannedIsletTileId[] = TILE_DEFS.map(t => t.id);

export const TILE_COUNT = TILE_IDS.length; // 24

const TILE_ORDER = new Map<BannedIsletTileId, number>(TILE_IDS.map((id, index) => [id, index]));

/** A tile's place in §5.2's printed order — the deterministic last resort when two tiles are otherwise indistinguishable. */
export function tileOrder(tile: BannedIsletTileId): number {
    return TILE_ORDER.get(tile) ?? TILE_COUNT;
}

/** What to call a tile to a player. A grid position means nothing at the table, so nothing player-facing prints one. */
export function tileName(tile: BannedIsletTileId): string {
    return TILES.find(t => t.id === tile)?.name ?? 'Unknown tile';
}

/** §4.1: the escape point, and the tile whose sinking ends the game on the spot (§4.2). */
export const PIER_TILE: BannedIsletTileId = 'beaconPier';

// ─── The treasures (§5.2, §8) ───────────────────────────────────────────────

export type BannedIsletTreasureId = 'emberCrown' | 'stormIdol' | 'tideChalice' | 'rootStone';

export interface IBannedIsletTreasureDef {
    id: BannedIsletTreasureId;
    name: string;
    /** The two tiles it can be captured on; both sinking uncaptured loses the game (§4.2). */
    tiles: readonly BannedIsletTileId[];
}

export const TREASURES: readonly IBannedIsletTreasureDef[] = [
    { id: 'emberCrown', name: 'Ember Crown', tiles: ['cinderTemple', 'ashfallHollow'] },
    { id: 'stormIdol', name: 'Storm Idol', tiles: ['whistlingSpire', 'galeTerrace'] },
    { id: 'tideChalice', name: 'Tide Chalice', tiles: ['coralVault', 'weepingWell'] },
    { id: 'rootStone', name: 'Root Stone', tiles: ['mossgrave', 'deepwoodSteps'] },
];

export const TREASURE_IDS: readonly BannedIsletTreasureId[] = TREASURES.map(t => t.id);

// ─── The treasure cards (§10) ───────────────────────────────────────────────
// A card is identified by what it *is*, not by a serial number: the five Ember
// Crown cards are interchangeable and a capture asks only for four of a kind
// (§8), so a card id is the treasure's own id for a treasure card and a name
// for each of §10's three specials.

export type BannedIsletSpecialCardId = 'watersRise' | 'helicopterLift' | 'sandbags';
export type BannedIsletCardId = BannedIsletTreasureId | BannedIsletSpecialCardId;

export const TREASURE_CARDS_PER_TREASURE = 5;
export const WATERS_RISE_CARD_COUNT = 3;
export const HELICOPTER_LIFT_CARD_COUNT = 3;
export const SANDBAGS_CARD_COUNT = 2;

/** §10's 28 cards, unshuffled — 20 treasure cards, 3 Waters Rise!, 3 Helicopter Lift, 2 Sandbags. Setup shuffles it; nothing else should assume this order. */
export const TREASURE_DECK_CARDS: readonly BannedIsletCardId[] = [
    ...TREASURE_IDS.flatMap(id => new Array<BannedIsletCardId>(TREASURE_CARDS_PER_TREASURE).fill(id)),
    ...new Array<BannedIsletCardId>(WATERS_RISE_CARD_COUNT).fill('watersRise'),
    ...new Array<BannedIsletCardId>(HELICOPTER_LIFT_CARD_COUNT).fill('helicopterLift'),
    ...new Array<BannedIsletCardId>(SANDBAGS_CARD_COUNT).fill('sandbags'),
];

// ─── The roles (§12) ────────────────────────────────────────────────────────
// Static reference data only — dealt at setup and expressed as small pure
// exceptions to the base rules in rules.ts, rather than as `if (role === ...)`
// branches sprayed through the command classes, exactly as Outbreak's ROLES
// table is. `ability` is read by players, so it's written in their language.

export type BannedIsletRoleId = 'pilot' | 'engineer' | 'explorer' | 'diver' | 'messenger' | 'navigator';

export interface IBannedIsletRoleDef {
    id: BannedIsletRoleId;
    name: string;
    ability: string;
    /** §5.2, §6 step 4: where this role's pawn starts, flooded or not. */
    startTile: BannedIsletTileId;
}

export const ROLES: readonly IBannedIsletRoleDef[] = [
    { id: 'pilot', name: 'Pilot', ability: 'Once a turn, fly to any tile on the island for one action.', startTile: 'beaconPier' },
    { id: 'engineer', name: 'Engineer', ability: 'Shore up two tiles for one action instead of one.', startTile: 'brambleGate' },
    { id: 'explorer', name: 'Explorer', ability: 'Moves and shores up diagonally as well as up, down, left and right.', startTile: 'twinPalms' },
    { id: 'diver', name: 'Diver', ability: 'For one action, swim through any number of flooded or sunken tiles to the nearest dry land.', startTile: 'mistyShallows' },
    { id: 'messenger', name: 'Messenger', ability: 'Give a treasure card to any player anywhere on the island, without meeting them.', startTile: 'lanternWalk' },
    { id: 'navigator', name: 'Navigator', ability: 'For one action, move another player up to two tiles.', startTile: 'watchersRock' },
];

export const ROLE_IDS: readonly BannedIsletRoleId[] = ROLES.map(r => r.id);

/** Falls back to the Pilot rather than throwing on a role id that was never validated — a stored game is read long after the value was written. */
export function roleDef(role: BannedIsletRoleId): IBannedIsletRoleDef {
    return ROLES.find(r => r.id === role) ?? ROLES[0];
}

// ─── The numbers (§6, §7, §8, §10) ──────────────────────────────────────────

/** §1: 2-4 adventurers, co-op. Six roles against a four-seat cap, so the role deal always has spares. */
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

/** §7 Phase 1: three actions a turn, refilled at the start of that player's turn (§21.4). */
export const ACTIONS_PER_TURN = 3;

/** §10: checked at the end of Phase 2; over it, the holder discards down. */
export const HAND_LIMIT = 5;

/** §8: four matching treasure cards buy one treasure. */
export const CARDS_TO_CAPTURE = 4;

/** §6 step 2: six tiles are already flooded before anybody has had a turn. */
export const TILES_FLOODED_AT_SETUP = 6;

/** §6 step 5: two cards each, dealt with the Waters Rise! cards set aside. */
export const STARTING_HAND_SIZE = 2;

// ─── The water meter (§11, §13) ─────────────────────────────────────────────

/**
 * §11's flood rate by water level, indexed by `level - 1` — levels 1 to 9.
 * Level 10 has no rate because it isn't one: it's the skull, and the loss
 * (§4.2). `floodRateFor` in rules.ts is the only thing that should index this.
 */
export const WATER_LEVEL_TRACK: readonly number[] = [2, 2, 3, 4, 4, 5, 5, 6, 6];

/** §4.2, §11: the tenth level of the meter is the skull — reaching it loses the game. */
export const LOSING_WATER_LEVEL = 10;

export type BannedIsletDifficulty = 'novice' | 'normal' | 'elite' | 'legendary';

export interface IBannedIsletDifficultyDef {
    id: BannedIsletDifficulty;
    label: string;
    /** §13: the one dial — where the water meter starts. */
    startWaterLevel: number;
    description: string;
}

export const DIFFICULTIES: readonly IBannedIsletDifficultyDef[] = [
    { id: 'novice', label: 'Novice', startWaterLevel: 1, description: 'Two tiles a turn to start, and the meter can never reach the skull.' },
    { id: 'normal', label: 'Normal', startWaterLevel: 2, description: 'The intended baseline: two tiles a turn, with room to climb.' },
    { id: 'elite', label: 'Elite', startWaterLevel: 3, description: 'Three tiles a turn from the first, and the meter is now a real clock.' },
    { id: 'legendary', label: 'Legendary', startWaterLevel: 4, description: 'Four tiles a turn from the first, and six Waters Rise! cards end it.' },
];

/**
 * The difficulty a game is set to, defaulting to the first rather than trusting
 * the stored string — `POST /api/lobby` spreads a client's per-game settings
 * into an invitation unchecked, so anything at all can be sitting in
 * `difficulty` by the time setup reads it (the lesson Fires Out's
 * `difficultyTier` records at length).
 */
export function difficultyDef(difficulty: BannedIsletDifficulty): IBannedIsletDifficultyDef {
    return DIFFICULTIES.find(d => d.id === difficulty) ?? DIFFICULTIES[0];
}

/** §13: the water level a game of this difficulty starts on. */
export function startWaterLevelFor(difficulty: BannedIsletDifficulty): number {
    return difficultyDef(difficulty).startWaterLevel;
}

// ─── Shared state vocabulary ────────────────────────────────────────────────
// Here rather than in BannedIsletModels.ts so apiModels.ts can import it
// without a cycle — the same reason OutbreakPhase lives in Outbreak/board.ts.

/** §9.1's three tile states. Sunk is permanent: the tile is gone and its flood card with it. */
export type BannedIsletTileState = 'dry' | 'flooded' | 'sunk';

/** §21.4: a turn is open for actions, or held open for a hand-limit discard. */
export type BannedIsletPhase = 'actions' | 'discard';
