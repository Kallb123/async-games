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
    /**
     * Set alongside `exits` when `connectByGeometry` wrote them, not an author's
     * hand — so a later pass may redraw them (a moved tile, a redrawn corner) the
     * way a hand-drawn override never is. Absent (or false) on any `exits` an
     * author drew themselves, which stays untouched forever.
     */
    autoExits?: boolean;
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

function isNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

/** A space literal `{ row, lane }`, kept only if both are numbers. */
function cleanSpace(value: unknown): RaceCarsSpace | null {
    if (!value || typeof value !== "object") return null;
    const space = value as Record<string, unknown>;
    return isNumber(space.row) && isNumber(space.lane) ? { row: space.row, lane: space.lane } : null;
}

/** One tile of an imported draft, or null if its shape can't be trusted. */
function cleanTile(value: unknown): EditorTile | null {
    if (!value || typeof value !== "object") return null;
    const tile = value as Record<string, unknown>;
    if (!isNumber(tile.row) || !isNumber(tile.lane) || !isNumber(tile.x) || !isNumber(tile.y)) return null;
    const cleaned: EditorTile = { row: tile.row, lane: tile.lane, x: tile.x, y: tile.y };
    if (isNumber(tile.heading)) cleaned.heading = tile.heading;
    if (typeof tile.cornerId === "string") cleaned.cornerId = tile.cornerId;
    if (Array.isArray(tile.exits)) {
        const exits = tile.exits.map(cleanSpace).filter((exit): exit is RaceCarsSpace => exit !== null);
        if (exits.length > 0) {
            cleaned.exits = exits;
            if (tile.autoExits === true) cleaned.autoExits = true;
        }
    }
    return cleaned;
}

/**
 * A saved draft, trusted only as far as its shape holds up — the editor's
 * localStorage autosave and its "open a draft file" both come through here, and
 * the file is arbitrary local content: a wrong file, a stale copy, a hand-edit
 * with one bad find/replace. Every entry is shape-checked, not just the top
 * level: a tiles array carrying a `null`, or a corner whose value isn't an
 * object, would otherwise crash the first render that reads `tile.row` or
 * `corner.name`. Bad entries are dropped rather than trusted, and anything that
 * isn't an object at all falls back to a blank track.
 */
