import { describe, expect, it } from "vitest";
import {
    cornerAt,
    cornerCrossings,
    cornersPassed,
    crossesStartLine,
    DEFAULT_DISTANCE,
    DEFAULT_SPEC,
    distanceDef,
    gearDef,
    GEARS,
    MAX_PLAYERS,
    MIN_PLAYERS,
    RACE_DISTANCES,
    RaceCarsTrack,
    rowsAlong,
    rowsBetween,
    rowsCovered,
    shiftDownCost,
    SHIFT_DOWN_GEARBOX_COST,
    SLICK_CAP,
    spaceAt,
    spaceCount,
    spacesInRow,
    SPECS,
    specDef,
    stepsFrom,
    TRACKS,
    trackById,
    waivedCornerIdAt,
    WEAR_TOKENS_PER_CAR,
} from "./board";
import { ASHCOMBE } from "./tracks/ashcombe";
import { deriveTrack, type TrackSection } from "./tracks/sections";

const TRACK_LIST: RaceCarsTrack[] = Object.values(TRACKS);

describe("Ashcombe Park", () => {
    it("is 78 rows and 214 spaces (§5.2)", () => {
        expect(ASHCOMBE.rows).toBe(78);
        expect(spaceCount(ASHCOMBE)).toBe(214);
    });

    it("transcribes §5.2's sections as the spaces on each row", () => {
        // Rows per §5.2: three lanes everywhere except the Hairpin, Gravel Bend
        // and the Woodland Esses, which is what makes a corner block.
        const widths = Array.from({ length: ASHCOMBE.rows }, (_unused, row) => spacesInRow(ASHCOMBE, row).length);
        expect(widths.slice(0, 10).every(w => w === 3)).toBe(true);     // Start / Finish
        expect(widths.slice(10, 15).every(w => w === 2)).toBe(true);    // Hairpin
        expect(widths.slice(15, 47).every(w => w === 3)).toBe(true);    // The Mile
        expect(widths.slice(47, 52).every(w => w === 2)).toBe(true);    // Gravel Bend
        expect(widths.slice(52, 62).every(w => w === 2)).toBe(true);    // Woodland Esses
        expect(widths.slice(62, 66).every(w => w === 3)).toBe(true);    // The Kink
        expect(widths.slice(66, 78).every(w => w === 3)).toBe(true);    // Run to the Line
    });

    it("has §5.2's three corners and four corner-stops a lap", () => {
        expect(ASHCOMBE.corners).toEqual([
            { id: 'hairpin', name: 'Ashcombe Hairpin', from: 10, to: 14, stops: 2 },
            { id: 'gravel', name: 'Gravel Bend', from: 47, to: 51, stops: 1 },
            { id: 'kink', name: 'The Kink', from: 62, to: 65, stops: 1 },
        ]);
        expect(ASHCOMBE.corners.reduce((total, corner) => total + corner.stops, 0)).toBe(4);
    });

    it("is a five-gear circuit (§8.3)", () => {
        expect(ASHCOMBE.maxGear).toBe(5);
    });

    it("puts six staggered cars on the grid, all on real spaces (§5.2)", () => {
        expect(ASHCOMBE.grid).toHaveLength(MAX_PLAYERS);
        const keys = new Set(ASHCOMBE.grid.map(slot => `${slot.row}:${slot.lane}`));
        expect(keys.size).toBe(MAX_PLAYERS);
        for (const slot of ASHCOMBE.grid) {
            expect(slot.lane).toBeGreaterThanOrEqual(1);
            expect(spaceAt(ASHCOMBE, slot.row, slot.lane)).not.toBeNull();
        }
    });

    it("draws every space exactly once", () => {
        expect(ASHCOMBE.geometry).toHaveLength(spaceCount(ASHCOMBE));
        const keys = new Set(ASHCOMBE.geometry.map(space => `${space.row}:${space.lane}`));
        expect(keys.size).toBe(spaceCount(ASHCOMBE));
        for (const space of ASHCOMBE.geometry) {
            expect(space.lane).toBeGreaterThanOrEqual(1);
            expect(spaceAt(ASHCOMBE, space.row, space.lane)).not.toBeNull();
        }
    });
});

