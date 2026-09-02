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

// ─── The Experienced game and its difficulty tiers (§6.2, §13, §17.6 step 8) ─
// The switch between rulesets is this one field, read here rather than
// scattered through the fire system — see gameStateToModel and
// buildInitialFiresOutState in FiresOutModels.ts for the other half of "one
// two-valued string, which is the whole mechanism" (§17.6 step 8).

export type RulesetId = 'family' | 'experienced';
export type DifficultyId = 'recruit' | 'veteran' | 'heroic';

export interface IFiresOutDifficultyTier {
    id: DifficultyId;
    label: string;
    /** §6.2 step 2: initial explosions resolved (with wall damage) before anyone's had a turn. */
    explosions: number;
    /** §6.2 step 3: hazmat markers placed at setup. */
    hazmats: number;
    description: string;
}

export const DIFFICULTY_TIERS: IFiresOutDifficultyTier[] = [
    { id: 'recruit', label: 'Recruit', explosions: 3, hazmats: 3, description: 'Comparable to the Family game.' },
    { id: 'veteran', label: 'Veteran', explosions: 3, hazmats: 4, description: 'Hard.' },
    { id: 'heroic', label: 'Heroic', explosions: 4, hazmats: 5, description: 'Very hard, with a larger hot spot reserve.' },
];

export function difficultyTier(difficulty: DifficultyId): IFiresOutDifficultyTier {
    return DIFFICULTY_TIERS.find(d => d.id === difficulty)!;
}

/** §3's component count — the total hot spot marker supply. Placed-on-board + reserve always equals this (a conservation invariant, like the POI pool and the damage markers — §17.7's testing note). */
export const TOTAL_HOTSPOT_MARKERS = 24;

/** §6.2 step 4: "a base number scaled by crew size (roughly 2 for a three-firefighter crew, 3 for four or more), plus 3 additional at Veteran and Heroic." */
function hotspotsToPlace(crewSize: number, difficulty: DifficultyId): number {
    const base = crewSize <= 3 ? 2 : 3;
    return difficulty === 'recruit' ? base : base + 3;
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

/** A rolled interior coordinate a setup placement re-rolls until `isValid` accepts it, bounded the same way replenishPoi bounds its own re-rolls. */
function rollValidSetupTarget(nextRoll: NextRoll, isValid: (space: number) => boolean): number | null {
    const MAX_ATTEMPTS = INTERIOR_SPACE_COUNT * 4;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const target = spaceForRoll(nextRoll(6), nextRoll(8));
        if (isValid(target)) return target;
    }
    return null; // defensive — the board would have to be almost entirely full
}

/**
 * §6.2 steps 2-5: the Experienced game's rolled setup — initial explosions,
 * then hazmats, then hot spots, then the first 3 POIs, in that order (each
 * later placement avoids the spaces the earlier ones already claimed).
 * Vehicles (step 6) and Specialists (step 7) are later steps (9 and 10).
 * Returns the running POI id counter and the hot spot reserve left after
 * setup's own placements, both of which the caller folds into the fresh
 * specificGameState.
 */
