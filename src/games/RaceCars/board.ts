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
import { MONACO } from "./tracks/monaco";

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
 * §5.1's own rule — the next tile along, this lane or either lane beside it —
 * is what `deriveTrack` writes for an ordinary stretch of road, and it is
 * written out per space rather than recomputed on demand because a real circuit
 * does not obey it everywhere. Two things break it, and both live on a corner:
 *
 * - **A tile that names the tiles it lets you cross to.** Painted corners are
 *   not free to change lane across; the board says which space ahead each one
 *   feeds, and often that is only the one in front.
 * - **Lanes that do not run in step.** The inside of a corner is the short way
 *   round, so it takes fewer spaces to cover the same stretch than the outside
 *   does — four against eight — and "the same lane, one tile along" is then not
 *   a step across the road at all. Both lanes are level again at the sync line
 *   past the corner, and the rows they were given say so (`tracks/sections.ts`)
 *   even though the count of spaces behind them differs.
 *
 * Read the list, never write to it: it belongs to the track, and every car on
 * the circuit is handed the same array.
 */
export interface RaceCarsTrackSpace extends RaceCarsSpace {
    /**
     * Every space one step from here, in the order the road declares them —
     * an order nothing reads anything into, since a walk keys its frontier by
     * space. Never empty.
     */
    exits: readonly RaceCarsSpace[];
    /**
     * The corner this space belongs to, if any (§10): the id of the section it
     * was drawn into. A corner is a stretch of road between two sync lines, so
     * both of its lines are in it for the same stretch even where the inside
     * covers that stretch in half the tiles (§5.1) — and what §10 charges is
     * the spaces past the corner rather than the rows. A straight's spaces
     * carry no id.
     */
    cornerId?: string;
}

/**
 * A corner is a **section of road** with a stop count, not a turn of the wheel
 * (§5.1): the tiles an author drew into it, which is what `cornerId` carries on
 * each space and what §10 reads to decide when a car has left one.
 *
 * `from`/`to` are the inclusive row band those spaces span — a label for the
 * screen and the place a spun car is put back, never the measure of an
 * overshoot. §10 charges the **spaces** a move ends up past the corner
 * (`cornerExits`), because a row is a rank rather than a distance (§5.1).
 */
