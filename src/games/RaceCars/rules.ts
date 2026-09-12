// Pure, isomorphic Race Cars rules: the gear ladder, the breadth-first reach
// band, path derivation, and the arrival resolver that settles corners,
// overshoots, spins and oil — docs/games/race-cars.md §8-15.
//
// No server-only imports. The command classes of PR 3 and PR 5 validate
// through this module, and the board screen imports it to draw the reach band
// a player taps (docs/new-game.md, "Isomorphic rules modules"). Every function
// here reads state and returns a description of what should happen; nothing
// mutates, so a command can ask "what would this cost" as cheaply as it can
// apply it.
//
// **What these functions refuse.** A userId with no car, and a path that is not
// one this board can be driven, are programming errors by the time they get
// here — PR 3's `Execute` guards both before calling in — so they throw rather
// than degrade, loudly and without touching any state. The one exception is
// `conservativeTurn`, which the turn-timeout cron depends on being total and
// which therefore answers even for a driver who has no car (§23.7 PR 6).
import { DiceRoll } from "@/utils/games/DiceRoll";
import { mongoMap } from "@/utils/games/mongoMaps";
import { randomInt } from "@/utils/games/random";
import {
    cornerAt,
    cornerExits,
    gearDef,
    laneWidthAt,
    MIN_MOVE_ROWS,
    OIL_DIE_SIDES,
    OIL_SPIN_FACE,
    RaceCarsCorner,
    RaceCarsGear,
    RaceCarsSpace,
    RaceCarsSpecId,
    RaceCarsTrack,
    rowsBetween,
    shiftDownCost,
    SLIPSTREAM_GAP_ROWS,
    SLIPSTREAM_ROWS,
    spaceKey,
    stepsFrom,
    trackById,
    waivedCornerIdAt,
} from "./board";

// ─── State (§23.4) ──────────────────────────────────────────────────────────
//
// Declared here rather than in RaceCarsModels.ts so the Mongoose schema, the
// command classes and the board all read one definition. Nothing below needs
// Mongoose to say it, and a second copy beside the schema is a copy that can
// drift from the rules that act on it.

export type RaceCarsPhase = 'shift' | 'move' | 'slipstream';

export interface IRaceCarsSlick {
    row: number;
    lane: number;
    /** The round it was laid in; it is swept at the end of the next one (§14). */
    laidOnRound: number;
}

export interface IRaceCarsPlayerState {
    /** Grid slot, 1-6 — the second identity channel beside colour (§19). */
    raceNumber: number;
    row: number;
    lane: number;
    lapsCompleted: number;
    gear: RaceCarsGear;
    tyres: number;
    brakes: number;
    gearbox: number;
    /** Stops banked in the corner this car is standing in; 0 on a straight (§10). */
    cornerStops: number;
    /** Set by a spin; consumed by CheckEndTurn when the round reaches them (§13). */
    skipNextTurn: boolean;
    /** Written once, for the whole field, by the ending (§4.2). */
    finishedPosition: number | null;
    // The turn in progress. Per player and never global (§23.4): a global
    // `roll` is one a driver can leave behind for the next driver to spend.
    phase: RaceCarsPhase;
    roll: number | null;
    /** Brake points spent this turn, for §14's three-or-more slick source. */
    brakeSpent: number;
}

export interface IRaceCarsSpecificGameState {
    trackId: string;
    laps: number;
    spec: RaceCarsSpecId;
    oilSpills: boolean;
    round: number;
    /** userIds, leader first — fixed for the whole round (§15). */
    roundOrder: string[];
    roundIndex: number;
    slicks: IRaceCarsSlick[];
    /**
     * Mongoose hands a stored map back as a real Map on a live document and a
     * plain object once it has been through JSON, and the board reads the DTO's
     * plain record — `mongoMap` is what lets all three call the same rules.
     */
    players: Map<string, IRaceCarsPlayerState> | Record<string, IRaceCarsPlayerState>;
}

function playerStates(state: IRaceCarsSpecificGameState): Map<string, IRaceCarsPlayerState> {
    return mongoMap(state.players);
}

