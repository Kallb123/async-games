import { afterAll, describe, expect, it } from "vitest";
import { MAX_PLAYERS, RaceCarsSpace, RaceCarsTrack, TRACKS } from "./board";
import {
    conservativeTurn,
    derivePath,
    IRaceCarsPlayerState,
    IRaceCarsSpecificGameState,
    legalGears,
    moveOptions,
    reachableSpaces,
    recomputeRoundOrder,
    resolveArrival,
    rollFor,
    slipstreamOffered,
    trackProgress,
} from "./rules";

// Ashcombe (§5.2), for reading the fixtures below against:
//   0-9 straight (3) · 10-14 Hairpin (2, two stops) · 15-46 The Mile (3)
//   47-51 Gravel Bend (2, one stop) · 52-61 Esses (2) · 62-65 The Kink (3, one)
//   66-77 Run to the Line (3)

// A second circuit, registered here rather than shipped, because Ashcombe
// cannot show one thing §10 promises: its corners are far enough apart that a
// move crossing two of them always owes the first more tyres than any spec
// carries, so the first corner always spins the car and the second is never
// reached. Two corners six rows apart make both charges payable and visible —
// and it doubles as proof the rules read the track data rather than Ashcombe.
const TWO_CORNERS: RaceCarsTrack = {
    id: 'twocorners',
    name: 'Two Corners',
    rows: 30,
    laneWidth: Array.from({ length: 30 }, (_unused, row) =>
        (row >= 8 && row <= 10) || (row >= 14 && row <= 16) ? 2 : 3),
    corners: [
        { id: 'first', name: 'First', from: 8, to: 10, stops: 1 },
        { id: 'second', name: 'Second', from: 14, to: 16, stops: 1 },
    ],
    grid: Array.from({ length: MAX_PLAYERS }, (_unused, slot) => ({
        row: 2 - Math.floor(slot / 2),
        lane: slot % 2 === 0 ? 1 : 3,
    })),
    maxGear: 5,
    art: { href: '', viewBox: { width: 0, height: 0 } },
    geometry: [],
};
// `trackById` resolves through the exported registry, so a fixture circuit has
// to be registered rather than passed in — and taken out again afterwards, so a
// later test that enumerates TRACKS never inherits it. It is built to satisfy
// board.test.ts's own per-track invariants deliberately, not by luck: three rows
// of two lanes holds a full field, and its first corner starts past row 0.
TRACKS[TWO_CORNERS.id] = TWO_CORNERS;
afterAll(() => { delete TRACKS[TWO_CORNERS.id]; });

