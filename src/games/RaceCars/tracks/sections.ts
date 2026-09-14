// The one table every track's circuit is derived from — row-by-row lane
// widths and the corner bands are two readings of the same fact, and writing
// them out separately (as ashcombe.ts once did, before anglet.ts needed the
// same derivation) is how a corner comes to sit half on a three-lane row: a
// discrepancy no rule would report, because every rule reads only one of the
// two.
//
// A section is the shorthand, not the model. What a track actually carries is
// a graph — every space, and the spaces each one may be driven to (§5.1) — and
// the shorthand is what writes §5.1's own step rule onto an ordinary stretch of
// road so a straight is one line rather than thirty-two. A band that isn't
// ordinary names its own `tiles`, which is where the two things a real circuit
// does that the rule cannot say live: a tile that only feeds particular tiles
// ahead of it, and an inside line that takes fewer spaces round a corner than
// the outside does.
import type { RaceCarsCorner, RaceCarsSpace, RaceCarsTrackSpace } from "../board";

/**
 * Six staggered spaces on rows 0-2, lanes 1 and 3, so no car starts directly
 * behind another (§5.2) — every track's grid so far starts on a three-lane
 * straight the same width as this one, so there has been nothing yet for a
 * second circuit to say differently. P1 first.
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
 * One space of a section, written out because the section's own shape doesn't
 * say it.
 *
 * Two reasons to write one, and a band that has either needs every one of its
 * spaces listed rather than just the odd ones out — a `tiles` list *is* the
 * band's spaces:
 *
 * - **The lane doesn't run in step with the others.** The inside of a corner
 *   covers the same rows in fewer spaces than the outside, so it simply has no
 *   space on some of the band's rows, and listing the ones it does have is how
 *   that is said.
 * - **The space only feeds particular spaces ahead.** `exits` replaces §5.1's
 *   rule for this space outright: a painted corner that lets a car continue in
 *   its own lane and nowhere else lists exactly that one space.
 *
 * A space with no `exits` of its own still gets §5.1's rule — the next row,
 * this lane or either lane beside it, whichever of those the road actually has
 * — which is what lets a band be sparse without also hand-writing the steps
 * through it.
 */
export interface SectionTile extends RaceCarsSpace {
    exits?: RaceCarsSpace[];
    /**
     * The corner this space is in, overriding the section's own `corner` for
     * this space alone. A section corner tags all its spaces; a space that is
     * physically outside the painted corner even though it sits in the band —
     * the inside line past its own apex — carries `cornerId: undefined` to opt
     * out (§10, per-space membership).
     */
    cornerId?: string;
}

export interface TrackSection {
    name: string;
    /** Inclusive row band. */
    from: number;
    to: number;
    /** How wide the road is here, in lanes — 2 or 3. */
    lanes: 2 | 3;
    /**
     * Every space this band has, for a band that is not simply `lanes` of them
     * on each of its rows. Lanes may run out of step with each other and a
     * space may name its own exits; `lanes` still says how wide the road is,
     * because that is what the art draws and what a lane number is measured
     * against.
     */
    tiles?: SectionTile[];
    /** Corner id and stop count, or null for a straight. */
    corner: { id: string; stops: 1 | 2 } | null;
}

/** Every space of a section: its own `tiles`, or `lanes` of them on every row. */
function tilesOf(section: TrackSection): SectionTile[] {
    if (section.tiles) return section.tiles;
    const tiles: SectionTile[] = [];
    for (let row = section.from; row <= section.to; row++) {
        for (let lane = 1; lane <= section.lanes; lane++) tiles.push({ row, lane });
    }
    return tiles;
}

/**
 * §5.1's own step rule, written onto a space that didn't name its exits: the
 * next row, this lane or either lane beside it, keeping only the ones the road
 * actually has a space on.
 *
 * Narrowing handles itself, which is the reason this reads the next row's
 * spaces rather than a lane width. Coming out of a three-lane straight into a
 * two-lane corner, lane 3 has only lane 2 to merge into — and because every row
 * has a space on it, the result is never empty, which is what lets §9 treat an
 * empty step list as "boxed in by traffic" rather than "off the end of the map".
 *
 * Exported because the track editor (docs/admin-tools.md) draws these faint,
 * behind the exits an author has overridden, so a corner's real merge reads
 * against §5.1's default rather than replacing it invisibly.
 */