// The two invariants §23.4 puts on track data rather than on Ashcombe's
// geometry, so that §20's second circuit fails a test rather than a race.
describe("every track", () => {
    it.each(TRACK_LIST.map(track => [track.id, track] as const))("%s holds a full field in every corner", (_id, track) => {
        for (const corner of track.corners) {
            const spaces = track.spaces.filter(space => space.row >= corner.from && space.row <= corner.to).length;
            // A spin searches backwards along its corner for a free space, which
            // is only total if the corner can hold everybody at once.
            expect(spaces).toBeGreaterThanOrEqual(MAX_PLAYERS);
        }
    });

    it.each(TRACK_LIST.map(track => [track.id, track] as const))("%s starts no corner on row 0", (_id, track) => {
        // A corner whose `from` is row 0 has nothing behind it to search.
        for (const corner of track.corners) expect(corner.from).toBeGreaterThan(0);
    });

    it.each(TRACK_LIST.map(track => [track.id, track] as const))("%s has corners in row order that never overlap", (_id, track) => {
        let previousEnd = -1;
        for (const corner of track.corners) {
            expect(corner.from).toBeGreaterThan(previousEnd);
            expect(corner.to).toBeGreaterThanOrEqual(corner.from);
            expect(corner.to).toBeLessThan(track.rows);
            previousEnd = corner.to;
        }
        expect(new Set(track.corners.map(corner => corner.id)).size).toBe(track.corners.length);
    });

    it.each(TRACK_LIST.map(track => [track.id, track] as const))("%s is 2 or 3 lanes wide on every row", (_id, track) => {
        for (let row = 0; row < track.rows; row++) {
            expect([2, 3]).toContain(spacesInRow(track, row).length);
        }
    });

    it.each(TRACK_LIST.map(track => [track.id, track] as const))("%s can be driven off every space it has", (_id, track) => {
        // The step rule is a graph now (§5.1), so the holes it can have are a
        // graph's holes: a space nothing leads out of, a step onto a space that
        // isn't there, and a step that doesn't carry the car forward — which is
        // a car driving a corner's stop count for free.
        for (const space of track.spaces) {
            expect(space.exits.length).toBeGreaterThan(0);
            for (const exit of space.exits) {
                expect(spaceAt(track, exit.row, exit.lane)).not.toBeNull();
                expect(rowsBetween(track, space.row, exit.row)).toBeGreaterThan(0);
            }
        }
    });

    it.each(TRACK_LIST.map(track => [track.id, track] as const))("%s seats a full grid", (_id, track) => {
        expect(track.grid.length).toBeGreaterThanOrEqual(MAX_PLAYERS);
    });
});