function requirePlayer(state: IRaceCarsSpecificGameState, userId: string): IRaceCarsPlayerState {
    const ps = playerStates(state).get(userId);
    if (!ps) throw new Error(`Race Cars: no car for ${userId}`);
    return ps;
}

// ─── Shifting and the dice (§8.1, §8.2) ─────────────────────────────────────

export interface RaceCarsGearOption {
    gear: RaceCarsGear;
    /** Gearbox this shift charges — 0 for holding, going up, or dropping one. */
    gearboxCost: number;
}

/**
 * Every gear this car may declare, cheapest first by gear number (§8.2).
 *
 * Up is one gear a turn and free, except off a standing start, where gear 0 may
 * launch to 1 *or* 2. Down is free for one gear and steeply priced beyond it,
 * and a gear the gearbox cannot pay for is not offered at all.
 *
 * Gear 0 is never on the list. It is where the grid and a spun car sit, not
 * somewhere a driver may choose to go: §9's "you can never choose to stop"
 * would mean nothing if a car could shift into neutral and park across a corner.
 */
export function legalGears(state: IRaceCarsSpecificGameState, userId: string): RaceCarsGearOption[] {
    const ps = requirePlayer(state, userId);
    const maxGear = trackById(state.trackId).maxGear;

    // A standing start is allowed one extra ratio, and it is the only exception.
    if (ps.gear === 0) {
        return ([1, 2] as RaceCarsGear[])
            .filter(gear => gear <= maxGear)
            .map(gear => ({ gear, gearboxCost: 0 }));
    }

    // Floored rather than read raw: holding a gear is free, so a pool that ever
    // went negative would price even that out and hand back an empty list — and
    // an empty list is a live driver with nothing to tap, not just a stalled one.
    const gearbox = Math.max(0, ps.gearbox);
    const options: RaceCarsGearOption[] = [];
    for (let gear = 1 as RaceCarsGear; gear <= maxGear; gear++) {
        if (gear > ps.gear + 1) continue;
        const gearboxCost = gear > ps.gear ? 0 : shiftDownCost(ps.gear, gear);
        if (gearboxCost === null || gearboxCost > gearbox) continue;
        options.push({ gear, gearboxCost });
    }
    return options;
}

/**
 * The gear's die (§8.1). Uniform across the band — the faces printed on the
 * die the board draws are cosmetic, and `gearDef().faces` is never read here.
 */
export function rollFor(gear: RaceCarsGear): number {
    const def = gearDef(gear);
    return def.min + randomInt(def.max - def.min + 1);
}

// ─── Reach (§9) ─────────────────────────────────────────────────────────────

interface WalkNode {
    space: RaceCarsSpace;
    /** Slicks crossed on the best path to this space (§14). */
    slicks: number;
    /** Key of the space this one was best reached from; null at the start. */
    parent: string | null;
}

interface RaceCarsWalk {
    /** Steps actually walked — short of what was asked when traffic is in the way. */
    distance: number;
    /** Steps the walk was asked for, once made driveable. */
    requested: number;
    /** One map per step, 0 (the car's own space) to `distance`. */
    levels: Map<string, WalkNode>[];
}

/**
 * A distance this board can actually be asked to walk: a whole number of rows,
 * never negative, never longer than a lap.
 *
 * Both halves earn their place. A **fractional** distance would floor itself
 * against the loop bound and then read as short of what was asked — reporting a
 * move as blocked by traffic that nothing blocked, and charging a tyre for it.
 * An **oversized** one is work and memory proportional to a number chosen
 * off-board rather than to the circuit, and no gear can roll past a lap anyway.
 */
function driveableDistance(track: RaceCarsTrack, distance: number): number {
    if (!Number.isFinite(distance) || distance < 1) return 0;
    return Math.min(Math.floor(distance), track.rows);
}

function occupiedBy(state: IRaceCarsSpecificGameState, exceptUserId: string): Set<string> {
    const occupied = new Set<string>();
    for (const [userId, ps] of playerStates(state)) {
        if (userId !== exceptUserId) occupied.add(spaceKey(ps.row, ps.lane));
    }
    return occupied;
}

