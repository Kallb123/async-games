import { describe, expect, it } from "vitest";
import {
    cornerAt,
    cornerExits,
    DEFAULT_DISTANCE,
    DEFAULT_SPEC,
    distanceDef,
    gearDef,
    GEARS,
    laneWidthAt,
    MAX_PLAYERS,
    MIN_PLAYERS,
    RACE_DISTANCES,
    RaceCarsTrack,
    rowsBetween,
    shiftDownCost,
    SHIFT_DOWN_GEARBOX_COST,
    SLICK_CAP,
    spaceCount,
    SPECS,
    specDef,
    stepsFrom,
    TRACKS,
    trackById,
    WEAR_TOKENS_PER_CAR,
} from "./board";
import { ASHCOMBE } from "./tracks/ashcombe";

const TRACK_LIST: RaceCarsTrack[] = Object.values(TRACKS);

describe("Ashcombe Park", () => {
    it("is 78 rows and 214 spaces (§5.2)", () => {
        expect(ASHCOMBE.rows).toBe(78);
        expect(ASHCOMBE.laneWidth).toHaveLength(78);
        expect(spaceCount(ASHCOMBE)).toBe(214);
    });

    it("transcribes §5.2's sections as lane widths", () => {
        // Rows per §5.2: three lanes everywhere except the Hairpin, Gravel Bend
        // and the Woodland Esses, which is what makes a corner block.
        const widths = ASHCOMBE.laneWidth;
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
            expect(slot.lane).toBeLessThanOrEqual(laneWidthAt(ASHCOMBE, slot.row));
        }
    });

    it("draws every space exactly once", () => {
        expect(ASHCOMBE.geometry).toHaveLength(spaceCount(ASHCOMBE));
        const keys = new Set(ASHCOMBE.geometry.map(space => `${space.row}:${space.lane}`));
        expect(keys.size).toBe(spaceCount(ASHCOMBE));
        for (const space of ASHCOMBE.geometry) {
            expect(space.lane).toBeGreaterThanOrEqual(1);
            expect(space.lane).toBeLessThanOrEqual(laneWidthAt(ASHCOMBE, space.row));
        }
    });
});

// The two invariants §23.4 puts on track data rather than on Ashcombe's
// geometry, so that §20's second circuit fails a test rather than a race.
describe("every track", () => {
    it.each(TRACK_LIST.map(track => [track.id, track] as const))("%s holds a full field in every corner", (_id, track) => {
        for (const corner of track.corners) {
            const spaces = track.laneWidth
                .slice(corner.from, corner.to + 1)
                .reduce((total, lanes) => total + lanes, 0);
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
        expect(track.laneWidth).toHaveLength(track.rows);
        for (const width of track.laneWidth) expect([2, 3]).toContain(width);
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
        expect(GEARS[0].sides).toBeNull();
        expect(GEARS[0].min).toBe(0);
        expect(GEARS[0].max).toBe(0);
    });

    it("prints §8.1's bands on §8.1's dice", () => {
        expect(GEARS.slice(1).map(def => [def.sides, def.min, def.max])).toEqual([
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
            expect(def.faces).toHaveLength(def.sides!);
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
        for (let row = 0; row < ASHCOMBE.rows; row++) {
            for (let lane = 1; lane <= laneWidthAt(ASHCOMBE, row); lane++) {
                expect(stepsFrom(ASHCOMBE, row, lane).length).toBeGreaterThan(0);
            }
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

    it("reports each corner left behind, in path order", () => {
        // Row 46 to row 66 crosses Gravel Bend and then The Kink.
        expect(cornerExits(ASHCOMBE, 46, 20).map(exit => [exit.corner.id, exit.step])).toEqual([
            ['gravel', 6],
            ['kink', 20],
        ]);
    });

    it("counts a crossing that wraps the finish line along the path, not by subtraction", () => {
        // §10: a car on row 60 that moves 20 ends on row 2 of the next lap
        // having crossed The Kink, and `2 − 65` is not the answer.
        expect(cornerExits(ASHCOMBE, 60, 20).map(exit => exit.corner.id)).toEqual(['kink']);
        expect(rowsBetween(ASHCOMBE, 60, 2)).toBe(20);
    });

    it("reports nothing for a move that stays inside a corner", () => {
        expect(cornerExits(ASHCOMBE, 10, 3)).toEqual([]);
    });
});

describe("the track registry (§20)", () => {
    it("finds Ashcombe and falls back to it", () => {
        expect(trackById('ashcombe')).toBe(ASHCOMBE);
        expect(trackById('nowhere')).toBe(ASHCOMBE);
    });
});