describe("the gear table (§8.1)", () => {
    it("is indexed by gear, 0 to 6", () => {
        expect(GEARS).toHaveLength(7);
        GEARS.forEach((def, gear) => expect(def.gear).toBe(gear));
        expect(gearDef(0)).toEqual(GEARS[0]);
    });

    it("gives gear 0 no die and no distance", () => {
        expect(GEARS[0].faces).toEqual([]);
        expect(GEARS[0].min).toBe(0);
        expect(GEARS[0].max).toBe(0);
    });

    it("prints §8.1's bands on §8.1's dice", () => {
        // The die is its face count, so this checks the d4/d6/d8/d12/d20/d30 too.
        expect(GEARS.slice(1).map(def => [def.faces.length, def.min, def.max])).toEqual([
            [4, 1, 2],
            [6, 2, 4],
            [8, 4, 8],
            [12, 7, 12],
            [20, 11, 20],
            [30, 21, 30],
        ]);
    });

    it("draws a die whose faces match its band", () => {
        // Cosmetic, not the roll — gear 3's eight faces cannot be uniform over a
        // five-wide band — but the die on screen still has to be the right die,
        // showing only numbers the gear can actually produce.
        for (const def of GEARS.slice(1)) {
            expect(Math.min(...def.faces)).toBe(def.min);
            expect(Math.max(...def.faces)).toBe(def.max);
        }
    });

    it("climbs without a gap, so the ladder is always worth taking", () => {
        for (let gear = 2; gear < GEARS.length; gear++) {
            expect(GEARS[gear].min).toBeGreaterThan(GEARS[gear - 1].min);
            expect(GEARS[gear].max).toBeGreaterThan(GEARS[gear - 1].max);
            // Bands overlap at their edges or meet exactly; they never leave a
            // distance no gear can roll.
            expect(GEARS[gear].min).toBeLessThanOrEqual(GEARS[gear - 1].max + 1);
        }
    });
});

describe("shifting down (§8.2)", () => {
    it("charges §8.2's table", () => {
        expect(SHIFT_DOWN_GEARBOX_COST).toEqual([0, 0, 1, 3, 6]);
        expect(shiftDownCost(5, 4)).toBe(0);
        expect(shiftDownCost(5, 3)).toBe(1);
        expect(shiftDownCost(5, 2)).toBe(3);
        expect(shiftDownCost(5, 1)).toBe(6);
    });

    it("refuses a drop of five or more", () => {
        expect(shiftDownCost(6, 1)).toBeNull();
        expect(shiftDownCost(5, 0)).toBeNull();
    });

    it("charges nothing for holding a gear or climbing one", () => {
        expect(shiftDownCost(3, 3)).toBe(0);
        expect(shiftDownCost(3, 4)).toBe(0);
    });
});

describe("the spec table (§11)", () => {
    it("splits twelve tokens four ways", () => {
        expect(SPECS.map(spec => spec.id)).toEqual(['balanced', 'sticky', 'stopper', 'closeRatio']);
        for (const spec of SPECS) {
            expect(spec.tyres + spec.brakes + spec.gearbox).toBe(WEAR_TOKENS_PER_CAR);
        }
    });

    it("matches §11's pools", () => {
        expect(SPECS.map(spec => [spec.tyres, spec.brakes, spec.gearbox])).toEqual([
            [5, 4, 3],
            [7, 3, 2],
            [4, 6, 2],
            [4, 3, 5],
        ]);
    });

    it("falls back to Balanced rather than dealing pools of undefined", () => {
        // POST /api/lobby spreads its settings in against a `spec: String`
        // schema, so an unvalidated value can reach here (§23.4).
        expect(specDef('unobtanium').id).toBe(DEFAULT_SPEC);
        expect(specDef('sticky').tyres).toBe(7);
    });
});

describe("race distance (§15)", () => {
    it("is one lap or two", () => {
        expect(RACE_DISTANCES.map(distance => [distance.id, distance.laps])).toEqual([
            ['sprint', 1],
            ['grandPrix', 2],
        ]);
        expect(DEFAULT_DISTANCE).toBe('sprint');
    });

    it("falls back to a Sprint", () => {
        expect(distanceDef('99').laps).toBe(1);
        expect(distanceDef('grandPrix').laps).toBe(2);
    });
});

describe("the field and the hazards", () => {
    it("seats two to six drivers and caps slicks at twelve", () => {
        expect(MIN_PLAYERS).toBe(2);
        expect(MAX_PLAYERS).toBe(6);
        expect(SLICK_CAP).toBe(12);
    });
});

