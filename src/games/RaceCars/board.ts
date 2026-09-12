// Static Race Cars data: the shape of a circuit, the gear ladder, the wear
// specs, the race distances, and the one movement primitive every other rule
// is built on — docs/games/race-cars.md §5.1, §8.1, §8.2, §11, §15.
//
// No server-only imports. rules.ts reads this module, the command classes read
// rules.ts, and the board screen reads both for the reach band (docs/new-game.md,
// "Isomorphic rules modules"), so nothing here may reach for Mongoose, Clerk or
// `node:`.
import { ASHCOMBE } from "./tracks/ashcombe";

// ─── The circuit (§5.1) ─────────────────────────────────────────────────────

/** A space is a (row, lane) pair; lanes are numbered from 1 (§5.1). */
export interface RaceCarsSpace {
    row: number;
    lane: number;
}

/**
 * A corner is a contiguous band of rows with a stop count, not a turn of the
 * wheel (§5.1). `from`/`to` are inclusive row numbers.
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
    /** Rows in one lap. Row numbers wrap: the row after `rows - 1` is row 0. */
    rows: number;
    /** Lanes in each row, indexed by row number — 2 or 3 (§5.1). */
    laneWidth: number[];
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

export const TRACKS: Record<string, RaceCarsTrack> = {
    [ASHCOMBE.id]: ASHCOMBE,
};

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

/** The three settings of §6 — everything a host picks, and the whole of it. */
export interface IRaceCarsSettings {
    distance: RaceCarsDistanceId;
    spec: RaceCarsSpecId;
    oilSpills: boolean;
}

/**
 * §6's three settings read off whatever was sent: each snapped to a value the
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
    distance?: unknown;
    spec?: unknown;
    oilSpills?: unknown;
}): { settings: IRaceCarsSettings; rejection: string | null } {
    const distance = RACE_DISTANCES.find(option => option.id === raw.distance);
    const spec = SPECS.find(option => option.id === raw.spec);
    // Not `!!raw.oilSpills`: `"false"` is truthy, and a setting the whole
    // field races under should be a boolean or a 400, never a coercion.
    const oilSpills = typeof raw.oilSpills === 'boolean' ? raw.oilSpills : null;

    return {
        settings: {
            distance: distance?.id ?? DEFAULT_DISTANCE,
            spec: spec?.id ?? DEFAULT_SPEC,
            oilSpills: oilSpills ?? false,
        },
        rejection: !distance ? "Unknown race distance"
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
/** A tow is a second move of exactly three rows (§12). */
export const SLIPSTREAM_ROWS = 3;
/** A tow is offered to a car this many rows behind another, in any lane (§12). */
export const SLIPSTREAM_GAP_ROWS = [1, 2];
/** Brakes shorten a roll down to this and no further — a car always moves (§11). */
export const MIN_MOVE_ROWS = 1;

// ─── Board geometry (§5.1, §10) ─────────────────────────────────────────────

/** The key a (row, lane) pair is looked up by in an occupancy or slick set. */
export function spaceKey(row: number, lane: number): string {
    return `${row}:${lane}`;
}

export function laneWidthAt(track: RaceCarsTrack, row: number): number {
    return track.laneWidth[row] ?? 0;
}

/** Spaces in one lap — the sum of every row's lane width. */
export function spaceCount(track: RaceCarsTrack): number {
    return track.laneWidth.reduce((total, lanes) => total + lanes, 0);
}

/** The row after this one. Rows wrap, and crossing that boundary is a lap (§5.1). */
export function nextRow(track: RaceCarsTrack, row: number): number {
    return (row + 1) % track.rows;
}

/** Rows travelled going forward from `from` to `to`, the way a car drives. */
export function rowsBetween(track: RaceCarsTrack, from: number, to: number): number {
    return ((to - from) % track.rows + track.rows) % track.rows;
}

/**
 * The corner this row is inside, or null on a straight. Derived rather than
 * stored beside the car's row (§23.4): a second source of truth is one a move
 * can forget to update, and the bug stays invisible until a car banks a stop
 * in a corner it has already left.
 */
export function cornerAt(track: RaceCarsTrack, row: number): RaceCarsCorner | null {
    return track.corners.find(corner => row >= corner.from && row <= corner.to) ?? null;
}

/**
 * §5.1's step rule, and the only movement primitive in the game: from a space
 * you step to the next row, in the same lane or either lane beside it. A car
 * changes lane *while* moving, never sideways on the spot.
 *
 * Narrowing handles itself. Coming out of a three-lane straight into a two-lane
 * corner, lane 3 has only lane 2 to merge into — and because a lane width is
 * never below 2, the result is never empty, which is what lets §9 treat an
 * empty step list as "boxed in by traffic" rather than "off the end of the map".
 */
export function stepsFrom(track: RaceCarsTrack, row: number, lane: number): RaceCarsSpace[] {
    const to = nextRow(track, row);
    const width = laneWidthAt(track, to);
    const steps: RaceCarsSpace[] = [];
    for (let candidate = lane - 1; candidate <= lane + 1; candidate++) {
        if (candidate >= 1 && candidate <= width) steps.push({ row: to, lane: candidate });
    }
    return steps;
}

/**
 * The corner whose remaining stops are written off if this car leaves it — §10's
 * waiver, which applies to a car standing on a corner's **last row** and nowhere
 * else: §9 forbids standing still, so no legal move can keep it inside, and it
 * has taken the corner as slowly as the road allows. The road decides this and
 * never the gear, so a car that arrived at speed is charged in the ordinary way.
 */
export function waivedCornerIdAt(track: RaceCarsTrack, row: number): string | null {
    const corner = cornerAt(track, row);
    return corner && row === corner.to ? corner.id : null;
}

/**
 * Where along a move of `distance` rows from `startRow` each corner is left
 * behind: the 1-based step whose *previous* row is that corner's last. §10
 * settles an overshoot at exactly these points, and counting them along the
 * path rather than subtracting row numbers is what keeps a move that wraps the
 * finish line honest — a car on row 60 that moves 20 ends on row 2 of the next
 * lap having crossed The Kink, and `2 − 65` is not the answer.
 *
 * Exits come back in path order, and a step leaves at most one corner because
 * corner bands never overlap.
 */
export function cornerExits(
    track: RaceCarsTrack,
    startRow: number,
    distance: number,
): { corner: RaceCarsCorner; step: number }[] {
    const exits: { corner: RaceCarsCorner; step: number }[] = [];
    for (let step = 1; step <= distance; step++) {
        const leaving = (startRow + step - 1) % track.rows;
        const corner = cornerAt(track, leaving);
        if (corner && leaving === corner.to) exits.push({ corner, step });
    }
    return exits;
}
