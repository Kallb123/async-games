// The pure half of the Race Cars track editor (docs/admin-tools.md): the model
// an admin builds by clicking tiles onto a circuit image, and the three things
// it does with that model — derive the circuit it describes, say what is wrong
// with it, and print it as a `tracks/` file ready to paste beside anglet.ts.
//
// No React and no DOM: the editor component owns the pointer handling and this
// owns the geometry, the graph and the serialisation, so both can be reasoned
// about (and tested) on their own. It reuses the game's own derivation —
// `deriveTrack`, and `defaultExitIds` for §5.1's step rule — rather than
// restating any of it, so a track drawn here obeys exactly the rules the track
// files that ship already do, rows included.
//
// **Rows are never authored here.** An author draws sections, tiles and the
// steps between them; `deriveTrack` works out which row each tile lands on
// (`sections.ts`). The editor shows those rows back so a skewed corner is
// visible, and that is the only place a row number enters this file.
import type { RaceCarsGear, RaceCarsTrack } from "../board";
import { spaceKey } from "../board";
import {
    bearingTo,
    defaultExitIds,
    deriveTrack,
    lapRuns,
    neighbouringLanes,
    plainTileId,
    tileGeometry,
    type DerivedTrack,
    type SectionRuns,
    type SourceTile,
    type TrackSection,
} from "./sections";

/**
 * One stretch of road between two sync lines, as the editor holds it: the same
 * thing `TrackSection` is, with the stop count flattened so a straight and a
 * corner are one control rather than two shapes (§10).
 */
export interface EditorSection {
    id: string;
    name: string;
    lanes: 2 | 3;
    /** 0 for a straight; a corner's stop count otherwise. */
    stops: 0 | 1 | 2;
}

/**
 * One tile as the editor holds it: its id, the section and lane it belongs to,
 * the point on the art the author dropped it at, and — where they differ from
 * §5.1's default — the steps out of it.
 *
 * `exits` is left undefined for an ordinary tile that takes the default rule,
 * so the printed track carries an override only where a real corner needs one,
 * exactly as a hand-written track file does. `heading` is likewise optional:
 * omitted, it is computed from where the tile's exits point.
 */
export interface EditorTile {
    id: string;
    /** The `EditorSection.id` this tile is drawn in. */
    section: string;
    lane: number;
    x: number;
    y: number;
    heading?: number;
    exits?: string[];
    /**
     * Set alongside `exits` when `connectByGeometry` wrote them, not an author's
     * hand — so a later pass may redraw them (a moved tile, a redrawn corner) the
     * way a hand-drawn override never is. Absent (or false) on any `exits` an
     * author drew themselves, which stays untouched forever.
     */
    autoExits?: boolean;
}

/** Everything the editor holds for one circuit — its own save format. */
export interface EditorState {
    id: string;
    name: string;
    artHref: string;
    viewBox: { width: number; height: number };
    maxGear: Exclude<RaceCarsGear, 0>;
    /** In the order they are driven, starting at the start/finish line. */
    sections: EditorSection[];
    tiles: EditorTile[];
}

/** The section every blank circuit opens with, so there is somewhere to draw. */
const FIRST_SECTION: EditorSection = {
    id: "start",
    name: "Start / Finish Straight",
    lanes: 3,
    stops: 0,
};

/** A blank circuit to start drawing on, sized to the art behind it. */
export function emptyState(overrides: Partial<EditorState> = {}): EditorState {
    return {
        id: "",
        name: "",
        artHref: "",
        viewBox: { width: 828, height: 538 },
        maxGear: 5,
        sections: [{ ...FIRST_SECTION }],
        tiles: [],
        ...overrides,
    };
}

function isNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

/** One section of an imported draft, or null if its shape can't be trusted. */
function cleanSection(value: unknown): EditorSection | null {
    if (!value || typeof value !== "object") return null;
    const section = value as Record<string, unknown>;
    if (typeof section.id !== "string" || !section.id) return null;
    return {
        id: section.id,
        name: typeof section.name === "string" ? section.name : section.id,
        lanes: section.lanes === 2 ? 2 : 3,
        stops: section.stops === 1 ? 1 : section.stops === 2 ? 2 : 0,
    };
}