export interface RaceCarsCorner {
    id: string;
    name: string;
    from: number;
    to: number;
    stops: 1 | 2 | 3;
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
     * Ranks round one lap. Row numbers wrap: the row after `rows - 1` is row 0,
     * and crossing that boundary completes a lap.
     *
     * A row is a **place on the road, not a step along it, and not a distance**.
     * It says how far round the lap a space is and nothing else, which is what
     * orders the field and places the finish line. Rows are derived from the
     * step graph itself (`tracks/sections.ts`), so a lane taking the short way
     * round a corner skips the rows it saved rather than falling out of step
     * with the lane beside it — and nothing a rule charges is counted in them.
     */
    rows: number;
    /** Every space on the circuit, and the steps out of each (§5.1). */
    spaces: RaceCarsTrackSpace[];
    corners: RaceCarsCorner[];
    /** The starting grid, P1 first (§5.2). Never shorter than MAX_PLAYERS. */
    grid: RaceCarsSpace[];
    /**
     * Where the finish line is painted across the road, if the circuit says.
     *
     * A line is a set of spaces rather than a row because a real one is painted
     * wherever the art puts it: a lane that takes the short way round carries it
     * on a different row from the lane beside it, and a line drawn on the skew
     * sits on several. What §15 reads off it is one row — see `lapBoundary` for
     * which, and why a set of spaces still earns its place. Left out, the lap is
     * counted at row 0, which is where every circuit drawn before the line could
     * be painted has it.
     */
    finish?: RaceCarsSpace[];
    /**
     * Whether the grid sits **behind** the finish line, so the first crossing of
     * it is the start of lap 1 rather than the end of it.
     *
     * A circuit whose grid is drawn back down the straight from the line — the
     * line then doubling as the start — would otherwise credit every car a lap
     * within a few rows of the flag dropping. Read once, at `startingLaps`,
     * which seats such a field a lap short of the line rather than on it.
     */
    gridBehindFinishLine?: boolean;
    /**
     * Spaces the circuit paints oil on, if any.
     *
     * **Authoring data only**: §14's slicks are still laid by spins and
     * heavy braking alone, and nothing in a race reads this list. It is here so
     * that a circuit drawn with a permanently greasy patch can say so once, in
     * the file it is drawn into, rather than that being redrawn later.
     */
    oil?: RaceCarsSpace[];
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
export const TRACK_LIST: RaceCarsTrack[] = [MONACO, ASHCOMBE, ANGLET];

export const TRACKS: Record<string, RaceCarsTrack> = Object.fromEntries(
    TRACK_LIST.map(track => [track.id, track]),
);

export const DEFAULT_TRACK_ID = MONACO.id;

/** The named circuit, falling back to the one that ships rather than throwing. */
export function trackById(trackId: string): RaceCarsTrack {
    return TRACKS[trackId] ?? MONACO;
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
/** A tow is a second move of exactly three steps (§12). */
export const SLIPSTREAM_STEPS = 3;
/**
 * A tow is offered to a car this many **steps** behind another, in any lane
 * (§12) — steps along the road the car is actually on, not a difference of row
 * numbers: a row is a rank rather than a distance (§5.1), so two cars a row
 * apart on a staggered stretch are beside each other rather than in each
 * other's wake.
 */
export const SLIPSTREAM_GAP_STEPS = [1, 2];
/** Brakes shorten a roll down to this and no further — a car always moves (§11). */
export const MIN_MOVE_STEPS = 1;

// ─── Board geometry (§5.1, §10) ─────────────────────────────────────────────

/** The key a (row, lane) pair is looked up by in an occupancy or slick set. */
export function spaceKey(row: number, lane: number): string {
    return `${row}:${lane}`;
}

/**
 * The spaces of a circuit, indexed the three ways every rule asks for them.
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
    byCorner: Map<string, RaceCarsTrackSpace[]>;
}

const TRACK_INDEX = new WeakMap<RaceCarsTrack, TrackIndex>();

function indexOf(track: RaceCarsTrack): TrackIndex {
    const cached = TRACK_INDEX.get(track);
    if (cached) return cached;

    const byKey = new Map<string, RaceCarsTrackSpace>();
    const byRow = new Map<number, RaceCarsTrackSpace[]>();
    const byCorner = new Map<string, RaceCarsTrackSpace[]>();
    for (const space of track.spaces) {
        byKey.set(spaceKey(space.row, space.lane), space);
        const row = byRow.get(space.row);
        if (row) row.push(space);
        else byRow.set(space.row, [space]);
        if (space.cornerId) {
            const corner = byCorner.get(space.cornerId);
            if (corner) corner.push(space);
            else byCorner.set(space.cornerId, [space]);
        }
    }
    for (const row of byRow.values()) row.sort((a, b) => a.lane - b.lane);
    // Last row first, then lane order: the order §13 searches a corner for a
    // free space to put a spun car back on.
    for (const corner of byCorner.values()) corner.sort((a, b) => b.row - a.row || a.lane - b.lane);

    const built: TrackIndex = { byKey, byRow, byCorner };
    TRACK_INDEX.set(track, built);
    return built;
}

/** The space at this (row, lane), or null where the road has none there. */
export function spaceAt(track: RaceCarsTrack, row: number, lane: number): RaceCarsTrackSpace | null {
    return indexOf(track).byKey.get(spaceKey(row, lane)) ?? null;
}

/**
 * Every space on a row, in lane order — the width of the road on an ordinary
 * one, and fewer where a lane skips it (§5.1).
 */
export function spacesInRow(track: RaceCarsTrack, row: number): RaceCarsTrackSpace[] {
    return indexOf(track).byRow.get(row) ?? [];
}

/** Every space of one corner, its last row first — the order §13 searches. */
export function spacesInCorner(track: RaceCarsTrack, cornerId: string): RaceCarsTrackSpace[] {
    return indexOf(track).byCorner.get(cornerId) ?? [];
}

/** Spaces in one lap. */
export function spaceCount(track: RaceCarsTrack): number {
    return track.spaces.length;
}

/**
 * Rows travelled going forward from `from` to `to`, the way a car drives.
 *
 * An **ordering** measure and never a charge: rows rank the field, band the
 * corners and place the finish line, while everything a rule costs — an
 * overshoot, a tow, a roll — is counted in spaces (§5.1, §10).
 */
export function rowsBetween(track: RaceCarsTrack, from: number, to: number): number {
    return ((to - from) % track.rows + track.rows) % track.rows;
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

/**
 * §5.1's step rule, and the only movement primitive in the game: the spaces a
 * car standing here may drive to, as the track itself declares them.
 *
 * A rule rather than a lookup until the circuits grew corners whose lanes run
 * out of step: "the next tile along, this lane or either beside it" is what the
 * section table writes onto an ordinary stretch of road, and a band traced off
 * real art says exactly where each of its tiles leads instead.
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
 * The one row §15 counts a lap at: the **earliest** row the circuit paints its
 * finish line on, or row 0 where it paints none.
 *
 * `track.finish` is a set of spaces because a painted line really does sit on
 * several rows — a lane taking the short way round a corner carries it on its
 * own, and a line drawn on the skew crosses the road diagonally. The rule reads
 * one row off that set all the same, and deliberately the lowest, for two
 * reasons:
 *
 * - **A lap can only be counted once.** Were each lane to complete its lap at
 *   its own painted row, a car crossing in the lane whose row comes first and
 *   then changing into one whose row comes later would cross a second time and
 *   bank a second lap, a few spaces after the first.
 * - **Every car completes its lap at the same place.** A line that counts per
 *   lane hands the lanes it reaches first a head start worth the skew of the
 *   line, every lap, for nothing either driver did.
 *
 * Row 0 is the fallback rather than a special case: it is where the lap has
 * always been counted, and where a circuit that paints no line still has its
 * first section begin.
 */
export function lapBoundary(track: RaceCarsTrack): number {
    if (!track.finish?.length) return 0;
    return Math.min(...track.finish.map(space => space.row));
}

/**
 * Whether a step from `fromRow` to `toRow` carries the car over the finish line,
 * completing a lap (§15).
 *
 * Not "lands on the boundary row": a lane with no space on that row steps
 * straight over the line from row 77 to row 1, and a lap that only counts when
 * a car lands exactly on it is a lap that circuit can never complete. So the
 * question is asked as "walking forward from where it stood, does it reach the
 * line at or before it reaches where it stopped".
 *
 * Whichever lane takes the step: the boundary is one row for the whole circuit
 * (`lapBoundary`), so two cars level across the road complete their laps on the
 * same step rather than a lane at a time.
 */
export function crossesFinishLine(track: RaceCarsTrack, fromRow: number, toRow: number): boolean {
    const boundary = lapBoundary(track);
    // A car standing on the line is over it already, not behind it, and one
    // step can never carry it the whole lap round to it again.
    if (fromRow === boundary) return false;
    return rowsBetween(track, fromRow, boundary) <= rowsBetween(track, fromRow, toRow);
}

/**
 * The laps a car is credited with as it is seated on the grid (§5.2, §15).
 *
 * Zero, except on a circuit whose grid is drawn **behind** its finish line,
 * where the flag drops a few spaces short of the line and the first crossing is
 * the start of lap 1 rather than the end of it. Such a field starts one lap
 * short — so the first crossing brings it to nought laps completed, the lap it
 * then drives is the first that counts, and the race still ends on the crossing
 * that banks `laps`.
 *
 * A lap short rather than a flag on each car, because every number §15 works in
 * is already this one: track order sorts on it, `rowsCovered` measures progress
 * with it, and a car yet to reach the line for the first time genuinely is a
 * lap's worth of progress behind one sitting on it.
 *
 * Every reader of the negative clamps it, and none of them loses anything by it.
 * The board's lap readout would otherwise say "lap 0 of 1", which is not a lap a
 * driver is ever on — before the first crossing they are working on the first.
 * Rows covered would otherwise report "covered −75 rows" on the result page, and
 * draw those rounds off the bottom of a chart whose axis floors at nought
 * (`LineChart`) rather than below the line. What the negative is *for* is the
 * ordering, and that is pure subtraction — `recomputeRoundOrder`, the
 * classification and `rowsBehindLeader` all read it unclamped and all come out
 * right, because a car yet to reach the line genuinely is a lap down.
 */
export function startingLaps(track: RaceCarsTrack): number {
    // Both halves, not just the toggle. "Behind the finish line" is only a
    // statement about a circuit that has one: with no line painted the boundary
    // falls back to row 0, which is where the first section begins rather than
    // anywhere an author drew, and seating a field a lap short of *that* makes
    // every race on the circuit one whole lap longer than the distance the
    // players picked. The editor warns on the combination; this refuses to act
    // on it.
    return track.gridBehindFinishLine && track.finish?.length ? -1 : 0;
}

/**
 * The corner this space is in, or null on a straight.
 *
 * Read off the space's own `cornerId` — the section it was drawn in (§10) — so
 * it is per space rather than per row: the inside line of a corner is the short
 * way round, and two cars level on the same row can be one in the corner and
 * one already out of it.
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
 * Read off whether each exit is still in the same corner: an inside line whose
 * last corner space feeds only spaces outside the corner has nowhere to go but
 * out, and is owed the waiver even though the outside line carries the corner
 * on for several more tiles.
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
export interface RaceCarsCornerExit {
    corner: RaceCarsCorner;
    /** The step that left it — the first space of the path past the corner. */
    step: number;
    /** Spaces the move ends up past the corner, which is what §10 charges. */
    spacesPast: number;
}

/**
 * Every corner a path leaves behind, in the order it leaves them.
 *
 * Read off the spaces themselves — the step where the car was in the corner and
 * the next where it is not — rather than off row numbers. A corner is the tiles
 * an author drew into it (§10), so the inside line leaves at its own last tile
 * while the outside carries on, and neither one has to be worked out from a
 * band. A move that wraps the finish line needs no special case either, because
 * nothing here subtracts one row number from another.
 *
 * §10 settles an overshoot at exactly the step it happens rather than at the end
 * of the move, because a move that spins the car at the first corner "stops
 * there and never reaches the second" — so the second corner is never reached,
 * and neither are the oil checks past it, which is what keeps the recorded roll
 * log the same length on replay.
 */
export function cornerExits(track: RaceCarsTrack, path: RaceCarsSpace[]): RaceCarsCornerExit[] {
    if (path.length < 2) return [];
    const distance = path.length - 1;
    const exits: RaceCarsCornerExit[] = [];

    let from = cornerAt(track, path[0].row, path[0].lane);
    for (let step = 1; step <= distance; step++) {
        const to = cornerAt(track, path[step].row, path[step].lane);
        if (from && from.id !== to?.id) {
            exits.push({ corner: from, step, spacesPast: distance - step + 1 });
        }
        from = to;
    }
    return exits;
}

/** How a corner sits relative to a car, measured in the spaces of §9's walk. */
export interface RaceCarsCornerReach {
    corner: RaceCarsCorner;
    /** Fewest steps that put the car on one of its spaces; 0 standing in it. */
    enter: number;
    /** Most steps, within the limit asked for, that still leave it on one. */
    last: number;
}

/**
 * Every space within `limit` steps of one, and how many steps away each is —
 * the plain breadth-first walk of the road with no traffic on it, which is what
 * both a reach band and §12's "in the wake of" are asked in terms of.
 *
 * First sighting wins, so a space's step is the fewest that reach it, and the
 * map is in step order. The car's own space is in it at nought.
 */
export function stepsWithin(
    track: RaceCarsTrack,
    from: RaceCarsSpace,
    limit: number,
): Map<string, { space: RaceCarsSpace; step: number }> {
    const seen = new Map<string, { space: RaceCarsSpace; step: number }>([
        [spaceKey(from.row, from.lane), { space: from, step: 0 }],
    ]);

    let frontier: RaceCarsSpace[] = [from];
    const walked = driveableSteps(track, limit);
    for (let step = 1; step <= walked; step++) {
        const next = new Map<string, RaceCarsSpace>();
        for (const space of frontier) {
            for (const to of stepsFrom(track, space.row, space.lane)) next.set(spaceKey(to.row, to.lane), to);
        }
        // Only reachable off the circuit's edge, which no track has.
        if (next.size === 0) break;
        frontier = [...next.values()];
        for (const [key, space] of next) if (!seen.has(key)) seen.set(key, { space, step });
    }
    return seen;
}

/**
 * Where each corner within `limit` steps sits, in steps — the reading the reach
 * band quotes and the tow is priced against (§23.5).
 *
 * Steps rather than rows, because a roll is spent in steps and a corner is a
 * set of tiles: "the corner is six out and you are still inside it at nine" is
 * a sentence about the same currency the driver is about to spend. Traffic is
 * ignored, exactly as the reach band ignores it — it can only make a move
 * shorter, so a roll this says can stop in a corner can always stop in it.
 *
 * One breadth-first walk for every corner rather than one apiece, because the
 * board screen asks this on every render.
 */
export function cornerReaches(
    track: RaceCarsTrack,
    from: RaceCarsSpace,
    limit: number,
): Map<string, RaceCarsCornerReach> {
    const reaches = new Map<string, RaceCarsCornerReach>();
    // In step order, which is what the contiguity below reads.
    for (const { space, step } of stepsWithin(track, from, limit).values()) {
        const corner = cornerAt(track, space.row, space.lane);
        if (!corner) continue;
        const seen = reaches.get(corner.id);
        // First sighting is the fewest steps to it.
        if (!seen) {
            reaches.set(corner.id, { corner, enter: step, last: step });
            continue;
        }
        // Extended only while the walk is *still* inside it. A corner's spaces
        // are reachable on a run of consecutive steps and then not again until
        // the next lap round, and a walk long enough to come back to one would
        // otherwise report a car as able to stay in the corner it is standing
        // in for another seventy-eight spaces.
        if (step === seen.last + 1) seen.last = step;
    }
    return reaches;
}

/**
 * The nearest corner ahead of a car — the one the reach band is measured
 * against. A fold over a walk already taken rather than a walk of its own, so
 * the screen reads one walk per render however many gears it prints.
 */
export function nextCornerReach(reaches: Map<string, RaceCarsCornerReach>): RaceCarsCornerReach | null {
    return [...reaches.values()]
        .filter(reach => reach.enter > 0)
        .sort((a, b) => a.enter - b.enter)[0] ?? null;
}