export function applyExperiencedSetup(
    spaces: IFiresOutSpaceState[],
    edges: IFiresOutEdgeState[],
    poiPool: boolean[],
    difficulty: DifficultyId,
    crewSize: number,
    nextRoll: NextRoll,
): { nextPoiId: number; hotspotReserve: number } {
    const tier = difficultyTier(difficulty);

    for (let i = 0; i < tier.explosions; i++) {
        seedInitialExplosion(spaces, edges, spaceForRoll(nextRoll(6), nextRoll(8)));
    }

    // One hazmat per space (§6.2 step 3) — not on an already-burning space
    // (nobody would leave equipment in an active blast zone) and not
    // stacked on another hazmat.
    for (let i = 0; i < tier.hazmats; i++) {
        const target = rollValidSetupTarget(nextRoll, space => spaces[space].threat !== 'fire' && !spaces[space].hazmat);
        if (target !== null) spaces[target].hazmat = true;
    }

    // Hot spots (§6.2 step 4) — not doubled up on a hazmat or another hot
    // spot, and not dropped into existing fire for the same reason as
    // hazmats above. Whatever isn't placed now stays in reserve for §9.4's
    // hazmat-detonation replacement.
    const toPlace = hotspotsToPlace(crewSize, difficulty);
    let placed = 0;
    for (let i = 0; i < toPlace; i++) {
        const target = rollValidSetupTarget(nextRoll,
            space => spaces[space].threat !== 'fire' && !spaces[space].hazmat && !spaces[space].hotspot);
        if (target === null) break;
        spaces[target].hotspot = true;
        placed++;
    }

    // POIs (§6.2 step 5) — the same 3-marker placement as the Family game.
    const nextPoiId = replenishPoi(spaces, poiPool, nextRoll, 0);

    return { nextPoiId, hotspotReserve: TOTAL_HOTSPOT_MARKERS - placed };
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
        flashover(spaces);
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
 */
export function resolveAdvanceFire(
    spaces: IFiresOutSpaceState[],
    edges: IFiresOutEdgeState[],
    firefighters: IFiresOutFirefighterState[],
    hotspotReserve: number,
    nextRoll: NextRoll,
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
        const flareUp = resolveAdvanceFire(spaces, edges, firefighters, reserve, nextRoll);
        reserve = flareUp.hotspotReserve;
        flareUps.push(flareUp);
    }

    return { rolls: { d6, d8 }, target, resolution, consequences, flareUps, hotspotReserve: reserve };
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

// ─── §8 the AP economy ───────────────────────────────────────────────────────

export const AP_COSTS = {
    move: 1,
    moveIntoFire: 2,
    carryPerSpace: 2,
    door: 1,
    extinguish: 1,
    chop: 2,
} as const;

/**
 * Spends `cost` AP from `ff`, preferring its restricted pool when `kind`
 * matches it (§17.4: "one spendAp(firefighter, cost, actionKind) decides
 * which pool pays" — every spend site already knows its own action kind, so
 * no action needs a "which pool" argument beyond this). Returns false and
 * mutates nothing if the firefighter can't afford it. No Specialist has a
 * restrictedAp pool yet (17.6 step 10), so `kind` is always `null` today and
 * every spend comes straight out of `apLeft` — this is still the one place
 * that decides, ready for when one does.
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

/** §8: what moving from `from` to an adjacent `to` costs, given whether `ff` is carrying something. Ignores whether the move is otherwise legal (see canMoveTo). */
export function moveApCost(spaces: SpacesWithThreat, ff: IFiresOutFirefighterState, to: number): number {
    if (ff.carrying) return AP_COSTS.carryPerSpace;
    return spaces[to].threat === 'fire' ? AP_COSTS.moveIntoFire : AP_COSTS.move;
}

/**
 * §8: whether `ff` may step from `from` to the adjacent `to` — connected by a
 * passable edge, and not carrying a victim or hazmat into fire.
 */
export function canMoveTo(
    spaces: SpacesWithThreat,
    edges: IFiresOutEdgeState[],
    ff: IFiresOutFirefighterState,
    from: number,
    to: number,
): boolean {
    const edgeId = edgeBetween(from, to);
    if (edgeId === undefined || !isPassable(edges[edgeId])) return false;
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
        canMoveTo(spaces, edges, asIf, ff.space, to) && canAffordAp(ff, moveApCost(spaces, asIf, to), null));
}

/** §8: adjacent doors `ff` can afford to open or close. */
export function legalDoorTargets(edges: IFiresOutEdgeState[], ff: IFiresOutFirefighterState): number[] {
    if (!canAffordAp(ff, AP_COSTS.door, null)) return [];
    return neighboursOf(ff.space).filter(to => {
        const edgeId = edgeBetween(ff.space, to);
        return edgeId !== undefined && edges[edgeId].kind === 'door';
    });
}

/** §8: `ff`'s own space plus any adjacent space carrying smoke or fire, that `ff` can afford to extinguish. */
export function legalExtinguishTargets(spaces: SpacesWithThreat, ff: IFiresOutFirefighterState): number[] {
    if (!canAffordAp(ff, AP_COSTS.extinguish, null)) return [];
    return [ff.space, ...neighboursOf(ff.space)].filter(space => spaces[space].threat !== 'none');
}

/** §8, §9.2: adjacent undestroyed walls `ff` can afford to chop. */
export function legalChopTargets(edges: IFiresOutEdgeState[], ff: IFiresOutFirefighterState): number[] {
    if (!canAffordAp(ff, AP_COSTS.chop, null)) return [];
    return neighboursOf(ff.space).filter(to => {
        const edgeId = edgeBetween(ff.space, to);
        return edgeId !== undefined && edges[edgeId].kind === 'wall' && edges[edgeId].damage < 2;
    });
}
