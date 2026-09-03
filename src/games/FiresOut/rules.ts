// Pure, isomorphic Fires Out rules: the fire system (§9), knock-downs and lost
// POIs (§10), and the AP economy (§8) from docs/games/fires-out-gdd.md. No
// server-only imports — FiresOutLogic.ts's commands call these functions
// rather than duplicating the logic, and a future action picker can import
// them directly for reachability/legality hints, the same contract every
// other game's rules.ts holds (docs/new-game.md, "Isomorphic rules modules").
//
// §17.4: randomness is taken as an injected `nextRoll` callback rather than
// called directly (`DiceRoll` from @/utils/games/DiceRoll), which is what
// keeps this module both replayable (the command layer's recorded-roll
// cursor decides what nextRoll returns) and testable with scripted dice.
import {
    COLS,
    colOf,
    DAMAGE_TO_COLLAPSE,
    DifficultyId,
    difficultyTier,
    EDGE_COUNT,
    EDGE_DEFS,
    EdgeDef,
    EdgeKind,
    edgeBetween,
    exteriorBottomSpace,
    exteriorLeftSpace,
    exteriorRightSpace,
    exteriorTopSpace,
    FALSE_ALARM_POI_COUNT,
    FAMILY_STARTING_FIRE,
    FAMILY_STARTING_POI,
    INTERIOR_SPACE_COUNT,
    isExteriorSpace,
    isInteriorSpace,
    neighboursOf,
    Quadrant,
    quadrantOf,
    rowOf,
    ROWS,
    RulesetId,
    spaceForRoll,
    spaceIndex,
    spacePhrase,
    SPACE_COUNT,
    spacesInQuadrant,
    START_SPACE,
    TOTAL_HOTSPOT_MARKERS,
    perimeterNeighbours,
    VICTIM_POI_COUNT,
    VICTIMS_LOST_TO_LOSE,
    VICTIMS_TO_WIN,
} from "./board";
import { shuffle } from "@/utils/games/shuffle";

// ─── Firefighter / turn shape ───────────────────────────────────────────────

// §11: declared now (rather than at the Specialists step, 17.6 step 10) so the
// firefighter shape doesn't change persisted schema eight commits from now.
// Family setup never assigns anything but 'generalist'.
export type SpecialistId =
    | 'generalist' | 'fireCaptain' | 'rescueSpecialist' | 'cafsFirefighter'
    | 'paramedic' | 'imagingTechnician' | 'driverOperator' | 'hazmatTechnician';

export type RestrictedApKind = 'command' | 'moveChop' | 'extinguish';

export interface IFiresOutFirefighterState {
    ownerId: string;
    space: number;
    specialist: SpecialistId;
    apLeft: number;
    restrictedAp: { kind: RestrictedApKind; left: number } | null;
    bankedAp: number; // 0..MAX_BANKED_AP
    // 'escort' (§11 Paramedic, §17.6 step 10): a revealed victim `treat`ed
    // rather than carried — walks alongside at the ordinary move cost (§8)
    // instead of costing carryPerSpace, but still counts as "carrying
    // something" for canMoveTo's into-fire block and applyMove's rescue check.
    carrying: 'victim' | 'hazmat' | 'escort' | null;
}

/** §7 Phase 1, §8: 4 AP per turn plus up to `MAX_BANKED_AP` carried over — the Family game's flat allowance, and the Experienced game's before any specialist modifies it (see SPECIALISTS below). */
export const AP_PER_TURN = 4;
export const MAX_BANKED_AP = 4;

export function newFirefighter(ownerId: string, space: number = START_SPACE): IFiresOutFirefighterState {
    return {
        ownerId,
        space,
        specialist: 'generalist',
        apLeft: AP_PER_TURN,
        restrictedAp: null,
        bankedAp: 0,
        carrying: null,
    };
}

// ─── Specialists (§11, §17.6 step 10) ───────────────────────────────────────
// Static reference data only — dealt in FiresOutModels.buildInitialFiresOutState
// and expressed as small pure exceptions to the base rules below, rather than
// as `if (specialist === ...)` branches sprayed through FiresOutLogic.ts's
// Execute methods (mirrors Outbreak's ROLES/roleDef, board.ts:300-337).
//
// `specialist` is always populated on a firefighter, including in the Family
// game, where it stays the meaningless 'generalist' placeholder every
// firefighter is built with (§6.1 step 7 sets Specialist cards aside — same
// "always populated, meaningless in Family" pattern as `difficulty`). So
// every specialist-driven number below is read only when `ruleset ===
// 'experienced'` (see refillFirefighterAp) — a Family-game firefighter's
// `specialist` field is never fed through SPECIALISTS at all.

export interface ISpecialistDef {
    id: SpecialistId;
    label: string;
    /** §8: total AP allowance once dealt — the printed 4 AP base already folded in. */
    baseAp: number;
    restrictedAp: { kind: RestrictedApKind; amount: number } | null;
    /** Player-facing: what the card does at the table, for the crew-change picker. No GDD references, no pronouns. */
    ability: string;
}

// All eight, dealt one per firefighter at random in the Experienced game
// (dealSpecialists) and swappable at the Engine (FiresOutLogic.ts's
// applyCrewChange). Chop/extinguish/deck-gun cost exceptions and the
// Paramedic/Imaging/Hazmat abilities that aren't AP arithmetic live in their
// own functions below rather than in this table, the same split Outbreak's
// ROLES/rules.ts uses for the Medic's auto-clear and the Dispatcher's control.
export const SPECIALISTS: ISpecialistDef[] = [
    { id: 'generalist', label: 'Generalist', baseAp: 5, restrictedAp: null,
        ability: 'No special ability — one extra AP every turn.' },
    { id: 'fireCaptain', label: 'Fire Captain', baseAp: 4, restrictedAp: { kind: 'command', amount: 2 },
        ability: "2 extra AP usable only to move a teammate's firefighter (as if it were your own) or to open/close a door." },
    { id: 'rescueSpecialist', label: 'Rescue Specialist', baseAp: 4, restrictedAp: { kind: 'moveChop', amount: 3 },
        ability: '3 extra AP usable only for moving or chopping walls — and chopping a wall costs 1 AP instead of 2.' },
    { id: 'cafsFirefighter', label: 'CAFS Firefighter', baseAp: 3, restrictedAp: { kind: 'extinguish', amount: 3 },
        ability: '3 extra AP usable only for extinguishing.' },
    { id: 'paramedic', label: 'Paramedic', baseAp: 4, restrictedAp: null,
        ability: 'Can treat a revealed victim for 1 AP so they walk alongside at 1 AP a space instead of being carried at 2. Extinguishing costs 1 AP more.' },
    { id: 'imagingTechnician', label: 'Imaging Technician', baseAp: 4, restrictedAp: null,
        ability: 'Can reveal any POI marker on the board remotely, without travelling to it.' },
    { id: 'driverOperator', label: 'Driver/Operator', baseAp: 4, restrictedAp: null,
        ability: 'Fires the deck gun for 2 AP instead of 4, and automatically re-rolls a shot that clears nothing.' },
    { id: 'hazmatTechnician', label: 'Hazmat Technician', baseAp: 4, restrictedAp: null,
        ability: 'Can remove a hazmat marker on their own space instantly, instead of carrying it out of the building.' },
];