describe("stepsFrom (§5.1)", () => {
    it("steps to the next row, same lane or either lane beside it", () => {
        // The Mile is three lanes wide throughout.
        expect(stepsFrom(ASHCOMBE, 20, 2)).toEqual([
            { row: 21, lane: 1 },
            { row: 21, lane: 2 },
            { row: 21, lane: 3 },
        ]);
        expect(stepsFrom(ASHCOMBE, 20, 1)).toEqual([
            { row: 21, lane: 1 },
            { row: 21, lane: 2 },
        ]);
    });

    it("merges lane 3 into a narrowing corner", () => {
        // Row 9 is three lanes; row 10 is the Hairpin's first, two lanes wide.
        expect(stepsFrom(ASHCOMBE, 9, 3)).toEqual([{ row: 10, lane: 2 }]);
        expect(stepsFrom(ASHCOMBE, 9, 2)).toEqual([
            { row: 10, lane: 1 },
            { row: 10, lane: 2 },
        ]);
    });

    it("wraps at the finish line", () => {
        expect(stepsFrom(ASHCOMBE, 77, 1).every(step => step.row === 0)).toBe(true);
    });

    it("never leaves a car with nowhere to step, anywhere on the circuit", () => {
        // The step rule is what §9 reads as "boxed in by traffic"; an empty list
        // from the geometry alone would be a hole in the board, not a block.
        for (const space of ASHCOMBE.spaces) {
            expect(stepsFrom(ASHCOMBE, space.row, space.lane).length).toBeGreaterThan(0);
        }
    });
});

describe("corner geometry (§10)", () => {
    it("names the corner a row is inside, and nothing on a straight", () => {
        expect(cornerAt(ASHCOMBE, 10)?.id).toBe('hairpin');
        expect(cornerAt(ASHCOMBE, 14)?.id).toBe('hairpin');
        expect(cornerAt(ASHCOMBE, 15)).toBeNull();
        expect(cornerAt(ASHCOMBE, 51)?.id).toBe('gravel');
        expect(cornerAt(ASHCOMBE, 52)).toBeNull();
    });

    it("reports each corner left behind, in path order, with the rows past it", () => {
        // Row 46 to row 66 crosses Gravel Bend and then The Kink.
        expect(cornersPassed(ASHCOMBE, 46, 20).map(pass => [pass.corner.id, pass.rowsPast])).toEqual([
            ['gravel', 15],
            ['kink', 1],
        ]);
    });

    it("counts a crossing that wraps the finish line along the road, not by subtraction", () => {
        // §10: a car on row 60 that moves 20 ends on row 2 of the next lap
        // having crossed The Kink, and `2 − 65` is not the answer.
        expect(cornersPassed(ASHCOMBE, 60, 20).map(pass => pass.corner.id)).toEqual(['kink']);
        expect(rowsBetween(ASHCOMBE, 60, 2)).toBe(20);
    });

    it("reports nothing for a move that stays inside a corner", () => {
        expect(cornersPassed(ASHCOMBE, 10, 3)).toEqual([]);
    });

    it("places each corner on the step of the path that left it behind", () => {
        // The same two corners, walked as an actual path: Ashcombe's lanes run
        // in step, so a step is a row and the crossings land where §10's own
        // worked example puts them.
        const path = Array.from({ length: 21 }, (_unused, step) => ({ row: (46 + step) % ASHCOMBE.rows, lane: 1 }));
        expect(cornerCrossings(ASHCOMBE, path).map(crossing => [crossing.corner.id, crossing.step])).toEqual([
            ['gravel', 6],
            ['kink', 20],
        ]);
        expect(rowsAlong(ASHCOMBE, path)).toBe(20);
    });

    it("completes a lap on crossing the line, not on landing on row 0", () => {
        expect(crossesStartLine(ASHCOMBE, 77, 0)).toBe(true);
        expect(crossesStartLine(ASHCOMBE, 76, 1)).toBe(true);
        expect(crossesStartLine(ASHCOMBE, 70, 75)).toBe(false);
        // A car standing on the line is over it already.
        expect(crossesStartLine(ASHCOMBE, 0, 1)).toBe(false);
    });

    it("quotes a gear's band in rows, which is its step count while the lanes run in step", () => {
        expect(rowsCovered(ASHCOMBE, { row: 20, lane: 2 }, 8)).toEqual({ min: 8, max: 8 });
        expect(rowsCovered(ASHCOMBE, { row: 20, lane: 2 }, 0)).toEqual({ min: 0, max: 0 });
    });
});

