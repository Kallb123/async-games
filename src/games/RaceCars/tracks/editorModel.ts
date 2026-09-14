// The pure half of the Race Cars track editor (docs/admin-tools.md): the model
// an admin builds by clicking tiles onto a circuit image, and the two things it
// does with that model — validate it as a circuit a race can be driven round,
// and print it as a `tracks/` file ready to paste beside anglet.ts.
//
// No React and no DOM: the editor component owns the pointer handling and this
// owns the geometry, the graph and the serialisation, so both can be reasoned
// about (and tested) on their own. It reuses the game's own step rule —
// `defaultExits` and `assembleSpaces` — rather than restating §5.1, so a track
// drawn here obeys exactly the rules the track files that ship already do.
import type {
    RaceCarsCorner,
    RaceCarsGear,
    RaceCarsSpace,
    RaceCarsTrack,
} from "../board";
import { spaceKey } from "../board";
import { assembleSpaces, defaultExits, type SectionTile } from "./sections";

/**
 * One tile as the editor holds it: a (row, lane) on the circuit, the point on
 * the art the author dropped it at, and — where they differ from §5.1's default
 * — the steps out of it and the corner it belongs to.
 *
 * `exits` is left undefined for an ordinary tile that takes the default rule,
 * so the printed track carries an override only where a real corner needs one,
 * exactly as a hand-written track file does. `heading` is likewise optional:
 * omitted, it is computed from where the tile's exits point.
 */
export interface EditorTile {
    row: number;
    lane: number;
    x: number;
    y: number;
    heading?: number;
    exits?: RaceCarsSpace[];
    cornerId?: string;
}

/** A corner's name and stop count; its row band is read off the tiles in it. */
export interface EditorCornerMeta {
    name: string;
    stops: 1 | 2;
}

/** Everything the editor holds for one circuit — its own save format. */
export interface EditorState {
    id: string;
    name: string;
    artHref: string;
    viewBox: { width: number; height: number };
    maxGear: Exclude<RaceCarsGear, 0>;
    tiles: EditorTile[];
    /** Keyed by corner id; the band comes from the tiles that carry that id. */
    corners: Record<string, EditorCornerMeta>;
}

/** A blank circuit to start drawing on, sized to the art behind it. */
export function emptyState(overrides: Partial<EditorState> = {}): EditorState {
    return {
        id: "",
        name: "",
        artHref: "",
        viewBox: { width: 828, height: 538 },
        maxGear: 5,
        tiles: [],
        corners: {},
        ...overrides,
    };
}

/** Lap length: one past the highest row any tile sits on, or 0 for a blank track. */
export function rowCount(tiles: EditorTile[]): number {
    return tiles.reduce((max, tile) => Math.max(max, tile.row + 1), 0);
}

/** The lanes present on each row, sorted — what §5.1's default step rule reads. */
export function spacesByRow(tiles: EditorTile[]): Map<number, number[]> {
    const byRow = new Map<number, number[]>();
    for (const tile of tiles) {
        const lanes = byRow.get(tile.row);
        if (lanes) lanes.push(tile.lane);
        else byRow.set(tile.row, [tile.lane]);
    }
    for (const lanes of byRow.values()) lanes.sort((a, b) => a - b);
    return byRow;
}

/**
 * The steps §5.1 gives this tile when it names none of its own — the next row,
 * this lane or either lane beside it — so the editor can draw them faint behind
 * the exits an author has overridden, and tell the two apart when it prints.
 */
export function tileDefaultExits(tiles: EditorTile[], tile: EditorTile): RaceCarsSpace[] {
    return defaultExits(rowCount(tiles), spacesByRow(tiles), tile);
}

/** Whether two step lists name the same spaces, order aside. */
export function sameExits(a: readonly RaceCarsSpace[], b: readonly RaceCarsSpace[]): boolean {
    if (a.length !== b.length) return false;
    const bKeys = new Set(b.map(space => spaceKey(space.row, space.lane)));
    return a.every(space => bKeys.has(spaceKey(space.row, space.lane)));
}

/** A tile's steps: its own where it has overridden them, else §5.1's default. */
export function effectiveExits(tiles: EditorTile[], tile: EditorTile): RaceCarsSpace[] {
    return tile.exits ?? tileDefaultExits(tiles, tile);
}

