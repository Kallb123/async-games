// Pure, isomorphic Outbreak rules: legal-move computation, the outbreak chain
// resolver, cure eligibility, and the loss checks from
// docs/games/outbreak-gdd.md §8-10. No server-only imports — the client
// action picker computes hints from this module directly, the same way
// Solitaire's rules.ts is shared by SolitaireLogic.ts and the board UI (see
// docs/new-game.md, "Isomorphic rules modules").
import {
    ADJACENCY,
    CITY_COUNT,
    DISEASE_COLORS,
    EPIDEMIC_CARD_ID,
    isAdjacent,
    isCityCardId,
    OutbreakCureState,
    OutbreakDiseaseColor,
    OutbreakRoleId,
    ROLES,
} from "./board";
import { shuffle } from "@/utils/games/shuffle";

// ─── The action economy (§7-8) ──────────────────────────────────────────────

/** Actions per player per turn (§7 Phase 1, §21.4 — refills at turn start). */
export const ACTIONS_PER_TURN = 4;

// ─── The draw and infect phases (§7 Phase 2-3, §9-10, §21.6 step 6) ────────

/** Player cards drawn at the start of Phase 2, every turn. */
export const CARDS_DRAWN_PER_TURN = 2;

/** Hand limit enforced at the end of Phase 2 — over this, discard down to it. */
export const HAND_LIMIT = 7;

// §6 step 6: 2 players deal 4 cards each, 3 deal 3, 4 deal 2 — the official
// "6 minus the seat count" shorthand.
export function startingHandSize(playerCount: number): number {
    return Math.max(0, 6 - playerCount);
}

// ─── Movement (§8.1) ────────────────────────────────────────────────────────

export type OutbreakMoveType = 'drive' | 'directFlight' | 'charterFlight' | 'shuttleFlight';

export interface IOutbreakMove {
    type: OutbreakMoveType;
    destination: number;
    /** City card that must be discarded to make this move, if any. */
    discardCityId?: number;
}

export interface IOutbreakMoveOptions {
    currentCity: number;
    /** City ids of the city cards (not event cards) in the acting player's hand. */
    hand: number[];
    /** City ids that currently have a research station. */
    researchStations: number[];
}

// Every legal move out of `currentCity` per §8.1: Drive/Ferry along the
// adjacency graph, Direct Flight to any city card held, Charter Flight
// anywhere by discarding the current city's own card, and Shuttle Flight
// between research stations.
export function getLegalMoves(options: IOutbreakMoveOptions): IOutbreakMove[] {
    const moves: IOutbreakMove[] = [];
    const seen = new Set<string>();
    const push = (move: IOutbreakMove) => {
        const key = `${move.type}:${move.destination}`;
        if (seen.has(key)) return;
        seen.add(key);
        moves.push(move);
    };

    for (const destination of ADJACENCY[options.currentCity] ?? []) {
        push({ type: 'drive', destination });
    }

    // Event and epidemic card ids share this same hand array (§21.6 step 10)
    // but name no destination — only a city card can fly you anywhere.
    for (const cityId of options.hand) {
        if (cityId === options.currentCity || !isCityCardId(cityId)) continue;
        push({ type: 'directFlight', destination: cityId, discardCityId: cityId });
    }

    if (options.hand.includes(options.currentCity)) {
        for (let destination = 0; destination < CITY_COUNT; destination++) {
            if (destination === options.currentCity) continue;
            push({ type: 'charterFlight', destination, discardCityId: options.currentCity });
        }
    }

    if (options.researchStations.includes(options.currentCity)) {
        for (const destination of options.researchStations) {
            if (destination === options.currentCity) continue;
            push({ type: 'shuttleFlight', destination });
        }
    }

    return moves;
}

// ─── Outbreak chain resolution (§10.1) ─────────────────────────────────────

/** Per-city cube counts, one entry per disease colour. */
export type OutbreakCubeCounts = Record<OutbreakDiseaseColor, number>;