/** One tile of an imported draft, or null if its shape can't be trusted. */
function cleanTile(value: unknown): EditorTile | null {
    if (!value || typeof value !== "object") return null;
    const tile = value as Record<string, unknown>;
    if (typeof tile.id !== "string" || !tile.id) return null;
    if (typeof tile.section !== "string" || !isNumber(tile.lane) || !isNumber(tile.x) || !isNumber(tile.y)) return null;
    const cleaned: EditorTile = { id: tile.id, section: tile.section, lane: tile.lane, x: tile.x, y: tile.y };
    if (isNumber(tile.heading)) cleaned.heading = tile.heading;
    if (Array.isArray(tile.exits)) {
        const exits = tile.exits.filter((exit): exit is string => typeof exit === "string");
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
 * level: a tiles array carrying a `null`, or a section whose value isn't an
 * object, would otherwise crash the first render that reads `tile.lane` or
 * `section.name`. Bad entries are dropped rather than trusted, and anything
 * that isn't an object at all falls back to a blank track.
 */
export function parseDraft(raw: string | null): EditorState {
    if (!raw) return emptyState();
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return emptyState();
        const source = parsed as Record<string, unknown>;
        const base = emptyState();

        const sections = Array.isArray(source.sections)
            ? source.sections.map(cleanSection).filter((section): section is EditorSection => section !== null)
            : [];
        const tiles = Array.isArray(source.tiles)
            ? source.tiles.map(cleanTile).filter((tile): tile is EditorTile => tile !== null)
            : [];

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
            // A draft with no readable sections still has to be drawable on.
            sections: sections.length > 0 ? sections : base.sections,
            tiles,
        };
    } catch {
        return emptyState();
    }
}

// ─── The circuit the drawing describes ───────────────────────────────────────

/** What to call a section on screen and in the printed file. */
export function sectionLabel(section: EditorSection): string {
    return section.name || section.id;
}

/** The tiles drawn in one section, in the order they were placed. */
export function tilesIn(state: EditorState, sectionId: string): EditorTile[] {
    return state.tiles.filter(tile => tile.section === sectionId);
}

/**
 * The editor's model as the `SECTIONS` table a track file is written in — the
 * one conversion everything else here goes through, so the circuit the editor
 * validates, previews and prints is one reading of the drawing rather than
 * three that could drift.
 */
export function toSections(state: EditorState): TrackSection[] {
    const bySection = new Map(state.sections.map(section => [section.id, [] as SourceTile[]]));
    for (const tile of state.tiles) {
        bySection.get(tile.section)?.push({
            id: tile.id,
            lane: tile.lane,
            exits: tile.exits,
            x: tile.x,
            y: tile.y,
            heading: tile.heading,
        });
    }
    return state.sections.map(section => ({
        id: section.id,
        name: sectionLabel(section),
        lanes: section.lanes,
        corner: section.stops > 0 ? { stops: section.stops as 1 | 2 } : null,
        tiles: bySection.get(section.id) ?? [],
    }));
}

/**
 * The row each tile lands on, by tile id — what the canvas prints on the tiles
 * so a skewed section is something an author can see rather than something the
 * game finds out about later. Empty while the drawing is not a circuit yet.
 */
export function derivedRows(derived: DerivedTrack | null): Map<string, number> {
    return new Map((derived?.tiles ?? []).map(tile => [tile.id, tile.row]));
}

// ─── Steps ───────────────────────────────────────────────────────────────────

/** The next free id for a tile in this section and lane — `section.lane.n`. */
export function nextTileId(state: EditorState, sectionId: string, lane: number): string {
    const taken = new Set(state.tiles.map(tile => tile.id));
    let index = 0;
    while (taken.has(plainTileId(sectionId, lane, index))) index++;
    return plainTileId(sectionId, lane, index);
}

/**
 * §5.1's own step rule for one tile — the next tile along, this lane or either
 * lane beside it — so the editor can draw it faint behind the steps an author
 * has overridden, and tell the two apart when it prints.
 *
 * `lap` is passed in rather than rebuilt, because the canvas asks this of every
 * tile on every render and rebuilding the lap per tile is the O(n²) the tile
 * lookup already avoids.
 */
export function tileDefaultExits(lap: SectionRuns[], state: EditorState, tile: EditorTile): string[] {
    const sectionIndex = state.sections.findIndex(section => section.id === tile.section);
    if (sectionIndex < 0) return [];
    return defaultExitIds(lap, sectionIndex, { id: tile.id, lane: tile.lane });
}