function slickKeys(state: IRaceCarsSpecificGameState): Set<string> {
    if (!state.oilSpills) return new Set<string>();
    return new Set(state.slicks.map(slick => spaceKey(slick.row, slick.lane)));
}

/**
 * §9's breadth-first walk of exactly `distance` steps, keeping a parent tree so
 * `derivePath` can read a route back out rather than searching again.
 *
 * Each level carries, per space, the fewest slicks any route to it crosses —
 * the single objective of §14, resolved here so a tie is broken the same way
 * every time. A tie broken by map iteration order would replay a different
 * number of oil dice than the live game rolled, which `recordedOilRolls`
 * consumes positionally and would silently mis-read.
 *
 * The frontier is at most a lane width wide, so this visits at most 3N nodes.
 */
function walk(state: IRaceCarsSpecificGameState, userId: string, distance: number): RaceCarsWalk {
    const ps = requirePlayer(state, userId);
    const track = trackById(state.trackId);
    const occupied = occupiedBy(state, userId);
    const slicks = slickKeys(state);

    const start: RaceCarsSpace = { row: ps.row, lane: ps.lane };
    const levels: Map<string, WalkNode>[] = [
        new Map([[spaceKey(start.row, start.lane), { space: start, slicks: 0, parent: null }]]),
    ];

    const requested = driveableDistance(track, distance);
    for (let step = 1; step <= requested; step++) {
        const previous = levels[step - 1];
        const next = new Map<string, WalkNode>();
        for (const [fromKey, node] of previous) {
            for (const to of stepsFrom(track, node.space.row, node.space.lane)) {
                const toKey = spaceKey(to.row, to.lane);
                // A car is a wall: no bumping, no overtaking manoeuvre (§9).
                if (occupied.has(toKey)) continue;
                const crossed = node.slicks + (slicks.has(toKey) ? 1 : 0);
                const seen = next.get(toKey);
                if (!seen || crossed < seen.slicks) next.set(toKey, { space: to, slicks: crossed, parent: fromKey });
            }
        }
        if (next.size === 0) break;
        levels.push(next);
    }

    return { distance: levels.length - 1, requested, levels };
}

function spacesAt(level: Map<string, WalkNode>): RaceCarsSpace[] {
    return [...level.values()]
        .map(node => node.space)
        .sort((a, b) => a.row - b.row || a.lane - b.lane);
}

/**
 * The spaces reachable in **exactly** `distance` steps — empty when traffic
 * makes that impossible. This is the membership test a move validates against
 * (§23.4): deriving a path *to* a submitted destination rather than checking it
 * is in this set accepts `{ row: 77, lane: 1 }` and wins the race from the grid.
 */
export function reachableSpaces(
    state: IRaceCarsSpecificGameState,
    userId: string,
    distance: number,
): RaceCarsSpace[] {
    const options = moveOptions(state, userId, distance);
    // Exactly-N reach is the case that is neither short of the ask nor stuck on
    // the spot, which keeps this honest about a distance that had to be floored.
    return options.blockedShort || options.boxedIn ? [] : options.spaces;
}

export interface RaceCarsMoveOptions {
    /** Where this move may finish. Never empty: it is the car's own space when boxed in. */
    spaces: RaceCarsSpace[];
    /** Rows the car will actually travel, which is short of the roll when blocked. */
    distance: number;
    /** §9: no space reachable in exactly `distance` — stop on the furthest, 1 tyre. */
    blockedShort: boolean;
    /** §9: cannot move even one row — stay put, no damage, gear drops to 1. */
    boxedIn: boolean;
}

/**
 * Every legal end to this move, and which of §9's three cases it is.
 *
 * Kept separate from `reachableSpaces` on purpose: the blocked-short set is its
 * own explicit set, so a driver cannot dress "I would rather stop here" as a
 * block. A command validates a destination against whichever of the two sets
 * applies and never against the union.
 */
export function moveOptions(
    state: IRaceCarsSpecificGameState,
    userId: string,
    distance: number,
): RaceCarsMoveOptions {
    const walked = walk(state, userId, distance);
    return {
        spaces: spacesAt(walked.levels[walked.distance]),
        distance: walked.distance,
        blockedShort: walked.distance > 0 && walked.distance < walked.requested,
        boxedIn: walked.distance === 0,
    };
}