export function defaultExits(rows: number, spacesByRow: Map<number, number[]>, tile: SectionTile): RaceCarsSpace[] {
    const to = (tile.row + 1) % rows;
    return (spacesByRow.get(to) ?? [])
        .filter(lane => Math.abs(lane - tile.lane) <= 1)
        .map(lane => ({ row: to, lane }));
}

/**
 * A circuit's `spaces` — every tile with the steps out of it, §5.1's default
 * rule written onto any that didn't name their own — validated as a graph a
 * race can actually be driven round.
 *
 * The half of `deriveTrack` that is about tiles rather than sections, split out
 * so the track editor can assemble the same graph from tiles it has no section
 * table for and refuse the same undriveable circuits (docs/admin-tools.md).
 * `rows` is the lap length: `deriveTrack` reads it off the last section, the
 * editor off the highest row it has a tile on. Throws — the errors are the ones
 * `board.test.ts` pins — on each hole a race would otherwise fall into
 * silently: two spaces on one square, a row the road skips, a space nothing can
 * step off, a step onto a space that isn't there, or a step that changes lane
 * without moving the car forward.
 */
export function assembleSpaces(tiles: SectionTile[], rows: number): RaceCarsTrackSpace[] {
    const spacesByRow = new Map<number, number[]>();
    for (const tile of tiles) {
        const lanes = spacesByRow.get(tile.row);
        if (lanes?.includes(tile.lane)) throw new Error(`Race Cars: two spaces at ${tile.row}:${tile.lane}`);
        if (lanes) lanes.push(tile.lane);
        else spacesByRow.set(tile.row, [tile.lane]);
    }
    for (const lanes of spacesByRow.values()) lanes.sort((a, b) => a - b);
    for (let row = 0; row < rows; row++) {
        // A row the road skips is a gap `defaultExits` steps straight over,
        // which is a lap distance no rule would agree on.
        if (!spacesByRow.has(row)) throw new Error(`Race Cars: row ${row} has no spaces on it`);
    }

    const spaces: RaceCarsTrackSpace[] = tiles.map(tile => ({
        row: tile.row,
        lane: tile.lane,
        exits: tile.exits ?? defaultExits(rows, spacesByRow, tile),
        cornerId: tile.cornerId,
    }));

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
 * A track's `rows`, `spaces` and `corners`, all read off one `SECTIONS` table.
 *
 * Throws on a circuit that cannot be driven rather than shipping one. A track
 * is static data read at module load and asserted by `board.test.ts`, so the
 * only way to reach one of these is to be writing a circuit — and every one of
 * them is a hole a race would fall into silently: a space nothing can step off,
 * a step onto a space that isn't there, a row the road skips entirely, or a
 * step that doesn't move the car forward, which is a car that can drive a
 * corner's stop count for free.
 */
export function deriveTrack(sections: TrackSection[]): {
    rows: number;
    spaces: RaceCarsTrackSpace[];
    corners: RaceCarsCorner[];
} {
    const rows = sections[sections.length - 1].to + 1;

    let expected = 0;
    for (const section of sections) {
        if (section.from !== expected || section.to < section.from) {
            throw new Error(`Race Cars: section "${section.name}" covers rows ${section.from}-${section.to}, expected to start at ${expected}`);
        }
        expected = section.to + 1;
    }

    const tiles = sections.flatMap(section => tilesOf(section).map(tile => {
        if (tile.row < section.from || tile.row > section.to) {
            throw new Error(`Race Cars: section "${section.name}" has a space on row ${tile.row}, outside its band`);
        }
        if (tile.lane < 1 || tile.lane > section.lanes) {
            throw new Error(`Race Cars: section "${section.name}" has a space in lane ${tile.lane} on a ${section.lanes}-lane road`);
        }
        // A section corner tags every space in the band; a space that names its
        // own cornerId keeps it — including an explicit `cornerId: undefined`,
        // which drops the inside line out of the corner past its apex (§10,
        // per-space membership). "Key present" is what distinguishes that opt-out
        // from a space that simply didn't mention a corner.
        return { ...tile, cornerId: 'cornerId' in tile ? tile.cornerId : section.corner?.id };
    }));

    const spaces = assembleSpaces(tiles, rows);

    const corners: RaceCarsCorner[] = sections
        .filter(section => section.corner !== null)
        .map(section => ({
            id: section.corner!.id,
            name: section.name,
            from: section.from,
            to: section.to,
            stops: section.corner!.stops,
        }));

    return { rows, spaces, corners };
}
