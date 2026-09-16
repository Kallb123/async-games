// The form a circuit is authored in, and the one place a row number comes from.
//
// A track is a **graph of tiles** — every space, and the spaces each one may be
// driven to (§5.1). What an author writes is that graph cut into **sections**:
// a straight, a corner, an esse, each one a stretch of road whose ends are
// **sync lines** — a line across the road where every lane is level with every
// other. Rows are then *derived*, section by section, and never typed.
//
// That derivation is the whole point of this file. Numbering tiles by counting
// them along a lane is what broke the old model: a corner whose inside line
// takes four tiles where the outside takes eight leaves the two lanes one,
// four, nine tiles out of step, for the rest of the lap — so two tiles drawn
// side by side carried different row numbers, and a step across the road came
// out as a step that does not move the car forward. Rows here are a **rank in
// the step graph**, worked out from the steps themselves: every step advances
// at least one row by construction, tiles that are level land on the same row,
// and a lane that takes the short way round simply skips the rows it saved.
//
// Nothing is measured in rows. Overshoot, the tow and the reach band are all
// counted in spaces along the road (§10, §12); rows order the field, band the
// corners and place the finish line, and that is all they are for.
import type { RaceCarsCorner, RaceCarsGeometry, RaceCarsSpace, RaceCarsTrackSpace } from "../board";

/**
 * Six staggered spaces on rows 0-2, lanes 1 and 3, so no car starts directly
 * behind another (§5.2) — every track's grid so far starts on a plain
 * three-lane straight the same width as this one, whose first section derives
 * rows 0, 1, 2 in order. P1 first.
 */
export const STAGGERED_SIX_GRID: RaceCarsSpace[] = [
    { row: 2, lane: 1 },
    { row: 2, lane: 3 },
    { row: 1, lane: 1 },
    { row: 1, lane: 3 },
    { row: 0, lane: 1 },
    { row: 0, lane: 3 },
];

/**
 * One tile as an author writes it: which lane of its section it is in, where it
 * sits on the art, and — where the road does not simply run on — the tiles it
 * may be driven to.
 *
 * `id` is the tile's name for the whole circuit's life, and the only way one
 * tile names another. It deliberately is not a coordinate: rows are derived
 * from these steps, so a step written as a row number would be a step written
 * in terms of the answer.
 *
 * `exits` may name a tile in any section, which is what a corner's re-alignment
 * onto the straight past it is. Left out, the tile takes the default of a road
 * whose lanes run in step (see `defaultExitIds`).
 */
export interface SourceTile {
    id: string;
    lane: number;
    exits?: string[];
    /** Where the tile centre sits on the art, for a traced circuit. */
    x?: number;
    y?: number;
    /** Which way a car on it faces; derived from its exits when left out. */
    heading?: number;
}

/**
 * A stretch of road between two sync lines: a straight, an esse, or a corner
 * with a stop count (§10).
 *
 * A section is a **corner's identity** as well as its extent — a corner is a
 * section with `corner` set, and every tile in that section is in it. Which is
 * also why a section boundary has to be a place where the lanes really are
 * level: a corner's entry and exit are where the rules and the road have to
 * agree, and rows restart their alignment at every one of them.
 *
 * Write `length` for an ordinary band — so many tiles in every lane, all of
 * them in step, §5.1's own step rule between them — and `tiles` for one traced
 * off real art, where the lanes may hold different numbers of tiles and each
 * one names where it leads.
 */
export interface TrackSection {
    id: string;
    name: string;
    /** How wide the road is here, in lanes — 2 or 3. */
    lanes: 2 | 3;
    /** Corner stop count, or null for a straight. The section's id names it. */
    corner: { stops: 1 | 2 } | null;
    /** A plain band: this many tiles in every lane, lanes in step. */
    length?: number;
    /** A traced band: every tile it holds, each lane's run in road order. */
    tiles?: SourceTile[];
}

/** A point on the art — what a bearing is taken between. */
export interface Point {
    x: number;
    y: number;
}

