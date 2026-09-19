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
import { clonePlayerStates, mongoMap } from "@/utils/games/mongoMaps";
import { randomInt } from "@/utils/games/random";
import {
    cornerAt,
    cornerExits,
    crossesFinishLine,
    driveableSteps,
    gearDef,
    MIN_MOVE_STEPS,
    rowsBetween,
    OIL_DIE_SIDES,
    OIL_SPIN_FACE,
    RaceCarsCorner,
    RaceCarsGear,
    RaceCarsSpace,
    RaceCarsSpecId,
    RaceCarsTrack,
    shiftDownCost,
    START_DIE_SIDES,
    START_FLYING_FROM,
    START_ROUND,
    START_STALL_FACE,
    SLIPSTREAM_MIN_GEAR,
    SLIPSTREAM_STEPS,
    spaceKey,
    spacesInCorner,
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

/**
 * Where a turn has got to. `'start'` is §6a's startup round and only ever
 * round one: one d20 decides how the car gets away, and it stands in for the
 * shift nobody makes off the line.
 */
export type RaceCarsPhase = 'start' | 'shift' | 'move' | 'slipstream';

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
    /**
     * The d20 this car got away on (§6a), or null until it has thrown one.
     *
     * Kept for the whole race rather than read and dropped: it is what tells
     * the turn sheet and the end-of-move reveal that the four spaces in `roll`
     * are a flying start rather than a number off first gear's die — which
     * nothing else on the car can say, since a flying start leaves it in first
     * like every other clean getaway.
     */
    startRoll: number | null;
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
    // ─── Undo (docs/undo.md) ────────────────────────────────────────────────
    /**
     * Snapshots of the whole state, newest last, pushed by RaceCarsMove and
     * RaceCarsSlipstream before they mutate anything — except when doing so
     * would let a driver undo a roll hiding inside them: a leg that crosses one
     * of §14's slicks rolls for oil partway through, and a leg that crosses the
     * line ends the race, neither of which docs/undo.md §6 lets an undo reach
     * back over (see `raceCarsCommitUndo` in RaceCarsLogic.ts). `by` is whose
     * move it was. Capped at UNDO_STACK_DEPTH; the oldest is dropped, which
     * only ever costs reach, never correctness.
     */
    undoStack: { by: string; state: IRaceCarsSpecificGameState }[];
    /**
     * The id of the last command that pushed or popped a snapshot. RaceCarsUndo
     * refuses unless this matches the id of the tail of `commandHistory` —
     * which is how the stack goes stale the moment anything else is played,
     * without every other command having to remember to clear it (docs/undo.md
     * §4).
     */
    undoAnchorId: string | null;
    /**
     * When a turn that is ready to end is being held open so its driver can
     * still take their last move or tow back (docs/undo.md §5). ISO, or null
     * the rest of the time. Set only when the leg that would have ended the
     * turn is the one directly behind the undo anchor — a leg that rolled for
     * oil or crossed the line ends the turn immediately instead, exactly as it
     * always has — and cleared by `RaceCarsGameType.CheckEndTurn` once the
     * hand-off it was holding open is actually final.
     */
    autoEndTurnAt: string | null;
}

function playerStates(state: IRaceCarsSpecificGameState): Map<string, IRaceCarsPlayerState> {
    return mongoMap(state.players);
}

function requirePlayer(state: IRaceCarsSpecificGameState, userId: string): IRaceCarsPlayerState {
    const ps = playerStates(state).get(userId);
    if (!ps) throw new Error(`Race Cars: no car for ${userId}`);
    return ps;
}

// ─── Cloning (turn recap, undo) ─────────────────────────────────────────────
// The grid draw of §6 step 5 is randomised at creation and is gone from the
// live state the moment the first car moves, so — like every other multiplayer
// game here — turn recap replays from a snapshot of it rather than re-deriving
// it. docs/undo.md §16's second pilot reuses the same snapshot unchanged,
// which is why this lives here rather than in RaceCarsModels.ts: RaceCarsLogic.ts
// (the undo command) needs it too, and this is the one file both it and
// RaceCarsModels.ts already import without creating a cycle between them.