export function parseDraft(raw: string | null): EditorState {
    if (!raw) return emptyState();
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return emptyState();
        const source = parsed as Record<string, unknown>;
        const base = emptyState();

        const tiles = Array.isArray(source.tiles)
            ? source.tiles.map(cleanTile).filter((tile): tile is EditorTile => tile !== null)
            : [];

        const corners: EditorState["corners"] = {};
        if (source.corners && typeof source.corners === "object") {
            for (const [id, value] of Object.entries(source.corners as Record<string, unknown>)) {
                if (!value || typeof value !== "object") continue;
                const meta = value as Record<string, unknown>;
                corners[id] = {
                    name: typeof meta.name === "string" ? meta.name : id,
                    stops: meta.stops === 2 ? 2 : 1,
                };
            }
        }

        const viewBox = source.viewBox && typeof source.viewBox === "object" ? source.viewBox as Record<string, unknown> : {};
        const gear = source.maxGear;

        return {
            id: typeof source.id === "string" ? source.id : base.id,
            name: typeof source.name === "string" ? source.name : base.name,
            artHref: typeof source.artHref === "string" ? source.artHref : base.artHref,
            viewBox: {
                width: isNumber(viewBox.width) ? viewBox.width : base.viewBox.width,
                height: isNumber(viewBox.height) ? viewBox.height : base.viewBox.height,
            },
            maxGear: (gear === 1 || gear === 2 || gear === 3 || gear === 4 || gear === 5 || gear === 6) ? gear : base.maxGear,
            tiles,
            corners,
        };
    } catch {
        return emptyState();
    }
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
 * A tile with no exit override at all — spread this onto a tile to wipe both
 * `exits` and `autoExits` together, rather than retyping the pair at each of
 * the few call sites (geometry falling back to the default rule, a deleted
 * tile's last remaining exit, "reset to default") that need to clear one
 * without silently leaving the other stale.
 */
export const NO_EXITS: Pick<EditorTile, "exits" | "autoExits"> = { exits: undefined, autoExits: undefined };

/** How far off the heading a candidate may sit — a projection this fraction of
 *  its distance keeps roughly-forward tiles and drops the ones off to the side. */
const CONNECT_CONE = 0.3;

/**
 * Exits redrawn from where the tiles actually sit rather than assumed from
 * their row numbers — the plain remaining job here once every corner sharp
 * enough to need a real lane realignment is drawn by hand instead (its
 * `exits` a genuine override, never `autoExits`): the tiles this function
 * still touches are an ordinary straight or gentle bend, where row+1 already
 * names the right row and the only question worth asking geometrically is
 * *which* tile on it — the nearest one ahead, not necessarily the one at the
 * same x the road happened to wander to.
 *
 * The nearest tile is picked once per lane — this lane and the one either
 * side, exactly what §5.1's own rule allows (`defaultExits`) — rather than
 * once across every candidate pooled together with a distance cutoff. A lane
 * change can sit much farther away than staying in lane (the lane offset on a
 * wide or staggered road), so a single "close enough to the closest" cutoff
 * across lanes was dropping a real, and often the only, tile ahead in the
 * next lane over just because the same-lane tile happened to be nearer — a
 * wide road never got its 1↔2 or 2↔3 merge drawn. Per lane, one candidate
 * either exists ahead or it doesn't; there is nothing to rank it against.
 * Limiting candidates to this lane or the one either side of it also keeps
 * geometry from ever connecting lane 1 straight to lane 3, a step no car may
 * take, however close that tile happens to sit. A same-row (sideways)
 * candidate is never connected either — a car changes lane while moving,
 * never on the spot.
 *
 * A tile that already carries a hand-drawn override keeps it untouched. One
 * this function wrote itself on an earlier run (`autoExits`) is *always*
 * redrawn from scratch rather than trusted as a starting point: reasoning
 * from last run's guess — its heading, or which tiles it already reached —
 * is exactly what let a second run drift to a different, sometimes wrong,
 * target instead of settling on the one the tiles actually call for. Both
 * the heading used to aim the search and the record of what is "already
 * connected" (below) come only from this run's own tile positions and
 * hand-drawn exits, never from a tile's own previous auto-connect result.
 *
 * Tiles are worked in row order — the direction of travel, now that every
 * sharp lane change is hand-drawn rather than something this function has to
 * infer — so that a candidate behind a tile has already been resolved by the
 * time that tile searches, and a candidate this very run has already pointed
 * the other way is never offered back: that line has a direction, and
 * retracing it would connect two tiles both ways however well the nearer one
 * otherwise fits the heading. The next-nearest tile in that lane is offered
 * instead, the same as when the nearest candidate fails the heading cone —
 * or no exit at all for that lane, if nothing else is ahead.
 */
export function connectByGeometry(tiles: EditorTile[]): EditorTile[] {
    const rows = rowCount(tiles);
    const byRow = spacesByRow(tiles);
    const byKey = new Map(tiles.map(tile => [spaceKey(tile.row, tile.lane), tile]));

    // What this run has resolved so far — a hand-drawn override from the
    // start, an auto tile's the moment this loop below (re)computes it.
    // Never a tile's own previous `exits` when those were auto-written: that
    // is exactly the stale guess this function stops trusting.
    const resolved = new Map<string, RaceCarsSpace[]>();
    for (const tile of tiles) {
        if (tile.exits && !tile.autoExits) resolved.set(spaceKey(tile.row, tile.lane), tile.exits);
    }

    const results = new Map<string, EditorTile>();
    for (const tile of [...tiles].sort((a, b) => a.row - b.row || a.lane - b.lane)) {
        const tileKey = spaceKey(tile.row, tile.lane);
        if (tile.exits && !tile.autoExits) { results.set(tileKey, tile); continue; }

        const fallback = defaultExits(rows, byRow, tile);
        const heading = tile.heading ?? headingTowards(tile, fallback, byKey);
        const radians = (heading * Math.PI) / 180;
        const forwardX = Math.cos(radians);
        const forwardY = Math.sin(radians);

        const exits: RaceCarsSpace[] = [];
        for (const lane of [tile.lane - 1, tile.lane, tile.lane + 1]) {
            let nearest: { other: EditorTile; dist: number } | null = null;
            for (const other of tiles) {
                if (other === tile || other.row === tile.row || other.lane !== lane) continue;
                // A candidate this run has already pointed back into this
                // tile is never offered — that line has a direction.
                const already = resolved.get(spaceKey(other.row, other.lane));
                if (already?.some(exit => exit.row === tile.row && exit.lane === tile.lane)) continue;
                const dx = other.x - tile.x;
                const dy = other.y - tile.y;
                const dist = Math.hypot(dx, dy);
                if (dist <= 0 || dx * forwardX + dy * forwardY < dist * CONNECT_CONE) continue;
                if (!nearest || dist < nearest.dist) nearest = { other, dist };
            }
            if (nearest) exits.push({ row: nearest.other.row, lane: nearest.other.lane });
        }

        const result = exits.length > 0 && !sameExits(exits, fallback)
            ? { ...tile, exits, autoExits: true }
            : (tile.exits ? { ...tile, ...NO_EXITS } : tile);

        resolved.set(tileKey, result.exits ?? fallback);
        results.set(tileKey, result);
    }

    return tiles.map(tile => results.get(spaceKey(tile.row, tile.lane))!);
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

    // An exit that runs more than half a lap "forward" is almost always a
    // backward step from a row-numbering slip — the trap a sharp corner sets,
    // where the inside line took fewer tiles round and the rows past it no
    // longer count up in step. A car crossing the start line steps forward a
    // row or two, never half the lap, so the wrap itself never trips this.
    if (rows > 0) {
        let backwards = 0;
        for (const [fromKey, exits] of allEffectiveExits(state.tiles)) {
            const from = state.tiles.find(tile => spaceKey(tile.row, tile.lane) === fromKey);
            if (!from) continue;
            for (const exit of exits) {
                const advance = ((exit.row - from.row) % rows + rows) % rows;
                if (advance > rows / 2) backwards++;
            }
        }
        if (backwards > 0) {
            warnings.push(`${backwards} exit${backwards === 1 ? '' : 's'} run more than half a lap forward — usually a row-numbering slip after a corner. Check the rows count up the way the road runs.`);
        }
    }

    // A tile painted with a corner that no longer exists — a corner removed, or
    // a stale id in an imported draft. `cornerAt` reads it as no corner at all,
    // so §10's stops go silently unenforced on that tile; surface it rather than
    // print a track whose spaces name a corner missing from its own list.
    const cornerIds = new Set(Object.keys(state.corners));
    if (state.tiles.some(tile => tile.cornerId !== undefined && !cornerIds.has(tile.cornerId))) {
        warnings.push("Some tiles are painted with a corner that no longer exists — clear them, or add the corner back.");
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
    const tiles: SectionTile[] = state.tiles.map(tile => ({ row: tile.row, lane: tile.lane, exits: tile.exits, cornerId: tile.cornerId }));
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
        return {
            row: space.row,
            lane: space.lane,
            x: geometry?.x ?? 0,
            y: geometry?.y ?? 0,
            heading: geometry?.heading,
            exits: sameExits(space.exits, fallback) ? undefined : space.exits.map(e => ({ row: e.row, lane: e.lane })),
            // Per space, read straight off the space — not derived from the row
            // band, which would pull the inside line back into the corner it
            // already left (§10).
            cornerId: space.cornerId,
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

function tileLiteral(tile: EditorTile): string {
    const parts = [`row: ${tile.row}`, `lane: ${tile.lane}`];
    if (tile.exits) parts.push(`exits: [${tile.exits.map(spaceLiteral).join(", ")}]`);
    if (tile.cornerId) parts.push(`cornerId: ${JSON.stringify(tile.cornerId)}`);
    return `{ ${parts.join(", ")} },`;
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

    const tileLines = state.tiles.map(tile => `    ${tileLiteral(tile)}`).join("\n");
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