/** A tile once the derivation has placed it. */
export interface PlacedTile {
    id: string;
    lane: number;
    x?: number;
    y?: number;
    heading?: number;
    /** Index of its section in the lap. */
    section: number;
    /** Where it sits in its lane's run through that section; 0 is first. */
    index: number;
    /** Resolved steps out, as tile ids — its own, or the default rule's. */
    exits: string[];
    /** The derived row (see the file comment). */
    row: number;
}

export interface DerivedTrack {
    rows: number;
    spaces: RaceCarsTrackSpace[];
    corners: RaceCarsCorner[];
    /** Every tile, placed — what a geometry pass and the editor read. */
    tiles: PlacedTile[];
    /** Where each tile landed, by id — what a grid slot is written in terms of. */
    spaceOf: Map<string, RaceCarsSpace>;
}

/** The id `length` bands give their tiles: section, lane and place in the run. */
export function plainTileId(sectionId: string, lane: number, index: number): string {
    return `${sectionId}.${lane}.${index}`;
}

/** Every tile of a section: its own, or `lanes` runs of `length` plain ones. */
function sectionTiles(section: TrackSection): SourceTile[] {
    if (section.tiles && section.length !== undefined) {
        throw new Error(`Race Cars: section "${section.name}" has both a length and its own tiles`);
    }
    if (section.tiles) return section.tiles;
    if (!section.length || section.length < 1) {
        throw new Error(`Race Cars: section "${section.name}" has no tiles and no length`);
    }
    const tiles: SourceTile[] = [];
    for (let lane = 1; lane <= section.lanes; lane++) {
        for (let index = 0; index < section.length; index++) {
            tiles.push({ id: plainTileId(section.id, lane, index), lane });
        }
    }
    return tiles;
}

/** Each lane's run through a section, in the order the tiles were written. */
function laneRuns(tiles: readonly SourceTile[]): Map<number, SourceTile[]> {
    const runs = new Map<number, SourceTile[]>();
    for (const tile of tiles) {
        const run = runs.get(tile.lane);
        if (run) run.push(tile);
        else runs.set(tile.lane, [tile]);
    }
    return runs;
}

/**
 * Whether a section's lanes hold the same number of tiles.
 *
 * §5.1's default step rule is only a statement about the road where they do:
 * it answers "the next tile along, this lane or either beside it" by index into
 * each lane's run, and where the runs are different lengths that index is not
 * beside anything. `deriveTrack` refuses such a section unless every tile names
 * its own steps, and the editor asks the same question to say which tiles those
 * are — so the test lives here, once, rather than in both.
 */
export function runsInStep(runs: Map<number, SourceTile[]>): boolean {
    const lengths = [...runs.values()].map(run => run.length);
    return lengths.every(length => length === lengths[0]);
}

/** A lane and the two either side of it — everywhere §5.1's rule is applied. */
export function neighbouringLanes(lane: number): number[] {
    return [lane - 1, lane, lane + 1];
}

/** A section with its lanes' runs — the shape the default step rule reads. */
export interface SectionRuns {
    section: TrackSection;
    runs: Map<number, SourceTile[]>;
}

/** Every section's lane runs, once, for a caller asking about more than one tile. */
export function lapRuns(sections: TrackSection[]): SectionRuns[] {
    return sections.map(section => ({ section, runs: laneRuns(sectionTiles(section)) }));
}

/**
 * §5.1's own step rule written in the authoring model: the next tile along, in
 * this lane or either lane beside it, and the first tiles of the next section
 * for a tile at the end of its own run.
 *
 * Narrowing handles itself, because this reads the lanes the next section
 * actually has rather than a width: coming out of a three-lane straight into a
 * two-lane corner, lane 3 has only lane 2 to merge into.
 *
 * It is only a rule for a band whose lanes run **in step**. Where they do not —
 * a corner traced off real art, where the inside takes four tiles to the
 * outside's eight — "the next tile along in the lane beside me" is not a
 * statement about the road at all, so `deriveTrack` refuses such a section
 * unless every one of its tiles names its own steps.
 */