// ─────────────────────────────────────────────────────────────────────────────

/** A circuit built from `sections` alone — no art, no grid, no geometry. */
function testTrack(sections: TrackSection[]): RaceCarsTrack {
    return {
        id: 'test',
        name: 'Test',
        ...deriveTrack(sections),
        grid: [],
        maxGear: 5,
        art: { href: '', viewBox: { width: 0, height: 0 } },
        geometry: [],
    };
}

// The Kettle: a corner whose outside is painted — each of its spaces feeds the
// one in front and nothing else — and whose inside takes four spaces to cover
// the eight rows the outside takes. Both of the things §5.1's own step rule
// cannot say, on one corner, because a real board says them on one corner.
//
// Deliberately not a circuit anybody races: Ashcombe and Anglet are the tracks,
// and this is the shape the data has to be able to hold.
const KETTLE_SECTIONS: TrackSection[] = [
    { name: 'Straight', from: 0, to: 5, lanes: 3, corner: null },
    {
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
            // The inside, four spaces to the outside's eight, rejoining the
            // road in either lane at the end of it.
            { row: 6, lane: 1, exits: [{ row: 8, lane: 1 }] },
            { row: 8, lane: 1, exits: [{ row: 10, lane: 1 }] },
            { row: 10, lane: 1, exits: [{ row: 12, lane: 1 }] },
            { row: 12, lane: 1, exits: [{ row: 14, lane: 1 }, { row: 14, lane: 2 }] },
        ],
    },
    { name: 'Run to the Line', from: 14, to: 19, lanes: 3, corner: null },
];

const KETTLE = testTrack(KETTLE_SECTIONS);

describe("a corner whose lanes do not run in step (§5.1)", () => {
    it("steps where the space says it may, and nowhere else", () => {
        // Painted: the outside of the corner feeds the space in front of it.
        expect(stepsFrom(KETTLE, 6, 2)).toEqual([{ row: 7, lane: 2 }]);
        // The inside skips the rows it has no space on.
        expect(stepsFrom(KETTLE, 6, 1)).toEqual([{ row: 8, lane: 1 }]);
        expect(spaceAt(KETTLE, 7, 1)).toBeNull();
        // Everything around it still gets §5.1's own rule, narrowing included.
        expect(stepsFrom(KETTLE, 5, 3)).toEqual([{ row: 6, lane: 2 }]);
        expect(stepsFrom(KETTLE, 5, 2)).toEqual([{ row: 6, lane: 1 }, { row: 6, lane: 2 }]);
    });

    it("covers the corner in four spaces on the inside and eight on the outside", () => {
        expect(rowsCovered(KETTLE, { row: 6, lane: 1 }, 4)).toEqual({ min: 8, max: 8 });
        expect(rowsCovered(KETTLE, { row: 6, lane: 2 }, 4)).toEqual({ min: 4, max: 4 });
    });

    it("makes a gear's band a range of rows rather than a number of them", () => {
        // From the straight, where the line into the corner is still a choice:
        // five spaces are five rows round the outside and nine down the inside.
        expect(rowsCovered(KETTLE, { row: 5, lane: 2 }, 5)).toEqual({ min: 5, max: 9 });
    });

    it("charges an overshoot in rows of road, not in spaces driven", () => {
        // Five spaces down the inside land on row 15, two rows past the
        // corner's last row — the same five round the outside are still in it.
        const inside = [
            { row: 6, lane: 1 }, { row: 8, lane: 1 }, { row: 10, lane: 1 },
            { row: 12, lane: 1 }, { row: 14, lane: 1 }, { row: 15, lane: 1 },
        ];
        expect(rowsAlong(KETTLE, inside)).toBe(9);
        expect(cornerCrossings(KETTLE, inside)).toEqual([
            { corner: KETTLE.corners[0], step: 4, rowsPast: 2 },
        ]);

        const outside = [6, 7, 8, 9, 10, 11].map(row => ({ row, lane: 2 }));
        expect(cornerCrossings(KETTLE, outside)).toEqual([]);
    });

    it("waives the corner for an inside line that has nowhere left inside it (§10)", () => {
        // Not "standing on the corner's last row": the inside line's last space
        // is two rows short of it and still has nowhere to go but out.
        expect(waivedCornerIdAt(KETTLE, 12, 1)).toBe('kettle');
        expect(waivedCornerIdAt(KETTLE, 12, 2)).toBeNull();
        expect(waivedCornerIdAt(KETTLE, 13, 2)).toBe('kettle');
        expect(waivedCornerIdAt(KETTLE, 5, 2)).toBeNull();
    });
});