/**
 * The route the car takes to `destination`, start space first, or `[]` if that
 * destination is not one this move can legally finish on.
 *
 * The path itself matters for exactly one thing — which slicks were crossed
 * (§14) — because which *corners* were crossed is not a choice at all: a corner
 * is a band of rows, and every path of exactly N steps crosses the same rows.
 */
export function derivePath(
    state: IRaceCarsSpecificGameState,
    userId: string,
    distance: number,
    destination: RaceCarsSpace,
): RaceCarsSpace[] {
    const walked = walk(state, userId, distance);
    let key = spaceKey(destination.row, destination.lane);
    if (!walked.levels[walked.distance].has(key)) return [];

    const path: RaceCarsSpace[] = [];
    for (let step = walked.distance; step >= 0; step--) {
        const node = walked.levels[step].get(key);
        if (!node) return [];
        path.unshift(node.space);
        if (node.parent !== null) key = node.parent;
    }
    return path;
}

// ─── Arrival: corners, overshoot, spins and oil (§10, §13, §14) ─────────────

export type RaceCarsArrivalEvent =
    | { type: 'blocked' }
    | { type: 'boxedIn' }
    | { type: 'lap'; lapsCompleted: number }
    | { type: 'finish' }
    | { type: 'cornerStop'; cornerId: string; banked: number; owed: number }
    | { type: 'cornerCleared'; cornerId: string }
    | { type: 'overshoot'; cornerId: string; rows: number; waived: boolean }
    | { type: 'oilCheck'; row: number; lane: number; roll: number }
    | { type: 'spin'; cause: 'overshoot' | 'oil'; cornerId: string | null };

export interface RaceCarsArrival {
    row: number;
    lane: number;
    lapsCompleted: number;
    tyres: number;
    cornerStops: number;
    gear: RaceCarsGear;
    spun: boolean;
    /** This car crossed the line having completed the distance (§4.1). */
    finished: boolean;
    /** Where a spin laid its slick, or null (§13 step 5). Only ever set with oil on. */
    slick: RaceCarsSpace | null;
    /** The d6 per slick entered, in path order — the log `recordedOilRolls` replays. */
    oilRolls: number[];
    events: RaceCarsArrivalEvent[];
}

export interface RaceCarsArrivalOptions {
    /** §9: this move fell short of the roll, so it costs a tyre before anything else. */
    blockedShort?: boolean;
    /** One d6 per slick entered, live or replayed (§14, §23.4). */
    nextOilRoll?: () => number;
}

/**
 * Where a spin comes to rest: the corner's last row, first free lane, searching
 * backwards along the corner for a free space (§13, §18).
 *
 * An *overshoot* spin never needs the backwards half, and that is a property
 * rather than an accident: to overshoot at all the car must have stepped onto
 * the corner's last row, so a lane of it was free a moment ago and still is.
 * §18 rules on the full search anyway, so it is written the way §18 rules on
 * it — and the board invariant `board.test.ts` asserts, that every corner holds
 * a full field, is what makes even the search total. The final fallback is
 * unreachable on any track that passes its own tests.
 */
function spinLanding(track: RaceCarsTrack, occupied: Set<string>, corner: RaceCarsCorner): RaceCarsSpace {
    for (let row = corner.to; row >= corner.from; row--) {
        for (let lane = 1; lane <= laneWidthAt(track, row); lane++) {
            if (!occupied.has(spaceKey(row, lane))) return { row, lane };
        }
    }
    return { row: corner.to, lane: 1 };
}

/**
 * Refuse a path this car could not have driven.
 *
 * This is the function that actually writes a car's row, lane, tyres and laps,
 * and it is handed an array rather than deriving one — so it checks that array
 * instead of trusting whoever built it. A forged `[own space, { row: 0, lane: 1 }]`
 * would otherwise finish the race from anywhere on the circuit, and a path
 * carrying a NaN row would park a car on a space `stepsFrom` can never step off
 * again: a silent soft-lock rather than a crash, which is the worse of the two.
 *
 * `derivePath` is the way to build one, and its output always passes. Anything
 * else is a caller that skipped §23.4's membership test, which is a bug in the
 * command rather than a move to resolve — so this throws rather than guessing.
 */