export function defaultExitIds(lap: SectionRuns[], sectionIndex: number, tile: SourceTile): string[] {
    const here = lap[sectionIndex];
    const run = here.runs.get(tile.lane) ?? [];
    const index = run.findIndex(other => other.id === tile.id);
    const next = lap[(sectionIndex + 1) % lap.length];

    // Whether the road carries on inside this section is a question about the
    // tile's **own** lane, asked once. Asking it per candidate lane is how a
    // two-lane esse came to step straight into the lane 3 of the corner past
    // it, from every tile in the run rather than only its last: the esse has no
    // lane 3 to carry on in, so every tile looked one section ahead for one.
    const last = index === run.length - 1;

    return neighbouringLanes(tile.lane).flatMap(lane => {
        const onward = last ? next.runs.get(lane)?.[0] : here.runs.get(lane)?.[index + 1];
        return onward ? [onward.id] : [];
    });
}

/**
 * The longest path to each tile over one section's own steps, as a depth in
 * steps: 0 for a tile nothing inside the section leads to.
 *
 * Read forwards it says how far past the section's entry sync line a tile can
 * be; read backwards (`adjacency` reversed) how far short of its exit. Between
 * them they give the band each tile may sit in, which is what `deriveTrack`
 * centres it in.
 */
function longestDepths(ids: string[], adjacency: Map<string, string[]>, sectionName: string): Map<string, number> {
    const depth = new Map<string, number>();
    const open = new Set<string>();

    const visit = (id: string): number => {
        const settled = depth.get(id);
        if (settled !== undefined) return settled;
        if (open.has(id)) {
            throw new Error(`Race Cars: the steps inside "${sectionName}" loop back on themselves at ${id}`);
        }
        open.add(id);
        let best = 0;
        for (const from of adjacency.get(id) ?? []) best = Math.max(best, visit(from) + 1);
        open.delete(id);
        depth.set(id, best);
        return best;
    };

    for (const id of ids) visit(id);
    return depth;
}

function addEdge(adjacency: Map<string, string[]>, from: string, to: string): void {
    const edges = adjacency.get(from);
    if (edges) edges.push(to);
    else adjacency.set(from, [to]);
}

/**
 * A circuit's rows, spaces and corners, all derived from one `SECTIONS` table.
 *
 * Throws on a circuit that cannot be driven rather than shipping one. A track
 * is static data read at module load and asserted by `board.test.ts`, and the
 * track editor runs the same function over the tiles an author has drawn, so
 * "it validates in the editor" and "it loads in the game" are one statement.
 */