/** Cube counts for every city on the board, indexed by city id. */
export type OutbreakBoardCubes = OutbreakCubeCounts[];

export const CUBES_PER_CITY_LIMIT = 3;

/** Cubes in supply per colour at setup (§5, §15). */
export const CUBES_PER_COLOR = 24;

export function emptyCubeCounts(): OutbreakCubeCounts {
    return { blue: 0, yellow: 0, black: 0, red: 0 };
}

export function emptyBoardCubes(): OutbreakBoardCubes {
    return Array.from({ length: CITY_COUNT }, emptyCubeCounts);
}

// One infection-card draw's outcome, or an epidemic's own Increase+Infect
// step, or the whole Infect Cities phase being skipped — the building block
// of IOutbreakInfectionPhaseOutcome.infectionLog (OutbreakLogic.ts), returned
// by OutbreakEndTurn/OutbreakDiscard/OutbreakPlayEvent's Execute (§21.6 step
// 6, step 12). Built so both the end-of-turn screen and the away recap
// (recap.ts) can narrate exactly what a draw did — including the Quarantine
// Specialist quietly containing it, which a before/after cube count can't
// tell apart from an ordinary placement.
export type OutbreakInfectionOutcome =
    | 'placed'      // one cube added, no cap hit
    | 'outbreak'    // the city was already at the cap; it outbroke and chained
    | 'contained'   // the Quarantine Specialist blocked it entirely
    | 'eradicated'; // the colour is already eradicated; drawn and discarded, no effect

export interface IOutbreakInfectionLogEntry {
    kind: 'infect' | 'epidemic' | 'quietNight';
    /** Set for 'infect', and for 'epidemic' once its Infect step actually drew
     * a card (omitted if the infection deck was empty). */
    cityId?: number;
    color?: OutbreakDiseaseColor;
    outcome?: OutbreakInfectionOutcome;
    /** The outbreak and any chain reaction it set off, burst by burst, in the
     *  order the cities overflowed — only set when outcome === 'outbreak'. The
     *  first step's city is the one the drawn card infected; each step names the
     *  neighbours that took a cube from that burst, so a recap can show exactly
     *  which cities an outbreak overflowed onto and how a cascade spread. */
    outbreakChain?: IOutbreakOutbreakStep[];
    /** 'epidemic' only: the infection rate after its Increase step. */
    rateAfter?: number;
}

/** One city overflowing during an outbreak chain: the city that burst and the
 *  adjacent cities that took a cube from it. A neighbour already outbroken this
 *  resolution (§10.1) or shielded by the Quarantine Specialist (§11) takes no
 *  cube and is left out — this lists only where a cube actually landed. */
export interface IOutbreakOutbreakStep {
    city: number;
    infected: number[];
}

export interface IOutbreakChainResult {
    cubes: OutbreakBoardCubes;
    /** Number of new outbreaks triggered while resolving this placement. */
    outbreaks: number;
    /** Each city that outbroke, in the order it did, paired with the neighbours
     *  that took a cube from its burst. `outbreakChain.length` is the outbreak
     *  count; `outbreakChain.map(s => s.city)` is the list of cities that
     *  overflowed. */
    outbreakChain: IOutbreakOutbreakStep[];
    /** Echoes back the (decremented) supply, when `cubesLeft` was passed in. */
    cubesLeft?: OutbreakCubeCounts;
    /**
     * True when `cubesLeft` was passed in and the colour's supply ran out
     * mid-resolution — §4.2's cube-exhaustion loss. Per §16 ("cube supply
     * runs dry mid-outbreak — the loss is immediate, do not finish resolving
     * the chain"), the walk stops the instant this happens rather than
     * completing the chain.
     */
    cubeExhausted?: boolean;
}

