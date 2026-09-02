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
    EDGE_DEFS,
    EdgeKind,
    edgeBetween,
    EXTERIOR_TOP_START,
    FALSE_ALARM_POI_COUNT,
    FAMILY_STARTING_FIRE,
    FAMILY_STARTING_POI,
    INTERIOR_SPACE_COUNT,
    isInteriorSpace,
    neighboursOf,
    rowOf,
    ROWS,
    spaceForRoll,
    spaceIndex,
    SPACE_COUNT,
    START_SPACE,
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
    carrying: 'victim' | 'hazmat' | null;
}

/** §7 Phase 1, §8: 4 AP per turn plus up to `MAX_BANKED_AP` carried over. */
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
    return EDGE_DEFS.map(def => ({ kind: def.kind, damage: 0, doorOpen: false }));
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

// ─── Phase 2 — Advance Fire (§9) ────────────────────────────────────────────

export type NextRoll = (sides: number) => number;

function isAdjacentToFire(spaces: IFiresOutSpaceState[], space: number): boolean {
    return neighboursOf(space).some(n => spaces[n].threat === 'fire');
}

/**
 * Where an explosion's blast (or a shockwave continuing it) goes next, one
 * step in one cardinal direction — `null` when it runs off the building with
 * nowhere to go (dissipates). Only the top and bottom rows connect to the
 * exterior track (§3's simplified entry model, see board.ts); running off the
 * left or right edge of the grid simply has no target.
 */
function spaceInDirection(current: number, dRow: number, dCol: number): number | null {
    if (!isInteriorSpace(current)) return null; // an exterior space is a dead end
    const col = colOf(current) + dCol;
    if (col < 0 || col >= COLS) return null;
    const row = rowOf(current) + dRow;
    if (row < 0) return EXTERIOR_TOP_START + col;
    if (row >= ROWS) return EXTERIOR_TOP_START + COLS + col;
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
    if (isAdjacentToFire(spaces, target)) {
        state.threat = 'fire';
        return 'fire';
    }
    state.threat = 'smoke';
    return 'smoke';
}

/** §9.3: every smoke space adjacent to fire flips to fire, repeated to a fixpoint. */
export function flashover(spaces: IFiresOutSpaceState[]): void {
    let changed = true;
    while (changed) {
        changed = false;
        for (let space = 0; space < spaces.length; space++) {
            if (spaces[space].threat === 'smoke' && isAdjacentToFire(spaces, space)) {
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
 * knocked down (moved to the exterior, along with anything they're
 * carrying), and any fire that ended up outside the building during the
 * blast (§9.2) is put out — it isn't a threat to a structure it already left.
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
        ff.carrying = null; // knocked down, not lost (§10.3) — a mercy, not a loss
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
}

/**
 * One full Phase 2 (§7): roll, resolve the target space, flashover to a
 * fixpoint, then apply consequences. Hot spot flare-ups (§9.4, chained
 * re-rolls of this same function) and the Experienced ruleset are out of
 * scope until 17.6 step 8 — every space's `hotspot` stays false until then,
 * so this never triggers one.
 */
export function resolveAdvanceFire(
    spaces: IFiresOutSpaceState[],
    edges: IFiresOutEdgeState[],
    firefighters: IFiresOutFirefighterState[],
    nextRoll: NextRoll,
): IFiresOutAdvanceFireResult {
    const d6 = nextRoll(6);
    const d8 = nextRoll(8);
    const target = spaceForRoll(d6, d8);
    const resolution = resolveTargetSpace(spaces, edges, target);
    flashover(spaces);
    const consequences = resolveFireConsequences(spaces, firefighters);
    return { rolls: { d6, d8 }, target, resolution, consequences };
}

// ─── Phase 3 — Replenish POI (§7) ───────────────────────────────────────────

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

/**
 * §7 Phase 3: while fewer than 3 POIs are on the board, roll for a
 * coordinate and place the next marker off `poiPool`, re-rolling an invalid
 * target. Mutates `spaces` and `poiPool`, and hands back the running POI id
 * counter (the id `applyFamilySetup` already started).
 */
export function replenishPoi(
    spaces: IFiresOutSpaceState[],
    poiPool: boolean[],
    nextRoll: NextRoll,
    nextPoiId: number,
): number {
    const MAX_ATTEMPTS = INTERIOR_SPACE_COUNT * 4; // generous — every space re-rolled a few times over
    let attempts = 0;
    while (poiCountOnBoard(spaces) < 3 && poiPool.length > 0 && attempts < MAX_ATTEMPTS) {
        attempts++;
        const d6 = nextRoll(6);
        const d8 = nextRoll(8);
        const target = spaceForRoll(d6, d8);
        if (!isValidReplenishTarget(spaces, target)) continue;
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
