// Static Race Cars data: the shape of a circuit, the gear ladder, the wear
// specs, the race distances, and the one movement primitive every other rule
// is built on — docs/games/race-cars.md §5.1, §8.1, §8.2, §11, §15.
//
// No server-only imports. rules.ts reads this module, the command classes read
// rules.ts, and the board screen reads both for the reach band (docs/new-game.md,
// "Isomorphic rules modules"), so nothing here may reach for Mongoose, Clerk or
// `node:`.
import { ANGLET } from "./tracks/anglet";
import { ASHCOMBE } from "./tracks/ashcombe";

// ─── The circuit (§5.1) ─────────────────────────────────────────────────────

/** A space is a (row, lane) pair; lanes are numbered from 1 (§5.1). */
export interface RaceCarsSpace {
    row: number;
    lane: number;
}

/**
 * One space of a circuit, carrying the single fact about it no rule can work
 * out from where it sits: the spaces a car standing here may drive to next.
 *
 * §5.1's own rule — the next row, this lane or either lane beside it — is what
 * `deriveTrack` writes for an ordinary stretch of road, and it is written out
 * per space rather than recomputed on demand because a real circuit does not
 * obey it everywhere. Two things break it, and both live on the same corner:
 *
 * - **A tile that names the tiles it lets you cross to.** Painted corners are
 *   not free to change lane across; the board says which space ahead each one
 *   feeds, and often that is only the one in front.
 * - **Lanes that do not run in step.** The inside of a corner is the short way
 *   round, so it takes fewer spaces to cover the same rows than the outside
 *   does — four against eight — and "the same lane in the next row" is then not
 *   a space that exists at all. Past the corner the lanes are level again but
 *   the count of spaces behind them is not, which is why nothing downstream
 *   measures progress in steps.
 *
 * Read the list, never write to it: it belongs to the track, and every car on
 * the circuit is handed the same array.
 */
export interface RaceCarsTrackSpace extends RaceCarsSpace {
    /** Every space one step from here, in row then lane order. Never empty. */
    exits: readonly RaceCarsSpace[];
    /**
     * The corner this space belongs to, if any (§10) — membership is per space,
     * not per row. A corner covers all of its lanes, but not every lane on every
     * one of its rows: the inside line is the short way round and takes fewer
     * tiles through the corner than the outside does (§5.1), so it is in the
     * corner for fewer rows. A straight's spaces carry no id.
     */
    cornerId?: string;
}

/**
 * A corner is a band of rows with a stop count, not a turn of the wheel (§5.1).
 * `from`/`to` are the inclusive row band its spaces span — the outside line's
 * extent, since the inside line covers it in fewer rows — and §10 charges
 * overshoot in rows past `to`. Which spaces are actually in it is carried on the
 * spaces themselves (`cornerId`), because within that band different rows hold
 * different lanes of it.
 */
export interface RaceCarsCorner {
    id: string;
    name: string;
    from: number;
    to: number;
    stops: 1 | 2;
}

/**
 * Where one space is drawn on the circuit art, and which way a car sitting on
 * it faces. `heading` is degrees clockwise from "pointing along increasing
 * rows", so a straight-line unrolled circuit is all zeroes.
 */
export interface RaceCarsGeometry extends RaceCarsSpace {
    x: number;
    y: number;
    heading: number;
}

/**
 * A circuit, entirely as data — which is what makes §20's "add a second track"
 * hook one new file under `tracks/` plus one line in `TRACKS`.
 */