/**
 * The tile the road carries straight on to in this tile's **own** lane — the
 * direction of travel, for a search that has to tell "ahead" from "beside".
 *
 * Rows used to answer that: a candidate on the same row was level, whatever the
 * art did, and never a step. With rows derived rather than typed there is
 * nothing to compare but the road itself, and the author has already said which
 * way it runs by placing each lane's tiles in order — so the next tile along
 * this lane is the heading, rather than the mean of the default steps, which
 * points diagonally across the road and lets the tile *beside* this one pass
 * for one ahead of it.
 */
function laneAhead(lap: SectionRuns[], state: EditorState, tile: EditorTile): string[] {
    return tileDefaultExits(lap, state, tile).filter(exit => {
        const other = state.tiles.find(candidate => candidate.id === exit);
        return other?.lane === tile.lane;
    });
}

/** Whether two step lists name the same tiles, order aside. */
export function sameExits(a: readonly string[], b: readonly string[]): boolean {
    if (a.length !== b.length) return false;
    const other = new Set(b);
    return a.every(exit => other.has(exit));
}

/** Every tile's effective steps at once, by tile id — one pass for the canvas. */
export function allEffectiveExits(state: EditorState): Map<string, string[]> {
    const lap = lapRuns(toSections(state));
    return new Map(state.tiles.map(tile => [
        tile.id,
        tile.exits ?? tileDefaultExits(lap, state, tile),
    ]));
}

/** One tile's steps: its own where it has overridden them, else §5.1's default. */
export function effectiveExits(state: EditorState, tile: EditorTile): string[] {
    return tile.exits ?? tileDefaultExits(lapRuns(toSections(state)), state, tile);
}

/**
 * Whether §5.1's default step rule is refused for this tile — that is, whether
 * its section's lanes hold different numbers of tiles.
 *
 * `defaultExitIds` answers "the next tile along, this lane or either beside it"
 * by **index** within each lane's run. Where the runs are different lengths
 * that index is not a statement about the road, so `deriveTrack` refuses the
 * section unless every tile in it names its own steps (`sections.ts`). The
 * editor still draws the computed default there, because it is usually the
 * right answer near the section's entry and a useful thing to start from — but
 * an author has to confirm it, which is what `pinnedExits` is for.
 */
export function mustNameSteps(state: EditorState, tile: EditorTile): boolean {
    const section = state.sections.find(candidate => candidate.id === tile.section);
    if (!section) return false;
    const lengths = [...laneRunLengths(state, section.id)];
    return lengths.length > 1 && lengths.some(length => length !== lengths[0]);
}

/** How many tiles each lane of a section holds, in no particular order. */
function laneRunLengths(state: EditorState, sectionId: string): number[] {
    const perLane = new Map<number, number>();
    for (const tile of state.tiles) {
        if (tile.section !== sectionId) continue;
        perLane.set(tile.lane, (perLane.get(tile.lane) ?? 0) + 1);
    }
    return [...perLane.values()];
}

/**
 * The patch that **freezes** a tile's steps as its own — the same set it is
 * already taking, written down explicitly rather than left to §5.1's rule.
 *
 * This is the only way to say "yes, those exact steps" about a tile whose
 * default is already correct: toggling a step off and back on can't do it,
 * because an edit that lands on the default drops the override again. A tile in
 * a section whose lanes run out of step needs exactly that, since the rule its
 * steps would otherwise fall back to is one `deriveTrack` refuses.
 */
export function pinnedExits(state: EditorState, tile: EditorTile): Pick<EditorTile, "exits" | "autoExits"> {
    // `autoExits` cleared with it: a set an author has confirmed is theirs, so
    // auto-connect leaves it alone like any other hand-drawn override.
    return { exits: effectiveExits(state, tile), autoExits: undefined };
}

/**
 * The same, for every tile of one section at once.
 *
 * `deriveTrack` throws on the **first** tile it finds without steps of its own,
 * so an out-of-step corner fixed a tile at a time is one error message per tile
 * — a dozen rounds of read-click-read for one corner. The condition is a
 * property of the section rather than the tile, so this is the shape the fix
 * wants: confirm the section's steps once, then correct the few the geometry
 * got wrong by hand.
 *
 * Tiles that already have their own steps keep them, hand-drawn and
 * auto-connected alike — this only writes down the ones still falling back to
 * §5.1's rule.
 */