function assertDriveable(
    track: RaceCarsTrack,
    ps: IRaceCarsPlayerState,
    occupied: Set<string>,
    path: RaceCarsSpace[],
): void {
    if (path.length === 0) return;
    const [start] = path;
    if (start.row !== ps.row || start.lane !== ps.lane) {
        throw new Error(`Race Cars: path starts at ${start.row}:${start.lane}, car is at ${ps.row}:${ps.lane}`);
    }
    for (let step = 1; step < path.length; step++) {
        const from = path[step - 1];
        const to = path[step];
        const legal = stepsFrom(track, from.row, from.lane)
            .some(candidate => candidate.row === to.row && candidate.lane === to.lane);
        if (!legal) throw new Error(`Race Cars: ${from.row}:${from.lane} does not step to ${to.row}:${to.lane}`);
        // A car is a wall (§9), on this path as much as on the walk that built it.
        if (occupied.has(spaceKey(to.row, to.lane))) {
            throw new Error(`Race Cars: path runs through the car on ${to.row}:${to.lane}`);
        }
    }
}

/**
 * Resolve a move that has already been chosen: walk the path row by row and
 * settle the finish line, corner stops, overshoots, spins and oil **in path
 * order** (§10). Pure — it reports the car's new state and the events that got
 * it there, and the command applies them.
 *
 * Two ordering decisions §10 leaves implicit, made here and worth naming:
 *
 * - An overshoot is settled at the step that leaves the corner, charged for
 *   every row from there to the destination the driver chose. It is not
 *   deferred to the end of the move, because §10 says a move that spins at the
 *   first corner "stops there and never reaches the second" — so the second
 *   corner is never reached, and neither are the oil checks past it, which is
 *   what keeps the recorded roll log the same length on replay.
 * - Within one step, the corner behind is settled before the space ahead is
 *   checked for oil: the corner is about the row being left, the slick about
 *   the space being entered.
 */