export interface RaceCarsTrack {
    id: string;
    name: string;
    /**
     * Positions round one lap. Row numbers wrap: the row after `rows - 1` is
     * row 0, and crossing that boundary completes a lap.
     *
     * A row is a **place on the road, not a step along it**. Everything that
     * compares two cars, or a car against the circuit, is measured in rows —
     * turn order, the gap to the leader, a corner's band, the finish line —
     * precisely because a lane may have no space on a given row (§5.1), so one
     * step can carry a car more than one row and two cars level with each other
     * can be a different number of steps from the same corner.
     */
    rows: number;
    /** Every space on the circuit, and the steps out of each (§5.1). */
    spaces: RaceCarsTrackSpace[];
    corners: RaceCarsCorner[];
    /** The starting grid, P1 first (§5.2). Never shorter than MAX_PLAYERS. */
    grid: RaceCarsSpace[];
    /** The top gear this circuit's straights can reach (§8.3). */
    maxGear: Exclude<RaceCarsGear, 0>;
    art: { href: string; viewBox: { width: number; height: number } };
    /**
     * One entry per space, for the board screen. Read through a Map built once
     * in module scope rather than a `.find()` per space — at 214 spaces and six
     * cars that is tens of thousands of comparisons a render, on every poll.
     */
    geometry: RaceCarsGeometry[];
}

/** Every circuit, in the order the setup screen offers them. */
export const TRACK_LIST: RaceCarsTrack[] = [ASHCOMBE, ANGLET];

export const TRACKS: Record<string, RaceCarsTrack> = Object.fromEntries(
    TRACK_LIST.map(track => [track.id, track]),
);

export const DEFAULT_TRACK_ID = ASHCOMBE.id;

/** The named circuit, falling back to the one that ships rather than throwing. */
export function trackById(trackId: string): RaceCarsTrack {
    return TRACKS[trackId] ?? ASHCOMBE;
}

// ─── The field (§5.2, §11) ──────────────────────────────────────────────────

export const MIN_PLAYERS = 2;
/** Six grid slots (§5.2), and the bound every corner is sized against (§23.4). */
export const MAX_PLAYERS = 6;

// ─── Gears and the dice (§8.1) ──────────────────────────────────────────────

export type RaceCarsGear = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface RaceCarsGearDef {
    gear: RaceCarsGear;
    /** The band, inclusive. A roll is uniform across it. */
    min: number;
    max: number;
    /**
     * The faces printed on the die the board draws, so a player reading "d8"
     * sees a d8 — and `faces.length` **is** the die, which is why the number of
     * sides is not stated a second time beside them. Cosmetic only: §8.1 rolls
     * `min + randomInt(span)`, uniform over the band, and gear 3's eight faces
     * cannot be uniform over a five-wide one. `rollFor` never reads this list.
     * Gear 0 has no die and no faces.
     */
    faces: number[];
    /** §8.1's "what it is for", for the gear picker and the guide. */
    purpose: string;
}

/** §8.1's table, indexed by gear. */
export const GEARS: RaceCarsGearDef[] = [
    { gear: 0, min: 0, max: 0, faces: [], purpose: 'Stopped: the grid, and a car that has spun' },
    { gear: 1, min: 1, max: 2, faces: [1, 1, 2, 2], purpose: 'Crawling out of a hairpin; the only gear that can bank a second stop in a five-row corner' },
    { gear: 2, min: 2, max: 4, faces: [2, 2, 3, 3, 4, 4], purpose: 'Corner entry and corner exit' },
    { gear: 3, min: 4, max: 8, faces: [4, 5, 5, 6, 6, 7, 7, 8], purpose: 'The workhorse — wide enough to reach a corner, short enough to stop in one' },
    { gear: 4, min: 7, max: 12, faces: [7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12], purpose: "The Mile's gear. Committed: a five-row corner cannot contain it" },
    { gear: 5, min: 11, max: 20, faces: [11, 11, 12, 12, 13, 13, 14, 14, 15, 15, 16, 16, 17, 17, 18, 18, 19, 19, 20, 20], purpose: 'The gamble. Reaches a corner from a long way out, and cannot stop in one without brakes' },
    { gear: 6, min: 21, max: 30, faces: [21, 21, 21, 22, 22, 22, 23, 23, 23, 24, 24, 24, 25, 25, 25, 26, 26, 26, 27, 27, 27, 28, 28, 28, 29, 29, 29, 30, 30, 30], purpose: 'Top gear, reachable only on a circuit with a straight long enough to climb the ladder' },
];