/**
 * Every tile's effective steps at once, keyed by `spaceKey`. The canvas draws
 * an edge per exit on every render — and during a drag, every frame — so it
 * reads them from one O(n) pass here rather than recomputing §5.1's default per
 * tile (§23.4's objection to a `.find` per space per render, in the editor).
 */
export function allEffectiveExits(tiles: EditorTile[]): Map<string, RaceCarsSpace[]> {
    const rows = rowCount(tiles);
    const byRow = spacesByRow(tiles);
    return new Map(tiles.map(tile => [
        spaceKey(tile.row, tile.lane),
        tile.exits ?? defaultExits(rows, byRow, tile),
    ]));
}

/**
 * The screen bearing toward the mean of a set of exit tiles — the direction of
 * travel, in the degrees-clockwise-from-increasing-rows that
 * `RaceCarsGeometry.heading` is measured in and `loopGeometry` writes. Split
 * from `tileHeading` so a caller placing every tile (`toTrack`) can pass the
 * lookup and the exits it already has in hand rather than rebuild them per tile
 * — the O(n²) trap the canvas edges already avoid (§23.4).
 */
function headingTowards(tile: EditorTile, exits: readonly RaceCarsSpace[], byKey: Map<string, EditorTile>): number {
    const targets = exits
        .map(exit => byKey.get(spaceKey(exit.row, exit.lane)))
        .filter((exit): exit is EditorTile => exit !== undefined);
    if (targets.length === 0) return 0;
    const meanX = targets.reduce((sum, exit) => sum + exit.x, 0) / targets.length;
    const meanY = targets.reduce((sum, exit) => sum + exit.y, 0) / targets.length;
    return Math.round((Math.atan2(meanY - tile.y, meanX - tile.x) * 180) / Math.PI);
}

/**
 * The heading a car on this tile faces: its own where the author set one, else
 * pointed down the road toward its exits, so a fresh track's cars aim the right
 * way without a heading typed per tile. Rebuilds the tile lookup itself — for
 * the once-per-selection panel, not the per-tile loop (see `headingTowards`).
 */
export function tileHeading(tiles: EditorTile[], tile: EditorTile): number {
    if (tile.heading !== undefined) return tile.heading;
    const byKey = new Map(tiles.map(other => [spaceKey(other.row, other.lane), other]));
    return headingTowards(tile, effectiveExits(tiles, tile), byKey);
}

/**
 * Each corner as the rules want it — id, name, stop count, and the inclusive
 * row band read off the tiles that carry its id. A corner with no tiles is
 * dropped rather than printed as an empty band nothing sits in.
 */
export function buildCorners(state: EditorState): RaceCarsCorner[] {
    return Object.entries(state.corners)
        .map(([id, meta]) => {
            const rows = state.tiles.filter(tile => tile.cornerId === id).map(tile => tile.row);
            return { id, meta, rows };
        })
        .filter(corner => corner.rows.length > 0)
        .map(corner => ({
            id: corner.id,
            name: corner.meta.name,
            from: Math.min(...corner.rows),
            to: Math.max(...corner.rows),
            stops: corner.meta.stops,
        }))
        .sort((a, b) => a.from - b.from);
}

export interface EditorValidation {
    /** Reasons the track cannot be driven — it must not be shipped with any. */
    errors: string[];
    /** Things worth an author's eye that do not stop the track working. */
    warnings: string[];
}

/**
 * What is wrong with the drawn circuit, split into what stops it being a track
 * at all and what merely wants a second look. The errors half runs the tiles
 * through `assembleSpaces` — the very check the track files pass at module load
 * — so "it validates in the editor" and "it loads in the game" are the same
 * statement.
 */
