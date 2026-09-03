// Shared test fixtures for Fires Out domain state. Same reasoning as
// Settlements & Cities' — see the note at the top of
// src/games/SettlementsAndCities/testFixtures.ts.
//
// Test-only. Nothing under src/app imports this.

import { AMBULANCE_START, ENGINE_START, INTERIOR_SPACE_COUNT, spaceIndex } from "./board";
import { buildEmptyEdges, buildEmptySpaces, newFirefighter } from "./rules";
import type { IFiresOutSpaceState } from "./rules";
import type { IFiresOutSpecificGameState } from "./FiresOutModels";

/**
 * Firefighters — one per entry in `owners`, in that order — all starting at
 * (3,2): a kitchen space with one of each kind of boundary around it, open to
 * (3,3) and (2,2), walled off from (3,1), and a door onto the dining room at
 * (4,2). No fire, POIs or damage, so a test builds whatever board condition it
 * needs on top of this rather than fighting the Family setup's fire cluster.
 *
 * `owners` is a list of *figure* owners rather than the game's turn order —
 * §17.2 gap 3's distinction — so one user may appear more than once, which is
 * how §1's multi-pawn solitaire play is set up.
 */
export function baseState(owners: string[] = ["u1", "u2"]): IFiresOutSpecificGameState {
    return {
        ruleset: 'family',
        difficulty: 'recruit',
        spaces: buildEmptySpaces(),
        edges: buildEmptyEdges(),
        poiPool: [],
        nextPoiId: 0,
        rescued: 0,
        lost: 0,
        firefighters: owners.map(userId => newFirefighter(userId, spaceIndex(3, 2))),
        activeFirefighter: 0,
        hotspotReserve: 0,
        engine: ENGINE_START,
        ambulance: AMBULANCE_START,
    };
}

/**
 * Sets every interior space alight except `clear` — the late-game board, for
 * the rules that only get interesting once there is almost nowhere legal
 * left to put anything (§7 Phase 3, §6.2's placements).
 */
export function burnAllExcept(spaces: IFiresOutSpaceState[], ...clear: number[]): void {
    for (let space = 0; space < INTERIOR_SPACE_COUNT; space++) {
        spaces[space].threat = clear.includes(space) ? 'none' : 'fire';
    }
}

/**
 * The same board under the Experienced rules — what vehicle tests need, since
 * 'drive'/'deckGun' and the Ambulance-gated rescue are all set aside in the
 * Family game (§6.1 step 7).
 */
export function experiencedState(owners: string[] = ["u1", "u2"]): IFiresOutSpecificGameState {
    return { ...baseState(owners), ruleset: 'experienced' };
}