export const TOP_GEAR: RaceCarsGear = 6;

export function gearDef(gear: RaceCarsGear): RaceCarsGearDef {
    return GEARS[gear] ?? GEARS[0];
}

/**
 * A gear as a driver says it — "3rd", and "neutral" for the gear 0 of the grid
 * and a spun car (§8.1). Beside `GEARS` rather than in the command that logs
 * it, because the gear picker and the roll card of PR 4 name gears too and a
 * second spelling of "5th" is a second spelling to keep in step.
 */
const GEAR_NAMES = ['neutral', '1st', '2nd', '3rd', '4th', '5th', '6th'];

export function gearName(gear: RaceCarsGear): string {
    return GEAR_NAMES[gear] ?? GEAR_NAMES[0];
}

// ─── Shifting (§8.2) ────────────────────────────────────────────────────────

/**
 * Gearbox charged for dropping N gears, indexed by N. Climbing is slow and
 * free, falling is fast and expensive — which is what gives the ladder its
 * teeth (§8.2). Dropping five or more is off the end of the table and illegal.
 */
export const SHIFT_DOWN_GEARBOX_COST = [0, 0, 1, 3, 6];

/**
 * What moving from `from` to `to` costs in gearbox, or `null` if no gearbox
 * pool can buy it. Shifting *up* is capped by the caller, not here: §8.2's
 * one-gear limit and the standing-start exception both live in `legalGears`,
 * because both need to know what gear the car is actually in.
 */
export function shiftDownCost(from: RaceCarsGear, to: RaceCarsGear): number | null {
    const dropped = from - to;
    if (dropped <= 0) return 0;
    const cost = SHIFT_DOWN_GEARBOX_COST[dropped];
    return cost === undefined ? null : cost;
}

// ─── Wear (§11) ─────────────────────────────────────────────────────────────

export type RaceCarsSpecId = 'balanced' | 'sticky' | 'stopper' | 'closeRatio';

export interface RaceCarsSpecDef {
    id: RaceCarsSpecId;
    name: string;
    tyres: number;
    brakes: number;
    gearbox: number;
    /** §11's "reads as" — the one line the setup screen shows under the name. */
    readsAs: string;
}

/** Twelve tokens, split four ways. The host picks one and the whole field runs it. */
export const WEAR_TOKENS_PER_CAR = 12;

export const SPECS: RaceCarsSpecDef[] = [
    { id: 'balanced', name: 'Balanced', tyres: 5, brakes: 4, gearbox: 3, readsAs: 'Everything costs something, nothing is free' },
    { id: 'sticky', name: 'Sticky', tyres: 7, brakes: 3, gearbox: 2, readsAs: 'Corner-eater: overshoot and survive it' },
    { id: 'stopper', name: 'Stopper', tyres: 4, brakes: 6, gearbox: 2, readsAs: 'Precision: brake down and land the corner exactly' },
    { id: 'closeRatio', name: 'Close-ratio', tyres: 4, brakes: 3, gearbox: 5, readsAs: 'Drop two gears at a time; slow in, fast out' },
];

export const DEFAULT_SPEC: RaceCarsSpecId = 'balanced';

/**
 * The named spec, falling back to Balanced. The fallback is load-bearing:
 * POST /api/lobby spreads its per-game settings into the invitation against a
 * `spec: String` schema, so an unvalidated value can reach here — and a spec
 * of `undefined` deals wear pools of `undefined`, making every overshoot
 * unpayable and spinning the entire field (§23.4).
 */
export function specDef(specId: string): RaceCarsSpecDef {
    return SPECS.find(spec => spec.id === specId) ?? SPECS[0];
}

// ─── Race distance (§15) ────────────────────────────────────────────────────

export type RaceCarsDistanceId = 'sprint' | 'grandPrix';

export interface RaceCarsDistanceDef {
    id: RaceCarsDistanceId;
    name: string;
    laps: 1 | 2;
    /** What the setup screen says the choice costs, in the player's language. */
    readsAs: string;
}