export function validateTrack(state: EditorState): EditorValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (state.tiles.length === 0) {
        return { errors: ["Nothing drawn yet — click the art to place tiles."], warnings };
    }
    if (!state.id.trim()) warnings.push("No track id set.");
    if (!state.name.trim()) warnings.push("No track name set.");
    if (!state.artHref.trim()) warnings.push("No art path set — the board will draw the space layer alone.");

    const rows = rowCount(state.tiles);
    const tiles: SectionTile[] = state.tiles.map(tile => ({
        row: tile.row,
        lane: tile.lane,
        exits: tile.exits,
    }));
    try {
        assembleSpaces(tiles, rows);
    } catch (error) {
        errors.push(error instanceof Error ? error.message.replace(/^Race Cars: /, "") : String(error));
    }

    // A corner has to be one unbroken band of rows: `cornerAt` finds a car's
    // corner with `row >= from && row <= to`, so a gap in the middle would pull
    // in the straight between two stretches an author meant to keep apart. The
    // rows are indexed in one pass rather than two `.some` scans per row, since
    // this reruns on every drag frame (§23.4).
    const rowsPresent = new Set(state.tiles.map(tile => tile.row));
    const taggedRowsByCorner = new Map<string, Set<number>>();
    for (const tile of state.tiles) {
        if (!tile.cornerId) continue;
        const set = taggedRowsByCorner.get(tile.cornerId) ?? new Set<number>();
        set.add(tile.row);
        taggedRowsByCorner.set(tile.cornerId, set);
    }
    for (const corner of buildCorners(state)) {
        const tagged = taggedRowsByCorner.get(corner.id) ?? new Set<number>();
        for (let row = corner.from; row <= corner.to; row++) {
            if (rowsPresent.has(row) && !tagged.has(row)) {
                warnings.push(`Corner "${corner.name}" skips row ${row} — its rows must be one unbroken band.`);
                break;
            }
        }
    }

    return { errors, warnings };
}

/**
 * The editor's model as one `RaceCarsTrack` — the single conversion `printTrackFile`
 * reads its geometry off, so the printed `spaces`, `corners` and `geometry` are
 * all one function's view of the drawn circuit rather than three that could
 * drift. Throws through `assembleSpaces` on an undriveable track, so a caller
 * runs `validateTrack` first (the export panel does, and only prints when it is
 * clean).
 *
 * The lookup and the per-tile exits are built once and threaded into every
 * heading, rather than rebuilt per tile: this runs on every keystroke and drag
 * frame while a track is valid, so the O(n²) it would otherwise be is the same
 * trap §23.4 fixed for the canvas edges.
 */
export function toTrack(state: EditorState): RaceCarsTrack {
    const rows = rowCount(state.tiles);
    const tiles: SectionTile[] = state.tiles.map(tile => ({ row: tile.row, lane: tile.lane, exits: tile.exits }));
    const byKey = new Map(state.tiles.map(tile => [spaceKey(tile.row, tile.lane), tile]));
    const exitsByKey = allEffectiveExits(state.tiles);
    return {
        id: state.id || "draft",
        name: state.name || "Draft circuit",
        rows,
        spaces: assembleSpaces(tiles, rows),
        corners: buildCorners(state),
        grid: [],
        maxGear: state.maxGear,
        art: { href: state.artHref, viewBox: state.viewBox },
        geometry: state.tiles.map(tile => ({
            row: tile.row,
            lane: tile.lane,
            x: Math.round(tile.x),
            y: Math.round(tile.y),
            heading: tile.heading ?? headingTowards(tile, exitsByKey.get(spaceKey(tile.row, tile.lane)) ?? [], byKey),
        })),
    };
}

/**
 * Load an existing `RaceCarsTrack` into the editor, so a placeholder circuit
 * (Ashcombe's loop, Anglet's traced polyline) can be dragged onto its real art
 * rather than re-placed from nothing. An exit list that matches §5.1's default
 * is dropped back to undefined, so refining geometry doesn't turn every ordinary
 * straight into a hand-written override.
 */