export function specialistDef(id: SpecialistId): ISpecialistDef {
    return SPECIALISTS.find(s => s.id === id)!;
}

/** §6.2 step 7: each firefighter takes one specialist at random — mirrors Outbreak's dealRoles (rules.ts:361-366) exactly, including its "more roles than seats" slack (8 specialists, MAX_PLAYERS 6). */
export function dealSpecialists(turnOrder: string[]): Map<string, SpecialistId> {
    const shuffled = shuffle(SPECIALISTS.map(s => s.id));
    const assignment = new Map<string, SpecialistId>();
    turnOrder.forEach((userId, i) => assignment.set(userId, shuffled[i]));
    return assignment;
}

/**
 * Refills `ff`'s AP for the turn about to start: their specialist's full
 * allowance in the Experienced game (§11) or the flat AP_PER_TURN in the
 * Family game (§8), plus whatever they banked, and a freshly-full restricted
 * pool if their specialist has one — unspent restricted AP is never banked
 * (§8 only banks the general pool). Used both by FiresOutGameType.CheckEndTurn
 * (a turn handing off) and setup (a firefighter's very first turn, with
 * `bankedAp` still 0) — the one place both call so a specialist's numbers are
 * never recomputed differently in two places.
 */
export function refillFirefighterAp(ff: IFiresOutFirefighterState, ruleset: RulesetId): void {
    const def = specialistDef(ff.specialist);
    const baseAp = ruleset === 'experienced' ? def.baseAp : AP_PER_TURN;
    const restricted = ruleset === 'experienced' ? def.restrictedAp : null;
    ff.apLeft = baseAp + ff.bankedAp;
    ff.restrictedAp = restricted ? { kind: restricted.kind, left: restricted.amount } : null;
    ff.bankedAp = 0;
}

// ─── Space / edge state ─────────────────────────────────────────────────────

export type ThreatLevel = 'none' | 'smoke' | 'fire';

export interface IFiresOutPoiState {
    id: number;
    revealed: boolean;
    // Internal only — the identity a face-down "?" hides. gameStateToModel
    // must strip this whenever `revealed` is false (docs/new-game.md, "Don't
    // leak hidden information"), the same redaction Solitaire applies to a
    // face-down card's rank/suit.
    victim: boolean;
}

export interface IFiresOutSpaceState {
    threat: ThreatLevel;
    poi: IFiresOutPoiState | null;
    hazmat: boolean;
    hotspot: boolean;
}

export interface IFiresOutEdgeState {
    kind: EdgeKind;
    damage: 0 | 1 | 2;
    doorOpen: boolean;
}

export function emptySpaceState(): IFiresOutSpaceState {
    return { threat: 'none', poi: null, hazmat: false, hotspot: false };
}

export function buildEmptySpaces(): IFiresOutSpaceState[] {
    return Array.from({ length: SPACE_COUNT }, emptySpaceState);
}

export function buildEmptyEdges(): IFiresOutEdgeState[] {
    return EDGE_DEFS.map(emptyEdgeState);
}

function emptyEdgeState(def: EdgeDef): IFiresOutEdgeState {
    return { kind: def.kind, damage: 0, doorOpen: false };
}

/** The two board arrays of `specificGameState`, taken structurally so this module stays free of FiresOutModels.ts (which imports it). */
export interface IFiresOutBoard {
    spaces: IFiresOutSpaceState[];
    edges: IFiresOutEdgeState[];
}

/**
 * Grows a persisted board, in place, to the size board.ts describes today. A
 * game saved before the exterior became a full perimeter ring has shorter
 * `spaces` and `edges` arrays, and every index the ring added is — by
 * construction — an empty outdoor space or an undamaged opening, so appending
 * blanks is the whole migration. Called at the top of FiresOutAction.Execute,
 * before any rule reads either array; a no-op for every game created since.
 *
 * Deliberately additive only: the walls and doors such a game already holds
 * are left exactly as they are, even though the rooms have since been
 * re-measured against the board art. A building doesn't rearrange itself
 * halfway through a fire — and more concretely, the recap replays a game's
 * recorded commands against its own starting snapshot (utils/games/replay.ts),
 * so moving a wall under a game in flight would make its own history stop
 * being replayable. An in-flight game keeps the floorplan it was dealt; the
 * corrected one starts with the next game.
 */
export function growBoardToCurrentLayout(board: IFiresOutBoard): void {
    while (board.spaces.length < SPACE_COUNT) board.spaces.push(emptySpaceState());
    for (let id = board.edges.length; id < EDGE_COUNT; id++) board.edges.push(emptyEdgeState(EDGE_DEFS[id]));
}

/** The same growth, without touching the stored state — for read-only paths like the response builder, which has no business mutating what it serialises. Returns `board` itself when there is nothing to grow. */
export function boardAtCurrentLayout(board: IFiresOutBoard): IFiresOutBoard {
    if (board.spaces.length >= SPACE_COUNT && board.edges.length >= EDGE_COUNT) return board;
    const grown: IFiresOutBoard = { spaces: [...board.spaces], edges: [...board.edges] };
    growBoardToCurrentLayout(grown);
    return grown;
}

/** The collapse clock (§5, §17.4): derived from the edges, never a stored total. */
export function totalDamage(edges: IFiresOutEdgeState[]): number {
    return edges.reduce((sum, e) => sum + e.damage, 0);
}

export function isBuildingCollapsed(edges: IFiresOutEdgeState[]): boolean {
    return totalDamage(edges) >= DAMAGE_TO_COLLAPSE;
}

// ─── The POI pool (§10.1, §17.4) ────────────────────────────────────────────
// Shuffled once at setup and drawn in order thereafter — see
// buildInitialFiresOutState in FiresOutModels.ts, which is what makes this
// replayable (§17.4: "a pool reshuffled at each Replenish would be
// unreplayable").

/** A freshly shuffled 15-marker pool: 10 victims, 5 false alarms. */
export function shuffledPoiPool(): boolean[] {
    const pool = [
        ...Array.from({ length: VICTIM_POI_COUNT }, () => true),
        ...Array.from({ length: FALSE_ALARM_POI_COUNT }, () => false),
    ];
    return shuffle(pool);
}