export const RACE_DISTANCES: RaceCarsDistanceDef[] = [
    { id: 'sprint', name: 'Sprint', laps: 1, readsAs: 'One lap — four corner-stops on twelve wear tokens' },
    { id: 'grandPrix', name: 'Grand Prix', laps: 2, readsAs: 'Two laps — eight corner-stops on the same twelve' },
];

export const DEFAULT_DISTANCE: RaceCarsDistanceId = 'sprint';

/** The named distance, falling back to Sprint — see `specDef` for why. */
export function distanceDef(distanceId: string): RaceCarsDistanceDef {
    return RACE_DISTANCES.find(distance => distance.id === distanceId) ?? RACE_DISTANCES[0];
}

// ─── The race the host chose (§6) ───────────────────────────────────────────

/** The four settings of §6 — everything a host picks, and the whole of it. */
export interface IRaceCarsSettings {
    trackId: string;
    distance: RaceCarsDistanceId;
    spec: RaceCarsSpecId;
    oilSpills: boolean;
}

/**
 * §6's four settings read off whatever was sent: each snapped to a value the
 * rules can actually run, plus the reason to refuse the request outright if
 * one of them was not a value at all.
 *
 * Both halves exist because there are **two** creation paths (§23.4).
 * `POST /api/newgame/racecars` checks its body and answers 400 with
 * `rejection`; `POST /api/lobby` destructures `...gameSettings` off its body
 * and spreads them into the invitation, where Mongoose's strict mode limits
 * which *keys* survive and says nothing about values. So a hand-written lobby
 * body carrying `laps: 99` and `spec: "unobtanium"` reaches `CreateGame`
 * unchecked, and `settings` is what it gets instead: the race the other five
 * drivers accepted, rather than wear pools of `undefined` that make every
 * overshoot unpayable and spin the entire field.
 *
 * One helper rather than a copy each, so the lobby path can never be the one
 * that was forgotten.
 */
export function readRaceSettings(raw: {
    trackId?: unknown;
    distance?: unknown;
    spec?: unknown;
    oilSpills?: unknown;
}): { settings: IRaceCarsSettings; rejection: string | null } {
    const track = typeof raw.trackId === 'string' ? TRACKS[raw.trackId] : undefined;
    const distance = RACE_DISTANCES.find(option => option.id === raw.distance);
    const spec = SPECS.find(option => option.id === raw.spec);
    // Not `!!raw.oilSpills`: `"false"` is truthy, and a setting the whole
    // field races under should be a boolean or a 400, never a coercion.
    const oilSpills = typeof raw.oilSpills === 'boolean' ? raw.oilSpills : null;

    return {
        settings: {
            trackId: track?.id ?? DEFAULT_TRACK_ID,
            distance: distance?.id ?? DEFAULT_DISTANCE,
            spec: spec?.id ?? DEFAULT_SPEC,
            oilSpills: oilSpills ?? false,
        },
        rejection: !track ? "Unknown track"
            : !distance ? "Unknown race distance"
            : !spec ? "Unknown car spec"
            : oilSpills === null ? "Oil spills must be on or off"
            : null,
    };
}

// ─── Oil, slipstream and the small numbers the rules quote (§9, §12, §14) ───

/** Slicks alive at once; a thirteenth sweeps the oldest (§14). */
export const SLICK_CAP = 12;
/** A slick laid in round r is swept at the end of round r + 1 (§14). */
export const SLICK_LIFETIME_ROUNDS = 1;
/** Spending this many brake points in one turn lays a slick behind you (§14). */
export const BRAKE_SLICK_THRESHOLD = 3;
/** Entering a slick's space rolls a d6; a 1 loses control (§14). */
export const OIL_DIE_SIDES = 6;
export const OIL_SPIN_FACE = 1;
/**
 * A tow is a second move of exactly three steps (§12) — three rows of road on a
 * circuit whose lanes run in step, and the inside line's three spaces where
 * they do not (§5.1).
 */