export function resolveArrival(
    state: IRaceCarsSpecificGameState,
    userId: string,
    path: RaceCarsSpace[],
    options: RaceCarsArrivalOptions = {},
): RaceCarsArrival {
    const ps = requirePlayer(state, userId);
    const track = trackById(state.trackId);
    const occupied = occupiedBy(state, userId);
    const slicks = slickKeys(state);
    assertDriveable(track, ps, occupied, path);
    const nextOilRoll = options.nextOilRoll ?? (() => DiceRoll(OIL_DIE_SIDES));

    const start = path[0] ?? { row: ps.row, lane: ps.lane };
    const distance = Math.max(0, path.length - 1);
    const events: RaceCarsArrivalEvent[] = [];
    const oilRolls: number[] = [];

    let tyres = ps.tyres;
    let lapsCompleted = ps.lapsCompleted;
    let stops = ps.cornerStops;

    // A turn that ends inside a corner banks a stop, however it ended there —
    // including standing still while boxed in (§18).
    const rest = (space: RaceCarsSpace, gear: RaceCarsGear, spun: boolean, banks: boolean): RaceCarsArrival => {
        const corner = cornerAt(track, space.row);
        if (corner && banks) {
            stops += 1;
            events.push({ type: 'cornerStop', cornerId: corner.id, banked: stops, owed: corner.stops });
        }
        return {
            row: space.row,
            lane: space.lane,
            lapsCompleted,
            tyres,
            // Stops only mean anything inside the corner they were banked in (§10).
            cornerStops: corner ? stops : 0,
            gear,
            spun,
            finished: false,
            slick: spun && state.oilSpills ? { row: space.row, lane: space.lane } : null,
            oilRolls,
            events,
        };
    };

    // Boxed in (§9): no damage, and the gear drops to 1 rather than 0 — the car
    // is stuck in traffic, not stalled.
    if (distance === 0) {
        events.push({ type: 'boxedIn' });
        return rest(start, 1, false, true);
    }

    // Blocked short (§9): one tyre for having to lift, whatever the distance
    // lost. It is a scuff rather than a debt, so it never spins a car that
    // cannot pay it (§18) — it simply clamps at an empty pool.
    if (options.blockedShort) {
        events.push({ type: 'blocked' });
        tyres = Math.max(0, tyres - 1);
    }

    const waivedCornerId = waivedCornerIdAt(track, start.row);

    const exits = new Map(cornerExits(track, start.row, distance).map(exit => [exit.step, exit.corner]));

    for (let step = 1; step <= distance; step++) {
        const to = path[step];

        // The finish line (§15). A lap is complete on crossing from the last
        // row to row 0, and the race ends the instant a car completes the
        // distance — distance past the line is not measured, so nothing
        // further along the path is resolved or charged (§4.1, §18).
        if (to.row === 0) {
            lapsCompleted += 1;
            events.push({ type: 'lap', lapsCompleted });
            if (lapsCompleted >= state.laps) {
                events.push({ type: 'finish' });
                const end = path[distance];
                return {
                    row: end.row,
                    lane: end.lane,
                    lapsCompleted,
                    tyres,
                    cornerStops: 0,
                    gear: ps.gear,
                    spun: false,
                    finished: true,
                    slick: null,
                    oilRolls,
                    events,
                };
            }
        }

        const corner = exits.get(step);
        if (corner) {
            const owed = corner.stops - stops;
            if (owed <= 0) {
                events.push({ type: 'cornerCleared', cornerId: corner.id });
            } else if (corner.id === waivedCornerId) {
                events.push({ type: 'overshoot', cornerId: corner.id, rows: distance - step + 1, waived: true });
            } else {
                const rows = distance - step + 1;
                events.push({ type: 'overshoot', cornerId: corner.id, rows, waived: false });
                if (tyres >= rows) {
                    tyres -= rows;
                } else {
                    // §10: you do not pay what you can and spin for the rest.
                    // You pay nothing, and the car is placed back in the corner.
                    events.push({ type: 'spin', cause: 'overshoot', cornerId: corner.id });
                    return rest(spinLanding(track, occupied, corner), 0, true, true);
                }
            }
            // Banked stops reset the moment the corner is legally left (§10).
            stops = 0;
        }

        // Oil (§14): checked on the space entered, never on the one already
        // stood on, so a driver never spins on their own slick.
        if (slicks.has(spaceKey(to.row, to.lane))) {
            const roll = nextOilRoll();
            oilRolls.push(roll);
            events.push({ type: 'oilCheck', row: to.row, lane: to.lane, roll });
            if (roll === OIL_SPIN_FACE) {
                events.push({ type: 'spin', cause: 'oil', cornerId: null });
                // An oil spin rests on the slick's own space, and §18 leaves its
                // banked stops untouched — so it banks nothing on the way down.
                return rest(to, 0, true, false);
            }
        }
    }

    return rest(path[distance], ps.gear, false, true);
}

// ─── Slipstream (§12) ───────────────────────────────────────────────────────

/**
 * Whether this car is owed a tow: it ended one or two rows behind another car,
 * in any lane, and has somewhere to go.
 *
 * The "somewhere to go" half is the point of putting the check here rather than
 * in the command that accepts it. A tow with nothing reachable at all — both
 * lanes of the Esses occupied one row ahead — is not offered, rather than
 * offered and then punished: a player should never be able to accept an offer
 * that costs them for accepting it. A tow that is merely blocked *short* is
 * offered, and takes the same tyre a blocked move does.
 */
export function slipstreamOffered(state: IRaceCarsSpecificGameState, userId: string): boolean {
    const ps = requirePlayer(state, userId);
    // A spin ends the turn outright — no tow for a car that has just been told
    // it is missing its next turn (§18).
    if (ps.skipNextTurn) return false;

    const track = trackById(state.trackId);
    const ahead = [...playerStates(state)].some(([otherId, other]) =>
        otherId !== userId && SLIPSTREAM_GAP_ROWS.includes(rowsBetween(track, ps.row, other.row)));
    if (!ahead) return false;

    return !moveOptions(state, userId, SLIPSTREAM_ROWS).boxedIn;
}