/** §6.1 step 3-4: seeds the Family game's starting fire and its first 3 POIs, drawing from `poiPool` (mutated — see shuffledPoiPool). */
export function applyFamilySetup(spaces: IFiresOutSpaceState[], poiPool: boolean[]): void {
    for (const space of FAMILY_STARTING_FIRE) spaces[space].threat = 'fire';

    let nextId = 0;
    for (const space of FAMILY_STARTING_POI) {
        const victim = poiPool.shift();
        if (victim === undefined) break; // defensive — pool always has 15, more than 3
        spaces[space].poi = { id: nextId++, revealed: false, victim };
    }
}

// ─── The Experienced game's rolled setup (§6.2, §17.6 step 8) ──────────────
// RulesetId/DifficultyId/DIFFICULTY_TIERS/TOTAL_HOTSPOT_MARKERS live in
// board.ts alongside this game's other §3 component counts; this is the
// behaviour that reads them. The switch between rulesets is that one field,
// read here rather than scattered through the fire system — see
// gameStateToModel and buildInitialFiresOutState in FiresOutModels.ts for the
// other half of "one two-valued string, which is the whole mechanism".

/** §6.2 step 4: "a base number scaled by crew size (roughly 2 for a three-firefighter crew, 3 for four or more), plus 3 additional at Veteran and Heroic." The "3 additional" is difficultyTier's own `hotspotBonus` (board.ts) — the one place that number is written, so the new-game screen's difficulty description can't drift from what setup actually places. */
function hotspotsToPlace(crewSize: number, difficulty: DifficultyId): number {
    const base = crewSize <= 3 ? 2 : 3;
    return base + difficultyTier(difficulty).hotspotBonus;
}

/**
 * §6.2 step 2: seeds one initial explosion at a rolled coordinate, fully
 * resolved (including wall damage) — the building starts already
 * compromised, and differently compromised every game. Unlike a live Advance
 * Fire roll, the target need not already be on fire: the printed setup
 * assumes something has *just* gone off there, so this places the fire and
 * radiates from it in the same step rather than requiring resolveTargetSpace
 * to see existing fire first.
 */
function seedInitialExplosion(spaces: IFiresOutSpaceState[], edges: IFiresOutEdgeState[], target: number): void {
    spaces[target].threat = 'fire';
    explode(spaces, edges, target);
}

/**
 * One rolled interior space `isValid` accepts, or `null` when no space on the
 * board would satisfy `isValid` at all. Setup's own hazmat and hot spot
 * placements use this; rollTargetInQuadrant (§17.6 step 9) is the same roll
 * with a quadrant as its validity check, for the deck gun, and replenishPoi
 * (§7 Phase 3) with "clear of fire and POIs" as its own.
 *
 * The printed rule is "roll a coordinate, re-roll an invalid one", and this is
 * that rule — one roll over the legal spaces instead of a re-roll loop, which
 * is the *same* roll. `spaceForRoll` maps d6×d8 onto the 48 interior spaces
 * one-for-one, so re-rolling until the pair lands somewhere legal is a uniform
 * pick among the legal spaces, which is exactly what this is.
 *
 * Writing it as the loop cost more than a line of code. Every pair rolled is
 * recorded on the command for replay (`recordedRolls`, FiresOutLogic.ts), and
 * the late-game board is where the loop struggled: with most of the building
 * alight, a Replenish hunting three clear spaces re-rolled dozens of pairs per
 * marker — up to 386 numbers persisted for one endTurn — and after 192
 * attempts it gave up anyway, silently leaving the board short of the POIs §7
 * says it must carry. A board with nowhere legal is now answered before a die
 * leaves the hand, and a board with somewhere legal always places.
 */
export function rollValidTarget(nextRoll: NextRoll, isValid: (space: number) => boolean): number | null {
    const legal: number[] = [];
    for (let space = 0; space < INTERIOR_SPACE_COUNT; space++) {
        if (isValid(space)) legal.push(space);
    }
    if (legal.length === 0) return null;

    // Clamped, because `nextRoll` is not always a die: on replay it hands back
    // whatever the command recorded, and a recorded value that doesn't match
    // this call (a log from before this function rolled one die per placement,
    // say) would otherwise index off the end and answer `undefined` — which
    // every caller here would write into `spaces[undefined]`.
    const rolled = Math.round(nextRoll(legal.length));
    return legal[Math.min(Math.max(rolled, 1), legal.length) - 1];
}

/**
 * §6.2 steps 2-5: the Experienced game's rolled setup — initial explosions,
 * then hazmats, then hot spots, then the first 3 POIs, in that order (each
 * later placement avoids the spaces the earlier ones already claimed).
 * Vehicles (step 6) and Specialists (step 7) are later steps (9 and 10).
 * Returns the running POI id counter and the hot spot reserve left after
 * setup's own placements, both of which the caller folds into the fresh
 * specificGameState — plus `explosionLog`, one line per explosion naming what
 * it actually rolled. That's the one setup fact `CreateGame` can't recover by
 * reading the finished board afterward (the hazmat/hot spot/POI counts and
 * locations are still sitting in `spaces` once this returns, but an
 * explosion's own d6/d8 are consumed and gone the moment `spaceForRoll` turns
 * them into a target) — see `CreateGame`, which derives its hazmat/hot
 * spot/POI history lines straight off the returned `specificGameState` the
 * same way Outbreak's own `CreateGame` derives its setup facts.
 */
export function applyExperiencedSetup(
    spaces: IFiresOutSpaceState[],
    edges: IFiresOutEdgeState[],
    poiPool: boolean[],
    difficulty: DifficultyId,
    crewSize: number,
    nextRoll: NextRoll,
): { nextPoiId: number; hotspotReserve: number; explosionLog: string[] } {
    const tier = difficultyTier(difficulty);
    const explosionLog: string[] = [];

    for (let i = 0; i < tier.explosions; i++) {
        const d6 = nextRoll(6);
        const d8 = nextRoll(8);
        const target = spaceForRoll(d6, d8);
        seedInitialExplosion(spaces, edges, target);
        explosionLog.push(`Setup: explosion rolled ${d6},${d8} — ignited ${spacePhrase(target)}`);
    }

    // One hazmat per space (§6.2 step 3) — not on an already-burning space
    // (nobody would leave equipment in an active blast zone) and not
    // stacked on another hazmat.
    for (let i = 0; i < tier.hazmats; i++) {
        const target = rollValidTarget(nextRoll, space => spaces[space].threat !== 'fire' && !spaces[space].hazmat);
        if (target !== null) spaces[target].hazmat = true;
    }

    // Hot spots (§6.2 step 4) — not doubled up on a hazmat or another hot
    // spot, and not dropped into existing fire for the same reason as
    // hazmats above. Whatever isn't placed now stays in reserve for §9.4's
    // hazmat-detonation replacement.
    const toPlace = hotspotsToPlace(crewSize, difficulty);
    let placed = 0;
    for (let i = 0; i < toPlace; i++) {
        const target = rollValidTarget(nextRoll,
            space => spaces[space].threat !== 'fire' && !spaces[space].hazmat && !spaces[space].hotspot);
        if (target === null) break;
        spaces[target].hotspot = true;
        placed++;
    }

    // POIs (§6.2 step 5) — the same 3-marker placement as the Family game.
    const nextPoiId = replenishPoi(spaces, poiPool, nextRoll, 0);

    return { nextPoiId, hotspotReserve: TOTAL_HOTSPOT_MARKERS - placed, explosionLog };
}