export function withSectionStepsNamed(state: EditorState, sectionId: string): EditorTile[] {
    const lap = lapRuns(toSections(state));
    return state.tiles.map(tile => (tile.section === sectionId && !tile.exits
        ? { ...tile, exits: tileDefaultExits(lap, state, tile), autoExits: undefined }
        : tile));
}

/**
 * The heading a car on this tile faces: its own where the author set one, else
 * pointed down the road toward its exits, so a fresh track's cars aim the right
 * way without a heading typed per tile.
 */
export function tileHeading(state: EditorState, tile: EditorTile): number {
    if (tile.heading !== undefined) return tile.heading;
    const byId = new Map(state.tiles.map(other => [other.id, other]));
    return headingTowards(tile, effectiveExits(state, tile), byId);
}

function headingTowards(tile: EditorTile, exits: readonly string[], byId: Map<string, EditorTile>): number {
    return bearingTo(tile, exits
        .map(exit => byId.get(exit))
        .filter((exit): exit is EditorTile => exit !== undefined));
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
 * Exits redrawn from where the tiles actually sit rather than assumed from the
 * order they were placed in — the plain remaining job here once every corner
 * sharp enough to need a real lane realignment is drawn by hand instead (its
 * `exits` a genuine override, never `autoExits`): the tiles this function still
 * touches are an ordinary straight or gentle bend, where the only question
 * worth asking geometrically is *which* tile ahead, not necessarily the one the
 * road happened to wander towards.
 *
 * The nearest tile is picked once per lane — this lane and the one either side,
 * exactly what §5.1's own rule allows — rather than once across every candidate
 * pooled together with a distance cutoff. A lane change can sit much farther
 * away than staying in lane (the lane offset on a wide or staggered road), so a
 * single "close enough to the closest" cutoff across lanes was dropping a real,
 * and often the only, tile ahead in the next lane over just because the
 * same-lane tile happened to be nearer — a wide road never got its 1↔2 or 2↔3
 * merge drawn. Per lane, one candidate either exists ahead or it doesn't.
 * Limiting candidates to this lane or the one either side of it also keeps
 * geometry from ever connecting lane 1 straight to lane 3, a step no car may
 * take, however close that tile happens to sit.
 *
 * A tile that already carries a hand-drawn override keeps it untouched. One
 * this function wrote itself on an earlier run (`autoExits`) is *always*
 * redrawn from scratch rather than trusted as a starting point: reasoning from
 * last run's guess — its heading, or which tiles it already reached — is
 * exactly what let a second run drift to a different, sometimes wrong, target
 * instead of settling on the one the tiles actually call for.
 *
 * Tiles are worked in road order — section by section, and in placement order
 * inside each — so that a candidate behind a tile has already been resolved by
 * the time that tile searches, and a candidate this very run has already
 * pointed the other way is never offered back: that line has a direction, and
 * retracing it would connect two tiles both ways however well the nearer one
 * otherwise fits the heading. Two tiles pointing at each other is the one
 * mistake the derivation cannot place a row against at all, and it says so.
 */
export function connectByGeometry(state: EditorState): EditorTile[] {
    const lap = lapRuns(toSections(state));
    const byId = new Map(state.tiles.map(tile => [tile.id, tile]));
    const order = new Map(state.sections.map((section, index) => [section.id, index]));

    // What this run has resolved so far — a hand-drawn override from the start,
    // an auto tile's the moment the loop below (re)computes it. Never a tile's
    // own previous `exits` when those were auto-written: that is exactly the
    // stale guess this function stops trusting.
    const results = new Map<string, EditorTile>();
    for (const tile of state.tiles) {
        if (tile.exits && !tile.autoExits) results.set(tile.id, tile);
    }

    const roadOrder = [...state.tiles].sort((a, b) =>
        (order.get(a.section) ?? 0) - (order.get(b.section) ?? 0));

    for (const tile of roadOrder) {
        if (results.has(tile.id)) continue; // hand-drawn, seeded above

        const fallback = tileDefaultExits(lap, state, tile);
        const ahead = laneAhead(lap, state, tile);
        const heading = tile.heading ?? headingTowards(tile, ahead.length > 0 ? ahead : fallback, byId);
        const radians = (heading * Math.PI) / 180;
        const forwardX = Math.cos(radians);
        const forwardY = Math.sin(radians);

        const exits: string[] = [];
        for (const lane of neighbouringLanes(tile.lane)) {
            let nearest: { other: EditorTile; dist: number } | null = null;
            for (const other of state.tiles) {
                if (other.id === tile.id || other.lane !== lane) continue;
                // A candidate this run has already resolved with an exit back
                // into this tile is never offered — that line has a direction.
                const resolved = results.get(other.id);
                const alreadyExits = resolved && (resolved.exits ?? tileDefaultExits(lap, state, resolved));
                if (alreadyExits?.includes(tile.id)) continue;
                const dx = other.x - tile.x;
                const dy = other.y - tile.y;
                const dist = Math.hypot(dx, dy);
                if (dist <= 0 || dx * forwardX + dy * forwardY < dist * CONNECT_CONE) continue;
                if (!nearest || dist < nearest.dist) nearest = { other, dist };
            }
            if (nearest) exits.push(nearest.other.id);
        }

        const result = exits.length > 0 && !sameExits(exits, fallback)
            ? { ...tile, exits, autoExits: true }
            : (tile.exits ? { ...tile, ...NO_EXITS } : tile);

        results.set(tile.id, result);
    }

    return state.tiles.map(tile => results.get(tile.id)!);
}

// ─── Validation ──────────────────────────────────────────────────────────────

export interface EditorValidation {
    /** Reasons the track cannot be driven — it must not be shipped with any. */
    errors: string[];
    /** Things worth an author's eye that do not stop the track working. */
    warnings: string[];
    /**
     * The circuit the drawing derived to, or null if it does not derive to one.
     * Handed back rather than thrown away so the screen can print the rows it
     * worked out without deriving the same drawing a second time — this runs on
     * every keystroke and every frame of a drag.
     */
    derived: DerivedTrack | null;
}

/**
 * What is wrong with the drawn circuit, split into what stops it being a track
 * at all and what merely wants a second look. The errors half runs the drawing
 * through `deriveTrack` — the very derivation the track files pass at module
 * load — so "it validates in the editor" and "it loads in the game" are the
 * same statement.
 */
export function validateTrack(state: EditorState): EditorValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (state.tiles.length === 0) {
        return { errors: ["Nothing drawn yet — click the art to place tiles."], warnings, derived: null };
    }
    if (!state.id.trim()) warnings.push("No track id set.");
    if (!state.name.trim()) warnings.push("No track name set.");
    if (!state.artHref.trim()) warnings.push("No art path set — the board will draw the space layer alone.");

    let derived: DerivedTrack | null = null;
    try {
        derived = deriveTrack(toSections(state));
    } catch (error) {
        errors.push(error instanceof Error ? error.message.replace(/^Race Cars: /, "") : String(error));
    }

    // A tile drawn into a section that has since been deleted is a tile the
    // derivation never sees — it would quietly vanish from the printed track
    // rather than break it, which is the worse of the two.
    const sectionIds = new Set(state.sections.map(section => section.id));
    const orphans = state.tiles.filter(tile => !sectionIds.has(tile.section)).length;
    if (orphans > 0) {
        warnings.push(`${orphans} tile${orphans === 1 ? " belongs" : "s belong"} to a section that no longer exists — they will not be printed.`);
    }

    for (const section of state.sections) {
        const tiles = tilesIn(state, section.id);
        if (tiles.length === 0) {
            warnings.push(`Section "${sectionLabel(section)}" has no tiles on it yet.`);
            continue;
        }
        const lanes = new Set(tiles.map(tile => tile.lane));
        if (lanes.size < section.lanes) {
            warnings.push(`Section "${sectionLabel(section)}" is ${section.lanes} lanes wide but only has tiles in ${lanes.size} of them.`);
        }
    }

    // The thing rows are *for*: a corner whose inside line is drawn shorter than
    // its outside gets more rows than it has tiles in a lane, which is correct
    // and worth seeing. A section far longer in rows than any of its lanes is
    // long in tiles, though, is usually a zig-zag of steps that should have
    // been two sections with a sync line between them.
    if (derived) {
        for (const [index, section] of state.sections.entries()) {
            const tiles = derived.tiles.filter(tile => tile.section === index);
            if (tiles.length === 0) continue;
            const rows = new Set(tiles.map(tile => tile.row)).size;
            const longestLane = Math.max(...[...new Set(tiles.map(tile => tile.lane))]
                .map(lane => tiles.filter(tile => tile.lane === lane).length));
            if (rows > longestLane * 2) {
                warnings.push(`Section "${sectionLabel(section)}" spans ${rows} rows for a longest lane of ${longestLane} tiles — check its steps run across the road rather than zig-zagging along it.`);
            }
        }
    }

    return { errors, warnings, derived };
}