export function deriveTrack(sections: TrackSection[]): DerivedTrack {
    // Two, not one: the lap's wrap back to the start line has to cross a sync
    // line. A single section would hold that wrap inside itself, where it is a
    // loop in the very graph the rows are ranked from — and a lap whose last
    // tile ranks before its first is not a lap.
    if (sections.length < 2) {
        throw new Error("Race Cars: a circuit needs at least two sections, so the lap's wrap back to the start line crosses a sync line");
    }

    const lap = lapRuns(sections);

    // ── Every tile, placed in its section and its lane's run ────────────────
    const placed: PlacedTile[] = [];
    const byId = new Map<string, PlacedTile>();
    lap.forEach(({ section, runs }, sectionIndex) => {
        if (runs.size === 0) throw new Error(`Race Cars: section "${section.name}" has no tiles`);
        for (const [lane, run] of runs) {
            if (lane < 1 || lane > section.lanes) {
                throw new Error(`Race Cars: section "${section.name}" has a tile in lane ${lane} on a ${section.lanes}-lane road`);
            }
            run.forEach((tile, index) => {
                if (byId.has(tile.id)) throw new Error(`Race Cars: two tiles share the id ${tile.id}`);
                const entry: PlacedTile = {
                    id: tile.id,
                    lane: tile.lane,
                    x: tile.x,
                    y: tile.y,
                    heading: tile.heading,
                    section: sectionIndex,
                    index,
                    exits: [],
                    row: 0,
                };
                placed.push(entry);
                byId.set(tile.id, entry);
            });
        }
    });

    // ── The steps out of each one ───────────────────────────────────────────
    //
    // A band whose lanes hold different numbers of tiles has no "the tile
    // beside me, one along" to fall back on, so it has to say where its tiles
    // lead. This is the check that turns a silently wrong corner into a
    // refusal an author can read.
    lap.forEach(({ section, runs }, sectionIndex) => {
        const inStep = runsInStep(runs);
        for (const run of runs.values()) {
            for (const tile of run) {
                const entry = byId.get(tile.id)!;
                if (tile.exits) {
                    for (const exit of tile.exits) {
                        if (!byId.has(exit)) {
                            throw new Error(`Race Cars: ${tile.id} steps to ${exit}, which is not a tile`);
                        }
                    }
                    entry.exits = [...tile.exits];
                    continue;
                }
                if (!inStep) {
                    throw new Error(`Race Cars: section "${section.name}" runs its lanes out of step, so ${tile.id} has to name its own steps`);
                }
                entry.exits = defaultExitIds(lap, sectionIndex, tile);
            }
        }
    });

    // ── The rows those steps imply ──────────────────────────────────────────
    let start = 0;
    lap.forEach(({ section }, sectionIndex) => {
        const tiles = placed.filter(tile => tile.section === sectionIndex);
        const ids = tiles.map(tile => tile.id);

        const predecessors = new Map<string, string[]>();
        const successors = new Map<string, string[]>();
        for (const tile of tiles) {
            for (const exit of tile.exits) {
                if (byId.get(exit)!.section !== sectionIndex) continue;
                addEdge(successors, tile.id, exit);
                addEdge(predecessors, exit, tile.id);
            }
        }

        const fromEntry = longestDepths(ids, predecessors, section.name);
        const toExit = longestDepths(ids, successors, section.name);
        // The section is as many rows deep as its longest line through it.
        const length = Math.max(...ids.map(id => fromEntry.get(id)! + toExit.get(id)!)) + 1;

        for (const tile of tiles) {
            const earliest = fromEntry.get(tile.id)!;
            const latest = length - 1 - toExit.get(tile.id)!;
            // Centred between the two sync lines, so a lane taking the short
            // way round is spread evenly across the rows it saved rather than
            // bunched against one end of them. Every step still advances at
            // least one row: an exit's earliest is at least one past this
            // tile's, and its latest at least one past this tile's too, so the
            // midpoints cannot meet.
            tile.row = start + Math.round((earliest + latest) / 2);
        }

        start += length;
    });

    const rows = start;
    const spaceOf = new Map<string, RaceCarsSpace>(
        placed.map(tile => [tile.id, { row: tile.row, lane: tile.lane }]),
    );

    const spaces = assembleSpaces(placed.map(tile => ({
        row: tile.row,
        lane: tile.lane,
        exits: tile.exits.map(exit => spaceOf.get(exit)!),
        cornerId: sections[tile.section].corner ? sections[tile.section].id : undefined,
    })), rows);

    const corners: RaceCarsCorner[] = sections
        .map((section, sectionIndex) => ({ section, sectionIndex }))
        .filter(({ section }) => section.corner !== null)
        .map(({ section, sectionIndex }) => {
            const band = placed.filter(tile => tile.section === sectionIndex).map(tile => tile.row);
            return {
                id: section.id,
                name: section.name,
                from: Math.min(...band),
                to: Math.max(...band),
                stops: section.corner!.stops,
            };
        });

    return { rows, spaces, corners, tiles: placed, spaceOf };
}