// ─── Phase 2 — Advance Fire (§9) ────────────────────────────────────────────

export type NextRoll = (sides: number) => number;

/**
 * Whether the boundary between two adjacent spaces is open — an open
 * doorway, a doorway whose door is open, or a wall chopped twice and
 * destroyed (`isPassable`) — or `false` if they aren't adjacent at all.
 *
 * §4, §8: fire crosses a boundary on exactly the terms a firefighter does,
 * so this is the one place either asks. That shared answer is the point:
 * `isAdjacentToFire` below used a bare `neighboursOf` and ignored the
 * floorplan entirely, letting fire flash through solid walls and making §8's
 * "closed doors block fire — a genuine tactical tool" untrue, while
 * `explode` (which has always read the edge table) was correctly stopped by
 * the same wall.
 */
function passableBetween(edges: IFiresOutEdgeState[], from: number, to: number): boolean {
    const edgeId = edgeBetween(from, to);
    return edgeId !== undefined && isPassable(edges[edgeId]);
}

function isAdjacentToFire(spaces: IFiresOutSpaceState[], edges: IFiresOutEdgeState[], space: number): boolean {
    return neighboursOf(space).some(n => spaces[n].threat === 'fire' && passableBetween(edges, space, n));
}

/**
 * Where an explosion's blast (or a shockwave continuing it) goes next, one
 * step in one cardinal direction — `null` when it runs off the building with
 * nowhere to go (dissipates). Every face of the building backs onto the
 * exterior perimeter (board.ts), so a blast that leaves the grid lands on the
 * outdoor space beyond that face and stops there: an exterior space is a dead
 * end, and resolveFireConsequences puts out anything burning outside anyway.
 */
function spaceInDirection(current: number, dRow: number, dCol: number): number | null {
    if (!isInteriorSpace(current)) return null; // an exterior space is a dead end
    const row = rowOf(current) + dRow;
    const col = colOf(current) + dCol;
    if (row < 0) return exteriorTopSpace(col);
    if (row >= ROWS) return exteriorBottomSpace(col);
    if (col < 0) return exteriorLeftSpace(row);
    if (col >= COLS) return exteriorRightSpace(row);
    return spaceIndex(row, col);
}

const CARDINAL_DIRECTIONS: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];

// A shockwave can cross at most the grid's own span before it must either hit
// something or run off the board — bounds a malformed edge table instead of
// looping forever.
const MAX_SHOCKWAVE_STEPS = ROWS + COLS;

/**
 * §9.2: radiates fire from `origin` in all four directions, damaging walls,
 * destroying doors, and chaining a shockwave through any already-burning
 * spaces in its path until it reaches something it can burn.
 */
export function explode(spaces: IFiresOutSpaceState[], edges: IFiresOutEdgeState[], origin: number): void {
    for (const [dRow, dCol] of CARDINAL_DIRECTIONS) {
        let current = origin;
        for (let step = 0; step < MAX_SHOCKWAVE_STEPS; step++) {
            const target = spaceInDirection(current, dRow, dCol);
            if (target === null) break;
            const edgeId = edgeBetween(current, target);
            if (edgeId === undefined) break; // defensive — every adjacent pair has an edge

            const edge = edges[edgeId];
            if (edge.kind === 'wall' && edge.damage < 2) {
                edge.damage = (edge.damage + 1) as 0 | 1 | 2;
                break;
            }
            if (edge.kind === 'door' && !edge.doorOpen) {
                edge.kind = 'open'; // a destroyed door is permanently passable
                break;
            }

            const targetState = spaces[target];
            if (targetState.threat === 'fire') {
                current = target; // shockwave: keep going in the same direction
                continue;
            }
            targetState.threat = 'fire';
            break;
        }
    }
}

/** §9.1's four-row table, for the space the d6/d8 roll targets. */
export function resolveTargetSpace(
    spaces: IFiresOutSpaceState[],
    edges: IFiresOutEdgeState[],
    target: number,
): 'smoke' | 'fire' | 'explosion' {
    const state = spaces[target];
    if (state.threat === 'fire') {
        explode(spaces, edges, target);
        return 'explosion';
    }
    if (state.threat === 'smoke') {
        state.threat = 'fire';
        return 'fire';
    }
    if (isAdjacentToFire(spaces, edges, target)) {
        state.threat = 'fire';
        return 'fire';
    }
    state.threat = 'smoke';
    return 'smoke';
}

/** §9.3: every smoke space adjacent to fire — across a boundary fire can actually cross (passableBetween) — flips to fire, repeated to a fixpoint. */
export function flashover(spaces: IFiresOutSpaceState[], edges: IFiresOutEdgeState[]): void {
    let changed = true;
    while (changed) {
        changed = false;
        for (let space = 0; space < spaces.length; space++) {
            if (spaces[space].threat === 'smoke' && isAdjacentToFire(spaces, edges, space)) {
                spaces[space].threat = 'fire';
                changed = true;
            }
        }
    }
}

export interface IFiresOutFireConsequences {
    /** Firefighters knocked down this Advance Fire, by their index in the firefighters array. */
    knockedDownIndices: number[];
    /** Victim POIs lost to fire this Advance Fire (false alarms are removed silently). */
    victimsLost: number;
}

/**
 * §9.1 step 6: POIs caught by fire are lost, firefighters caught by fire are
 * knocked down (moved to the exterior, keeping hold of whatever they were
 * carrying — §10.3), and any fire that ended up outside the building during
 * the blast (§9.2) is put out — it isn't a threat to a structure it already
 * left.
 */