/**
 * The editor's model as one `RaceCarsTrack` — what the preview board draws and
 * what `printTrackFile` reads its geometry off. Throws through `deriveTrack` on
 * a circuit that cannot be driven, so a caller runs `validateTrack` first (the
 * export panel does, and only prints when it is clean).
 */
export function toTrack(state: EditorState): RaceCarsTrack {
    const derived = deriveTrack(toSections(state));
    return {
        id: state.id || "draft",
        name: state.name || "Draft circuit",
        rows: derived.rows,
        spaces: derived.spaces,
        corners: derived.corners,
        grid: [],
        maxGear: state.maxGear,
        art: { href: state.artHref, viewBox: state.viewBox },
        geometry: tileGeometry(derived),
    };
}

/**
 * Load an existing `RaceCarsTrack` into the editor, so a placeholder circuit
 * (Ashcombe's loop, Anglet's traced polyline) can be dragged onto its real art
 * rather than re-placed from nothing.
 *
 * A finished track carries no sections — they are the authoring model, and what
 * survives derivation is rows and corner ids — so they are read back the one
 * way they can be: every corner is its own section, and the road between two of
 * them is a straight. An author who wants a sync line inside one of those
 * straights (an esse, a chicane approach) splits it in the editor, which is the
 * same decision they would have made drawing it from scratch.
 */