// Places 1 cube of `color` on `cityId`. If the city already has
// CUBES_PER_CITY_LIMIT cubes of that colour, an outbreak occurs instead
// (§10.1): the cube isn't added there; instead 1 cube spreads to every
// adjacent city, which may itself outbreak in turn — a chain reaction.
//
// `alreadyOutbroken` is the set of cities that have already outbroken during
// this single infection-card resolution. Per §10.1 ("a city may only
// outbreak once per infection card resolution") and §16's chain-re-entry
// edge case, a city already in this set neither outbreaks again nor
// receives a further cube from the chain — it's simply skipped. Callers
// resolving one infection card should pass a fresh empty set (the default);
// a caller resolving several cards in the same phase should pass its own
// set per card.
//
// `cubesLeft` is optional: setup's initial infection has 24-per-colour
// supply to spare and calls this with it omitted (unlimited supply, exactly
// today's behaviour). The infect phase (§21.6 step 6) passes it in, so a
// colour that runs out mid-chain stops the walk immediately instead of
// placing cubes the supply doesn't have.
//
// `isProtected` is the Quarantine Specialist's exception (§11, §16): a city
// it flags neither receives a cube nor outbreaks, and the chain does not
// continue past it — there's nothing there to trigger it further.
export function placeCubeOrOutbreak(
    cubes: OutbreakBoardCubes,
    cityId: number,
    color: OutbreakDiseaseColor,
    alreadyOutbroken: Set<number> = new Set(),
    cubesLeft?: OutbreakCubeCounts,
    isProtected?: (cityId: number) => boolean,
): IOutbreakChainResult {
    const next = cubes.map(c => ({ ...c }));
    const nextLeft = cubesLeft ? { ...cubesLeft } : undefined;
    const outbreakChain: IOutbreakOutbreakStep[] = [];
    // Each burst is queued along with the city whose overflow queued it, so a
    // cube that lands can be attributed back to the burst that spread it (`from`
    // is null only for the drawn city that starts the chain).
    const stepByCity = new Map<number, IOutbreakOutbreakStep>();
    const queue: { city: number; from: number | null }[] = [{ city: cityId, from: null }];

    while (queue.length > 0) {
        const { city, from } = queue.shift()!;
        if (alreadyOutbroken.has(city)) continue;
        if (isProtected?.(city)) continue;

        if (next[city][color] >= CUBES_PER_CITY_LIMIT) {
            alreadyOutbroken.add(city);
            const step: IOutbreakOutbreakStep = { city, infected: [] };
            outbreakChain.push(step);
            stepByCity.set(city, step);
            for (const neighbor of ADJACENCY[city]) {
                queue.push({ city: neighbor, from: city });
            }
        } else if (nextLeft && isCubeExhaustionLoss(nextLeft[color], 1)) {
            return { cubes: next, outbreaks: outbreakChain.length, outbreakChain, cubesLeft: nextLeft, cubeExhausted: true };
        } else {
            next[city][color] += 1;
            if (nextLeft) nextLeft[color] -= 1;
            if (from !== null) stepByCity.get(from)!.infected.push(city);
        }
    }

    return { cubes: next, outbreaks: outbreakChain.length, outbreakChain, cubesLeft: nextLeft, cubeExhausted: false };
}