export function resolveFireConsequences(
    spaces: IFiresOutSpaceState[],
    firefighters: IFiresOutFirefighterState[],
): IFiresOutFireConsequences {
    let victimsLost = 0;
    for (let space = 0; space < INTERIOR_SPACE_COUNT; space++) {
        const state = spaces[space];
        if (state.threat !== 'fire' || !state.poi) continue;
        if (state.poi.victim) victimsLost++;
        state.poi = null;
    }

    const knockedDownIndices: number[] = [];
    firefighters.forEach((ff, index) => {
        if (spaces[ff.space].threat !== 'fire') return;
        ff.space = START_SPACE;
        // §10.3: "Any victim being carried is knocked down along with them
        // rather than lost." `carrying` therefore survives the knock-down —
        // the victim (or hazmat, or escorted victim) rides out to the
        // exterior in the firefighter's arms and still has to be walked to
        // the rescue point. Clearing it here instead used to *destroy* the
        // marker: it wasn't counted in `victimsLost`, wasn't returned to the
        // board and wasn't returned to `poiPool`, so it left the game
        // entirely. §5's arithmetic has no slack for that — 10 victims, 7 to
        // win, 4 lost to lose — so every destroyed victim pushed the win
        // condition further out of reach while the loss track stayed put,
        // and a crew could be left playing a game it could no longer win.
        knockedDownIndices.push(index);
    });

    for (let space = INTERIOR_SPACE_COUNT; space < SPACE_COUNT; space++) {
        spaces[space].threat = 'none';
    }

    return { knockedDownIndices, victimsLost };
}

export interface IFiresOutAdvanceFireResult {
    rolls: { d6: number; d8: number };
    target: number;
    resolution: 'smoke' | 'fire' | 'explosion';
    consequences: IFiresOutFireConsequences;
    /**
     * §9.4: "fire placed on a hot spot" — a hot spot this resolution's fire
     * newly reached, each triggering one more full Advance Fire, resolved
     * depth-first (a flare-up's own flare-ups appear inside it). Empty for
     * every Family game, since no space ever has `hotspot: true` there.
     */
    flareUps: IFiresOutAdvanceFireResult[];
    /** The hot spot reserve left after this resolution (and any chained flare-ups) drew from it. */
    hotspotReserve: number;
}

// The live log writes what Advance Fire just did; the recap retells the same
// roll afterwards. Tense is the only thing that ever differed between them,
// so the verbs sit in one table rather than one per caller — as two copies
// they had to be edited in lockstep and had already drifted apart.
const ADVANCE_FIRE_VERB = {
    present: { smoke: 'smoke fills', fire: 'fire catches in', explosion: 'an explosion tears through' },
    past: { smoke: 'smoke filled', fire: 'fire caught in', explosion: 'an explosion tore through' },
} as const;

/**
 * The one sentence saying what an Advance Fire roll did, in the room it did
 * it to (never a grid index — see `spaceName`). Callers add their own
 * flare-up note: the live log prefixes each chained roll as it resolves,
 * the recap counts them up at the end.
 */
export function advanceFireLine(
    rolls: { d6: number; d8: number },
    resolution: IFiresOutAdvanceFireResult['resolution'],
    target: number,
    tense: 'present' | 'past',
): string {
    return `Advance Fire: rolled ${rolls.d6},${rolls.d8} — ${ADVANCE_FIRE_VERB[tense][resolution]} ${spacePhrase(target)}`;
}

/**
 * §9.4: a hazmat caught by fire detonates immediately — the same explosion
 * §9.2 already models, radiated from the hazmat's own space — and is
 * replaced by a hot spot drawn from the reserve (none, once it runs dry).
 * Interleaved with flashover to a fixpoint: a detonation can catch a
 * smoke-filled corridor that needs flashing over, and flashover can reach a
 * space still holding a hazmat that then needs to go off — each pass can
 * feed the other, bounded by the finite number of hazmats on the board.
 */
function settleHazmatsAndFlashover(spaces: IFiresOutSpaceState[], edges: IFiresOutEdgeState[], hotspotReserve: number): number {
    let changed = true;
    while (changed) {
        changed = false;
        flashover(spaces, edges);
        for (let space = 0; space < INTERIOR_SPACE_COUNT; space++) {
            const state = spaces[space];
            if (state.threat !== 'fire' || !state.hazmat) continue;
            state.hazmat = false;
            explode(spaces, edges, space);
            if (hotspotReserve > 0) {
                state.hotspot = true;
                hotspotReserve--;
            }
            changed = true;
        }
    }
    return hotspotReserve;
}

/**
 * One full Phase 2 (§7): roll, resolve the target space, settle hazmat
 * detonations and flashover to a fixpoint, apply consequences, then chase
 * down any hot spot flare-up this resolution's fire newly reached (§9.4) —
 * each one a full, recursive re-run of this same function, consuming more
 * of `nextRoll`'s cursor. A space already on fire before this call keeps its
 * hot spot from re-triggering every single turn; only the transition to
 * fire counts as "placed".
 *
 * `claimed` is shared by reference across the whole recursive call tree for
 * one turn's Advance Fire, not reset per call: a nested flare-up's own
 * explosion/flashover chain can reach a second hot spot before its ancestor's
 * for-loop gets there, and without a tree-wide record the ancestor's *own*
 * pre-call snapshot would still say that space "wasn't fire yet" and spawn a
 * second, redundant flare-up for an ignition its descendant already resolved.
 */
export function resolveAdvanceFire(
    spaces: IFiresOutSpaceState[],
    edges: IFiresOutEdgeState[],
    firefighters: IFiresOutFirefighterState[],
    hotspotReserve: number,
    nextRoll: NextRoll,
    claimed: Set<number> = new Set(),
): IFiresOutAdvanceFireResult {
    // Both snapshotted *before* this resolution touches anything: a flare-up
    // is fire reaching a hot spot that already existed, not a hot spot a
    // hazmat detonation (below) just planted on a space that was already
    // on fire — that space's fire arrived first, so it never "was placed"
    // on the hot spot at all.
    const wasFire = spaces.map(s => s.threat === 'fire');
    const wasHotspot = spaces.map(s => s.hotspot);

    const d6 = nextRoll(6);
    const d8 = nextRoll(8);
    const target = spaceForRoll(d6, d8);
    const resolution = resolveTargetSpace(spaces, edges, target);
    let reserve = settleHazmatsAndFlashover(spaces, edges, hotspotReserve);
    const consequences = resolveFireConsequences(spaces, firefighters);

    const flareUps: IFiresOutAdvanceFireResult[] = [];
    for (let space = 0; space < INTERIOR_SPACE_COUNT; space++) {
        if (wasFire[space] || !wasHotspot[space] || spaces[space].threat !== 'fire') continue;
        if (claimed.has(space)) continue; // a nested flare-up already resolved this ignition
        claimed.add(space);
        const flareUp = resolveAdvanceFire(spaces, edges, firefighters, reserve, nextRoll, claimed);
        reserve = flareUp.hotspotReserve;
        flareUps.push(flareUp);
    }

    return { rolls: { d6, d8 }, target, resolution, consequences, flareUps, hotspotReserve: reserve };
}

// ─── Phase 3 — Replenish POI (§7) ───────────────────────────────────────────