export const SLIPSTREAM_STEPS = 3;
/** A tow is offered to a car this many rows behind another, in any lane (§12). */
export const SLIPSTREAM_GAP_ROWS = [1, 2];
/** Brakes shorten a roll down to this and no further — a car always moves (§11). */
export const MIN_MOVE_STEPS = 1;

// ─── Board geometry (§5.1, §10) ─────────────────────────────────────────────

/** The key a (row, lane) pair is looked up by in an occupancy or slick set. */
export function spaceKey(row: number, lane: number): string {
    return `${row}:${lane}`;
}

/**
 * The spaces of a circuit, indexed the two ways every rule asks for them.
 *
 * A track is a graph rather than an arithmetic rule (§5.1), so "what is on this
 * space" would otherwise be a `.find()` over a couple of hundred entries — per
 * space of a walk, per car, per render, which is §23.4's own objection to
 * looking geometry up that way. Built once per track *object* and keyed by it,
 * so a fixture circuit a test registers is collected with the test rather than
 * pinned here for the life of the process.
 */
interface TrackIndex {
    byKey: Map<string, RaceCarsTrackSpace>;
    byRow: Map<number, RaceCarsTrackSpace[]>;
}

const TRACK_INDEX = new WeakMap<RaceCarsTrack, TrackIndex>();

function indexOf(track: RaceCarsTrack): TrackIndex {
    const cached = TRACK_INDEX.get(track);
    if (cached) return cached;

    const byKey = new Map<string, RaceCarsTrackSpace>();
    const byRow = new Map<number, RaceCarsTrackSpace[]>();
    for (const space of track.spaces) {
        byKey.set(spaceKey(space.row, space.lane), space);
        const row = byRow.get(space.row);
        if (row) row.push(space);
        else byRow.set(space.row, [space]);
    }
    for (const row of byRow.values()) row.sort((a, b) => a.lane - b.lane);

    const built: TrackIndex = { byKey, byRow };
    TRACK_INDEX.set(track, built);
    return built;
}

/** The space at this (row, lane), or null where the road has none there. */
export function spaceAt(track: RaceCarsTrack, row: number, lane: number): RaceCarsTrackSpace | null {
    return indexOf(track).byKey.get(spaceKey(row, lane)) ?? null;
}

/**
 * Every space on a row, in lane order — two or three of them on an ordinary
 * row, and fewer than the road is wide where a lane skips it (§5.1).
 */
export function spacesInRow(track: RaceCarsTrack, row: number): RaceCarsTrackSpace[] {
    return indexOf(track).byRow.get(row) ?? [];
}

/** Spaces in one lap. */
export function spaceCount(track: RaceCarsTrack): number {
    return track.spaces.length;
}

/** Rows travelled going forward from `from` to `to`, the way a car drives. */
export function rowsBetween(track: RaceCarsTrack, from: number, to: number): number {
    return ((to - from) % track.rows + track.rows) % track.rows;
}

/**
 * §5.1's step rule, and the only movement primitive in the game: the spaces a
 * car standing here may drive to, as the track itself declares them.
 *
 * A rule rather than a lookup until the circuits grew corners whose lanes run
 * out of step: "the next row, this lane or either beside it" is what
 * `deriveTrack` writes onto an ordinary stretch of road, and the track is free
 * to say something narrower anywhere it needs to.
 *
 * The list is the track's own — read it, never sort or push to it. It is never
 * empty for a space that exists, which is what lets §9 treat an empty *walk*
 * as "boxed in by traffic" rather than "off the end of the map"; a space that
 * is not on the circuit at all answers with an empty list rather than throwing,
 * because the one caller that can reach for one is a forged move being refused.
 */
export function stepsFrom(track: RaceCarsTrack, row: number, lane: number): readonly RaceCarsSpace[] {
    return spaceAt(track, row, lane)?.exits ?? [];
}