describe("deriveTrack refuses a circuit that cannot be driven", () => {
    const straight = (from: number, to: number, lanes: 2 | 3 = 3): TrackSection =>
        ({ name: `Rows ${from}-${to}`, from, to, lanes, corner: null });

    it("refuses a step onto a space that is not there", () => {
        expect(() => testTrack([
            straight(0, 2),
            { name: 'Bend', from: 3, to: 4, lanes: 2, corner: null, tiles: [
                { row: 3, lane: 1, exits: [{ row: 4, lane: 3 }] },
                { row: 3, lane: 2 }, { row: 4, lane: 1 }, { row: 4, lane: 2 },
            ] },
        ])).toThrow(/not a space/);
    });

    it("refuses a space nothing can be driven off", () => {
        expect(() => testTrack([
            straight(0, 2),
            { name: 'Bend', from: 3, to: 4, lanes: 2, corner: null, tiles: [
                { row: 3, lane: 1, exits: [] },
                { row: 3, lane: 2 }, { row: 4, lane: 1 }, { row: 4, lane: 2 },
            ] },
        ])).toThrow(/nothing to step to/);
    });

    it("refuses a sideways step — a car changes lane while moving (§5.1)", () => {
        expect(() => testTrack([
            straight(0, 2),
            { name: 'Bend', from: 3, to: 4, lanes: 2, corner: null, tiles: [
                { row: 3, lane: 1, exits: [{ row: 3, lane: 2 }] },
                { row: 3, lane: 2 }, { row: 4, lane: 1 }, { row: 4, lane: 2 },
            ] },
        ])).toThrow(/sideways/);
    });

    it("refuses a row the road skips entirely", () => {
        expect(() => testTrack([
            straight(0, 2),
            { name: 'Bend', from: 3, to: 4, lanes: 2, corner: null, tiles: [
                { row: 3, lane: 1, exits: [{ row: 0, lane: 1 }] },
                { row: 3, lane: 2, exits: [{ row: 0, lane: 2 }] },
            ] },
        ])).toThrow(/row 4 has no spaces/);
    });

    it("refuses a lane the road is not wide enough for, and a gap between sections", () => {
        expect(() => testTrack([
            straight(0, 2),
            { name: 'Bend', from: 3, to: 3, lanes: 2, corner: null, tiles: [
                { row: 3, lane: 1 }, { row: 3, lane: 3 },
            ] },
        ])).toThrow(/2-lane road/);
        expect(() => testTrack([straight(0, 2), straight(4, 6)])).toThrow(/expected to start at 3/);
    });
});

describe("the track registry (§20)", () => {
    it("finds Ashcombe and falls back to it", () => {
        expect(trackById('ashcombe')).toBe(ASHCOMBE);
        expect(trackById('nowhere')).toBe(ASHCOMBE);
    });
});