/** §7: how many POI markers Phase 3 keeps on the board. */
export const POI_TARGET_ON_BOARD = 3;

/** Interior spaces Replenish may target: no fire, no existing POI. */
function isValidReplenishTarget(spaces: IFiresOutSpaceState[], space: number): boolean {
    const state = spaces[space];
    return state.threat !== 'fire' && !state.poi;
}

export function poiCountOnBoard(spaces: IFiresOutSpaceState[]): number {
    let count = 0;
    for (let space = 0; space < INTERIOR_SPACE_COUNT; space++) {
        if (spaces[space].poi) count++;
    }
    return count;
}

/** §7 Phase 3's "while fewer than 3 POIs are on the board": whether another
 *  marker is wanted and there is one left in the pool to place. The loop
 *  below runs on it, and applyEndTurn asks the same question to tell "Phase 3
 *  had nothing to do" from "Phase 3 had nowhere to do it". */
export function poiReplenishWanted(spaces: IFiresOutSpaceState[], poiPool: boolean[]): boolean {
    return poiCountOnBoard(spaces) < POI_TARGET_ON_BOARD && poiPool.length > 0;
}

/**
 * §7 Phase 3: while fewer than 3 POIs are on the board, roll for a space and
 * place the next marker off `poiPool`. Mutates `spaces` and `poiPool`, and
 * hands back the running POI id counter (the id `applyFamilySetup` already
 * started).
 *
 * Where to put one is rollValidTarget's question, not a second copy of it, so
 * this stops for exactly three reasons: the board is up to 3, the pool has run
 * dry, or there is nowhere clear left to put one. Only the last leaves the
 * board short, and applyEndTurn says so rather than dropping it. Each pass
 * either places a marker or breaks, so there are at most three passes.
 */
export function replenishPoi(
    spaces: IFiresOutSpaceState[],
    poiPool: boolean[],
    nextRoll: NextRoll,
    nextPoiId: number,
): number {
    while (poiReplenishWanted(spaces, poiPool)) {
        const target = rollValidTarget(nextRoll, space => isValidReplenishTarget(spaces, space));
        if (target === null) break;
        const victim = poiPool.shift()!;
        spaces[target].poi = { id: nextPoiId++, revealed: false, victim };
    }
    return nextPoiId;
}

// ─── §5 end conditions ───────────────────────────────────────────────────────

export type FiresOutOutcome = 'win' | 'buildingCollapsed' | 'tooManyVictimsLost' | null;

export function checkOutcome(rescued: number, lost: number, edges: IFiresOutEdgeState[]): FiresOutOutcome {
    if (rescued >= VICTIMS_TO_WIN) return 'win';
    if (lost >= VICTIMS_LOST_TO_LOSE) return 'tooManyVictimsLost';
    if (isBuildingCollapsed(edges)) return 'buildingCollapsed';
    return null;
}

// ─── §8 the AP economy ───────────────────────────────────────────────────────

export const AP_COSTS = {
    move: 1,
    moveIntoFire: 2,
    carryPerSpace: 2,
    door: 1,
    extinguish: 1,
    chop: 2,
    drive: 2,
    deckGun: 4,
    // §11, §17.6 step 10 — flat costs the table gives directly: 'Treats a
    // victim for 1 AP', 'Crew change ... 2 AP'. Imaging Technician's remote
    // reveal and the Hazmat Technician's on-site removal have no printed AP
    // cost (unlike every other §8 row); priced here at 1 AP each, the same
    // as extinguish — the cheapest existing utility action — rather than
    // left free, since a free repeatable action would sit outside the AP
    // economy every other action in this game answers to.
    reveal: 1,
    treat: 1,
    crewChange: 2,
    disposeHazmatOnSite: 1,
    // Specialist-modified costs (chop, extinguish, the deck gun) are
    // resolved by chopApCost/extinguishApCost/deckGunApCost below rather
    // than living here — this table stays the unmodified baseline every one
    // of those functions falls back to.
} as const;

/**
 * Spends `cost` AP from `ff`, preferring its restricted pool when `kind`
 * matches it (§17.4: "one spendAp(firefighter, cost, actionKind) decides
 * which pool pays" — every spend site already knows its own action kind, so
 * no action needs a "which pool" argument beyond this). Returns false and
 * mutates nothing if the firefighter can't afford it. Only a firefighter
 * dealt a specialist with a restrictedAp pool (§11, §17.6 step 10) ever has
 * `ff.restrictedAp` non-null, so `kind` is a no-op for everyone else — this
 * is still the one place that decides.
 */
export function canAffordAp(ff: IFiresOutFirefighterState, cost: number, kind: RestrictedApKind | null): boolean {
    const restricted = ff.restrictedAp && kind && ff.restrictedAp.kind === kind ? ff.restrictedAp.left : 0;
    return ff.apLeft + restricted >= cost;
}

export function spendAp(ff: IFiresOutFirefighterState, cost: number, kind: RestrictedApKind | null): boolean {
    if (!canAffordAp(ff, cost, kind)) return false;
    if (ff.restrictedAp && kind && ff.restrictedAp.kind === kind) {
        const fromRestricted = Math.min(ff.restrictedAp.left, cost);
        ff.restrictedAp.left -= fromRestricted;
        cost -= fromRestricted;
    }
    ff.apLeft -= cost;
    return true;
}

/** Whether an edge between two adjacent spaces currently permits movement through it. */
export function isPassable(edge: IFiresOutEdgeState): boolean {
    if (edge.kind === 'wall') return edge.damage >= 2; // destroyed
    if (edge.kind === 'door') return edge.doorOpen;
    return true; // open
}

// Movement/extinguish legality never reads anything off a space but its
// threat level — narrower than IFiresOutSpaceState, so the client's redacted
// wire shape (IFiresOutSpaceResponse, apiModels.ts — whose poi may lack
// `victim`) satisfies it too. That's what lets the board reuse these exact
// checks for its own legal-target highlighting (below) with no adapter
// between the wire shape and the internal one.
type SpacesWithThreat = readonly { threat: ThreatLevel }[];
// Same trick for the two §11 abilities that read a POI or a hazmat flag
// rather than threat — legalRevealTargets only needs to know a marker is
// unrevealed (never its identity), and canTreat only reads `victim` once
// `revealed` is true, which is exactly when the client's own redacted
// response carries it. Neither ever needs the full internal IFiresOutSpaceState.
type SpacesWithPoi = readonly { poi: { revealed: boolean; victim?: boolean } | null }[];
type SpacesWithHazmat = readonly { hazmat: boolean }[];

/**
 * §8: what moving from `from` to an adjacent `to` costs, given whether `ff`
 * is carrying something. Ignores whether the move is otherwise legal (see
 * canMoveTo). An escorted victim (§11 Paramedic) walks under their own power
 * — the ordinary per-space rate, not carryPerSpace — which is the entire
 * point of treating them in the first place.
 */