function car(overrides: Partial<IRaceCarsPlayerState> = {}): IRaceCarsPlayerState {
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

function race(
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

/** Pick a destination, derive the path and resolve it — one driver's whole move. */
function drive(
    state: IRaceCarsSpecificGameState,
    userId: string,
    distance: number,
    options: { lane?: number; oilRolls?: number[] } = {},
) {
    const reach = moveOptions(state, userId, distance);
    const destination = options.lane === undefined
        ? reach.spaces[0]
        : reach.spaces.find(space => space.lane === options.lane)!;
    const path = derivePath(state, userId, reach.distance, destination);
    const rolls = [...(options.oilRolls ?? [])];
    return resolveArrival(state, userId, path, {
        blockedShort: reach.blockedShort,
        nextOilRoll: () => rolls.shift() ?? 6,
    });
}

const key = (space: RaceCarsSpace) => `${space.row}:${space.lane}`;

describe("reach (§9)", () => {
    it("reaches exactly the spaces N steps away, and nothing else", () => {
        const state = race({ a: { row: 20, lane: 2 } });
        for (const distance of [1, 3, 5, 12]) {
            const spaces = reachableSpaces(state, 'a', distance);
            expect(spaces.length).toBeGreaterThan(0);
            for (const space of spaces) expect(space.row).toBe(20 + distance);
        }
    });

    it("opens the full width of a three-lane row and no more", () => {
        const state = race({ a: { row: 20, lane: 2 } });
        expect(reachableSpaces(state, 'a', 5).map(key)).toEqual(['25:1', '25:2', '25:3']);
        // One step from the outside lane only opens two.
        expect(reachableSpaces(race({ a: { row: 20, lane: 1 } }), 'a', 1).map(key)).toEqual(['21:1', '21:2']);
    });

    it("narrows into a corner", () => {
        // Row 50 is inside Gravel Bend, two lanes wide.
        expect(reachableSpaces(race({ a: { row: 40, lane: 2 } }), 'a', 10).map(key)).toEqual(['50:1', '50:2']);
    });

    it("wraps the finish line", () => {
        expect(reachableSpaces(race({ a: { row: 76, lane: 1 } }), 'a', 3).map(space => space.row))
            .toEqual([1, 1, 1]);
    });
});

describe("arguments this module refuses", () => {
    it("refuses a path that does not start where the car is", () => {
        const state = race({ a: { row: 20, lane: 2 } });
        expect(() => resolveArrival(state, 'a', [{ row: 40, lane: 1 }, { row: 41, lane: 1 }]))
            .toThrow(/path starts at/);
    });

    it("refuses a path that teleports, however plausible each end looks", () => {
        // The forged move that would otherwise finish the race from anywhere.
        const state = race({ a: { row: 20, lane: 2 } }, { laps: 1 });
        expect(() => resolveArrival(state, 'a', [{ row: 20, lane: 2 }, { row: 0, lane: 1 }]))
            .toThrow(/does not step to/);
    });

    it("refuses a path driven through another car", () => {
        const state = race({ a: { row: 20, lane: 2 }, b: { row: 21, lane: 2 } });
        const through = [{ row: 20, lane: 2 }, { row: 21, lane: 2 }, { row: 22, lane: 2 }];
        expect(() => resolveArrival(state, 'a', through)).toThrow(/runs through the car/);
    });

    it("refuses a path carrying a row that is not a row", () => {
        // NaN would otherwise be written straight onto the car, and `stepsFrom`
        // can never step off it again — a soft-lock rather than a crash.
        const state = race({ a: { row: 20, lane: 2 } });
        expect(() => resolveArrival(state, 'a', [{ row: 20, lane: 2 }, { row: NaN, lane: 1 }]))
            .toThrow(/does not step to/);
    });

    it("refuses a move for a driver with no car", () => {
        expect(() => reachableSpaces(race({ a: {} }), 'ghost', 3)).toThrow(/no car for/);
    });

    it("floors a fractional distance rather than calling the move blocked short", () => {
        const state = race({ a: { row: 20, lane: 2 } });
        const reach = moveOptions(state, 'a', 2.9);
        expect(reach).toMatchObject({ distance: 2, blockedShort: false, boxedIn: false });
        expect(reach.spaces.every(space => space.row === 22)).toBe(true);
    });

    it.each([0, -5, NaN, Infinity])("treats a distance of %s as going nowhere", distance => {
        const state = race({ a: { row: 20, lane: 2 } });
        expect(moveOptions(state, 'a', distance)).toMatchObject({ distance: 0, boxedIn: true });
    });

    it("never walks further than a lap, whatever it is asked for", () => {
        const state = race({ a: { row: 20, lane: 2 } });
        expect(moveOptions(state, 'a', 5_000_000).distance).toBe(78);
    });

    it("still offers a gear to a car whose gearbox somehow went negative", () => {
        const options = legalGears(race({ a: { gear: 3, gearbox: -2 } }), 'a');
        expect(options.map(option => option.gear)).toEqual([2, 3, 4]);
    });
});

describe("blocking (§9)", () => {
    it("blocks every path through an occupied space", () => {
        const state = race({ a: { row: 20, lane: 2 }, b: { row: 21, lane: 2 } });
        expect(reachableSpaces(state, 'a', 1).map(key)).toEqual(['21:1', '21:3']);
        // And nothing further on is ever routed through it either.
        for (const destination of reachableSpaces(state, 'a', 4)) {
            expect(derivePath(state, 'a', 4, destination).map(key)).not.toContain('21:2');
        }
    });

    it("stops on the furthest space it can reach, for one tyre", () => {
        // The Esses are the only two-lane straight, so two cars close it.
        const state = race({
            a: { row: 52, lane: 1 },
            b: { row: 54, lane: 1 },
            c: { row: 54, lane: 2 },
        });
        const reach = moveOptions(state, 'a', 3);
        expect(reach).toMatchObject({ distance: 1, blockedShort: true, boxedIn: false });
        expect(reach.spaces.map(key)).toEqual(['53:1', '53:2']);

        const arrival = drive(state, 'a', 3);
        expect(arrival.tyres).toBe(4);
        expect(arrival.events).toContainEqual({ type: 'blocked' });
    });

    it("charges one tyre for the lift however many rows were lost", () => {
        const state = race({
            a: { row: 52, lane: 1 },
            b: { row: 54, lane: 1 },
            c: { row: 54, lane: 2 },
        });
        expect(drive(state, 'a', 3).tyres).toBe(4);
        expect(drive(state, 'a', 9).tyres).toBe(4);
    });

    it("does not spin a blocked car with no tyres left — the scuff is not a debt (§18)", () => {
        const state = race({
            a: { row: 52, lane: 1, tyres: 0 },
            b: { row: 54, lane: 1 },
            c: { row: 54, lane: 2 },
        });
        const arrival = drive(state, 'a', 3);
        expect(arrival.tyres).toBe(0);
        expect(arrival.spun).toBe(false);
    });

    it("boxes a car in: no damage, gear drops to 1, and it stays put", () => {
        const state = race({
            a: { row: 52, lane: 1, gear: 4 },
            b: { row: 53, lane: 1 },
            c: { row: 53, lane: 2 },
        });
        expect(moveOptions(state, 'a', 3)).toMatchObject({ distance: 0, boxedIn: true });

        const arrival = drive(state, 'a', 3);
        expect(arrival).toMatchObject({ row: 52, lane: 1, tyres: 5, gear: 1, spun: false });
        expect(arrival.events).toContainEqual({ type: 'boxedIn' });
    });

    it("banks a stop for a car boxed in inside a corner (§18)", () => {
        const state = race({
            a: { row: 47, lane: 1 },
            b: { row: 48, lane: 1 },
            c: { row: 48, lane: 2 },
        });
        expect(drive(state, 'a', 3).cornerStops).toBe(1);
    });
});

describe("corner stops (§10)", () => {
    it("cannot clear a two-stop corner in fewer than two turn-ends", () => {
        // One stop banked, and leaving still costs.
        const banked = race({ a: { row: 12, lane: 1, cornerStops: 1 } });
        const charged = drive(banked, 'a', 5);
        expect(charged.tyres).toBe(2);            // 5 tyres, three rows past row 14
        expect(charged.events).toContainEqual({ type: 'overshoot', cornerId: 'hairpin', rows: 3, waived: false });

        // Two stops banked, and the same move is free.
        const paid = race({ a: { row: 14, lane: 1, cornerStops: 2 } });
        const cleared = drive(paid, 'a', 3);
        expect(cleared.tyres).toBe(5);
        expect(cleared.events).toContainEqual({ type: 'cornerCleared', cornerId: 'hairpin' });
    });

    it("banks a stop for each turn that ends inside the corner", () => {
        const entering = drive(race({ a: { row: 9, lane: 1 } }), 'a', 3);
        expect(entering).toMatchObject({ row: 12, cornerStops: 1, tyres: 5 });

        const again = drive(race({ a: { row: 12, lane: 1, cornerStops: 1 } }), 'a', 2);
        expect(again).toMatchObject({ row: 14, cornerStops: 2 });
    });

    it("banks nothing for passing through — that is the overshoot case", () => {
        const arrival = drive(race({ a: { row: 9, lane: 1 } }), 'a', 8);
        expect(arrival.row).toBe(17);
        expect(arrival.cornerStops).toBe(0);
        expect(arrival.events).toContainEqual({ type: 'overshoot', cornerId: 'hairpin', rows: 3, waived: false });
    });

    it("resets banked stops the moment the corner is legally left", () => {
        const arrival = drive(race({ a: { row: 14, lane: 1, cornerStops: 2 } }), 'a', 3);
        expect(arrival.cornerStops).toBe(0);
    });
});

describe("overshoot (§10)", () => {
    // Gravel Bend's last row is 51, and the car starts on The Mile owing its stop.
    it.each([
        [7, 52, 1],
        [8, 53, 2],
        [9, 54, 3],
        [10, 55, 4],
    ])("costs one tyre a row: a move of %i lands on row %i for %i tyres", (distance, row, cost) => {
        const arrival = drive(race({ a: { row: 45, lane: 1 } }), 'a', distance);
        expect(arrival.row).toBe(row);
        expect(arrival.tyres).toBe(5 - cost);
        expect(arrival.events).toContainEqual({ type: 'overshoot', cornerId: 'gravel', rows: cost, waived: false });
    });

    it("counts rows along the path when the move wraps the finish line", () => {
        // §10: a car on row 60 that moves 20 ends on row 2 of the next lap
        // having crossed The Kink, and `2 − 65` is not the answer — it is the
        // fifteen rows the path actually travelled past row 65.
        const state = race({ a: { row: 60, lane: 1, tyres: 20 } }, { laps: 2 });
        const arrival = drive(state, 'a', 20);
        expect(arrival).toMatchObject({ row: 2, lapsCompleted: 1, tyres: 5 });
        expect(arrival.events).toContainEqual({ type: 'overshoot', cornerId: 'kink', rows: 15, waived: false });
    });

    it("is free for a car that began its turn on the corner's last row (§18)", () => {
        const arrival = drive(race({ a: { row: 51, lane: 1, cornerStops: 0 } }), 'a', 4);
        expect(arrival).toMatchObject({ row: 55, tyres: 5, spun: false, cornerStops: 0 });
        expect(arrival.events).toContainEqual({ type: 'overshoot', cornerId: 'gravel', rows: 4, waived: true });
    });

    it("is charged in full one row earlier, where the road still offered a stop", () => {
        const arrival = drive(race({ a: { row: 50, lane: 1 } }), 'a', 5);
        expect(arrival).toMatchObject({ row: 55, tyres: 1 });
    });

    it("is payable when the cost exactly empties the pool (§18)", () => {
        const arrival = drive(race({ a: { row: 45, lane: 1, tyres: 4 } }), 'a', 10);
        expect(arrival).toMatchObject({ row: 55, tyres: 0, spun: false });
    });

    it("charges both corners of a move that crosses two, in path order", () => {
        const state = race({ a: { row: 9, lane: 1, tyres: 10 } }, { trackId: TWO_CORNERS.id });
        const arrival = drive(state, 'a', 8);
        expect(arrival.row).toBe(17);
        expect(arrival.events.filter(event => event.type === 'overshoot')).toEqual([
            { type: 'overshoot', cornerId: 'first', rows: 7, waived: false },
            { type: 'overshoot', cornerId: 'second', rows: 1, waived: false },
        ]);
        expect(arrival.tyres).toBe(2);
    });
});

describe("spins (§13)", () => {
    it("spins a car that cannot pay, and it pays nothing at all", () => {
        const arrival = drive(race({ a: { row: 45, lane: 1, tyres: 3, gear: 4 } }), 'a', 10);
        expect(arrival).toMatchObject({
            row: 51,            // Gravel Bend's last row
            lane: 1,            // first free lane
            tyres: 3,           // you do not pay what you can and spin for the rest
            gear: 0,
            spun: true,
        });
        expect(arrival.events).toContainEqual({ type: 'spin', cause: 'overshoot', cornerId: 'gravel' });
    });

    it("banks the stop it ends the turn on", () => {
        expect(drive(race({ a: { row: 45, lane: 1, tyres: 0 } }), 'a', 10).cornerStops).toBe(1);
    });

    it("rests in the first free lane of the corner it failed (§13)", () => {
        // Lane 1 of Gravel Bend's last row is taken, so the overshooting car
        // both drove through lane 2 and comes to rest in it.
        const state = race({
            a: { row: 45, lane: 1, tyres: 0 },
            b: { row: 51, lane: 1 },
        });
        expect(drive(state, 'a', 10)).toMatchObject({ row: 51, lane: 2, spun: true });
    });

    it("stops the move at the first corner and never reaches the second", () => {
        const state = race({ a: { row: 9, lane: 1, tyres: 2 } }, { trackId: TWO_CORNERS.id });
        const arrival = drive(state, 'a', 8);
        expect(arrival).toMatchObject({ row: 10, spun: true });
        expect(arrival.events.flatMap(event => event.type === 'overshoot' ? [event.cornerId] : []))
            .toEqual(['first']);
    });

    it("lays a slick where it rests, but only with oil switched on (§13, §14)", () => {
        const dry = drive(race({ a: { row: 45, lane: 1, tyres: 0 } }), 'a', 10);
        expect(dry.slick).toBeNull();

        const oily = drive(race({ a: { row: 45, lane: 1, tyres: 0 } }, { oilSpills: true }), 'a', 10);
        expect(oily.slick).toEqual({ row: 51, lane: 1 });
    });
});

describe("oil (§14)", () => {
    const oiled = (slicks: RaceCarsSpace[], seat: Partial<IRaceCarsPlayerState>) =>
        race({ a: seat }, {
            oilSpills: true,
            slicks: slicks.map(slick => ({ ...slick, laidOnRound: 1 })),
        });

    it("rolls a d6 for every slick entered, in path order", () => {
        // Unavoidable oil: every lane of row 21 is slicked, and so is the
        // destination. An avoidable slick is routed around instead — see below.
        const state = oiled(
            [{ row: 21, lane: 1 }, { row: 21, lane: 2 }, { row: 21, lane: 3 }, { row: 22, lane: 2 }],
            { row: 20, lane: 2 },
        );
        const arrival = drive(state, 'a', 2, { lane: 2, oilRolls: [4, 5] });
        expect(arrival.oilRolls).toEqual([4, 5]);
        expect(arrival.spun).toBe(false);
    });

    it("spins on a 1, on that space, leaving banked stops untouched (§18)", () => {
        const state = oiled(
            [{ row: 48, lane: 1 }, { row: 48, lane: 2 }],
            { row: 47, lane: 1, cornerStops: 1 },
        );
        const arrival = drive(state, 'a', 3, { lane: 1, oilRolls: [1] });
        // Gravel Bend is still owed its stop, and the spin leaves the one
        // already banked exactly as it found it.
        expect(arrival).toMatchObject({ row: 48, gear: 0, spun: true, cornerStops: 1 });
        expect(arrival.events).toContainEqual({ type: 'spin', cause: 'oil', cornerId: null });
    });

    it("never checks the slick a car is already standing on", () => {
        const state = oiled([{ row: 20, lane: 2 }], { row: 20, lane: 2 });
        expect(drive(state, 'a', 2, { lane: 2, oilRolls: [1] }).oilRolls).toEqual([]);
    });

    it("routes around oil when a route around it exists", () => {
        const state = oiled([{ row: 21, lane: 1 }, { row: 21, lane: 2 }], { row: 20, lane: 2 });
        expect(derivePath(state, 'a', 2, { row: 22, lane: 2 }).map(key))
            .toEqual(['20:2', '21:3', '22:2']);
    });

    it("ignores slicks entirely with the module switched off", () => {
        const state = race({ a: { row: 20, lane: 2 } }, { slicks: [{ row: 21, lane: 2, laidOnRound: 1 }] });
        expect(drive(state, 'a', 2, { lane: 2, oilRolls: [1] }).oilRolls).toEqual([]);
    });
});

describe("laps and the ending (§4.1, §15)", () => {
    it("banks a lap on crossing from the last row to row 0", () => {
        const arrival = drive(race({ a: { row: 76, lane: 1 } }, { laps: 2 }), 'a', 3);
        expect(arrival).toMatchObject({ row: 1, lapsCompleted: 1, finished: false });
        expect(arrival.events).toContainEqual({ type: 'lap', lapsCompleted: 1 });
    });

    it("ends the race the instant a car completes the distance", () => {
        const arrival = drive(race({ a: { row: 76, lane: 1 } }, { laps: 1 }), 'a', 3);
        expect(arrival.finished).toBe(true);
        expect(arrival.events).toContainEqual({ type: 'finish' });
    });

    it("does not measure the distance past the line (§18)", () => {
        // Row 70 to row 17 crosses the line and then the Hairpin, which owes
        // two stops and would charge three rows. The race is already over.
        const arrival = drive(race({ a: { row: 70, lane: 1 } }, { laps: 1 }), 'a', 25);
        expect(arrival).toMatchObject({ row: 17, finished: true, tyres: 5, spun: false });
        expect(arrival.events.filter(event => event.type === 'overshoot')).toEqual([]);
    });
});

describe("shifting (§8.2)", () => {
    it("launches from a standing start into gear 1 or 2", () => {
        expect(legalGears(race({ a: { gear: 0 } }), 'a')).toEqual([
            { gear: 1, gearboxCost: 0 },
            { gear: 2, gearboxCost: 0 },
        ]);
    });

    it("climbs one gear a turn, free", () => {
        const options = legalGears(race({ a: { gear: 3, gearbox: 0 } }), 'a');
        expect(options).toEqual([
            { gear: 2, gearboxCost: 0 },
            { gear: 3, gearboxCost: 0 },
            { gear: 4, gearboxCost: 0 },
        ]);
    });

    it("prices a bigger drop out of the gearbox pool", () => {
        expect(legalGears(race({ a: { gear: 5, gearbox: 6 } }), 'a')).toEqual([
            { gear: 1, gearboxCost: 6 },
            { gear: 2, gearboxCost: 3 },
            { gear: 3, gearboxCost: 1 },
            { gear: 4, gearboxCost: 0 },
            { gear: 5, gearboxCost: 0 },
        ]);
    });

    it("refuses a gear the gearbox cannot pay for", () => {
        expect(legalGears(race({ a: { gear: 5, gearbox: 2 } }), 'a').map(option => option.gear))
            .toEqual([3, 4, 5]);
    });

    it("stops at the circuit's top gear (§8.3)", () => {
        expect(legalGears(race({ a: { gear: 5, gearbox: 3 } }), 'a').map(option => option.gear))
            .not.toContain(6);
    });

    it("never offers gear 0 — a car may not choose to park (§9)", () => {
        for (const gear of [1, 2, 3, 4, 5] as const) {
            expect(legalGears(race({ a: { gear, gearbox: 6 } }), 'a').map(option => option.gear))
                .not.toContain(0);
        }
    });
});

describe("the dice (§8.1)", () => {
    it.each([1, 2, 3, 4, 5, 6] as const)("keeps gear %i inside its band", gear => {
        const bands: Record<number, [number, number]> = {
            1: [1, 2], 2: [2, 4], 3: [4, 8], 4: [7, 12], 5: [11, 20], 6: [21, 30],
        };
        const [min, max] = bands[gear];
        const seen = new Set<number>();
        for (let roll = 0; roll < 400; roll++) seen.add(rollFor(gear));
        for (const value of seen) {
            expect(value).toBeGreaterThanOrEqual(min);
            expect(value).toBeLessThanOrEqual(max);
        }
        // Uniform over the band, so 400 rolls reach both ends of it.
        expect(seen.has(min)).toBe(true);
        expect(seen.has(max)).toBe(true);
    });

    it("rolls nothing in gear 0", () => {
        expect(rollFor(0)).toBe(0);
    });
});

describe("slipstream (§12)", () => {
    it("is offered one or two rows behind another car, in any lane", () => {
        expect(slipstreamOffered(race({ a: { row: 20, lane: 1 }, b: { row: 21, lane: 3 } }), 'a')).toBe(true);
        expect(slipstreamOffered(race({ a: { row: 20, lane: 1 }, b: { row: 22, lane: 3 } }), 'a')).toBe(true);
    });

    it("is not offered three rows behind, or in front", () => {
        expect(slipstreamOffered(race({ a: { row: 20, lane: 1 }, b: { row: 23, lane: 1 } }), 'a')).toBe(false);
        expect(slipstreamOffered(race({ a: { row: 20, lane: 1 }, b: { row: 19, lane: 1 } }), 'a')).toBe(false);
    });

    it("is not offered to a car that has just spun (§18)", () => {
        const state = race({ a: { row: 20, lane: 1, skipNextTurn: true }, b: { row: 21, lane: 1 } });
        expect(slipstreamOffered(state, 'a')).toBe(false);
    });

    it("is not offered at all when there is nowhere to be towed (§12)", () => {
        // Both lanes of the Esses closed one row ahead: the tow would be a
        // punishment for accepting it.
        const state = race({
            a: { row: 52, lane: 1 },
            b: { row: 53, lane: 1 },
            c: { row: 53, lane: 2 },
        });
        expect(slipstreamOffered(state, 'a')).toBe(false);
    });
});

describe("turn order (§15)", () => {
    it("sorts leader first: laps, then row", () => {
        const state = race({
            a: { row: 10 },
            b: { row: 30 },
            c: { row: 5, lapsCompleted: 1 },
        });
        expect(recomputeRoundOrder(state)).toEqual(['c', 'b', 'a']);
        expect(trackProgress(state, 'c')).toEqual({ lapsCompleted: 1, row: 5 });
    });

    it("breaks an exact tie on the previous round's order", () => {
        const state = race({ a: { row: 20 }, b: { row: 20 } }, { roundOrder: ['b', 'a'] });
        expect(recomputeRoundOrder(state)).toEqual(['b', 'a']);
    });

    it("stays consistent when the whole field ties, which is what a corner does", () => {
        const seats = Object.fromEntries(
            ['a', 'b', 'c', 'd', 'e', 'f'].map(userId => [userId, { row: 12, lane: 1 }]),
        );
        const order = ['d', 'f', 'a', 'c', 'e', 'b'];
        const state = race(seats, { roundOrder: order });
        expect(recomputeRoundOrder(state)).toEqual(order);
    });

    it("rebuilds the order whole, never spliced", () => {
        const state = race({ a: { row: 10 }, b: { row: 30 }, c: { row: 20 } });
        const order = recomputeRoundOrder(state);
        expect(order).toHaveLength(3);
        expect([...order].sort()).toEqual(['a', 'b', 'c']);
        expect(state.roundOrder).toEqual(['a', 'b', 'c']);   // the source is untouched
    });
});

describe("the conservative line (§23.7)", () => {
    it("climbs on a clear straight", () => {
        const state = race({ a: { row: 20, lane: 1, gear: 2, phase: 'shift' } });
        expect(conservativeTurn(state, 'a')).toEqual({ phase: 'shift', gear: 3 });
    });

    it("drops to the highest gear that cannot overshoot the corner ahead", () => {
        // From row 8, gear 3's maximum of 8 reaches past the Hairpin's last row.
        const state = race({ a: { row: 8, lane: 1, gear: 3, phase: 'shift' } });
        expect(conservativeTurn(state, 'a')).toEqual({ phase: 'shift', gear: 2 });
    });

    it("brakes as little as it can to land the corner", () => {
        // A 17 from row 38 is row 55, four rows past Gravel Bend; four brakes
        // make it a 13, which is row 51 — the Bend's last row (§11).
        const state = race({ a: { row: 38, lane: 1, gear: 5, phase: 'move', roll: 17 } });
        const plan = conservativeTurn(state, 'a');
        expect(plan).toMatchObject({ phase: 'move', brake: 4 });
        expect(plan.phase === 'move' && plan.destination.row).toBe(51);
    });

    it("falls through to the cheapest overshoot rather than naming nothing", () => {
        // No brakes left, and the roll cannot be made to stop in the corner.
        const state = race({ a: { row: 38, lane: 1, gear: 5, phase: 'move', roll: 17, brakes: 0 } });
        const plan = conservativeTurn(state, 'a');
        expect(plan).toMatchObject({ phase: 'move', brake: 0 });
        expect(plan.phase === 'move' && plan.destination.row).toBe(55);
    });

    it("names a destination the move can actually finish on, from anywhere on the circuit", () => {
        for (let row = 0; row < 78; row++) {
            const state = race({ a: { row, lane: 1, phase: 'move', roll: 8 } });
            const plan = conservativeTurn(state, 'a');
            if (plan.phase !== 'move') throw new Error('expected a move');
            const reach = moveOptions(state, 'a', 8 - plan.brake);
            expect(reach.spaces.map(key)).toContain(key(plan.destination));
        }
    });

    it("always names a gear, and never gear 0", () => {
        for (const gear of [0, 1, 2, 3, 4, 5] as const) {
            for (const row of [0, 8, 13, 46, 51, 60, 65, 77]) {
                const state = race({ a: { row, lane: 1, gear, gearbox: 0, phase: 'shift' } });
                const plan = conservativeTurn(state, 'a');
                if (plan.phase !== 'shift') throw new Error('expected a shift');
                expect(plan.gear).toBeGreaterThan(0);
            }
        }
    });

    it("answers for a driver the round order has outlived, rather than throwing", () => {
        // §23.7 PR 6: a throw here wedges the turn-timeout cron exactly as a
        // preference list with no fallthrough would.
        const state = race({ a: {} });
        expect(conservativeTurn(state, 'ghost')).toEqual({ phase: 'slipstream', tow: null });
    });

    it("declines a tow it was never offered", () => {
        const state = race({ a: { row: 20, lane: 1, phase: 'slipstream' } });
        expect(conservativeTurn(state, 'a')).toEqual({ phase: 'slipstream', tow: null });
    });

    it("declines a tow that would push it out of a corner it still owes (§12)", () => {
        const state = race({
            a: { row: 13, lane: 1, cornerStops: 1, phase: 'slipstream' },
            b: { row: 15, lane: 1 },
        });
        expect(conservativeTurn(state, 'a')).toEqual({ phase: 'slipstream', tow: null });
    });

    it("takes a tow that costs nothing", () => {
        const state = race({
            a: { row: 20, lane: 1, phase: 'slipstream' },
            b: { row: 22, lane: 3 },
        });
        const plan = conservativeTurn(state, 'a');
        expect(plan.phase === 'slipstream' && plan.tow).toEqual({ row: 23, lane: 1 });
    });
});