/**
 * A distance this board can actually be asked to walk: a whole number of steps,
 * never negative, never longer than a lap.
 *
 * Both halves earn their place. A **fractional** distance would floor itself
 * against the loop bound and then read as short of what was asked — reporting a
 * move as blocked by traffic that nothing blocked, and charging a tyre for it.
 * An **oversized** one is work and memory proportional to a number chosen
 * off-board rather than to the circuit, and no gear can roll past a lap anyway.
 */
export function driveableSteps(track: RaceCarsTrack, steps: number): number {
    if (!Number.isFinite(steps) || steps < 1) return 0;
    return Math.min(Math.floor(steps), track.rows);
}

/** Rows covered by the end of each step of a path; index 0 is none of it yet. */
function rowsByStep(track: RaceCarsTrack, path: RaceCarsSpace[]): number[] {
    const covered = [0];
    for (let step = 1; step < path.length; step++) {
        covered.push(covered[step - 1] + rowsBetween(track, path[step - 1].row, path[step].row));
    }
    return covered;
}

/** Rows covered by a path, which is what §10 charges in — never its step count. */
export function rowsAlong(track: RaceCarsTrack, path: RaceCarsSpace[]): number {
    const covered = rowsByStep(track, path);
    return covered[covered.length - 1];
}

/**
 * Rows a move of exactly `steps` steps from this space can cover, at its
 * shortest and its longest, ignoring traffic. (Not `RaceCarsModels`'
 * `rowsCovered`, which is the whole race's worth on the result page.)
 *
 * The two are the same number on a circuit whose lanes all run in step, and
 * that is the only reason the rest of the game could ever say "a roll of 8" and
 * "eight rows" in the same breath. Where a corner's inside line covers two rows
 * a step and its outside covers one, a gear's band is a range of rows rather
 * than a number of them — so the reach band quotes it as one (§23.5), and the
 * conservative line plans against the far end of it (§23.7 PR 6).
 */
export function rowSpan(
    track: RaceCarsTrack,
    from: RaceCarsSpace,
    steps: number,
): { min: number; max: number } {
    interface Reach { space: RaceCarsSpace; min: number; max: number }
    let frontier = new Map<string, Reach>([
        [spaceKey(from.row, from.lane), { space: from, min: 0, max: 0 }],
    ]);

    const walked = driveableSteps(track, steps);
    for (let step = 1; step <= walked; step++) {
        const next = new Map<string, Reach>();
        for (const node of frontier.values()) {
            for (const to of stepsFrom(track, node.space.row, node.space.lane)) {
                const advance = rowsBetween(track, node.space.row, to.row);
                const seen = next.get(spaceKey(to.row, to.lane));
                if (!seen) next.set(spaceKey(to.row, to.lane), { space: to, min: node.min + advance, max: node.max + advance });
                else {
                    seen.min = Math.min(seen.min, node.min + advance);
                    seen.max = Math.max(seen.max, node.max + advance);
                }
            }
        }
        // Only reachable off the circuit's edge, which no track has; leaving the
        // frontier where it is quotes the rows reached so far rather than none.
        if (next.size === 0) break;
        frontier = next;
    }

    let min = Infinity;
    let max = 0;
    for (const node of frontier.values()) {
        min = Math.min(min, node.min);
        max = Math.max(max, node.max);
    }
    return { min: Number.isFinite(min) ? min : 0, max };
}

/**
 * Whether a step from `fromRow` to `toRow` carries the car over the start line,
 * completing a lap (§15).
 *
 * Not `toRow === 0`: a lane with no space on row 0 steps straight over the line
 * from row 77 to row 1, and a lap that only counts when a car lands exactly on
 * it is a lap that circuit can never complete.
 */
export function crossesStartLine(track: RaceCarsTrack, fromRow: number, toRow: number): boolean {
    // A car standing on row 0 is on the line, not behind it, and one step can
    // never carry it the whole lap round to it again.
    if (fromRow === 0) return false;
    return rowsBetween(track, fromRow, 0) <= rowsBetween(track, fromRow, toRow);
}