// Epidemic INFECT step (§9.1 step 2): place all 3 cubes of `color` on
// `cityId` in one shot, rather than one at a time as the ordinary infect
// phase does. Reaching exactly 3 triggers no outbreak; a city that's already
// sitting at the 3-cube cap outbreaks immediately instead of receiving a 4th
// cube it can't hold. The already-saturated case delegates to
// placeCubeOrOutbreak so the chain-reaction and exhaustion logic isn't
// duplicated — it already outbreaks the instant a city is found at the cap.
export function placeEpidemicCubesOrOutbreak(
    cubes: OutbreakBoardCubes,
    cityId: number,
    color: OutbreakDiseaseColor,
    cubesLeft?: OutbreakCubeCounts,
    isProtected?: (cityId: number) => boolean,
): IOutbreakChainResult {
    // Quarantine Specialist (§11, §16): her protection applies to an
    // epidemic's Infect step exactly as it does to ordinary infection.
    if (isProtected?.(cityId)) {
        return {
            cubes: cubes.map(c => ({ ...c })),
            outbreaks: 0,
            outbreakChain: [],
            cubesLeft: cubesLeft ? { ...cubesLeft } : undefined,
            cubeExhausted: false,
        };
    }

    if (cubes[cityId][color] >= CUBES_PER_CITY_LIMIT) {
        return placeCubeOrOutbreak(cubes, cityId, color, new Set(), cubesLeft, isProtected);
    }

    const needed = CUBES_PER_CITY_LIMIT - cubes[cityId][color];
    if (cubesLeft && isCubeExhaustionLoss(cubesLeft[color], needed)) {
        return {
            cubes: cubes.map(c => ({ ...c })),
            outbreaks: 0,
            outbreakChain: [],
            cubesLeft: { ...cubesLeft },
            cubeExhausted: true,
        };
    }

    const next = cubes.map(c => ({ ...c }));
    next[cityId] = { ...next[cityId], [color]: CUBES_PER_CITY_LIMIT };
    const nextLeft = cubesLeft ? { ...cubesLeft, [color]: cubesLeft[color] - needed } : undefined;
    return { cubes: next, outbreaks: 0, outbreakChain: [], cubesLeft: nextLeft, cubeExhausted: false };
}

// ─── Deck construction: epidemic piles (§6 step 7, §13) ────────────────────

// Divides the player cards left after starting hands are dealt into
// `epidemicCount` piles as equal in size as possible, shuffles exactly one
// epidemic card into each, and stacks the piles in order. This is what
// spreads epidemics roughly evenly through the game while keeping their
// exact timing unknown, and it's the single dial §13's difficulty setting
// turns: more epidemics means smaller piles, so Intensify steps land closer
// together and the infection rate climbs sooner.
export function buildEpidemicDeck(remainingCards: number[], epidemicCount: number): number[] {
    const base = Math.floor(remainingCards.length / epidemicCount);
    const remainder = remainingCards.length % epidemicCount;
    const deck: number[] = [];
    let index = 0;
    for (let i = 0; i < epidemicCount; i++) {
        const pileSize = base + (i < remainder ? 1 : 0);
        const pile = remainingCards.slice(index, index + pileSize);
        index += pileSize;
        deck.push(...shuffle([...pile, EPIDEMIC_CARD_ID]));
    }
    return deck;
}

// ─── Cure eligibility (§8.2) ────────────────────────────────────────────────

export interface IOutbreakCureEligibility {
    atResearchStation: boolean;
    /** Number of cards of the target colour currently in hand. */
    handColorCount: number;
    /** Scientist role needs only 4 cards instead of 5. */
    isScientist?: boolean;
}

export function cureCardsRequired(isScientist?: boolean): number {
    return isScientist ? 4 : 5;
}

export function canDiscoverCure(state: IOutbreakCureEligibility): boolean {
    return state.atResearchStation && state.handColorCount >= cureCardsRequired(state.isScientist);
}

// ─── Board helpers shared with the client (§21.6 step 5) ───────────────────

/** City ids that currently have a research station, in id order. */
export function stationCityIds(cities: { station: boolean }[]): number[] {
    const ids: number[] = [];
    cities.forEach((c, id) => { if (c.station) ids.push(id); });
    return ids;
}

// The infection rate track (§9.1 step 1): index 0 is the starting rate. Not
// yet advanced by anything — epidemics land in §21.6 step 8 — but the board
// screen reads it now to show the current rate rather than a hard-coded 2.
export const INFECTION_RATE_TRACK = [2, 2, 2, 3, 3, 4, 4];

export function infectionRateFor(infectionRateIndex: number): number {
    return INFECTION_RATE_TRACK[infectionRateIndex] ?? INFECTION_RATE_TRACK[INFECTION_RATE_TRACK.length - 1];
}

