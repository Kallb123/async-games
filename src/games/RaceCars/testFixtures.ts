// Shared test fixtures for Race Cars domain state — one car, and a race built
// out of them. Same reasoning as Banned Islet's and Fires Out's: rules.test.ts
// wrote these first and RaceCarsLogic.test.ts wants the same ones, and a second
// copy is the signal to extract the first (AGENTS.md).
//
// Test-only. Nothing under src/app imports this.

import type { IRaceCarsPlayerState, IRaceCarsSpecificGameState } from "./rules";

/**
 * One car on the grid, with §11's Balanced pools and gear 3 — the workhorse
 * (§8.1), so a test that doesn't care about the gear ladder still gets a band
 * wide enough to reach a corner and short enough to stop in one.
 *
 * `phase: 'move'` by default because most rules fixtures are about a move
 * already rolled for; a test of a whole turn overrides it.
 */
export function car(overrides: Partial<IRaceCarsPlayerState> = {}): IRaceCarsPlayerState {
    return {
        raceNumber: 1,
        row: 0,
        lane: 1,
        lapsCompleted: 0,
        gear: 3,
        tyres: 5,
        brakes: 4,
        gearbox: 3,
        cornerStops: 0,
        skipNextTurn: false,
        finishedPosition: null,
        phase: 'move',
        roll: null,
        brakeSpent: 0,
        ...overrides,
    };
}

/**
 * A one-lap Sprint at Ashcombe with the named cars on it, race numbers dealt in
 * the order they are written and `roundOrder` in that same order — the grid
 * (§6 step 6), which is the only state where the two agree by construction.
 */
export function race(
    cars: Record<string, Partial<IRaceCarsPlayerState>>,
    overrides: Partial<IRaceCarsSpecificGameState> = {},
): IRaceCarsSpecificGameState {
    const players = new Map(Object.entries(cars).map(([userId, seat], slot) =>
        [userId, car({ raceNumber: slot + 1, ...seat })]));
    return {
        trackId: 'ashcombe',
        laps: 1,
        spec: 'balanced',
        oilSpills: false,
        round: 1,
        roundOrder: [...players.keys()],
        roundIndex: 0,
        slicks: [],
        players,
        ...overrides,
    };
}