/**
 * The spaces of a circuit, checked as a graph a race can actually be driven
 * round — the half of the derivation that is about spaces rather than sections.
 * Split out so `board.test.ts` can drive these checks against a hand-built
 * spaces list: the derivation above makes most of them unreachable (it cannot
 * emit a sideways step or skip a row), and they are the guard under a track
 * file that ever stops coming through it.
 *
 * Throws on each hole a race would otherwise fall into silently: two spaces on
 * one square, a row the road skips, a space nothing can step off, a step onto a
 * space that isn't there, or a step that changes lane without moving the car
 * forward.
 */
export function assembleSpaces(spaces: RaceCarsTrackSpace[], rows: number): RaceCarsTrackSpace[] {
    const spacesByRow = new Map<number, number[]>();
    for (const space of spaces) {
        const lanes = spacesByRow.get(space.row);
        if (lanes?.includes(space.lane)) throw new Error(`Race Cars: two spaces at ${space.row}:${space.lane}`);
        if (lanes) lanes.push(space.lane);
        else spacesByRow.set(space.row, [space.lane]);
    }
    for (const lanes of spacesByRow.values()) lanes.sort((a, b) => a - b);
    for (let row = 0; row < rows; row++) {
        // A row the road skips is a row nothing can be level with, which is a
        // lap distance no two lanes would agree on.
        if (!spacesByRow.has(row)) throw new Error(`Race Cars: row ${row} has no spaces on it`);
    }

    for (const space of spaces) {
        if (space.exits.length === 0) throw new Error(`Race Cars: nothing to step to from ${space.row}:${space.lane}`);
        for (const exit of space.exits) {
            if (!spacesByRow.get(exit.row)?.includes(exit.lane)) {
                throw new Error(`Race Cars: ${space.row}:${space.lane} steps to ${exit.row}:${exit.lane}, which is not a space`);
            }
            if (exit.row === space.row) {
                throw new Error(`Race Cars: ${space.row}:${space.lane} steps sideways to lane ${exit.lane} — a car changes lane while moving, never on the spot`);
            }
        }
    }

    return spaces;
}

/**
 * The bearing from one point towards the mean of some others, in the
 * degrees-clockwise-from-increasing-rows `RaceCarsGeometry.heading` is measured
 * in: which way a car standing here faces, given where the road leads.
 *
 * Over plain points rather than tiles, because the editor asks the same
 * question of its own tile type — and two copies of an `atan2` are two things
 * to keep in step for no reason.
 */
export function bearingTo(from: Point, targets: readonly Point[]): number {
    if (targets.length === 0) return 0;
    const meanX = targets.reduce((sum, target) => sum + target.x, 0) / targets.length;
    const meanY = targets.reduce((sum, target) => sum + target.y, 0) / targets.length;
    return Math.round((Math.atan2(meanY - from.y, meanX - from.x) * 180) / Math.PI);
}

/** Where a tile leads, as points — the tiles it steps to that have been placed on art. */
function exitPoints(tile: PlacedTile, byId: Map<string, PlacedTile>): Point[] {
    return tile.exits
        .map(exit => byId.get(exit))
        .filter((exit): exit is PlacedTile => exit?.x !== undefined && exit?.y !== undefined)
        .map(exit => ({ x: exit.x!, y: exit.y! }));
}

/**
 * A traced circuit's `geometry`, read straight off the tiles it was drawn from
 * — so a board traced on real art carries its own positions rather than having
 * them generated from a loop, and a tile that named no heading is pointed down
 * its own exits.
 *
 * The circuits that ship with generated geometry (`loopGeometry.ts`) do not
 * call this: they have no drawn positions to read.
 */
export function tileGeometry(derived: DerivedTrack): RaceCarsGeometry[] {
    const byId = new Map(derived.tiles.map(tile => [tile.id, tile]));
    return derived.tiles.map(tile => ({
        row: tile.row,
        lane: tile.lane,
        x: Math.round(tile.x ?? 0),
        y: Math.round(tile.y ?? 0),
        heading: tile.heading ?? (tile.x === undefined || tile.y === undefined
            ? 0
            : bearingTo({ x: tile.x, y: tile.y }, exitPoints(tile, byId))),
    }));
}
