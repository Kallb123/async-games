import { describe, expect, it } from "vitest";
import {
    cornerAt,
    cornerExits,
    cornerReaches,
    crossesFinishLine,
    DEFAULT_DISTANCE,
    DEFAULT_SPEC,
    distanceDef,
    gearDef,
    GEARS,
    MAX_PLAYERS,
    MIN_PLAYERS,
    RACE_DISTANCES,
    RaceCarsSpace,
    RaceCarsTrack,
    rowsBetween,
    shiftDownCost,
    SHIFT_DOWN_GEARBOX_COST,
    SLICK_CAP,
    spaceAt,
    spaceCount,
    spaceKey,
    spacesInCorner,
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
import { assembleSpaces, type TrackSection } from "./tracks/sections";
import { kettleCorner, testTrack } from "./testFixtures";

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
        // The table §5.2 prints, written out rather than referred back to: the
        // slots are named as tiles in `ashcombe.ts` and resolved through the
        // derivation, so this is what says the derivation still puts them here.
        expect(ASHCOMBE.grid).toEqual([
            { row: 2, lane: 1 }, { row: 2, lane: 3 },
            { row: 1, lane: 1 }, { row: 1, lane: 3 },
            { row: 0, lane: 1 }, { row: 0, lane: 3 },
        ]);
        for (const slot of ASHCOMBE.grid) {
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
            // Read off the corner's own spaces rather than its row band: they
            // are the same set now that a corner is a section (§10), and this
            // is the set a spin actually searches — which is only total if the
            // corner can hold everybody at once. A corner drawn with a short
            // inside line has fewer spaces than its rows suggest, and this is
            // the number that matters.
            expect(spacesInCorner(track, corner.id).length).toBeGreaterThanOrEqual(MAX_PLAYERS);
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

    it.each(TRACK_LIST.map(track => [track.id, track] as const))("%s has road on every row, and never more than three lanes of it", (_id, track) => {
        // Not "two or three lanes wide on every row", which was true only while
        // every circuit ran its lanes in step. A corner drawn with one tile on
        // the inside against five on the outside has rows the inside line
        // simply is not on — that is the shape §5.1 exists to hold, and the
        // rows it skips are the ones it saved. What must still hold is that the
        // road is somewhere on every row (a row nothing is on is a rank nothing
        // can be level with) and never wider than the widest road there is.
        for (let row = 0; row < track.rows; row++) {
            const width = spacesInRow(track, row).length;
            expect(width).toBeGreaterThan(0);
            expect(width).toBeLessThanOrEqual(3);
        }
    });

    it.each(TRACK_LIST.map(track => [track.id, track] as const))("%s can be driven off every space it has", (_id, track) => {
        // The step rule is a graph now (§5.1), so the holes it can have are a
        // graph's holes: a space nothing leads out of, a step onto a space that
        // isn't there, and a step that doesn't carry the car forward — which is
        // a car driving a corner's stop count for free. `deriveTrack` throws on
        // all three, and this is the assertion for a circuit that ever stops
        // coming through it — a hand-written `spaces`, or a generated one.
        for (const space of track.spaces) {
            expect(space.exits.length).toBeGreaterThan(0);
            for (const exit of space.exits) {
                expect(spaceAt(track, exit.row, exit.lane)).not.toBeNull();
                expect(rowsBetween(track, space.row, exit.row)).toBeGreaterThan(0);
            }
        }
    });

    it.each(TRACK_LIST.map(track => [track.id, track] as const))("%s seats a full grid, every car on a space it has", (_id, track) => {
        // The invariant Anglet shipped without. Its lanes never sit level, so
        // rows 0 and 2 are lane 2 alone — and the shared six-slot grid dealt
        // four of its six cars onto `{ row: 0 | 2, lane: 1 | 3 }`, coordinates
        // with no road at them. `spaceAt` answered null, `stepsFrom` an empty
        // list, and every turn those drivers took could only say "boxed in".
        // A grid slot is now a tile id resolved through the derivation
        // (`tracks/sections.ts`), which cannot name a space that is not there —
        // this is the assertion under that, for a grid that ever stops coming
        // through it.
        expect(track.grid.length).toBeGreaterThanOrEqual(MAX_PLAYERS);
        const keys = new Set(track.grid.map(slot => spaceKey(slot.row, slot.lane)));
        expect(keys.size).toBe(track.grid.length);
        for (const slot of track.grid) {
            expect(spaceAt(track, slot.row, slot.lane)).not.toBeNull();
            // A space that exists is a space with somewhere to go (§5.1), so
            // this holds for free — and says what the assertion above is for.
            expect(stepsFrom(track, slot.row, slot.lane).length).toBeGreaterThan(0);
        }
    });

    it.each(TRACK_LIST.map(track => [track.id, track] as const))("%s paints its finish line and its oil on spaces it has", (_id, track) => {
        // Both are optional and neither is read by a race yet (`board.ts`), but
        // a circuit that names one names it the same way the grid does, and a
        // mark on a space the road hasn't got is the same mistake.
        for (const space of [...(track.finish ?? []), ...(track.oil ?? [])]) {
            expect(spaceAt(track, space.row, space.lane)).not.toBeNull();
        }
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
    it("names the corner a space is inside, and nothing on a straight", () => {
        // Ashcombe's corners are whole-band (every lane of their rows), so any
        // lane of a corner row answers with the corner.
        expect(cornerAt(ASHCOMBE, 10, 1)?.id).toBe('hairpin');
        expect(cornerAt(ASHCOMBE, 14, 2)?.id).toBe('hairpin');
        expect(cornerAt(ASHCOMBE, 15, 1)).toBeNull();
        expect(cornerAt(ASHCOMBE, 51, 1)?.id).toBe('gravel');
        expect(cornerAt(ASHCOMBE, 52, 1)).toBeNull();
    });

    it("puts every tile of a corner section in the corner, both lines of it", () => {
        // A corner is a **section** now (§10): the stretch of road between two
        // sync lines, inside for as long as the road is. The inside line takes
        // fewer tiles round it than the outside and is in it for the same
        // stretch — which is what makes "spaces past the corner" the only
        // honest way to charge an overshoot on either line (§5.1).
        expect(spacesInCorner(KETTLE, 'kettle')).toHaveLength(12);
        expect(cornerAt(KETTLE, 8, 1)?.id).toBe('kettle');
        expect(cornerAt(KETTLE, 8, 2)?.id).toBe('kettle');
        expect(cornerAt(KETTLE, 14, 1)).toBeNull();
    });

    it("reports each corner a path leaves behind, in path order, with the spaces past it", () => {
        // Twenty spaces from row 46 down Ashcombe's lane 1, whose lanes run in
        // step: out of Gravel Bend at the sixth and past The Kink at the last.
        const path = Array.from({ length: 21 }, (_unused, step) => ({ row: (46 + step) % ASHCOMBE.rows, lane: 1 }));
        expect(cornerExits(ASHCOMBE, path).map(exit => [exit.corner.id, exit.step, exit.spacesPast])).toEqual([
            ['gravel', 6, 15],
            ['kink', 20, 1],
        ]);
    });

    it("reads a crossing off the spaces, so a move that wraps the line needs no special case", () => {
        // §10: a car on row 60 that drives 20 spaces ends on row 2 of the next
        // lap having crossed The Kink, and `2 − 65` is not the answer — nothing
        // here subtracts one row number from another.
        const path = Array.from({ length: 21 }, (_unused, step) => ({ row: (60 + step) % ASHCOMBE.rows, lane: 1 }));
        expect(cornerExits(ASHCOMBE, path).map(exit => exit.corner.id)).toEqual(['kink']);
    });

    it("reports nothing for a move that stays inside a corner", () => {
        const path = [10, 11, 12, 13].map(row => ({ row, lane: 1 }));
        expect(cornerExits(ASHCOMBE, path)).toEqual([]);
    });

    it("completes a lap on crossing the line, not on landing on row 0", () => {
        const at = (row: number, lane = 1) => ({ row, lane });
        expect(crossesFinishLine(ASHCOMBE, at(77), at(0))).toBe(true);
        expect(crossesFinishLine(ASHCOMBE, at(76), at(1))).toBe(true);
        expect(crossesFinishLine(ASHCOMBE, at(70), at(75))).toBe(false);
        // A car standing on the line is over it already.
        expect(crossesFinishLine(ASHCOMBE, at(0), at(1))).toBe(false);
        // Whichever lane takes the step: the boundary is the circuit's, not the
        // lane's, so cars level across the road bank their laps together.
        expect(crossesFinishLine(ASHCOMBE, at(77, 3), at(1, 1))).toBe(true);
    });

    it("says how many spaces out each corner is, and how long a move can stay in it", () => {
        // What the reach band quotes (§23.5): the currency the die is thrown in.
        const reaches = cornerReaches(ASHCOMBE, { row: 44, lane: 2 }, 20);
        expect(reaches.get('gravel')).toMatchObject({ enter: 3, last: 7 });
        // The Kink is still ahead at the end of the walk, so "last" is as far
        // as it was asked to look rather than the corner's own last space.
        expect(reaches.get('kink')).toMatchObject({ enter: 18, last: 20 });
        // A car standing in a corner is nought spaces into it, and can stay in
        // it for as long as the corner runs — not until it comes back round to
        // it a lap later, which a walk of a whole lap does reach.
        expect(cornerReaches(ASHCOMBE, { row: 48, lane: 1 }, 6).get('gravel')).toMatchObject({ enter: 0, last: 3 });
        expect(cornerReaches(ASHCOMBE, { row: 48, lane: 1 }, ASHCOMBE.rows).get('gravel'))
            .toMatchObject({ enter: 0, last: 3 });
    });
});

// ─────────────────────────────────────────────────────────────────────────────

// The Kettle (testFixtures.ts) with a straight either side of it: a corner
// whose outside is painted and whose inside takes four tiles to the outside's
// eight, which is both of the things §5.1's own step rule cannot say.
//
// Its rows are derived, not typed (`tracks/sections.ts`): the straight takes
// rows 0-5, the corner 6-13 — its longest line through — and the run-out 14-19.
// The inside line's four tiles are spread evenly across the corner's own eight
// rows rather than bunched at one end of them, which is what keeps the two
// lines comparable while one of them covers the road in half the tiles.
const KETTLE = testTrack([
    { id: 'straight', name: 'Straight', length: 6, lanes: 3, corner: null },
    kettleCorner('run'),
    { id: 'run', name: 'Run to the Line', length: 6, lanes: 3, corner: null },
]);

/** Every route of exactly `steps` steps off a space, traffic ignored — a test's
 *  brute force, where the game itself walks breadth-first and keeps one. */
function everyPath(track: RaceCarsTrack, from: RaceCarsSpace, steps: number): RaceCarsSpace[][] {
    if (steps === 0) return [[from]];
    return stepsFrom(track, from.row, from.lane)
        .flatMap(next => everyPath(track, next, steps - 1).map(rest => [from, ...rest]));
}

describe("a corner whose lanes do not run in step (§5.1)", () => {
    it("derives rows the lanes agree on rather than letting them drift apart", () => {
        // The outside's eight tiles take a row each; the inside's four are
        // spread across the same eight rows, two rows to a tile.
        expect(KETTLE.rows).toBe(20);
        expect(KETTLE.corners).toEqual([{ id: 'kettle', name: 'The Kettle', from: 6, to: 13, stops: 1 }]);
        const inside = KETTLE.spaces.filter(space => space.lane === 1 && space.cornerId === 'kettle');
        expect(inside.map(space => space.row)).toEqual([8, 9, 10, 11]);
        const outside = KETTLE.spaces.filter(space => space.lane === 2 && space.cornerId === 'kettle');
        expect(outside.map(space => space.row)).toEqual([6, 7, 8, 9, 10, 11, 12, 13]);
    });

    it("steps where the tile says it may, and nowhere else", () => {
        // Painted: the outside of the corner feeds the tile in front of it.
        expect(stepsFrom(KETTLE, 6, 2)).toEqual([{ row: 7, lane: 2 }]);
        // The inside skips the rows it has no tile on.
        expect(stepsFrom(KETTLE, 11, 1)).toEqual([{ row: 14, lane: 1 }, { row: 14, lane: 2 }]);
        expect(spaceAt(KETTLE, 7, 1)).toBeNull();
        // Everything around it still gets §5.1's own rule, narrowing included.
        expect(stepsFrom(KETTLE, 5, 3)).toEqual([{ row: 6, lane: 2 }]);
        expect(stepsFrom(KETTLE, 5, 2)).toEqual([{ row: 8, lane: 1 }, { row: 6, lane: 2 }]);
    });

    it("never lets a step fail to move the car forward, whichever line it takes", () => {
        // The invariant the derivation exists to hold: every step of the graph
        // advances at least one row, so no lane can drift level with another.
        for (const space of KETTLE.spaces) {
            for (const exit of space.exits) {
                expect(rowsBetween(KETTLE, space.row, exit.row)).toBeGreaterThan(0);
            }
        }
    });

    it("charges an overshoot in spaces driven, which both lines can be read in", () => {
        // Five spaces down the inside are out of the corner and one space past
        // it; the same five round the outside are still in it.
        const inside = [
            { row: 5, lane: 1 }, { row: 8, lane: 1 }, { row: 9, lane: 1 },
            { row: 10, lane: 1 }, { row: 11, lane: 1 }, { row: 14, lane: 1 },
        ];
        expect(cornerExits(KETTLE, inside).map(exit => [exit.corner.id, exit.spacesPast])).toEqual([
            ['kettle', 1],
        ]);

        const outside = [5, 6, 7, 8, 9, 10].map(row => ({ row, lane: row === 5 ? 2 : 2 }));
        expect(cornerExits(KETTLE, outside)).toEqual([]);
    });

    it("charges every route to one destination the same, which is what §9 sells", () => {
        // §9 lets a driver tap a **destination** rather than draw a path, and
        // that is only honest if two routes of the same length to the same
        // space are charged the same — which, now that an overshoot is read off
        // the corner each step is in, is a statement about the board rather
        // than about arithmetic. Every route of every length, enumerated.
        const starts = [
            { track: KETTLE, from: { row: 5, lane: 1 }, steps: 8 },
            { track: KETTLE, from: { row: 5, lane: 2 }, steps: 8 },
            { track: KETTLE, from: { row: 8, lane: 1 }, steps: 8 },
            // A three-lane road through a real corner: every route of eight
            // spaces from the end of The Mile, over Gravel Bend and out.
            { track: ASHCOMBE, from: { row: 46, lane: 2 }, steps: 8 },
            // And the one-inside, five-outside right-hander below, where the
            // lines through the corner differ most.
            { track: RIGHT_HANDER, from: { row: 2, lane: 2 }, steps: 8 },
        ];
        for (const start of starts) {
            for (let steps = 1; steps <= start.steps; steps++) {
                const charged = new Map<string, string>();
                for (const path of everyPath(start.track, start.from, steps)) {
                    const end = spaceKey(path[steps].row, path[steps].lane);
                    const bill = cornerExits(start.track, path)
                        .map(exit => `${exit.corner.id}:${exit.spacesPast}`).join(',');
                    const seen = charged.get(end);
                    if (seen === undefined) charged.set(end, bill);
                    else expect([end, bill]).toEqual([end, seen]);
                }
            }
        }
    });

    it("waives the corner for an inside line that has nowhere left inside it (§10)", () => {
        // Not "standing on the corner's last row": the inside line's last tile
        // is two rows short of it and still has nowhere to go but out.
        expect(waivedCornerIdAt(KETTLE, 11, 1)).toBe('kettle');
        expect(waivedCornerIdAt(KETTLE, 11, 2)).toBeNull();
        expect(waivedCornerIdAt(KETTLE, 13, 2)).toBe('kettle');
        expect(waivedCornerIdAt(KETTLE, 5, 2)).toBeNull();
    });
});

// A **staggered** straight: the lanes are drawn half a tile apart, so a lane
// change is a step diagonally forward rather than straight across — which is
// how a real board draws a road you can change lane on without losing ground.
//
// This is the shape that broke the old model. Counting rows along each lane put
// the two lanes' tiles on the same row numbers, so the diagonal step a car
// actually drives came out as a step that changes lane without moving forward —
// refused by the rules, and the corner behind it out of step for the rest of
// the lap. Derived, the two lanes interleave: each tile gets its own rank, and
// every step advances.
const STAGGERED = testTrack([
    {
        id: 'straight', name: 'Staggered Straight', lanes: 2, corner: null,
        tiles: [
            ...Array.from({ length: 3 }, (_unused, index) => ({
                id: `straight.1.${index}`,
                lane: 1,
                // On along this lane, or across to the tile half a tile ahead.
                exits: index < 2
                    ? [`straight.1.${index + 1}`, `straight.2.${index}`]
                    : [`straight.2.${index}`],
            })),
            ...Array.from({ length: 3 }, (_unused, index) => ({
                id: `straight.2.${index}`,
                lane: 2,
                exits: index < 2
                    ? [`straight.2.${index + 1}`, `straight.1.${index + 1}`]
                    : ['run.1.0', 'run.2.0'],
            })),
        ],
    },
    { id: 'run', name: 'Run to the Line', length: 2, lanes: 2, corner: null },
]);

describe("a staggered straight, drawn half a tile out of step (§5.1)", () => {
    it("gives each lane its own ranks rather than putting both on the same rows", () => {
        // Six rows of staggered road, then a plain two-row run to the line.
        expect(STAGGERED.rows).toBe(8);
        const staggered = STAGGERED.spaces.filter(space => space.row < 6);
        expect(staggered.filter(space => space.lane === 1).map(space => space.row)).toEqual([0, 2, 4]);
        expect(staggered.filter(space => space.lane === 2).map(space => space.row)).toEqual([1, 3, 5]);
    });

    it("makes the lane change a step that moves the car forward", () => {
        // The bug in one line: this step used to come out as 7:3 → 7:2.
        expect(stepsFrom(STAGGERED, 0, 1)).toEqual([{ row: 2, lane: 1 }, { row: 1, lane: 2 }]);
        for (const space of STAGGERED.spaces) {
            for (const exit of space.exits) {
                expect(rowsBetween(STAGGERED, space.row, exit.row)).toBeGreaterThan(0);
            }
        }
    });
});

// The corner the board art actually draws at a 90° right-hander: the inside
// lane is **one** tile, the middle three, the outside five. The most extreme
// version of "lanes need not run in step" a real circuit asks for, and the one
// the old row-counting model could not hold at all — the lanes came out of it
// four apart.
const RIGHT_HANDER = testTrack([
    { id: 'approach', name: 'Approach', length: 3, lanes: 3, corner: null },
    {
        id: 'bend', name: 'The Bend', lanes: 3, corner: { stops: 1 },
        tiles: [
            // The inside: one tile, and the only way off it is out of the corner.
            { id: 'bend.1.0', lane: 1, exits: ['run.1.0', 'run.2.0'] },
            ...[0, 1, 2].map(index => ({
                id: `bend.2.${index}`,
                lane: 2,
                exits: index < 2 ? [`bend.2.${index + 1}`] : ['run.1.0', 'run.2.0', 'run.3.0'],
            })),
            ...[0, 1, 2, 3, 4].map(index => ({
                id: `bend.3.${index}`,
                lane: 3,
                exits: index < 4 ? [`bend.3.${index + 1}`] : ['run.2.0', 'run.3.0'],
            })),
        ],
    },
    { id: 'run', name: 'Run to the Line', length: 3, lanes: 3, corner: null },
]);

describe("a corner of one tile inside and five outside (§5.1)", () => {
    it("ranks all three lanes against the outside line's extent", () => {
        expect(RIGHT_HANDER.rows).toBe(11);
        expect(RIGHT_HANDER.corners).toEqual([{ id: 'bend', name: 'The Bend', from: 3, to: 7, stops: 1 }]);
        const rowsIn = (lane: number) => RIGHT_HANDER.spaces
            .filter(space => space.cornerId === 'bend' && space.lane === lane)
            .map(space => space.row);
        // Five rows of corner: the outside takes one a tile, the middle three
        // of them, and the inside's single tile ranks in the middle of the lot.
        expect(rowsIn(3)).toEqual([3, 4, 5, 6, 7]);
        expect(rowsIn(2)).toEqual([4, 5, 6]);
        expect(rowsIn(1)).toEqual([5]);
    });

    it("takes the whole corner in one step down the inside, and five round the outside", () => {
        // Entering it is a single step covering three rows of road.
        expect(stepsFrom(RIGHT_HANDER, 2, 1)).toContainEqual({ row: 5, lane: 1 });
        // And there is nowhere to go from there but out, which is §10's waiver.
        expect(waivedCornerIdAt(RIGHT_HANDER, 5, 1)).toBe('bend');
        expect(waivedCornerIdAt(RIGHT_HANDER, 5, 3)).toBeNull();
    });

    it("keeps the invariants a shipped circuit is held to", () => {
        // The two that a corner like this used to break: every row has road on
        // it somewhere (rows 3 and 7 have only the outside line, which is the
        // point), and the corner still holds a full field for a spin to be put
        // back into.
        for (let row = 0; row < RIGHT_HANDER.rows; row++) {
            expect(spacesInRow(RIGHT_HANDER, row).length).toBeGreaterThan(0);
        }
        expect(spacesInCorner(RIGHT_HANDER, 'bend').length).toBeGreaterThanOrEqual(MAX_PLAYERS);
    });

    it("charges the inside line for the spaces it is past, not the rows", () => {
        // Two spaces down the inside are out of the corner and one space past
        // it; two round the outside are three tiles from leaving.
        const inside = [{ row: 2, lane: 1 }, { row: 5, lane: 1 }, { row: 8, lane: 1 }];
        expect(cornerExits(RIGHT_HANDER, inside).map(exit => [exit.corner.id, exit.spacesPast])).toEqual([
            ['bend', 1],
        ]);
        const outside = [{ row: 2, lane: 3 }, { row: 3, lane: 3 }, { row: 4, lane: 3 }];
        expect(cornerExits(RIGHT_HANDER, outside)).toEqual([]);
    });
});

describe("deriveTrack refuses a circuit that cannot be driven", () => {
    const straight = (id: string, length: number, lanes: 2 | 3 = 3): TrackSection =>
        ({ id, name: id, length, lanes, corner: null });

    it("refuses a step onto a tile that is not there", () => {
        expect(() => testTrack([
            straight('s', 3),
            { id: 'bend', name: 'Bend', lanes: 2, corner: null, tiles: [
                { id: 'b.1.0', lane: 1, exits: ['b.9.9'] },
                { id: 'b.2.0', lane: 2, exits: ['s.1.0'] },
            ] },
        ])).toThrow(/not a tile/);
    });

    it("refuses a tile nothing can be driven off", () => {
        expect(() => testTrack([
            straight('s', 3),
            { id: 'bend', name: 'Bend', lanes: 2, corner: null, tiles: [
                { id: 'b.1.0', lane: 1, exits: [] },
                { id: 'b.2.0', lane: 2, exits: ['s.1.0'] },
            ] },
        ])).toThrow(/nothing to step to/);
    });

    it("refuses a band whose lanes run out of step and name no steps of their own", () => {
        // The default rule is a statement about a road whose lanes run in step;
        // over one that doesn't it is a guess, and a guess is what used to put
        // two tiles drawn side by side a row apart.
        expect(() => testTrack([
            straight('s', 3),
            { id: 'bend', name: 'Bend', lanes: 2, corner: null, tiles: [
                { id: 'b.1.0', lane: 1 },
                { id: 'b.2.0', lane: 2 },
                { id: 'b.2.1', lane: 2 },
            ] },
        ])).toThrow(/out of step/);
    });

    it("refuses steps that loop back on themselves inside a section", () => {
        expect(() => testTrack([
            straight('s', 3),
            { id: 'bend', name: 'Bend', lanes: 2, corner: null, tiles: [
                { id: 'b.1.0', lane: 1, exits: ['b.2.0'] },
                { id: 'b.2.0', lane: 2, exits: ['b.1.0'] },
            ] },
        ])).toThrow(/loop back/);
    });

    it("refuses two tiles sharing an id, an empty section, and a lane the road is not wide enough for", () => {
        expect(() => testTrack([
            straight('s', 3),
            { id: 'bend', name: 'Bend', lanes: 2, corner: null, tiles: [
                { id: 'b.1.0', lane: 1, exits: ['s.1.0'] },
                { id: 'b.1.0', lane: 2, exits: ['s.2.0'] },
            ] },
        ])).toThrow(/share the id/);

        expect(() => testTrack([straight('s', 3), { id: 'empty', name: 'Empty', lanes: 2, corner: null, tiles: [] }]))
            .toThrow(/has no tiles/);

        expect(() => testTrack([
            straight('s', 3),
            { id: 'bend', name: 'Bend', lanes: 2, corner: null, tiles: [
                { id: 'b.1.0', lane: 1, exits: ['s.1.0'] },
                { id: 'b.3.0', lane: 3, exits: ['s.3.0'] },
            ] },
        ])).toThrow(/2-lane road/);
    });

    it("still refuses a hand-built spaces list that breaks the graph", () => {
        // `assembleSpaces` is the guard under the derivation, and the one the
        // editor runs a drawing through: a track file that ever stops coming
        // through `deriveTrack` is checked here instead.
        expect(() => assembleSpaces([
            { row: 0, lane: 1, exits: [{ row: 0, lane: 2 }] },
            { row: 0, lane: 2, exits: [{ row: 1, lane: 2 }] },
            { row: 1, lane: 2, exits: [{ row: 0, lane: 1 }] },
        ], 2)).toThrow(/sideways/);
        expect(() => assembleSpaces([
            { row: 0, lane: 1, exits: [{ row: 2, lane: 1 }] },
            { row: 2, lane: 1, exits: [{ row: 0, lane: 1 }] },
        ], 3)).toThrow(/row 1 has no spaces/);
    });
});

describe("the track registry (§20)", () => {
    it("finds Ashcombe and falls back to it", () => {
        expect(trackById('ashcombe')).toBe(ASHCOMBE);
        expect(trackById('nowhere')).toBe(ASHCOMBE);
    });
});