function clonePlayerState(ps: IRaceCarsPlayerState): IRaceCarsPlayerState {
    // Every field named rather than spread: a Mongoose subdocument keeps its
    // fields behind getters, so `{ ...ps }` copies none of them and the
    // replayed grid would start with `undefined` everywhere (mongoMaps.ts).
    return {
        raceNumber: ps.raceNumber,
        row: ps.row,
        lane: ps.lane,
        lapsCompleted: ps.lapsCompleted,
        gear: ps.gear,
        tyres: ps.tyres,
        brakes: ps.brakes,
        gearbox: ps.gearbox,
        cornerStops: ps.cornerStops,
        skipNextTurn: ps.skipNextTurn,
        finishedPosition: ps.finishedPosition,
        phase: ps.phase,
        roll: ps.roll,
        brakeSpent: ps.brakeSpent,
        startRoll: ps.startRoll,
    };
}

/**
 * Deep-clones a Race Cars state into independent plain objects, rebuilding the
 * player map in `userIdList` order (see `clonePlayerStates`). Used to seed
 * turn recap's starting snapshot and, unchanged, an undo snapshot
 * (docs/undo.md §7) — `undoStack: []`/`undoAnchorId: null` so a snapshot never
 * nests a stack of its own, and `autoEndTurnAt` copied through (not forced
 * null) so restoring an undo snapshot puts the hold back exactly where it
 * was — which for the pre-move snapshot §5's hold is taken from is always
 * null, since `raceCarsCommitUndo` never pushes one while a hold is already
 * open (see the `gs.autoEndTurnAt` guard on `RaceCarsMove`/`RaceCarsSlipstream`
 * in RaceCarsLogic.ts).
 */