export function fromTrack(track: RaceCarsTrack): EditorState {
    const geometryByKey = new Map(track.geometry.map(g => [spaceKey(g.row, g.lane), g]));
    const byRow = new Map<number, number[]>();
    for (const space of track.spaces) {
        const lanes = byRow.get(space.row);
        if (lanes) lanes.push(space.lane);
        else byRow.set(space.row, [space.lane]);
    }
    for (const lanes of byRow.values()) lanes.sort((a, b) => a - b);

    const cornerById = new Map(track.corners.map(corner => [corner.id, corner]));
    const tiles: EditorTile[] = track.spaces.map(space => {
        const geometry = geometryByKey.get(spaceKey(space.row, space.lane));
        const fallback = defaultExits(track.rows, byRow, { row: space.row, lane: space.lane });
        const corner = track.corners.find(c => space.row >= c.from && space.row <= c.to);
        return {
            row: space.row,
            lane: space.lane,
            x: geometry?.x ?? 0,
            y: geometry?.y ?? 0,
            heading: geometry?.heading,
            exits: sameExits(space.exits, fallback) ? undefined : space.exits.map(e => ({ row: e.row, lane: e.lane })),
            cornerId: corner?.id,
        };
    });

    return {
        id: track.id,
        name: track.name,
        artHref: track.art.href,
        viewBox: { ...track.art.viewBox },
        maxGear: track.maxGear,
        tiles,
        corners: Object.fromEntries(
            [...cornerById.values()].map(corner => [corner.id, { name: corner.name, stops: corner.stops }]),
        ),
    };
}

// ─── Printing the track file ─────────────────────────────────────────────────

function spaceLiteral(space: RaceCarsSpace): string {
    return `{ row: ${space.row}, lane: ${space.lane} }`;
}

function tileLiteral(tiles: EditorTile[], tile: EditorTile): string {
    const base = `{ row: ${tile.row}, lane: ${tile.lane}`;
    if (!tile.exits) return `${base} },`;
    const exits = tile.exits.map(spaceLiteral).join(", ");
    return `${base}, exits: [${exits}] },`;
}

/**
 * The circuit as a `tracks/` TypeScript file, ready to save beside the others
 * and add to `TRACK_LIST` — the editor's whole point, since 214 hand-placed
 * coordinates and their exits are not a thing to type by hand (§23.6).
 *
 * It prints explicit tiles and geometry rather than the section shorthand the
 * shipped tracks derive from: the editor's reason to exist is the geometry and
 * the per-tile exits, neither of which a section table carries, so re-deriving
 * them from sections would throw the authored positions away. `assembleSpaces`
 * still runs on the tiles at module load, so the printed track refuses the same
 * undriveable circuits `deriveTrack` does.
 */
export function printTrackFile(state: EditorState): string {
    const corners = buildCorners(state);
    const constName = (state.id || "track").toUpperCase().replace(/[^A-Z0-9]/g, "_");

    const tileLines = state.tiles.map(tile => `    ${tileLiteral(state.tiles, tile)}`).join("\n");
    const cornerLines = corners
        .map(c => `    { id: ${JSON.stringify(c.id)}, name: ${JSON.stringify(c.name)}, from: ${c.from}, to: ${c.to}, stops: ${c.stops} },`)
        .join("\n");
    const geometryLines = toTrack(state).geometry
        .map(g => `    { row: ${g.row}, lane: ${g.lane}, x: ${g.x}, y: ${g.y}, heading: ${g.heading} },`)
        .join("\n");

    return `// ${state.name || "A circuit"} — authored in the track editor (docs/admin-tools.md).
// Every tile's centre point, the corner merges that break §5.1's step rule and
// the corner bands were placed by hand on the art; \`assembleSpaces\` re-checks
// the graph at module load, exactly as the section-derived tracks are checked.
import type { RaceCarsCorner, RaceCarsGeometry, RaceCarsTrack } from "../board";
import { assembleSpaces, STAGGERED_SIX_GRID, type SectionTile } from "./sections";

const TILES: SectionTile[] = [
${tileLines}
];

const ROWS = ${rowCount(state.tiles)};

const CORNERS: RaceCarsCorner[] = [
${cornerLines}
];

const GEOMETRY: RaceCarsGeometry[] = [
${geometryLines}
];

export const ${constName}: RaceCarsTrack = {
    id: ${JSON.stringify(state.id || "draft")},
    name: ${JSON.stringify(state.name || "Draft circuit")},
    rows: ROWS,
    spaces: assembleSpaces(TILES, ROWS),
    corners: CORNERS,
    // Every track so far shares the staggered six-slot grid; give this one its
    // own array here if its start line sits somewhere else.
    grid: STAGGERED_SIX_GRID,
    maxGear: ${state.maxGear},
    art: {
        href: ${JSON.stringify(state.artHref)},
        viewBox: { width: ${state.viewBox.width}, height: ${state.viewBox.height} },
    },
    geometry: GEOMETRY,
};
`;
}