export function fromTrack(track: RaceCarsTrack): EditorState {
    const geometryByKey = new Map(track.geometry.map(at => [spaceKey(at.row, at.lane), at]));

    // The corner bands, in road order, with the straights between them.
    const corners = [...track.corners].sort((a, b) => a.from - b.from);
    const sections: EditorSection[] = [];
    const bandOf = new Map<number, string>();
    let row = 0;
    let straights = 0;
    const claim = (id: string, from: number, to: number) => {
        for (let at = from; at <= to; at++) bandOf.set(at, id);
    };
    const addStraight = (from: number, to: number) => {
        straights++;
        const id = `straight${straights}`;
        sections.push({
            id,
            name: straights === 1 ? "Start / Finish Straight" : `Straight ${straights}`,
            lanes: 3,
            stops: 0,
        });
        claim(id, from, to);
    };

    for (const corner of corners) {
        if (corner.from > row) addStraight(row, corner.from - 1);
        sections.push({ id: corner.id, name: corner.name, lanes: 2, stops: corner.stops });
        claim(corner.id, corner.from, corner.to);
        row = corner.to + 1;
    }
    if (row < track.rows || sections.length === 0) addStraight(row, track.rows - 1);
    // A section is as wide as the widest row drawn in it.
    for (const section of sections) {
        const widest = Math.max(1, ...track.spaces.filter(space => bandOf.get(space.row) === section.id).map(space => space.lane));
        section.lanes = widest >= 3 ? 3 : 2;
    }

    // Tile ids are the (row, lane) they were loaded from, so the exits below can
    // name them before the editor has ever re-derived a row.
    const idOf = (r: number, lane: number) => `t${r}_${lane}`;
    const ordered = [...track.spaces].sort((a, b) => a.row - b.row || a.lane - b.lane);
    const tiles: EditorTile[] = ordered.map(space => {
        const at = geometryByKey.get(spaceKey(space.row, space.lane));
        return {
            id: idOf(space.row, space.lane),
            section: bandOf.get(space.row) ?? sections[0].id,
            lane: space.lane,
            x: at?.x ?? 0,
            y: at?.y ?? 0,
            heading: at?.heading,
            // Every step is kept as an override: what the default rule would
            // have written depends on rows that have not been derived yet, and
            // a wrong guess here is a silently different circuit.
            exits: space.exits.map(exit => idOf(exit.row, exit.lane)),
        };
    });

    return {
        id: track.id,
        name: track.name,
        artHref: track.art.href,
        viewBox: { ...track.art.viewBox },
        maxGear: track.maxGear,
        sections,
        tiles,
    };
}

