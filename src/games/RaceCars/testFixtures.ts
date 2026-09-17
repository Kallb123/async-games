// Shared test fixtures for Race Cars domain state — one car, and a race built
// out of them. Same reasoning as Banned Islet's and Fires Out's: rules.test.ts
// wrote these first and RaceCarsLogic.test.ts wants the same ones, and a second
// copy is the signal to extract the first (AGENTS.md).
//
// Test-only. Nothing under src/app imports this.

import { MAX_PLAYERS, type RaceCarsTrack } from "./board";
import { deriveTrack, plainTileId, type TrackSection } from "./tracks/sections";
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
        startRoll: null,
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
 * say. Its outside is painted — each of its tiles feeds the one in front and
 * nothing else — and its inside covers the same stretch of road in four tiles
 * to the outside's eight, so the same roll driven down the inside covers twice
 * the road and arrives with nowhere left inside the corner.
 *
 * Deliberately not a corner anybody races: Ashcombe and Anglet are the
 * circuits, and this is the shape the track data has to be able to hold. A
 * band whose lanes run out of step names every step it takes
 * (`tracks/sections.ts`), including the ones onto the plain three-lane section
 * named by `nextSectionId` — so the derivation gives its outside line eight
 * rows, and its inside the four tiles spread evenly across them.
 */
export function kettleCorner(nextSectionId: string): TrackSection {
    const onward = [1, 2, 3].map(lane => plainTileId(nextSectionId, lane, 0));
    return {
        id: 'kettle',
        name: 'The Kettle',
        lanes: 2,
        corner: { stops: 1 },
        tiles: [
            // The outside, eight tiles, and no crossing off any of them.
            ...Array.from({ length: 8 }, (_unused, index) => ({
                id: `kettle.2.${index}`,
                lane: 2,
                exits: index < 7 ? [`kettle.2.${index + 1}`] : onward,
            })),
            // The inside, four tiles to the outside's eight, rejoining the road
            // in either lane it can reach at the end of it.
            ...Array.from({ length: 4 }, (_unused, index) => ({
                id: `kettle.1.${index}`,
                lane: 1,
                exits: index < 3 ? [`kettle.1.${index + 1}`] : onward.slice(0, 2),
            })),
        ],
    };
}

/**
 * §5.2's staggered six-slot grid on a circuit whose first rows are plain and
 * level: rows 2, 1, 0 back from the line, two cars abreast in lanes 1 and 3.
 *
 * Written once because three fixtures wanted the same six coordinates, and the
 * expression is fiddly enough that a fourth copy would be a typo waiting to
 * happen rather than a fixture.
 */
export function staggeredGrid(rows = 2): RaceCarsTrack["grid"] {
    return Array.from({ length: MAX_PLAYERS }, (_unused, slot) => ({
        row: rows - Math.floor(slot / 2),
        lane: slot % 2 === 0 ? 1 : 3,
    }));
}

/** Fourteen rows of plain three-lane road: rows 0-3 the grid straight, 4-13 the lap. */
const LINE_SECTIONS: TrackSection[] = [
    { id: 'gridstraight', name: 'Grid Straight', lanes: 3, corner: null, length: 4 },
    { id: 'lap', name: 'Lap', lanes: 3, corner: null, length: 10 },
];

/**
 * A circuit with its finish line painted across row 3 rather than row 0, and
 * its grid on rows 0-2 — so the field starts **behind** the line and its first
 * crossing begins lap 1 rather than ending it (§15).
 *
 * The one fixture that exercises both halves of the painted line at once, which
 * is why it lives here: `rules.test.ts` drives races over it and
 * `RaceCarsModels.test.ts` checks the grid it seats, and the two had a copy each.
 */
export function behindLineTrack(overrides: Partial<RaceCarsTrack> = {}): RaceCarsTrack {
    return testTrack(LINE_SECTIONS, {
        id: 'behindline',
        name: 'Behind The Line',
        grid: staggeredGrid(),
        finish: [1, 2, 3].map(lane => ({ row: 3, lane })),
        gridBehindFinishLine: true,
        ...overrides,
    });
}