export function cloneRaceCarsState(
    gs: IRaceCarsSpecificGameState,
    userIdList: string[],
): IRaceCarsSpecificGameState {
    return {
        trackId: gs.trackId,
        laps: gs.laps,
        spec: gs.spec,
        oilSpills: gs.oilSpills,
        round: gs.round,
        roundOrder: [...gs.roundOrder],
        roundIndex: gs.roundIndex,
        slicks: gs.slicks.map(slick => ({ row: slick.row, lane: slick.lane, laidOnRound: slick.laidOnRound })),
        players: clonePlayerStates(gs.players, userIdList, clonePlayerState),
        undoStack: [],
        undoAnchorId: null,
        autoEndTurnAt: gs.autoEndTurnAt ?? null,
    };
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
 * Up is one gear a turn and free. Down is free for one gear and steeply priced
 * beyond it, and a gear the gearbox cannot pay for is not offered at all.
 *
 * **Out of neutral there is no exception**: a car in gear 0 takes first and
 * nothing else. It used to be allowed a standing-start launch straight to
 * second, and §6a is what replaced that — how well a car gets away off the line
 * is the startup round's d20 now, not a free ratio, and a car sitting in
 * neutral afterwards (it bogged down, or it spun) is not in first yet and so
 * cannot be in second next turn. The one exception is a race that was already
 * running when §6a shipped; see the branch below for why it cannot simply be
 * dropped.
 *
 * Gear 0 is never on the list. It is where the grid and a spun car sit, not
 * somewhere a driver may choose to go: §9's "you can never choose to stop"
 * would mean nothing if a car could shift into neutral and park across a corner.
 */
export function legalGears(state: IRaceCarsSpecificGameState, userId: string): RaceCarsGearOption[] {
    const ps = requirePlayer(state, userId);
    const maxGear = trackById(state.trackId).maxGear;

    // A race dealt before §6a is the one place the old launch still applies,
    // and it has to: every `RaceCarsShift` in its recorded log was sent under
    // that rule, and a command replay refuses is skipped **in silence**
    // (replay.ts) — which freezes the car on the grid for the rest of that
    // match's review, drops every later command of that driver's with it
    // (their move has no roll to spend), and flattens their line on a result
    // chart computed once and stored. So an old race finishes under the rules
    // it started under.
    //
    // Unreachable in a §6a race, which is what makes this a compatibility
    // branch rather than a second rule: a car only reaches a shift after its
    // own launch, and every launch writes `startRoll` — a stall writes 1.
    if (ps.gear === 0 && ps.startRoll == null) {
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

// ─── The startup round (§6a) ────────────────────────────────────────────────

/**
 * What one d20 made of a car's getaway (§6a):
 *
 * - `stalled` — a 1. The engine bogs down: no gear, no roll, no movement, and
 *   the car is still in neutral when the next round reaches it, so first is the
 *   only gear it can take then.
 * - `away` — 2 to 16. First gear, and first gear's own die decides the move.
 * - `flying` — 17 and up. First gear, and a fixed four spaces instead of a roll.
 */
export type RaceCarsStartOutcome = 'stalled' | 'away' | 'flying';

/** Which of §6a's three getaways a d20 face is. */
export function startOutcome(roll: number): RaceCarsStartOutcome {
    if (roll <= START_STALL_FACE) return 'stalled';
    return roll >= START_FLYING_FROM ? 'flying' : 'away';
}

/** The d20 §6a throws. Its own function so the command reads the same way `rollFor` does. */
export function rollStart(): number {
    return DiceRoll(START_DIE_SIDES);
}

/**
 * The d20 this car is driving a flying start on, or null if the number it is
 * about to spend came off a gear's die after all — the one reading that
 * separates §6a's fixed four spaces from a roll, which is what both the turn
 * sheet and the end-of-move reveal need to name it.
 *
 * The face rather than a yes/no, because the one screen that asks draws the die
 * that was thrown: a boolean would only send it back for `startRoll` behind a
 * non-null assertion this already proved.
 *
 * Round one and nothing else: `startRoll` is kept for the whole race, so the
 * round is what keeps a 17 thrown on lap one from re-labelling a fourth-gear
 * four on lap two. Loosely nullish, because a race that was already running
 * when §6a shipped has cars carrying no `startRoll` at all — those never threw
 * a d20, so they never took a flying start either.
 */
export function flyingStartRoll(state: IRaceCarsSpecificGameState, ps: IRaceCarsPlayerState): number | null {
    if (state.round !== START_ROUND || ps.startRoll == null) return null;
    return startOutcome(ps.startRoll) === 'flying' ? ps.startRoll : null;
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
function walk(
    state: IRaceCarsSpecificGameState,
    userId: string,
    distance: number,
    blockers?: Set<string>,
): RaceCarsWalk {
    const ps = requirePlayer(state, userId);
    const track = trackById(state.trackId);
    // An empty set is the open road the reach band and the gear plan read: it
    // can only be wider than the one traffic leaves, never narrower.
    const occupied = blockers ?? occupiedBy(state, userId);
    const slicks = slickKeys(state);

    const start: RaceCarsSpace = { row: ps.row, lane: ps.lane };
    const levels: Map<string, WalkNode>[] = [
        new Map([[spaceKey(start.row, start.lane), { space: start, slicks: 0, parent: null }]]),
    ];

    const requested = driveableSteps(track, distance);
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
    /** Steps the car will actually travel, which is short of the roll when blocked. */
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
 * The set of destination spaces where all paths cross at least one slick (§14).
 * Returns space keys for destinations marked as having unavoidable oil.
 * Only meaningful when oil spills are enabled and there are slicks on the board.
 */
export function unavoidableOilDestinations(
    state: IRaceCarsSpecificGameState,
    userId: string,
    distance: number,
): Set<string> {
    if (!state.oilSpills) return new Set();
    
    const walked = walk(state, userId, distance);
    const unavoidable = new Set<string>();
    
    // For each destination space, check if the best path (minimum slicks) crosses at least one slick.
    // If it does, then all paths to that destination must cross at least one slick.
    const destinations = walked.levels[walked.distance];
    if (!destinations) return unavoidable;
    
    for (const [key, node] of destinations) {
        if (node.slicks > 0) {
            unavoidable.add(key);
        }
    }
    
    return unavoidable;
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
    return readPath(walk(state, userId, distance), spaceKey(destination.row, destination.lane));
}

/** The route a finished walk took to one of its destinations, start space first. */
function readPath(walked: RaceCarsWalk, destination: string): RaceCarsSpace[] {
    let key = destination;
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
    | { type: 'overshoot'; cornerId: string; spaces: number; waived: boolean }
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
    /**
     * Whether §10's waiver is in play — true for the turn's own move, false for
     * §12's tow.
     *
     * The waiver forgives a corner a car "could not have avoided leaving": it
     * began its turn on the last row, and §9 forbids standing still. A tow is
     * the one leg where that reasoning does not hold, because declining costs
     * nothing — so §12 charges its overshoot in full, and a driver towed onto a
     * corner's last row is making a choice rather than being pushed.
     */
    waiveUnavoidableCorner?: boolean;
}

/**
 * §10 on one corner a move leaves behind: which of its three outcomes this is,
 * and the spaces it is past the corner.
 *
 * **Spaces, not rows.** A row is a rank round the lap rather than a distance
 * (§5.1): the inside of a corner covers the same stretch in half the tiles, so
 * charging "rows past the corner" would charge two lines differently for the
 * same overrun. A space is a space on either of them.
 *
 * One reading of the rule for the resolver that charges it and the line that
 * plans against it (§23.7 PR 6) alike — two readings are two things to keep in
 * lockstep, and the state where they disagree is the one where the cron takes a
 * move it priced as free and then pays for it.
 */
function settleCorner(
    corner: RaceCarsCorner,
    stops: number,
    waivedCornerId: string | null,
    spacesPast: number,
): { outcome: 'cleared' | 'waived' | 'charged'; spaces: number } {
    if (corner.stops - stops <= 0) return { outcome: 'cleared', spaces: 0 };
    return { outcome: corner.id === waivedCornerId ? 'waived' : 'charged', spaces: spacesPast };
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
    const inside = spacesInCorner(track, corner.id);
    for (const space of inside) {
        if (!occupied.has(spaceKey(space.row, space.lane))) return { row: space.row, lane: space.lane };
    }
    return inside[0] ?? { row: corner.to, lane: 1 };
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

    // The row each lap banked this move was banked at, so `rest` can tell one the
    // car actually drove past from one it is about to be pulled back behind.
    const bankedAt: number[] = [];

    /**
     * Give back a lap the car never really completed.
     *
     * §10 puts a car that cannot pay its overshoot **back in the corner**, which
     * on a circuit whose line is painted near a corner's exit is behind a line
     * the same move crossed a step earlier. §10's own words are that such a move
     * "stops there and never reaches" what is past it — and the line is past it,
     * so the lap does not stand. Without this a car banks the lap, spins back
     * behind the line, and banks it again next turn: two laps for one.
     *
     * Measured forward from where the move began rather than by step, because a
     * spin lands on the highest free row of the corner and a line may be painted
     * inside one — what settles it is where the car comes to rest, not which step
     * the corner fell behind at. A move is never longer than a lap, so one walk
     * forward from the start orders every row it touched.
     */
    const unbankLapsPast = (space: RaceCarsSpace) => {
        const reached = rowsBetween(track, start.row, space.row);
        while (bankedAt.length > 0 && rowsBetween(track, start.row, bankedAt[bankedAt.length - 1]) > reached) {
            bankedAt.pop();
            const undone = lapsCompleted;
            lapsCompleted -= 1;
            for (let i = events.length - 1; i >= 0; i--) {
                const event = events[i];
                if (event.type === 'lap' && event.lapsCompleted === undone) {
                    events.splice(i, 1);
                    break;
                }
            }
        }
    };

    // A turn that ends inside a corner banks a stop, however it ended there —
    // including standing still while boxed in (§18).
    const rest = (space: RaceCarsSpace, gear: RaceCarsGear, spun: boolean, banks: boolean): RaceCarsArrival => {
        unbankLapsPast(space);
        const corner = cornerAt(track, space.row, space.lane);
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

    const waivedCornerId = (options.waiveUnavoidableCorner ?? true)
        ? waivedCornerIdAt(track, start.row, start.lane)
        : null;

    // Keyed by the step each corner falls behind at, and carrying the spaces
    // the move ends up past it — which is what §10 charges (see `settleCorner`).
    const exits = new Map(cornerExits(track, path).map(crossing => [crossing.step, crossing]));

    for (let step = 1; step <= distance; step++) {
        const to = path[step];

        // The finish line (§15). A lap is complete on crossing it, wherever the
        // circuit paints it (`lapBoundary`), and the race ends the instant a car
        // completes the distance — distance past the line is not measured, so
        // nothing further along the path is resolved or charged (§4.1, §18).
        if (crossesFinishLine(track, path[step - 1].row, to.row)) {
            lapsCompleted += 1;
            bankedAt.push(to.row);
            // On a circuit whose grid sits behind the line, the field starts a
            // lap short (`startingLaps`) and this first crossing only brings it
            // to nought: the race has started rather than a lap been completed,
            // so there is no lap to announce and none to finish on.
            if (lapsCompleted >= 1) events.push({ type: 'lap', lapsCompleted });
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

        const crossing = exits.get(step);
        if (crossing) {
            const corner = crossing.corner;
            const { outcome, spaces } = settleCorner(corner, stops, waivedCornerId, crossing.spacesPast);
            if (outcome === 'cleared') {
                events.push({ type: 'cornerCleared', cornerId: corner.id });
            } else {
                events.push({ type: 'overshoot', cornerId: corner.id, spaces, waived: outcome === 'waived' });
                if (outcome === 'charged') {
                    if (tyres >= spaces) {
                        tyres -= spaces;
                    } else {
                        // §10: you do not pay what you can and spin for the rest.
                        // You pay nothing, and the car is placed back in the corner.
                        events.push({ type: 'spin', cause: 'overshoot', cornerId: corner.id });
                        return rest(spinLanding(track, occupied, corner), 0, true, true);
                    }
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
 * Whether a tow into `to` would carry the car past the corner it stands on at
 * `from` — the road it is on now — into a different one, or into one from open
 * road. Standing still inside a corner and towing further into the *same* one
 * is not entry: the car already owes that corner its stops.
 */
export function entersNewCorner(track: RaceCarsTrack, from: RaceCarsSpace, to: RaceCarsSpace): boolean {
    const destCorner = cornerAt(track, to.row, to.lane);
    if (!destCorner) return false;
    return destCorner.id !== cornerAt(track, from.row, from.lane)?.id;
}

/**
 * Where a tow may legally finish: the ordinary three-step reach, minus any
 * destination that would carry the car into a corner it is not already in
 * while it has no brake point left to pay for the late braking (§12). A tow
 * is never offered at all when nothing survives this filter —
 * `slipstreamOffered` is what withholds the offer — so a caller that reaches
 * for this already knows the result is never empty.
 */
export function slipstreamMoveOptions(state: IRaceCarsSpecificGameState, userId: string): RaceCarsMoveOptions {
    const ps = requirePlayer(state, userId);
    const options = moveOptions(state, userId, SLIPSTREAM_STEPS);
    if (ps.brakes > 0) return options;

    const track = trackById(state.trackId);
    const from = { row: ps.row, lane: ps.lane };
    return { ...options, spaces: options.spaces.filter(space => !entersNewCorner(track, from, space)) };
}

/**
 * Whether this car is owed a tow: it ended directly behind another car it is
 * fast enough to draft (§12), and has somewhere legal to go.
 *
 * "Directly behind" is the one space the road puts one step ahead of this car
 * **in the lane it is already in** — never a lane it could shift into to find
 * a car, and never two steps out. A row is a rank rather than a distance
 * (§5.1), so that one step is a question about the road, not about row
 * numbers: on a corner's inside line it can cover two rows, and on a
 * staggered stretch a car a row up in a different lane is beside this one
 * rather than in front of it.
 *
 * A draft needs real speed on both sides: the trailing car in fourth gear or
 * above, and never below the gear of the car it is drafting — a slower car
 * throws no wake worth tucking into, and a faster one leaves its draft behind
 * before the trailing car can use it.
 *
 * The "somewhere legal to go" half is the point of putting the check here
 * rather than in the command that accepts it. A tow with nothing reachable at
 * all — both lanes of the Esses occupied one row ahead — is not offered,
 * rather than offered and then punished: a player should never be able to
 * accept an offer that costs them for accepting it. The same goes for a tow
 * that reaches only into a corner it is not already in when there is no brake
 * point left to pay the late-braking charge — see `slipstreamMoveOptions`. A
 * tow that is merely blocked *short* is offered, and takes the same tyre a
 * blocked move does.
 */
export function slipstreamOffered(state: IRaceCarsSpecificGameState, userId: string): boolean {
    const ps = requirePlayer(state, userId);
    // A spin ends the turn outright — no tow for a car that has just been told
    // it is missing its next turn (§18).
    if (ps.skipNextTurn) return false;

    const track = trackById(state.trackId);
    // Every space directly ahead of this car in its own lane — almost always
    // one, but a fork can offer more than one tile under the same lane number.
    // Traffic ignored: a car in the way is the thing being looked for.
    const directlyAhead = stepsFrom(track, ps.row, ps.lane).filter(next => next.lane === ps.lane);
    const ahead = [...playerStates(state)].some(([otherId, other]) => {
        if (otherId === userId) return false;
        if (!directlyAhead.some(next => next.row === other.row && next.lane === other.lane)) return false;
        // The car ahead clears the minimum, and the trailing car is at least as
        // fast — `ps.gear >= other.gear >= SLIPSTREAM_MIN_GEAR` already proves
        // the trailing car clears it too, so there is nothing left to check there.
        return other.gear >= SLIPSTREAM_MIN_GEAR && ps.gear >= other.gear;
    });
    if (!ahead) return false;

    const options = slipstreamMoveOptions(state, userId);
    return !options.boxedIn && options.spaces.length > 0;
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

/**
 * §4.2's classification: the whole field in finishing order, the winner first.
 *
 * Classification is **not** a tie-break for the win — §4.1's win is an event in
 * play order, and this is only what the result page and the match record
 * report. So the winner is placed by having crossed rather than by having the
 * most track progress, and everybody else is ordered by §15's own sort: laps,
 * then row, then the round they were in when it ended.
 *
 * Written once, for everyone, at the ending: no round ever contains a finished
 * driver, because the race stops the instant a car crosses.
 */
export function classification(state: IRaceCarsSpecificGameState, winnerId: string): string[] {
    return [winnerId, ...recomputeRoundOrder(state).filter(userId => userId !== winnerId)];
}

// ─── The conservative line (§23.7 PR 6) ─────────────────────────────────────

export type RaceCarsConservativeTurn =
    | { phase: 'start' }
    | { phase: 'shift'; gear: RaceCarsGear }
    | { phase: 'move'; brake: number; destination: RaceCarsSpace }
    | { phase: 'slipstream'; tow: RaceCarsSpace | null };

/**
 * Spaces of overshoot §10 would charge a car for driving this path — the same
 * reading `resolveArrival` charges, run over a path nobody has committed to yet.
 */
function overshootAlong(
    track: RaceCarsTrack,
    ps: IRaceCarsPlayerState,
    path: RaceCarsSpace[],
    waivedCornerId: string | null,
): number {
    let stops = ps.cornerStops;
    let charged = 0;
    for (const crossing of cornerExits(track, path)) {
        const settled = settleCorner(crossing.corner, stops, waivedCornerId, crossing.spacesPast);
        if (settled.outcome === 'charged') charged += settled.spaces;
        // Banked stops reset the moment a corner is legally left (§10).
        stops = 0;
    }
    return charged;
}

/** One end this move could take, priced in the two currencies the plan weighs. */
interface RaceCarsPlannedMove {
    destination: RaceCarsSpace;
    /** Spaces of overshoot §10 would charge for finishing here. */
    overshoot: number;
    /** Slicks the route that crosses fewest of them crosses (§14). */
    slicks: number;
}

interface RaceCarsPlannedMoves {
    /** Every legal end, cheapest first: fewest slicks, then lane, then row. */
    moves: RaceCarsPlannedMove[];
    blockedShort: boolean;
    boxedIn: boolean;
}

/**
 * Every end this move could take, each one priced for overshoot and oil.
 *
 * One walk, one path read per destination — which is what lets the plan pick
 * the line that gets away with a roll rather than reject the whole roll because
 * some *other* line through the same corner would have overshot. Where a
 * corner's lanes run out of step (§5.1) those are different numbers, and the
 * driver chooses which of them they take.
 *
 * `traffic: false` prices the open road, which is the honest question to ask
 * about a gear that has not been rolled yet: the cars in the way will have
 * moved by the time it is.
 */
function plannedMoves(
    state: IRaceCarsSpecificGameState,
    userId: string,
    distance: number,
    options: { traffic?: boolean; waiveUnavoidableCorner?: boolean } = {},
): RaceCarsPlannedMoves {
    const ps = requirePlayer(state, userId);
    const track = trackById(state.trackId);
    const walked = walk(state, userId, distance, options.traffic === false ? new Set<string>() : undefined);
    const waivedCornerId = (options.waiveUnavoidableCorner ?? true)
        ? waivedCornerIdAt(track, ps.row, ps.lane)
        : null;

    const moves = [...walked.levels[walked.distance]].map(([key, node]) => ({
        destination: node.space,
        slicks: node.slicks,
        overshoot: overshootAlong(track, ps, readPath(walked, key), waivedCornerId),
    }));

    // Sorted rather than picked at random: a cron-driven turn becomes a command
    // in the log, and a plan that depends on map iteration order is a plan that
    // replays differently from the one that was played.
    moves.sort((a, b) => a.slicks - b.slicks
        || a.destination.lane - b.destination.lane
        || a.destination.row - b.destination.row);

    return {
        moves,
        blockedShort: walked.distance > 0 && walked.distance < walked.requested,
        boxedIn: walked.distance === 0,
    };
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
 * that never climbs never leaves first, and The Mile alone would then take a
 * driver eleven turns — which §23.8's turn-count assertion is there to catch.
 */
/** The highest legal gear whose best roll cannot overshoot down any line — see the note above. */
function planShift(state: IRaceCarsSpecificGameState, userId: string): RaceCarsConservativeTurn {
    const options = legalGears(state, userId);
    const safe = options.filter(option => {
        const planned = plannedMoves(state, userId, gearDef(option.gear).max, { traffic: false });
        return planned.moves.every(move => move.overshoot === 0);
    });
    const chosen = safe.length > 0 ? safe[safe.length - 1] : options[0];
    // `legalGears` is never empty — holding the current gear is always free, and
    // gear 0 can always take first — but gear 1 is the answer if it ever became so.
    return { phase: 'shift', gear: chosen ? chosen.gear : 1 };
}

/** The fewest brakes that avoid an overshoot, else the cheapest overshoot going. */
function planMove(state: IRaceCarsSpecificGameState, userId: string): RaceCarsConservativeTurn {
    const ps = requirePlayer(state, userId);
    // `phase` is the authority and `roll` follows it (§23.4). A move phase with
    // no roll is a bug upstream; one space keeps this function total.
    const roll = ps.roll ?? MIN_MOVE_STEPS;
    const mostBrakes = Math.min(ps.brakes, Math.max(0, roll - MIN_MOVE_STEPS));

    // Crossing oil is the tie-break rather than a veto: a certain overshoot is
    // worse than a one-in-six chance of a spin.
    let oily: RaceCarsConservativeTurn | null = null;
    for (let brake = 0; brake <= mostBrakes; brake++) {
        const clean = plannedMoves(state, userId, roll - brake).moves.filter(move => move.overshoot === 0);
        if (clean.length === 0) continue;
        // Already ordered by slicks, so the first clean end is the driest one.
        if (clean[0].slicks === 0) return { phase: 'move', brake, destination: clean[0].destination };
        oily = oily ?? { phase: 'move', brake, destination: clean[0].destination };
    }
    if (oily) return oily;

    // Nothing this roll can reach gets away with the corner, so take the end
    // that is charged least — the shortest the brake pool can buy, and the line
    // through it that leaves the car fewest spaces past the corner.
    const forced = [...plannedMoves(state, userId, roll - mostBrakes).moves]
        .sort((a, b) => a.overshoot - b.overshoot)[0];
    // The walk always holds the car's own space at level 0, so it is never empty.
    return { phase: 'move', brake: mostBrakes, destination: forced.destination };
}

/** Take the tow only if it is free: three spaces in a braking zone are three spaces of overshoot. */
function planTow(state: IRaceCarsSpecificGameState, userId: string): RaceCarsConservativeTurn {
    if (!slipstreamOffered(state, userId)) return { phase: 'slipstream', tow: null };
    // §12's tow gets no waiver, so the plan is priced the way `resolveArrival`
    // will price it — otherwise the one board state where the two disagree is
    // the one where the cron takes a free tow into a corner and pays for it.
    const planned = plannedMoves(state, userId, SLIPSTREAM_STEPS, { waiveUnavoidableCorner: false });
    // Legal destinations only: `slipstreamOffered` proves at least one exists,
    // but the cheapest overshoot/slicks candidate can still be one that reaches
    // into a corner with no brake left to pay for it (§12).
    const legal = new Set(slipstreamMoveOptions(state, userId).spaces.map(space => spaceKey(space.row, space.lane)));
    const free = planned.moves.find(move =>
        move.overshoot === 0 && move.slicks === 0 && legal.has(spaceKey(move.destination.row, move.destination.lane)));
    return { phase: 'slipstream', tow: planned.blockedShort || !free ? null : free.destination };
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
    // §6a's getaway is a die and nothing else — there is no conservative way to
    // throw it, and a driver who lets the startup round time out still has to
    // throw it before anybody can take a turn. Left to the same command every
    // other driver sends, so a stalled start reached this way is the same
    // stalled start reached by tapping.
    if (ps.phase === 'start') return { phase: 'start' };
    if (ps.phase === 'shift') return planShift(state, userId);
    if (ps.phase === 'move') return planMove(state, userId);
    return planTow(state, userId);
}