export function moveApCost(spaces: SpacesWithThreat, ff: IFiresOutFirefighterState, to: number): number {
    if (ff.carrying === 'victim' || ff.carrying === 'hazmat') return AP_COSTS.carryPerSpace;
    return spaces[to].threat === 'fire' ? AP_COSTS.moveIntoFire : AP_COSTS.move;
}

// ─── Specialist-modified costs (§11, §17.6 step 10) ─────────────────────────
// Small, named exceptions to the flat AP_COSTS table — every call site
// already knows which firefighter is paying, so each of these takes `ff` and
// falls back to the unmodified cost for anyone without the specialist. Only
// `specialist` is ever read, so these take that alone rather than a full
// firefighter — which is what lets the AP-hint text in FiresOutActions.tsx
// call them with just `{ specialist }`, live as a player swaps cards,
// without needing a whole (possibly stale) firefighter object.
type HasSpecialist = { specialist: SpecialistId };

/** Rescue Specialist (§11): chops a wall for 1 AP instead of 2. */
export function chopApCost(ff: HasSpecialist): number {
    return ff.specialist === 'rescueSpecialist' ? 1 : AP_COSTS.chop;
}

/**
 * Paramedic (§11): "pays extra to extinguish" — no number is printed, so
 * this reads it as +1 AP (2 total) rather than, say, doubling it: the
 * Paramedic's whole design is a trade (fast rescues, weak firefighting), not
 * a firefighting penalty severe enough to make extinguishing impractical for
 * them — the smallest surcharge that's still a real cost is the one that
 * keeps the trade-off legible rather than punitive.
 */
export function extinguishApCost(ff: HasSpecialist): number {
    return ff.specialist === 'paramedic' ? AP_COSTS.extinguish + 1 : AP_COSTS.extinguish;
}

/** Driver/Operator (§11, §12.3): fires the deck gun for 2 AP instead of 4. */
export function deckGunApCost(ff: HasSpecialist): number {
    return ff.specialist === 'driverOperator' ? 2 : AP_COSTS.deckGun;
}

/**
 * §8: whether `ff` may step from `from` to the adjacent `to` — connected by a
 * passable edge, and not carrying or escorting anyone into fire.
 */
export function canMoveTo(
    spaces: SpacesWithThreat,
    edges: IFiresOutEdgeState[],
    ff: IFiresOutFirefighterState,
    from: number,
    to: number,
): boolean {
    if (!passableBetween(edges, from, to)) return false;
    if (ff.carrying && spaces[to].threat === 'fire') return false;
    return true;
}

// ─── Reachability — what a board click can legally target (§17.6 step 5) ───
// Mirrors FiresOutLogic.ts's own Execute checks exactly (canMoveTo/
// moveApCost, edge kind, canAffordAp), so the board never highlights a
// target the server would then reject — this module's header comment
// promises the client "what an action costs and what is reachable", and
// this is that promise kept for the board's own click targets.

/** §8, §10.2: adjacent spaces `ff` may move to right now — `carrying` is
 * whether this move would leave them carrying a victim (already carrying,
 * or picking one up as they leave their own space), the same "as if
 * carrying" firefighter applyMove checks against. */
export function legalMoveTargets(
    spaces: SpacesWithThreat,
    edges: IFiresOutEdgeState[],
    ff: IFiresOutFirefighterState,
    carrying: boolean,
): number[] {
    const asIf: IFiresOutFirefighterState = carrying ? { ...ff, carrying: 'victim' } : ff;
    return neighboursOf(ff.space).filter(to =>
        canMoveTo(spaces, edges, asIf, ff.space, to) && canAffordAp(ff, moveApCost(spaces, asIf, to), 'moveChop'));
}

/** §8: adjacent doors `ff` can afford to open or close — funded by a Fire Captain's command AP first (§11), general AP for everyone else. */
export function legalDoorTargets(edges: IFiresOutEdgeState[], ff: IFiresOutFirefighterState): number[] {
    if (!canAffordAp(ff, AP_COSTS.door, 'command')) return [];
    return neighboursOf(ff.space).filter(to => {
        const edgeId = edgeBetween(ff.space, to);
        return edgeId !== undefined && edges[edgeId].kind === 'door';
    });
}

/** §8, §11: `ff`'s own space plus any adjacent space carrying smoke or fire, that `ff` can afford to extinguish — a CAFS Firefighter's extinguish AP first, a Paramedic's higher cost, the flat rate for everyone else. */
export function legalExtinguishTargets(spaces: SpacesWithThreat, ff: IFiresOutFirefighterState): number[] {
    if (!canAffordAp(ff, extinguishApCost(ff), 'extinguish')) return [];
    return [ff.space, ...neighboursOf(ff.space)].filter(space => spaces[space].threat !== 'none');
}

/** §8, §9.2, §11: adjacent undestroyed walls `ff` can afford to chop — a Rescue Specialist's discounted cost and move/chop AP first, the flat rate for everyone else. */
export function legalChopTargets(edges: IFiresOutEdgeState[], ff: IFiresOutFirefighterState): number[] {
    if (!canAffordAp(ff, chopApCost(ff), 'moveChop')) return [];
    return neighboursOf(ff.space).filter(to => {
        const edgeId = edgeBetween(ff.space, to);
        return edgeId !== undefined && edges[edgeId].kind === 'wall' && edges[edgeId].damage < 2;
    });
}

// ─── Vehicles (§12, §17.6 step 9) ───────────────────────────────────────────
// Experienced only (§6.1 step 7: Family sets vehicles aside); FiresOutLogic.ts
// gates both 'drive' and 'deckGun' on `gs.ruleset === 'experienced'` the same
// way it would any other Family/Experienced difference.

/** §10.2: the Family game rescues at any exterior space; the Experienced game requires reaching the Ambulance specifically, wherever it's currently parked. */
export function isRescuePoint(ruleset: RulesetId, ambulance: number, space: number): boolean {
    if (!isExteriorSpace(space)) return false;
    return ruleset === 'family' || space === ambulance;
}

export type VehicleId = 'engine' | 'ambulance';

/** Where the two vehicles are parked — the two fields of `specificGameState` §12 cares about, taken structurally so this module stays free of FiresOutModels.ts (which imports it). */
export interface IFiresOutParking {
    engine: number;
    ambulance: number;
}

/** §6.2 step 6: the spot the *other* vehicle occupies, which the one being driven has to keep off now that the perimeter is one connected ring. */
export function otherVehicleSpace(parking: IFiresOutParking, vehicle: VehicleId): number {
    return parking[vehicle === 'engine' ? 'ambulance' : 'engine'];
}