// ─── Roles (§11, §21.6 step 9) ──────────────────────────────────────────────
// Each role is a permanent, narrow exception to one of the rules above rather
// than a system of its own — kept here as small pure predicates/helpers so
// OutbreakLogic.ts's Execute methods call into them instead of branching on
// `role` inline.

/** §6 step 5: shuffle all seven roles and deal the first N, one per seat. */
export function dealRoles(turnOrder: string[]): Map<string, OutbreakRoleId> {
    const shuffled = shuffle(ROLES.map(r => r.id));
    const assignment = new Map<string, OutbreakRoleId>();
    turnOrder.forEach((userId, i) => assignment.set(userId, shuffled[i]));
    return assignment;
}

/** Treat Disease (§8.2, §11 Medic): a cured colour always clears in full, and
 * so does any colour at all for the Medic — everyone else only removes 1
 * cube of an uncured colour. */
export function treatDiseaseRemovalCount(cured: boolean, present: number, role: OutbreakRoleId | null): number {
    return (cured || role === 'medic') ? present : 1;
}

/** Medic (§11, §16): every colour cured while she is standing in a city, or
 * that becomes cured while she is, clears there automatically — no action
 * required, and it follows her through a move the Dispatcher makes for her.
 * Returns which colours qualify at `cubes`. */
export function medicAutoClearColors(
    role: OutbreakRoleId | null,
    cubes: OutbreakCubeCounts,
    cures: Record<OutbreakDiseaseColor, OutbreakCureState>,
): OutbreakDiseaseColor[] {
    if (role !== 'medic') return [];
    return DISEASE_COLORS.filter(color => cures[color] !== 'none' && cubes[color] > 0);
}

/** Quarantine Specialist (§11, §16): no cube placement and no outbreak in her
 * city or any city adjacent to it — including an epidemic's Infect step, and
 * blocking the outbreak it would otherwise cause entirely. Setup's initial
 * infection (§6 step 8) runs before roles are dealt and is deliberately
 * exempt from this. */
export function isProtectedByQuarantine(quarantineSpecialistCity: number | null, cityId: number): boolean {
    if (quarantineSpecialistCity === null) return false;
    return cityId === quarantineSpecialistCity || isAdjacent(quarantineSpecialistCity, cityId);
}

/** Operations Expert (§11): Build a Research Station waives its discard cost. */
export function opsExpertBuildsFree(role: OutbreakRoleId | null): boolean {
    return role === 'opsExpert';
}

/** Researcher (§11): a card leaving *her* hand during Share Knowledge — given
 * by her, or taken from her by someone else — need not match the shared
 * city. A card she takes from someone else's hand still must. */
export function shareKnowledgeCardMatchRequired(giverRole: OutbreakRoleId | null): boolean {
    return giverRole !== 'researcher';
}

/** Dispatcher (§11): may act on another player's pawn as if it were her own. */
export function dispatcherCanControlOthers(role: OutbreakRoleId | null): boolean {
    return role === 'dispatcher';
}

// ─── Loss checks (§4.2) ─────────────────────────────────────────────────────

export const OUTBREAK_LOSS_THRESHOLD = 8;

/** Outbreak cascade loss: the outbreak marker has reached the threshold. */
export function isOutbreakCascadeLoss(outbreakCount: number): boolean {
    return outbreakCount >= OUTBREAK_LOSS_THRESHOLD;
}

/** Cube exhaustion loss: not enough cubes of a colour remain in supply to place. */
export function isCubeExhaustionLoss(cubesRemainingInSupply: number, cubesNeeded: number): boolean {
    return cubesRemainingInSupply < cubesNeeded;
}

/** Time-out loss: a card must be drawn from an empty player deck. */
export function isPlayerDeckEmptyLoss(deckSize: number): boolean {
    return deckSize <= 0;
}