// ─── Printing the track file ─────────────────────────────────────────────────

function tileLiteral(tile: EditorTile, exits: string[], heading: number): string {
    const parts = [
        `id: ${JSON.stringify(tile.id)}`,
        `lane: ${tile.lane}`,
        `x: ${Math.round(tile.x)}`,
        `y: ${Math.round(tile.y)}`,
        `heading: ${heading}`,
    ];
    if (tile.exits) parts.push(`exits: [${exits.map(exit => JSON.stringify(exit)).join(", ")}]`);
    return `{ ${parts.join(", ")} },`;
}

/**
 * The circuit as a `tracks/` TypeScript file, ready to save beside the others
 * and add to `TRACK_LIST` — the editor's whole point, since 214 hand-placed
 * coordinates and their steps are not a thing to type by hand (§23.6).
 *
 * It prints the same `SECTIONS` table the hand-written circuits are authored in,
 * with every tile written out: a traced board's tiles carry positions and steps
 * a `length` shorthand cannot say, and its rows are derived at module load from
 * the printed steps exactly as they were in the editor. No row number is
 * printed anywhere — printing one would be printing the answer to a question
 * `deriveTrack` is the only thing allowed to answer.
 *
 * Throws rather than printing a circuit that cannot be driven; a caller runs
 * `validateTrack` first.
 */
export function printTrackFile(state: EditorState): string {
    const constName = (state.id || "track").toUpperCase().replace(/[^A-Z0-9]/g, "_");
    const exitsById = allEffectiveExits(state);
    // The guard, and the only derivation this needs: a file that cannot be
    // derived is a file that would not load, so it is never printed. Callers
    // run `validateTrack` first and so never see this throw (the export panel
    // only prints a clean drawing) — it is here so that a caller that forgets
    // gets an error rather than a broken module.
    deriveTrack(toSections(state));

    const sectionLines = state.sections.map(section => {
        const tiles = tilesIn(state, section.id)
            // Lane by lane, each run in road order: the shape `sections.ts`
            // reads, and the shape a human reads a corner in.
            .sort((a, b) => a.lane - b.lane)
            .map(tile => `            ${tileLiteral(tile, exitsById.get(tile.id) ?? [], tileHeading(state, tile))}`)
            .join("\n");
        const corner = section.stops > 0 ? `{ stops: ${section.stops} }` : "null";
        return `    {
        id: ${JSON.stringify(section.id)},
        name: ${JSON.stringify(sectionLabel(section))},
        lanes: ${section.lanes},
        corner: ${corner},
        tiles: [
${tiles}
        ],
    },`;
    }).join("\n");

    return `// ${state.name || "A circuit"} — authored in the track editor (docs/admin-tools.md).
// Every tile's centre point and the steps out of it were placed by hand on the
// art; the rows are derived from those steps at module load (\`sections.ts\`),
// exactly as they are for the circuits written as plain section lengths.
import type { RaceCarsTrack } from "../board";
import { deriveTrack, STAGGERED_SIX_GRID, tileGeometry, type TrackSection } from "./sections";

const SECTIONS: TrackSection[] = [
${sectionLines}
];

const DERIVED = deriveTrack(SECTIONS);

export const ${constName}: RaceCarsTrack = {
    id: ${JSON.stringify(state.id || "draft")},
    name: ${JSON.stringify(state.name || "Draft circuit")},
    rows: DERIVED.rows,
    spaces: DERIVED.spaces,
    corners: DERIVED.corners,
    // Every track so far shares the staggered six-slot grid; give this one its
    // own array here if its start line sits somewhere else.
    grid: STAGGERED_SIX_GRID,
    maxGear: ${state.maxGear},
    art: {
        href: ${JSON.stringify(state.artHref)},
        viewBox: { width: ${state.viewBox.width}, height: ${state.viewBox.height} },
    },
    geometry: tileGeometry(DERIVED),
};
`;
}