// ─── Turn order (§15) ───────────────────────────────────────────────────────

export interface RaceCarsProgress {
    lapsCompleted: number;
    row: number;
}

/** How far round the circuit a car is — §15's first two sort keys, and §4.2's classification. */
export function trackProgress(state: IRaceCarsSpecificGameState, userId: string): RaceCarsProgress {
    const ps = requirePlayer(state, userId);
    return { lapsCompleted: ps.lapsCompleted, row: ps.row };
}

/**
 * Track order, leader first (§15): laps descending, then row, then the previous
 * round's order for an exact tie.
 *
 * Rebuilt whole from a **snapshot** of the current order rather than sorted in
 * place. §15's third tie-break reads the array being sorted, and a comparator
 * reading a half-permuted array is an inconsistent comparator — which is
 * reached at every corner, because bunching the field into equal rows is
 * exactly what corners are for.
 *
 * Called in one place only, `CheckEndTurn` when `roundIndex` wraps. Deriving it
 * mid-round would let a driver's own move reorder the drivers behind them.
 */
export function recomputeRoundOrder(state: IRaceCarsSpecificGameState): string[] {
    const players = playerStates(state);
    // An id in the order with no car is a game that is already being abandoned;
    // carrying it would leave `currentTurn` pointing at nobody.
    const previous = state.roundOrder.filter(userId => players.has(userId));
    const wasAt = new Map(previous.map((userId, index) => [userId, index]));

    return [...previous].sort((a, b) => {
        const left = players.get(a)!;
        const right = players.get(b)!;
        return right.lapsCompleted - left.lapsCompleted
            || right.row - left.row
            || (wasAt.get(a) ?? 0) - (wasAt.get(b) ?? 0);
    });
}

// ─── The conservative line (§23.7 PR 6) ─────────────────────────────────────

export type RaceCarsConservativeTurn =
    | { phase: 'shift'; gear: RaceCarsGear }
    | { phase: 'move'; brake: number; destination: RaceCarsSpace }
    | { phase: 'slipstream'; tow: RaceCarsSpace | null };

/**
 * Rows of overshoot a move of `distance` would be charged, ignoring traffic and
 * oil — what the timeout driver plans against. Traffic can only make a move
 * shorter, so a distance this says is clean is clean however it is blocked.
 */
function plannedOvershoot(track: RaceCarsTrack, ps: IRaceCarsPlayerState, distance: number): number {
    const waivedCornerId = waivedCornerIdAt(track, ps.row);
    let stops = ps.cornerStops;
    let rows = 0;
    for (const { corner, step } of cornerExits(track, ps.row, distance)) {
        if (corner.stops - stops > 0 && corner.id !== waivedCornerId) rows += distance - step + 1;
        stops = 0;
    }
    return rows;
}

/** The end of a move that crosses the fewest slicks, breaking ties by lane. */
function safestDestination(
    state: IRaceCarsSpecificGameState,
    userId: string,
    distance: number,
): { space: RaceCarsSpace; slicks: number } {
    const walked = walk(state, userId, distance);
    let best: WalkNode | null = null;
    for (const node of walked.levels[walked.distance].values()) {
        if (!best
            || node.slicks < best.slicks
            || (node.slicks === best.slicks && node.space.lane < best.space.lane)) best = node;
    }
    // Level 0 always holds the car's own space, so this is never null.
    return { space: best!.space, slicks: best!.slicks };
}

/**
 * A turn a timed-out driver can be given, for the phase they stalled in
 * (§23.7 PR 6). **Total by construction**: it always names a gear, always names
 * a destination, and falls through to the cheapest overshoot — spinning if that
 * cannot be paid — because a spin is a legal outcome of §10 and at least ends
 * the turn.
 *
 * A preference list with no fallthrough is not a style problem here. An empty
 * candidate set builds a command with an undefined destination, `Execute`
 * refuses it, `resolveStalledTurn` reports 'stuck', and the cron returns before
 * saving — discarding the missed-turn increment with it, so the abandon ladder
 * never climbs and the same game is re-read every tick forever.
 *
 * One deliberate reading of §23.7's preference order: "hold the gear if its
 * maximum cannot overshoot, else drop to the highest gear that cannot" is
 * implemented as **the highest legal gear that cannot overshoot**, which holds
 * and drops exactly as described but also climbs on a clear straight. A line
 * that never climbs never leaves gear 2, and The Mile alone would then take a
 * driver eleven turns — which §23.8's turn-count assertion is there to catch.
 */