/** §8, §12.1: adjacent parking spots `ff` can afford to drive `vehicle` to — only from the vehicle's own space, one step along the perimeter (perimeterNeighbours), and never onto the other vehicle's spot. Mirrors FiresOutLogic.ts's own Execute check, the same contract as this section's header comment. */
export function legalDriveTargets(ff: IFiresOutFirefighterState, parking: IFiresOutParking, vehicle: VehicleId): number[] {
    const vehicleSpace = parking[vehicle];
    if (ff.space !== vehicleSpace || !canAffordAp(ff, AP_COSTS.drive, null)) return [];
    const blocked = otherVehicleSpace(parking, vehicle);
    return perimeterNeighbours(vehicleSpace).filter(spot => spot !== blocked);
}

function quadrantHasFirefighter(firefighters: IFiresOutFirefighterState[], quadrant: Quadrant): boolean {
    return firefighters.some(f => isInteriorSpace(f.space) && quadrantOf(f.space) === quadrant);
}

/** §12.3: whether `ff` (from the Engine) may fire the deck gun into `target`'s quadrant — the quadrant must hold no firefighter at all, not just be clear of `ff` themselves. */
export function canFireDeckGunAt(
    firefighters: IFiresOutFirefighterState[],
    ff: IFiresOutFirefighterState,
    engineSpace: number,
    target: number,
): boolean {
    if (ff.space !== engineSpace || !isInteriorSpace(target)) return false;
    return !quadrantHasFirefighter(firefighters, quadrantOf(target));
}

/** §12.3: every interior space `ff` could click to fire the deck gun at — i.e. every space in a quadrant with no firefighter in it. The actual target within that quadrant is rolled (rollTargetInQuadrant), so this is a click surface, not a preview of where the shot lands. */
export function legalDeckGunTargets(firefighters: IFiresOutFirefighterState[], ff: IFiresOutFirefighterState, engineSpace: number): number[] {
    if (ff.space !== engineSpace || !canAffordAp(ff, deckGunApCost(ff), null)) return [];
    const targets: number[] = [];
    for (let space = 0; space < INTERIOR_SPACE_COUNT; space++) {
        if (canFireDeckGunAt(firefighters, ff, engineSpace, space)) targets.push(space);
    }
    return targets;
}

/** §12.3: "roll for a target space within it" — rollValidTarget rolls one of the quadrant's own spaces. A quadrant always holds spaces, so the `??` is only there to answer its `number | null`. */
export function rollTargetInQuadrant(quadrant: Quadrant, nextRoll: NextRoll): number {
    return rollValidTarget(nextRoll, space => quadrantOf(space) === quadrant) ?? spacesInQuadrant(quadrant)[0];
}

export interface IFiresOutDeckGunResult {
    quadrant: Quadrant;
    target: number;
    /** Spaces that actually had something to clear — a strict subset of target + its orthogonal neighbours. */
    clearedSpaces: number[];
}

/** §12.3: fire the deck gun into `quadrant` — rolls the actual target, then removes fire and smoke from it and its orthogonal neighbours (interior only; a target on the grid's edge simply has fewer neighbours to clear). */
export function fireDeckGun(spaces: IFiresOutSpaceState[], quadrant: Quadrant, nextRoll: NextRoll): IFiresOutDeckGunResult {
    const target = rollTargetInQuadrant(quadrant, nextRoll);
    const clearedSpaces: number[] = [];
    for (const space of [target, ...neighboursOf(target).filter(isInteriorSpace)]) {
        if (spaces[space].threat !== 'none') {
            spaces[space].threat = 'none';
            clearedSpaces.push(space);
        }
    }
    return { quadrant, target, clearedSpaces };
}

// ─── The four non-AP-arithmetic abilities (§11, §17.6 step 10) ─────────────

/** Fire Captain (§11): may act on another firefighter's pawn as if it were their own, spending their own AP — mirrors Outbreak's dispatcherCanControlOthers (rules.ts:410-412). */
export function fireCaptainCanControlOthers(specialist: SpecialistId): boolean {
    return specialist === 'fireCaptain';
}

/**
 * §10.1: flips a face-down POI at `target` — a false alarm vanishes, a
 * victim stays as a marker — and returns whether it was a victim, or `null`
 * if there was nothing unrevealed there to flip. Shared by applyMove's
 * arrive-and-reveal (FiresOutLogic.ts) and the Imaging Technician's remote
 * `reveal` action, so the one §10.1 rule ("a false alarm is simply removed")
 * isn't written twice.
 */
export function revealPoiAt(spaces: IFiresOutSpaceState[], target: number): { victim: boolean } | null {
    const poi = spaces[target].poi;
    if (!poi || poi.revealed) return null;
    poi.revealed = true;
    const victim = poi.victim;
    if (!victim) spaces[target].poi = null;
    return { victim };
}

/** Imaging Technician (§11): every interior space holding an unrevealed POI, affordable right now. No range limit — the whole point is not having to travel. */
export function legalRevealTargets(spaces: SpacesWithPoi, ff: IFiresOutFirefighterState): number[] {
    if (ff.specialist !== 'imagingTechnician' || !canAffordAp(ff, AP_COSTS.reveal, null)) return [];
    const targets: number[] = [];
    for (let space = 0; space < INTERIOR_SPACE_COUNT; space++) {
        const poi = spaces[space].poi;
        if (poi && !poi.revealed) targets.push(space);
    }
    return targets;
}

/** Paramedic (§11): whether `ff` can treat a revealed victim right now — one sits on their own space, unrevealed already ruled out, and they aren't already carrying/escorting someone. */
export function canTreat(spaces: SpacesWithPoi, ff: IFiresOutFirefighterState): boolean {
    if (ff.specialist !== 'paramedic' || ff.carrying !== null || !canAffordAp(ff, AP_COSTS.treat, null)) return false;
    const poi = spaces[ff.space].poi;
    return !!(poi && poi.revealed && poi.victim);
}

/** Hazmat Technician (§11): whether `ff` can remove the hazmat on their own space on the spot, rather than carrying it out. */
export function canDisposeHazmatOnSite(spaces: SpacesWithHazmat, ff: IFiresOutFirefighterState): boolean {
    return ff.specialist === 'hazmatTechnician' && spaces[ff.space].hazmat && canAffordAp(ff, AP_COSTS.disposeHazmatOnSite, null);
}

/** §8: whether `ff` can swap Specialist cards right now — must begin the turn at the Engine (Experienced only; Family has no vehicles or cards to swap). */
export function canCrewChange(ruleset: RulesetId, ff: IFiresOutFirefighterState, engineSpace: number): boolean {
    return ruleset === 'experienced' && ff.space === engineSpace && canAffordAp(ff, AP_COSTS.crewChange, null);
}
