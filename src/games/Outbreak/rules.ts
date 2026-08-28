// Pure, isomorphic Outbreak rules: legal-move computation, the outbreak chain
// resolver, cure eligibility, and the loss checks from
// docs/games/outbreak-gdd.md §8-10. No server-only imports — the client
// action picker computes hints from this module directly, the same way
// Solitaire's rules.ts is shared by SolitaireLogic.ts and the board UI (see
// docs/new-game.md, "Isomorphic rules modules").
import { ADJACENCY, CITY_COUNT, OutbreakDiseaseColor } from "./board";

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

    for (const cityId of options.hand) {
        if (cityId === options.currentCity) continue;
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

export interface IOutbreakChainResult {
    cubes: OutbreakBoardCubes;
    /** Number of new outbreaks triggered while resolving this placement. */
    outbreaks: number;
    /** Cities that outbroke, in the order they did. */
    outbrokenCities: number[];
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
export function placeCubeOrOutbreak(
    cubes: OutbreakBoardCubes,
    cityId: number,
    color: OutbreakDiseaseColor,
    alreadyOutbroken: Set<number> = new Set(),
    cubesLeft?: OutbreakCubeCounts,
): IOutbreakChainResult {
    const next = cubes.map(c => ({ ...c }));
    const nextLeft = cubesLeft ? { ...cubesLeft } : undefined;
    const outbrokenCities: number[] = [];
    const queue: number[] = [cityId];

    while (queue.length > 0) {
        const city = queue.shift()!;
        if (alreadyOutbroken.has(city)) continue;

        if (next[city][color] >= CUBES_PER_CITY_LIMIT) {
            alreadyOutbroken.add(city);
            outbrokenCities.push(city);
            for (const neighbor of ADJACENCY[city]) {
                queue.push(neighbor);
            }
        } else if (nextLeft && isCubeExhaustionLoss(nextLeft[color], 1)) {
            return { cubes: next, outbreaks: outbrokenCities.length, outbrokenCities, cubesLeft: nextLeft, cubeExhausted: true };
        } else {
            next[city][color] += 1;
            if (nextLeft) nextLeft[color] -= 1;
        }
    }

    return { cubes: next, outbreaks: outbrokenCities.length, outbrokenCities, cubesLeft: nextLeft, cubeExhausted: false };
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