/** The highest legal gear whose best roll still cannot overshoot — see the note above. */
function planShift(state: IRaceCarsSpecificGameState, userId: string): RaceCarsConservativeTurn {
    const ps = requirePlayer(state, userId);
    const track = trackById(state.trackId);
    const options = legalGears(state, userId);
    const safe = options.filter(option => plannedOvershoot(track, ps, gearDef(option.gear).max) === 0);
    const chosen = safe.length > 0 ? safe[safe.length - 1] : options[0];
    // `legalGears` is never empty — holding the current gear is always free, and
    // gear 0 can always launch — but gear 1 is the answer if it ever became so.
    return { phase: 'shift', gear: chosen ? chosen.gear : 1 };
}

/** The fewest brakes that avoid an overshoot, else the cheapest overshoot going. */
function planMove(state: IRaceCarsSpecificGameState, userId: string): RaceCarsConservativeTurn {
    const ps = requirePlayer(state, userId);
    const track = trackById(state.trackId);
    // `phase` is the authority and `roll` follows it (§23.4). A move phase with
    // no roll is a bug upstream; one row keeps this function total.
    const roll = ps.roll ?? MIN_MOVE_ROWS;
    const mostBrakes = Math.min(ps.brakes, Math.max(0, roll - MIN_MOVE_ROWS));

    // Crossing oil is the tie-break rather than a veto: a certain overshoot is
    // worse than a one-in-six chance of a spin.
    let oily: RaceCarsConservativeTurn | null = null;
    for (let brake = 0; brake <= mostBrakes; brake++) {
        const distance = roll - brake;
        if (plannedOvershoot(track, ps, distance) > 0) continue;
        const best = safestDestination(state, userId, distance);
        if (best.slicks === 0) return { phase: 'move', brake, destination: best.space };
        oily = oily ?? { phase: 'move', brake, destination: best.space };
    }
    if (oily) return oily;

    // The shortest move the brake pool can buy is the fewest rows past the
    // corner's last row, which is the cheapest overshoot available.
    const destination = safestDestination(state, userId, roll - mostBrakes).space;
    return { phase: 'move', brake: mostBrakes, destination };
}

/** Take the tow only if it is free: three rows in a braking zone are three rows of overshoot. */
function planTow(state: IRaceCarsSpecificGameState, userId: string): RaceCarsConservativeTurn {
    if (!slipstreamOffered(state, userId)) return { phase: 'slipstream', tow: null };
    const ps = requirePlayer(state, userId);
    const track = trackById(state.trackId);
    const options = moveOptions(state, userId, SLIPSTREAM_ROWS);
    const best = safestDestination(state, userId, SLIPSTREAM_ROWS);
    const free = !options.blockedShort
        && best.slicks === 0
        && plannedOvershoot(track, ps, options.distance) === 0;
    return { phase: 'slipstream', tow: free ? best.space : null };
}

export function conservativeTurn(
    state: IRaceCarsSpecificGameState,
    userId: string,
): RaceCarsConservativeTurn {
    const ps = playerStates(state).get(userId);
    // Total for a driver with no car, too. `roundOrder` can outlive `players` —
    // a driver removed mid-race, or any drift between the two — and throwing
    // here would wedge the cron in exactly the way the fallthrough below exists
    // to prevent, one step earlier: `resolveStalledTurn` reports 'stuck', the
    // cron returns before saving, and the abandon ladder never climbs. Declining
    // a tow is the one plan that ends a turn while changing nothing.
    if (!ps) return { phase: 'slipstream', tow: null };
    if (ps.phase === 'shift') return planShift(state, userId);
    if (ps.phase === 'move') return planMove(state, userId);
    return planTow(state, userId);
}