/**
 * The corner this space is in, or null on a straight — read off the space's own
 * `cornerId`, so it is per space, not per row (§10): the inside line of a corner
 * is in it for fewer rows than the outside, and two cars level on the same row
 * can be one in the corner and one already out of it.
 */
export function cornerAt(track: RaceCarsTrack, row: number, lane: number): RaceCarsCorner | null {
    const cornerId = spaceAt(track, row, lane)?.cornerId;
    return cornerId ? track.corners.find(corner => corner.id === cornerId) ?? null : null;
}

/**
 * The corner whose remaining stops are written off if this car leaves it — §10's
 * waiver, which applies to a car that cannot stay inside: every step the road
 * offers it leaves the corner, and §9 forbids standing still, so it has taken
 * the corner as slowly as the road allows. The road decides this and never the
 * gear, so a car that arrived at speed is charged in the ordinary way.
 *
 * Read off whether each exit is still in the same corner, not off the row band:
 * an inside line whose last corner space feeds only spaces outside the corner
 * has nowhere to go but out, and is owed the waiver even though the outside line
 * carries the band on for several more rows.
 */
export function waivedCornerIdAt(track: RaceCarsTrack, row: number, lane: number): string | null {
    const corner = cornerAt(track, row, lane);
    if (!corner) return null;
    const exits = stepsFrom(track, row, lane);
    const stuckInside = exits.length > 0
        && exits.every(exit => cornerAt(track, exit.row, exit.lane)?.id !== corner.id);
    return stuckInside ? corner.id : null;
}

/** One corner a move leaves behind, and what §10 charges for leaving it. */
export interface RaceCarsCornerPass {
    corner: RaceCarsCorner;
    /** Rows travelled past the corner's last row by the end of the move. */
    rowsPast: number;
}

/**
 * Every corner a move from `fromRow` covering `rows` rows leaves behind, in the
 * order it leaves them, with the rows it ends up past each.
 *
 * Counted forward along the road rather than by subtracting row numbers, which
 * is what keeps a move that wraps the finish line honest (§10) — a car on row
 * 60 that covers 20 rows ends on row 2 of the next lap having crossed The Kink,
 * and `2 − 65` is not the answer. A corner already behind the car sits almost a
 * whole lap ahead by that measure, so it is not crossed twice.
 */
export function cornersPassed(
    track: RaceCarsTrack,
    fromRow: number,
    rows: number,
): RaceCarsCornerPass[] {
    return track.corners
        // Where the corner's last row sits ahead of the car: 0 for one standing
        // on it, and the corner is behind once the move covers more than that.
        .map(corner => ({ corner, at: rowsBetween(track, fromRow, corner.to) }))
        .filter(ahead => ahead.at < rows)
        .sort((a, b) => a.at - b.at)
        .map(ahead => ({ corner: ahead.corner, rowsPast: rows - ahead.at }));
}

/**
 * The same corners, placed on a path: which step of it each one fell behind at.
 *
 * §10 settles an overshoot at exactly that step rather than at the end of the
 * move, because a move that spins the car at the first corner "stops there and
 * never reaches the second" — so the second corner is never reached, and
 * neither are the oil checks past it, which is what keeps the recorded roll log
 * the same length on replay.
 */
export function cornerCrossings(
    track: RaceCarsTrack,
    path: RaceCarsSpace[],
): (RaceCarsCornerPass & { step: number })[] {
    if (path.length < 2) return [];

    // A step is not a row once a lane can skip one (§5.1), so where a corner
    // falls along the path has to be measured rather than counted off.
    const covered = rowsByStep(track, path);
    const rows = covered[covered.length - 1];

    return cornersPassed(track, path[0].row, rows).map(pass => ({
        ...pass,
        // The first step to carry the car past the corner's own last row.
        step: covered.findIndex(rowsByStep => rowsByStep > rows - pass.rowsPast),
    }));
}
