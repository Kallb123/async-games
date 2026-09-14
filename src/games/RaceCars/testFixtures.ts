// Shared test fixtures for Race Cars domain state — one car, and a race built
// out of them. Same reasoning as Banned Islet's and Fires Out's: rules.test.ts
// wrote these first and RaceCarsLogic.test.ts wants the same ones, and a second
// copy is the signal to extract the first (AGENTS.md).
//
// Test-only. Nothing under src/app imports this.

import type { RaceCarsTrack } from "./board";
import { deriveTrack, type TrackSection } from "./tracks/sections";
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

/**
 * A circuit built from `sections` alone — no art, no grid, no geometry, and
 * nothing drawn. `overrides` is for the handful of fields a particular test
 * cares about (its id, so `trackById` can resolve it; its grid, if cars are
 * dealt onto it).
 */
export function testTrack(sections: TrackSection[], overrides: Partial<RaceCarsTrack> = {}): RaceCarsTrack {
    return {
        id: 'test',
        name: 'Test',
        ...deriveTrack(sections),
        grid: [],
        maxGear: 5,
        art: { href: '', viewBox: { width: 0, height: 0 } },
        geometry: [],
        ...overrides,
    };
}

/**
 * The Kettle: a corner doing both of the things §5.1's own step rule cannot
 * say. Its outside is painted — each of its spaces feeds the one in front and
 * nothing else — and its inside covers the same eight rows in four spaces, so
 * the same roll driven down the inside covers twice the road and arrives with
 * nowhere left inside the corner.
 *
 * Deliberately not a corner anybody races: Ashcombe and Anglet are the
 * circuits, and this is the shape the track data has to be able to hold. It
 * expects a two-lane band on rows 6-13 and an ordinary three-lane road on row
 * 14, which is what both the tracks built on it put there.
 */
export const KETTLE_CORNER: TrackSection = {
    name: 'The Kettle',
    from: 6,
    to: 13,
    lanes: 2,
    corner: { id: 'kettle', stops: 1 },
    tiles: [
        // The outside, one space a row, and no crossing off it.
        ...[6, 7, 8, 9, 10, 11, 12].map(row => ({ row, lane: 2, exits: [{ row: row + 1, lane: 2 }] })),
        // Its last space rejoins the straight under §5.1's own rule.
        { row: 13, lane: 2 },
        // The inside, four spaces to the outside's eight, rejoining the road in
        // either lane at the end of it.
        { row: 6, lane: 1, exits: [{ row: 8, lane: 1 }] },
        { row: 8, lane: 1, exits: [{ row: 10, lane: 1 }] },
        { row: 10, lane: 1, exits: [{ row: 12, lane: 1 }] },
        { row: 12, lane: 1, exits: [{ row: 14, lane: 1 }, { row: 14, lane: 2 }] },
    ],
};
