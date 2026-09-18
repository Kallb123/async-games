import { describe, expect, it } from "vitest";
import { RaceCarsGameType, RaceCarsLaunch, RaceCarsMove, RaceCarsShift, RaceCarsSlipstream } from "./RaceCarsLogic";
import type { IRaceCarsArrivalOutcome, IRaceCarsStartOutcome } from "./RaceCarsLogic";
import type { IRaceCarsGameData } from "./RaceCarsModels";
import type { IRaceCarsPlayerState, IRaceCarsSpecificGameState } from "./rules";
import { legalGears, moveOptions, slipstreamMoveOptions } from "./rules";
import { GEARS, gearDef, RaceCarsGear, specDef, START_DIE_SIDES, START_FLYING_SPACES, trackById } from "./board";
import { car, race } from "./testFixtures";
import { runCommand } from "@/utils/games/commandPipeline";

// ─── Minimal in-memory game harness (mirrors SolitaireLogic.test.ts) ────────
// Race Cars' specificGameState is a fully typed schema (§23.4), so — like
// Banned Islet and Outbreak — nothing here needs markModified: Mongoose tracks
// those mutations itself, and a plain object has no such method to call.
//
// Ashcombe (§5.2), for reading the fixtures below against:
//   0-9 straight (3) · 10-14 Hairpin (2, two stops) · 15-46 The Mile (3)
//   47-51 Gravel Bend (2, one stop) · 52-61 Esses (2) · 62-65 The Kink (3, one)
//   66-77 Run to the Line (3)

/**
 * A game around `state`. `turnOrder` is the **join order**, given separately
 * from `roundOrder` on purpose: §23.2's whole point is that the two are
 * different arrays and only one of them is the race order.
 */
function makeGame(
    state: IRaceCarsSpecificGameState,
    turnOrder: string[] = [...state.roundOrder],
): IRaceCarsGameData {
    return {
        gameId: "g",
        currentTurn: state.roundOrder[state.roundIndex],
        userIdList: turnOrder,
        gameState: { turnOrder, history: [], commandHistory: [] },
        specificGameState: state,
        complete: false,
        winner: "",
    } as unknown as IRaceCarsGameData;
}

function launch(fields: Partial<RaceCarsLaunch>, senderId = "a"): RaceCarsLaunch {
    const command = new RaceCarsLaunch();
    command.senderId = senderId;
    command.senderUsername = senderId;
    return Object.assign(command, fields);
}

function shift(fields: Partial<RaceCarsShift>, senderId = "a"): RaceCarsShift {
    const command = new RaceCarsShift();
    command.senderId = senderId;
    command.senderUsername = senderId;
    return Object.assign(command, fields);
}

function move(fields: Partial<RaceCarsMove>, senderId = "a"): RaceCarsMove {
    const command = new RaceCarsMove();
    command.senderId = senderId;
    command.senderUsername = senderId;
    return Object.assign(command, fields);
}

function slipstream(fields: Partial<RaceCarsSlipstream>, senderId = "a"): RaceCarsSlipstream {
    const command = new RaceCarsSlipstream();
    command.senderId = senderId;
    command.senderUsername = senderId;
    return Object.assign(command, fields);
}

/** One command through the pipeline the command route, replay and the cron all use. */
function run(game: IRaceCarsGameData, command: RaceCarsLaunch | RaceCarsShift | RaceCarsMove | RaceCarsSlipstream) {
    return runCommand(game, new RaceCarsGameType(), command);
}

function cars(game: IRaceCarsGameData): Map<string, IRaceCarsPlayerState> {
    return game.specificGameState.players as Map<string, IRaceCarsPlayerState>;
}

function seat(game: IRaceCarsGameData, userId: string): IRaceCarsPlayerState {
    return cars(game).get(userId)!;
}

function log(game: IRaceCarsGameData): string {
    return game.gameState.history[0].text;
}

/**
 * §23.8's conservation check: every pool inside 0..spec, and no two cars on one
 * space — which is what catches a path derivation that walked through a car.
 */
function expectConserved(game: IRaceCarsGameData) {
    const spec = specDef(game.specificGameState.spec);
    const spaces = new Set<string>();
    for (const [, ps] of cars(game)) {
        expect(ps.tyres).toBeGreaterThanOrEqual(0);
        expect(ps.tyres).toBeLessThanOrEqual(spec.tyres);
        expect(ps.brakes).toBeGreaterThanOrEqual(0);
        expect(ps.brakes).toBeLessThanOrEqual(spec.brakes);
        expect(ps.gearbox).toBeGreaterThanOrEqual(0);
        expect(ps.gearbox).toBeLessThanOrEqual(spec.gearbox);
        const key = `${ps.row}:${ps.lane}`;
        expect(spaces.has(key)).toBe(false);
        spaces.add(key);
    }
}

describe("RaceCarsLaunch (§6a, the startup round)", () => {
    /** The grid: both cars in neutral, both still to throw their d20. */
    const grid = () => makeGame(race({
        a: { row: 2, lane: 1, gear: 0, phase: 'start' },
        b: { row: 2, lane: 3, gear: 0, phase: 'start' },
    }));

    it("bogs down on a 1: no gear, no roll, no movement, and the turn is over", async () => {
        const game = grid();
        const { outcome } = await run(game, launch({ recordedStartRoll: 1 }));

        expect(outcome.validMove).toBe(true);
        expect(outcome.turnOver).toBe(true);
        const car = seat(game, 'a');
        expect(car.gear).toBe(0);
        expect(car.roll).toBeNull();
        expect(car.row).toBe(2);
        expect(car.startRoll).toBe(1);
        expect(log(game)).toContain('bogged down off the line');
        // The next driver still has their own getaway to throw — the startup
        // round is a round like any other.
        expect(game.currentTurn).toBe('b');
        expect(seat(game, 'b').phase).toBe('start');
    });

    it("gets away in first on a 2, and rolls first gear's own die for the move", async () => {
        const game = grid();
        const { outcome } = await run(game, launch({ recordedStartRoll: 2 }));

        expect(outcome).toMatchObject({ validMove: true, turnOver: false });
        const car = seat(game, 'a');
        expect(car.gear).toBe(1);
        expect(car.phase).toBe('move');
        expect(car.roll).toBeGreaterThanOrEqual(GEARS[1].min);
        expect(car.roll).toBeLessThanOrEqual(GEARS[1].max);
        // Not handed on: the number is thrown and spent inside the same turn.
        expect(game.currentTurn).toBe('a');
        expect(log(game)).toContain('got away in first');
    });

    it("takes a flying start on a 17: four spaces, no roll, and still in first", async () => {
        const game = grid();
        const { outcome } = await run(game, launch({ recordedStartRoll: 17 }));

        const car = seat(game, 'a');
        expect(car.gear).toBe(1);
        expect(car.phase).toBe('move');
        expect(car.roll).toBe(START_FLYING_SPACES);
        expect(outcome.turnOver).toBe(false);
        // The reveal reads this rather than the board (see RaceCarsStartScreen).
        expect((outcome as IRaceCarsStartOutcome).start)
            .toEqual({ roll: 17, outcome: 'flying', spaces: START_FLYING_SPACES });
        expect(log(game)).toContain('flying start');
        // And it is drivable: four spaces is a move like any other.
        const reach = moveOptions(game.specificGameState, 'a', START_FLYING_SPACES);
        expect((await run(game, move(reach.spaces[0]))).outcome.validMove).toBe(true);
        expect(seat(game, 'a').row).toBe(6);
    });

    it("throws inside the d20's band when nothing is recorded, and records what it threw", async () => {
        const game = grid();
        const command = launch({});
        await run(game, command);

        const thrown = seat(game, 'a').startRoll!;
        expect(thrown).toBeGreaterThanOrEqual(1);
        expect(thrown).toBeLessThanOrEqual(START_DIE_SIDES);
        // Written back onto the command before runCommand pushed it into
        // commandHistory, or a replay throws a different die (§23.4).
        expect(command.recordedStartRoll).toBe(thrown);
        expect(game.gameState.commandHistory[0]).toBe(command);
    });

    it("refuses a second throw once the first has been spent", async () => {
        // The command returns turnOver: false on a clean getaway, so currentTurn
        // never moves — without the `roll === null` half of the guard a driver
        // re-sends this body until the d20 comes up 17.
        const game = grid();
        await run(game, launch({ recordedStartRoll: 2 }));
        const before = seat(game, 'a').roll;

        expect((await run(game, launch({ recordedStartRoll: 20 }))).outcome.validMove).toBe(false);
        expect(seat(game, 'a').roll).toBe(before);
        expect(seat(game, 'a').startRoll).toBe(2);
    });

    it("refuses a getaway from a driver who is not on turn, and one after the startup round", async () => {
        expect((await run(grid(), launch({ recordedStartRoll: 9 }, 'b'))).outcome.validMove).toBe(false);

        const racing = makeGame(race({
            a: { row: 20, gear: 3, phase: 'shift' },
            b: {},
        }, { round: 2 }));
        expect((await run(racing, launch({ recordedStartRoll: 20 }))).outcome.validMove).toBe(false);
    });

    it("is the only way a startup-round turn can end, which is what keeps the old launch out of a new race", async () => {
        // §6a's compatibility branch in `legalGears` hands gear 2 to a car in
        // neutral that never threw a d20 — reachable only in a race dealt
        // before the startup round, because every launch writes `startRoll`.
        // That holds on this invariant and nothing else: if some later command
        // could end a round-one turn without a launch, the driver it handed on
        // to would open at gear 0 with no `startRoll` and be offered second off
        // the line for free. So the three other commands are pinned as refused
        // inside the startup round.
        const game = grid();

        expect((await run(game, shift({ gear: 2, recordedRoll: 3 }))).outcome.validMove).toBe(false);
        expect((await run(game, move({ row: 4, lane: 1 }))).outcome.validMove).toBe(false);
        expect((await run(game, slipstream({ tow: null }))).outcome.validMove).toBe(false);

        // Nothing moved on, so the startup round still owns the turn.
        expect(game.currentTurn).toBe('a');
        expect(seat(game, 'a').phase).toBe('start');
        expect(seat(game, 'a').startRoll).toBeNull();
    });

    it("hands the field into normal operation when the startup round wraps", async () => {
        const game = grid();
        await run(game, launch({ recordedStartRoll: 1 }));
        await run(game, launch({ recordedStartRoll: 1 }, 'b'));

        expect(game.specificGameState.round).toBe(2);
        // §6a: the startup round is round one and nothing else, so the driver it
        // wraps onto opens on a gear again.
        expect(seat(game, game.currentTurn).phase).toBe('shift');
        // And out of neutral there is one gear to take, not two (§8.2).
        expect(legalGears(game.specificGameState, game.currentTurn)).toEqual([{ gear: 1, gearboxCost: 0 }]);
    });
});

describe("RaceCarsShift (§7 step 1, §8)", () => {
    it("takes the gear, rolls its die and hands the driver into the move phase", async () => {
        const game = makeGame(race({ a: { row: 20, gear: 3, phase: 'shift' }, b: {} }));
        const { outcome } = await run(game, shift({ gear: 4, recordedRoll: 9 }));

        expect(outcome).toEqual({ validMove: true, turnOver: false });
        expect(seat(game, 'a').gear).toBe(4);
        expect(seat(game, 'a').roll).toBe(9);
        expect(seat(game, 'a').phase).toBe('move');
        // turnOver is false, so nobody has been handed anything yet (§7).
        expect(game.currentTurn).toBe('a');
        expect(log(game)).toContain('took 4th and rolled a 9');
    });

    it("rolls inside the gear's band when nothing is recorded, and records what it rolled", async () => {
        const game = makeGame(race({ a: { row: 20, gear: 4, phase: 'shift' }, b: {} }));
        const command = shift({ gear: 5 });
        await run(game, command);

        expect(seat(game, 'a').roll).toBeGreaterThanOrEqual(GEARS[5].min);
        expect(seat(game, 'a').roll).toBeLessThanOrEqual(GEARS[5].max);
        // Written back onto the command before runCommand pushed it into
        // commandHistory, or a replay has nothing to consume (§23.4).
        expect(command.recordedRoll).toBe(seat(game, 'a').roll);
        expect(game.gameState.commandHistory[0]).toBe(command);
    });

    it("takes first out of neutral and no further — §6a replaced the standing-start launch (§8.2)", async () => {
        // `startRoll` is what says this car threw §6a's d20; a car in neutral
        // without one is a race dealt before the startup round, covered below.
        const standing = () => makeGame(race({
            a: { row: 0, gear: 0, phase: 'shift', startRoll: 1 },
            b: {},
        }, { round: 2 }));

        expect((await run(standing(), shift({ gear: 1, recordedRoll: 2 }))).outcome.validMove).toBe(true);
        expect((await run(standing(), shift({ gear: 2, recordedRoll: 3 }))).outcome.validMove).toBe(false);
        expect((await run(standing(), shift({ gear: 3, recordedRoll: 5 }))).outcome.validMove).toBe(false);
    });

    it("replays a race dealt before §6a on the rules it was driven under", async () => {
        // A command replay refuses is skipped **in silence** (replay.ts), and a
        // dropped shift takes the move that spent its roll with it — so a
        // gear-0-to-second launch recorded before the startup round shipped has
        // to still resolve, or that car freezes on the grid for the whole of
        // its match review and flattens its line on the stored result chart.
        const legacy = makeGame(race({
            a: { row: 0, gear: 0, phase: 'shift' },
            b: { row: 0, lane: 3 },
        }));

        expect((await run(legacy, shift({ gear: 2, recordedRoll: 4 }))).outcome.validMove).toBe(true);
        expect(seat(legacy, 'a').gear).toBe(2);
        // And the hand-off leaves that race on shifts rather than moving it
        // onto a d20 nobody in it has thrown.
        expect((await run(legacy, move({ row: 4, lane: 1 }))).outcome.validMove).toBe(true);
        expect(seat(legacy, 'b').phase).toBe('shift');
    });

    it("refuses more than one gear up", async () => {
        const game = makeGame(race({ a: { row: 20, gear: 2, phase: 'shift' }, b: {} }));

        expect((await run(game, shift({ gear: 4, recordedRoll: 9 }))).outcome.validMove).toBe(false);
        expect(seat(game, 'a').gear).toBe(2);
        expect(seat(game, 'a').roll).toBeNull();
    });

    it("charges gearbox for dropping two gears, and refuses a drop it cannot pay for", async () => {
        const paid = makeGame(race({ a: { row: 20, gear: 5, gearbox: 3, phase: 'shift' }, b: {} }));
        await run(paid, shift({ gear: 3, recordedRoll: 6 }));
        expect(seat(paid, 'a').gearbox).toBe(2);
        expect(log(paid)).toContain('dropped to 3rd — 1 gearbox');

        const broke = makeGame(race({ a: { row: 20, gear: 5, gearbox: 0, phase: 'shift' }, b: {} }));
        expect((await run(broke, shift({ gear: 3, recordedRoll: 6 }))).outcome.validMove).toBe(false);
        // One gear a turn is still free with an empty pool (§8.2).
        expect((await run(broke, shift({ gear: 4, recordedRoll: 9 }))).outcome.validMove).toBe(true);
        expect(seat(broke, 'a').gearbox).toBe(0);
    });

    it("refuses a second shift, so a driver cannot re-roll until the d20 comes up 20", async () => {
        const game = makeGame(race({ a: { row: 20, gear: 4, phase: 'shift' }, b: {} }));
        await run(game, shift({ gear: 5, recordedRoll: 11 }));

        const again = await run(game, shift({ gear: 5, recordedRoll: 20 }));
        expect(again.outcome.validMove).toBe(false);
        expect(seat(game, 'a').roll).toBe(11);
        expect(game.gameState.commandHistory).toHaveLength(1);
    });

    it("refuses a driver who is not the one roundOrder is pointing at", async () => {
        const game = makeGame(race({ a: { row: 20, phase: 'shift' }, b: { row: 10, phase: 'shift' } }));
        // The shared surfaces that write currentTurn walk turnOrder with no
        // idea what game they are in (§23.4), so this is the state they leave.
        game.currentTurn = 'b';

        expect((await run(game, shift({ gear: 4, recordedRoll: 9 }, 'b'))).outcome.validMove).toBe(false);
        expect(seat(game, 'b').roll).toBeNull();
        expect((await run(game, shift({ gear: 4, recordedRoll: 9 }, 'a'))).outcome.validMove).toBe(true);
    });

    it("refuses a driver with no car", async () => {
        const game = makeGame(race({ a: { row: 20, phase: 'shift' }, b: {} }));
        expect((await run(game, shift({ gear: 4, recordedRoll: 9 }, 'ghost'))).outcome.validMove).toBe(false);
    });
});

describe("RaceCarsMove (§7 step 2, §9-§11)", () => {
    /** A car mid-turn: shifted, rolled, and waiting to be moved. */
    function rolled(
        roll: number,
        driver: Partial<IRaceCarsPlayerState> = {},
        others: Record<string, Partial<IRaceCarsPlayerState>> = {},
    ): IRaceCarsSpecificGameState {
        return race({ a: { phase: 'move', roll, ...driver }, ...others });
    }

    it("moves exactly the roll to the destination the driver tapped", async () => {
        const game = makeGame(rolled(7, { row: 20, lane: 2 }));
        const { outcome } = await run(game, move({ row: 27, lane: 1 }));

        expect(outcome.validMove).toBe(true);
        expect(outcome.turnOver).toBe(true);
        expect(seat(game, 'a').row).toBe(27);
        expect(seat(game, 'a').lane).toBe(1);
        expect(log(game)).toContain('drove 7 spaces');
        expectConserved(game);
    });

    it("spends brakes to shorten the roll, and records what was spent", async () => {
        // A second car parked well up the road, so the turn hands off to them
        // rather than wrapping straight back round to the driver who just
        // moved — whose turn state CheckEndTurn would then reset.
        const game = makeGame(rolled(7, { row: 20, lane: 2, brakes: 4 }, { b: { row: 70, lane: 1 } }));
        await run(game, move({ row: 24, lane: 2, brake: 3 }));

        expect(seat(game, 'a').row).toBe(24);
        expect(seat(game, 'a').brakes).toBe(1);
        // §14's three-or-more slick source reads this in PR 7.
        expect(seat(game, 'a').brakeSpent).toBe(3);
        expect(log(game)).toContain('after braking 3 spaces off the roll');
    });

    it("refuses a brake that is negative, oversized, fractional, or would stop the car", async () => {
        const bad = [
            { row: 29, lane: 2, brake: -2 },     // extra rows *and* extra tokens
            { row: 25, lane: 2, brake: 5 },      // more than the pool of 4
            { row: 26, lane: 2, brake: 1.5 },    // not a whole number of rows
            { row: 20, lane: 2, brake: 7 },      // a car always moves (§11)
        ];
        for (const fields of bad) {
            const game = makeGame(rolled(7, { row: 20, lane: 2, brakes: 4 }));
            expect((await run(game, move(fields))).outcome.validMove).toBe(false);
            expect(seat(game, 'a').row).toBe(20);
            expect(seat(game, 'a').brakes).toBe(4);
        }

        // Braking all the way down to one row is legal, and is the boundary.
        const game = makeGame(rolled(5, { row: 20, lane: 2, brakes: 4 }));
        expect((await run(game, move({ row: 21, lane: 2, brake: 4 }))).outcome.validMove).toBe(true);
    });

    it("refuses a destination that is not in the server's own reach set", async () => {
        const teleports = [
            { row: 77, lane: 1 },      // the finish line, from the middle of the Mile
            { row: 26, lane: 2 },      // short of the roll — you can never choose to stop (§9)
            { row: 28, lane: 2 },      // past it
            { row: 20.5, lane: 2 },    // not a space at all
            { row: 27, lane: 0 },      // not a lane
        ];
        for (const destination of teleports) {
            const game = makeGame(rolled(7, { row: 20, lane: 2 }));
            expect((await run(game, move(destination))).outcome.validMove).toBe(false);
            expect(seat(game, 'a').row).toBe(20);
        }
    });

    it("refuses lane 3 on a two-lane row", async () => {
        // Rows 47-51 are Gravel Bend, two lanes wide.
        const game = makeGame(rolled(3, { row: 45, lane: 2 }));
        expect((await run(game, move({ row: 48, lane: 3 }))).outcome.validMove).toBe(false);
        expect((await run(game, move({ row: 48, lane: 2 }))).outcome.validMove).toBe(true);
    });

    it("blocked short: stops on the furthest space reachable and takes one tyre (§9)", async () => {
        const game = makeGame(rolled(3, { row: 52, lane: 1, tyres: 5 }, {
            b: { row: 54, lane: 1 },
            c: { row: 54, lane: 2 },
        }));
        await run(game, move({ row: 53, lane: 1 }));

        expect(seat(game, 'a').row).toBe(53);
        expect(seat(game, 'a').tyres).toBe(4);
        expect(log(game)).toContain('was blocked and had to lift');
        expect(log(game)).toContain('1 tyre');
        expectConserved(game);
    });

    it("boxed in: stays put, takes no damage, drops to 1st — and banks a stop inside a corner (§18)", async () => {
        const esses = makeGame(rolled(4, { row: 52, lane: 1, gear: 3, tyres: 5 }, {
            b: { row: 53, lane: 1 },
            c: { row: 53, lane: 2 },
        }));
        await run(esses, move({ row: 52, lane: 1 }));
        expect(seat(esses, 'a').row).toBe(52);
        expect(seat(esses, 'a').tyres).toBe(5);
        expect(seat(esses, 'a').gear).toBe(1);
        expect(seat(esses, 'a').cornerStops).toBe(0);
        expect(log(esses)).toContain('was boxed in and stayed put');

        // The same thing one corner earlier: standing still ends the turn
        // inside Gravel Bend, so it banks a stop.
        const corner = makeGame(rolled(4, { row: 47, lane: 1, gear: 3 }, {
            b: { row: 48, lane: 1 },
            c: { row: 48, lane: 2 },
        }));
        await run(corner, move({ row: 47, lane: 1 }));
        expect(seat(corner, 'a').cornerStops).toBe(1);
        expect(log(corner)).toContain('banked a stop in Gravel Bend (1 of 1)');
    });

    it("banks a stop by ending inside a corner", async () => {
        const game = makeGame(rolled(4, { row: 44, lane: 2 }));
        await run(game, move({ row: 48, lane: 1 }));

        expect(seat(game, 'a').cornerStops).toBe(1);
        expect(seat(game, 'a').tyres).toBe(5);
        expect(log(game)).toContain('banked a stop in Gravel Bend (1 of 1)');
    });

    it("§11's worked example: 17 in fifth into Gravel Bend, with four brakes and without", async () => {
        // "a roll of 17 with four brakes left is a roll of 13, and 13 from row
        // 38 is row 51, which is the last row of the Bend."
        const braked = makeGame(rolled(17, { row: 38, lane: 2, gear: 5, brakes: 4, tyres: 5 }));
        await run(braked, move({ row: 51, lane: 1, brake: 4 }));
        expect(seat(braked, 'a').row).toBe(51);
        expect(seat(braked, 'a').tyres).toBe(5);
        expect(seat(braked, 'a').brakes).toBe(0);
        expect(seat(braked, 'a').cornerStops).toBe(1);

        // The same roll with nothing to spend: row 55, four rows past the
        // Bend's last row, four tyres (§10).
        const flat = makeGame(rolled(17, { row: 38, lane: 2, gear: 5, brakes: 0, tyres: 5 }));
        await run(flat, move({ row: 55, lane: 1 }));
        expect(seat(flat, 'a').row).toBe(55);
        expect(seat(flat, 'a').tyres).toBe(1);
        expect(seat(flat, 'a').cornerStops).toBe(0);
        expect(log(flat)).toContain('overshot Gravel Bend by 4 spaces');
        expect(log(flat)).toContain('4 tyres');
        expectConserved(flat);
    });

    it("an overshoot costing exactly the tyres left is payable (§18)", async () => {
        const game = makeGame(rolled(17, { row: 38, lane: 2, gear: 5, brakes: 0, tyres: 4 }));
        await run(game, move({ row: 55, lane: 1 }));

        expect(seat(game, 'a').tyres).toBe(0);
        expect(seat(game, 'a').skipNextTurn).toBe(false);
    });

    it("an overshoot it cannot pay for spins the car back into the corner (§10, §13)", async () => {
        const game = makeGame(rolled(17, { row: 38, lane: 2, gear: 5, brakes: 0, tyres: 3 }, {
            b: { row: 70, lane: 1 },
        }));
        await run(game, move({ row: 55, lane: 1 }));

        // §10: you do not pay what you can and spin for the rest — you pay
        // nothing, and the car is placed on the corner's last row.
        expect(seat(game, 'a').tyres).toBe(3);
        expect(seat(game, 'a').row).toBe(51);
        expect(seat(game, 'a').gear).toBe(0);
        expect(seat(game, 'a').skipNextTurn).toBe(true);
        expect(log(game)).toContain('spun back into Gravel Bend and misses their next turn');
        // Nothing was spent, so the line must not claim a tyre for it.
        expect(log(game)).not.toContain('tyre');
        expectConserved(game);
    });

    it("leaving a corner's last row is free, with the remaining stops waived (§10)", async () => {
        // Row 14 is the hairpin's last row, owing two stops with one banked:
        // no legal move keeps the car inside, so leaving costs nothing.
        const game = makeGame(rolled(4, { row: 14, lane: 1, cornerStops: 1, tyres: 5 }));
        await run(game, move({ row: 18, lane: 1 }));

        expect(seat(game, 'a').tyres).toBe(5);
        expect(seat(game, 'a').cornerStops).toBe(0);
        expect(log(game)).toContain('as slowly as the road allows');
    });

    it("refuses a move from a driver who has not shifted, or who is not on turn", async () => {
        const unshifted = makeGame(race({ a: { row: 20, phase: 'shift', roll: null }, b: {} }));
        expect((await run(unshifted, move({ row: 24, lane: 1 }))).outcome.validMove).toBe(false);

        const outOfOrder = makeGame(race({ a: { row: 20 }, b: { row: 10, phase: 'move', roll: 5 } }));
        outOfOrder.currentTurn = 'b';
        expect((await run(outOfOrder, move({ row: 15, lane: 1 }, 'b'))).outcome.validMove).toBe(false);
        expect(seat(outOfOrder, 'b').row).toBe(10);
    });

    it("counts a lap on crossing the line", async () => {
        const game = makeGame(rolled(4, { row: 76, lane: 1 }));
        game.specificGameState.laps = 2;
        await run(game, move({ row: 2, lane: 1 }));

        expect(seat(game, 'a').row).toBe(2);
        expect(seat(game, 'a').lapsCompleted).toBe(1);
        expect(log(game)).toContain('completed 1 lap');
    });
});

/** A whole turn: shift, then move to `destination`. */
async function driveTurn(
    game: IRaceCarsGameData,
    userId: string,
    gear: RaceCarsGear,
    roll: number,
    destination: { row: number; lane: number },
) {
    await run(game, shift({ gear, recordedRoll: roll }, userId));
    return run(game, move(destination, userId));
}

describe("CheckEndTurn (§15)", () => {
    it("hands the turn on and resets the incoming driver's phase, roll and brakes", async () => {
        // Round two and after: §6a's startup round has its own hand-off, tested
        // with the launch below.
        const game = makeGame(race({
            a: { row: 20, lane: 2, gear: 3, phase: 'shift' },
            b: { row: 10, lane: 1, gear: 3, phase: 'move', roll: 99, brakeSpent: 3 },
        }, { round: 2 }));

        await driveTurn(game, 'a', 4, 9, { row: 29, lane: 2 });

        expect(game.currentTurn).toBe('b');
        expect(game.specificGameState.roundIndex).toBe(1);
        expect(seat(game, 'b').phase).toBe('shift');
        expect(seat(game, 'b').roll).toBeNull();
        expect(seat(game, 'b').brakeSpent).toBe(0);
        // The driver who just finished keeps their own stale turn state, which
        // is exactly why it is theirs and not the game's (§23.4).
        expect(seat(game, 'a').phase).toBe('move');
    });

    it("does not lock out every driver after the first", async () => {
        // The regression turnTimeout.ts records this repo shipping once already
        // on Banned Islet's actionsLeft: forget to reset the incoming driver's
        // phase and the second shift of the race is refused forever.
        const game = makeGame(race({
            a: { row: 20, lane: 2, gear: 3, phase: 'shift' },
            b: { row: 10, lane: 1, gear: 1, phase: 'shift' },
            c: { row: 5, lane: 1, gear: 1, phase: 'shift' },
        }, { round: 2 }));

        await driveTurn(game, 'a', 4, 9, { row: 29, lane: 2 });
        expect((await driveTurn(game, 'b', 2, 3, { row: 13, lane: 1 })).outcome.validMove).toBe(true);
        expect((await driveTurn(game, 'c', 2, 2, { row: 7, lane: 1 })).outcome.validMove).toBe(true);
        expect(game.specificGameState.round).toBe(3);
        expectConserved(game);
    });

    it("rebuilds the round order whole, leader first, only when the round wraps", async () => {
        const game = makeGame(race({
            a: { row: 20, lane: 2, gear: 3, phase: 'shift' },
            b: { row: 40, lane: 2, gear: 3, phase: 'shift' },
        }, { round: 2 }));

        await driveTurn(game, 'a', 4, 9, { row: 29, lane: 2 });
        // Mid-round the order is a fixed fact, untouched by a's move — even
        // though b now leads on the road.
        expect(game.specificGameState.roundOrder).toEqual(['a', 'b']);
        expect(game.specificGameState.round).toBe(2);

        await driveTurn(game, 'b', 4, 9, { row: 49, lane: 1 });
        expect(game.specificGameState.round).toBe(3);
        expect(game.specificGameState.roundOrder).toEqual(['b', 'a']);
        expect(game.specificGameState.roundIndex).toBe(0);
        expect(game.currentTurn).toBe('b');
    });

    it("breaks an exact tie on the previous round's order (§15)", async () => {
        const game = makeGame(race({
            a: { row: 20, lane: 1, gear: 3, phase: 'shift' },
            b: { row: 20, lane: 2, gear: 3, phase: 'shift' },
        }));
        game.specificGameState.roundOrder = ['b', 'a'];
        game.currentTurn = 'b';

        // Both end the round on row 28 — the bunching a corner is for, and the
        // state an in-place sort would read a half-permuted array in.
        await driveTurn(game, 'b', 4, 8, { row: 28, lane: 2 });
        await driveTurn(game, 'a', 4, 8, { row: 28, lane: 1 });

        expect(game.specificGameState.roundOrder).toEqual(['b', 'a']);
    });

    it("unwinds a run of consecutive spun drivers in one pass", async () => {
        const game = makeGame(race({
            a: { row: 20, lane: 2, gear: 3, phase: 'shift' },
            b: { row: 15, lane: 1, skipNextTurn: true },
            c: { row: 10, lane: 1, skipNextTurn: true },
        }));

        await driveTurn(game, 'a', 4, 9, { row: 29, lane: 2 });

        // Both skips consumed at the moment of skipping, inside the one
        // CheckEndTurn a's move triggered — which is what bounds the loop.
        expect(seat(game, 'b').skipNextTurn).toBe(false);
        expect(seat(game, 'c').skipNextTurn).toBe(false);
        expect(game.specificGameState.round).toBe(2);
        expect(game.currentTurn).toBe('a');
        expect(game.specificGameState.roundIndex).toBe(0);
        expect(seat(game, 'a').phase).toBe('shift');
        expect(game.gameState.history.filter(entry => entry.text.includes('sat out the round')))
            .toHaveLength(2);
    });

    it("unwinds when the driver who just moved spun into a skip of their own", async () => {
        // The pass that exhausts the bound: b is already sitting out, and a
        // spins on the move that ends the round, so the wrap lands on a's own
        // fresh skip before it reaches somebody who can drive.
        const game = makeGame(race({
            a: { row: 38, lane: 2, gear: 4, phase: 'shift', tyres: 3, brakes: 0 },
            b: { row: 15, lane: 1, skipNextTurn: true },
        }));

        await driveTurn(game, 'a', 5, 17, { row: 55, lane: 1 });

        expect(seat(game, 'a').row).toBe(51);
        expect(seat(game, 'a').skipNextTurn).toBe(false);
        expect(seat(game, 'b').skipNextTurn).toBe(false);
        expect(game.currentTurn).toBe('b');
        expect(seat(game, 'b').phase).toBe('shift');
        expect(seat(game, 'b').roll).toBeNull();
    });

    it("counts a round the whole field sat out, wrapping twice in the one pass", async () => {
        // The mover is last in the order and spins, and everybody ahead of them
        // is already sitting out — so this one CheckEndTurn walks off the end of
        // the order twice: once to finish round 1, and once more across a round
        // 2 in which every driver consumed their slot by missing it.
        const game = makeGame(race({
            a: { row: 20, lane: 2, skipNextTurn: true },
            b: { row: 38, lane: 2, gear: 4, phase: 'shift', tyres: 3, brakes: 0 },
        }));
        game.specificGameState.roundIndex = 1;
        game.currentTurn = 'b';

        await driveTurn(game, 'b', 5, 17, { row: 55, lane: 1 });

        expect(seat(game, 'b').row).toBe(51);
        expect(seat(game, 'a').skipNextTurn).toBe(false);
        expect(seat(game, 'b').skipNextTurn).toBe(false);
        // Three, not two. Round 2 elapsed with nobody driving, and the log says
        // so twice — one "sat out" line per driver, one per slot of that round.
        // A counter that only moved once per CheckEndTurn would contradict its
        // own log, and would age §14's slicks a round too slowly.
        expect(game.specificGameState.round).toBe(3);
        expect(game.gameState.history.filter(entry => entry.text.includes('sat out the round')))
            .toHaveLength(2);
        expect(game.specificGameState.roundIndex).toBe(0);
        expect(game.currentTurn).toBe(game.specificGameState.roundOrder[0]);
        expect(seat(game, game.currentTurn).phase).toBe('shift');
    });

    it("a spun driver keeps their slot in the order the next round", async () => {
        const game = makeGame(race({
            a: { row: 20, lane: 2, gear: 3, phase: 'shift' },
            b: { row: 40, lane: 1, skipNextTurn: true },
        }));

        await driveTurn(game, 'a', 4, 9, { row: 29, lane: 2 });

        // b was skipped, not dropped: they still lead on the road, so they
        // still lead the order (§23.8 — no case removes a driver).
        expect(game.specificGameState.roundOrder).toEqual(['b', 'a']);
        expect(game.currentTurn).toBe('b');
    });

    it("never touches turnOrder or the roster the colour map keys on (§23.2)", async () => {
        const game = makeGame(race({
            a: { row: 20, lane: 2, gear: 3, phase: 'shift' },
            b: { row: 40, lane: 2, gear: 3, phase: 'shift' },
            c: { row: 60, lane: 1, gear: 3, phase: 'shift' },
        }, { round: 2 }), ['a', 'b', 'c']);

        await driveTurn(game, 'a', 4, 9, { row: 29, lane: 2 });
        await driveTurn(game, 'b', 4, 8, { row: 48, lane: 1 });
        await driveTurn(game, 'c', 2, 3, { row: 63, lane: 1 });

        // Sorting either of these by track position would recolour every car
        // the moment somebody overtook — in the scoreboard, the board, the log
        // and the recap at once.
        expect(game.gameState.turnOrder).toEqual(['a', 'b', 'c']);
        expect(game.userIdList).toEqual(['a', 'b', 'c']);
        expect(game.specificGameState.roundOrder).toEqual(['c', 'b', 'a']);
    });

    it("does nothing on a command that did not end the turn", async () => {
        const game = makeGame(race({ a: { row: 20, gear: 3, phase: 'shift' }, b: {} }));
        await run(game, shift({ gear: 4, recordedRoll: 9 }));

        expect(game.currentTurn).toBe('a');
        expect(game.specificGameState.roundIndex).toBe(0);
        expect(seat(game, 'a').roll).toBe(9);
    });
});

describe("CheckGameOver", () => {
    it("returns the flag the winning command set rather than re-deriving a win", () => {
        const gameType = new RaceCarsGameType();
        const game = makeGame(race({
            a: { row: 77, lane: 1, lapsCompleted: 1 },
            b: { row: 5, lane: 1 },
        }));

        // A car sitting on the last row having completed the distance is
        // exactly the state a derived win would hand the race to. §4.1's win is
        // an event in play order, so nothing here says the race is over — the
        // command that crosses the line does, in PR 5.
        expect(gameType.CheckGameOver(game)).toBe(false);

        game.complete = true;
        expect(gameType.CheckGameOver(game)).toBe(true);
    });
});

describe("a race that keeps running", () => {
    it("drives two cars round Ashcombe to the flag without leaking a pool or sharing a space", async () => {
        const track = trackById('ashcombe');
        const game = makeGame(race({
            a: { row: 2, lane: 1, gear: 0, phase: 'start' },
            b: { row: 2, lane: 3, gear: 0, phase: 'start' },
        }));

        // Both drivers take the highest gear they are allowed and its lowest
        // roll, every turn — a deliberately reckless line that blows through
        // corners, empties the tyre pool and spins, so the loop below visits
        // the blocked, boxed, overshot, spun and towed paths rather than a
        // clean lap. §23.8's assertion is termination: a lap of Ashcombe at
        // this pace is well inside the bound, so a loop that runs out of turns
        // is a race that has wedged.
        let turns = 0;
        while (!game.complete && turns < 60) {
            turns += 1;
            const driver = game.currentTurn;
            const ps = seat(game, driver);

            if (ps.phase === 'slipstream') {
                // Take every tow going, which is what drives the tow's own
                // corners, overshoots and spins through this loop as well —
                // `slipstreamMoveOptions` rather than the raw reach, so a
                // corner entry with no brake left to pay for it is never the
                // one picked (§12).
                const tow = slipstreamMoveOptions(game.specificGameState, driver).spaces[0];
                expect((await run(game, slipstream({ tow }, driver))).outcome.validMove).toBe(true);
                expectConserved(game);
                continue;
            }

            if (ps.phase === 'start') {
                // §6a: round one is one d20 and no gear at all. Recorded so the
                // race below is the same race every run — a clean getaway into
                // first, with first gear's own die coming up a 2.
                const away = await run(game, launch({ recordedStartRoll: 2, recordedRoll: 2 }, driver));
                expect(away.outcome.validMove).toBe(true);
                expectConserved(game);
                continue;
            }

            if (ps.phase === 'shift') {
                const gears = legalGears(game.specificGameState, driver);
                const gear = gears[gears.length - 1].gear;
                const shifted = await run(game, shift({ gear, recordedRoll: gearDef(gear).min }, driver));
                expect(shifted.outcome.validMove).toBe(true);
            }

            const reach = moveOptions(game.specificGameState, driver, seat(game, driver).roll!);
            const moved = await run(game, move(reach.spaces[0], driver));
            expect(moved.outcome.validMove).toBe(true);
            expectConserved(game);
        }

        expect(game.complete).toBe(true);
        expect(game.winner).not.toBe('');
        for (const [, ps] of cars(game)) {
            expect(ps.row).toBeGreaterThanOrEqual(0);
            expect(ps.row).toBeLessThan(track.rows);
            expect(ps.gear).toBeLessThanOrEqual(track.maxGear);
            // §4.2's classification is written for the whole field, not just
            // the car that crossed.
            expect(ps.finishedPosition).not.toBeNull();
        }
        // A lap between two drivers is well past the round boundary, so the
        // recompute has run — repeatedly — without wedging anybody.
        expect(game.specificGameState.round).toBeGreaterThan(1);
        expect(game.gameState.turnOrder).toEqual(['a', 'b']);
    });
});

// ─── PR 5 ───────────────────────────────────────────────────────────────────

describe("the slipstream hand-off (§12)", () => {
    /**
     * `a` finishes its move on row 20; `b` sits directly ahead at 21, same
     * lane. Both in 4th gear — the minimum a draft needs (§12) — so these
     * fixtures are about position and traffic, not the gear condition.
     */
    function towable(overrides: Record<string, Partial<IRaceCarsPlayerState>> = {}) {
        return makeGame(race({
            a: { row: 16, lane: 1, gear: 4, phase: 'move', roll: 4 },
            b: { row: 21, lane: 1, gear: 4 },
            ...overrides,
        }));
    }

    it("hands the driver into the slipstream phase rather than ending the turn", async () => {
        const game = towable();
        const { outcome } = await run(game, move({ row: 20, lane: 1 }));

        expect(outcome.turnOver).toBe(false);
        expect(seat(game, 'a').phase).toBe('slipstream');
        // turnOver is false, so nobody has been handed anything (§7).
        expect(game.currentTurn).toBe('a');
        expect(game.specificGameState.roundIndex).toBe(0);
    });

    it("ends the turn when no car is directly ahead", async () => {
        const game = towable({ b: { row: 40, lane: 1 } });
        const { outcome } = await run(game, move({ row: 20, lane: 1 }));

        expect(outcome.turnOver).toBe(true);
        expect(seat(game, 'a').phase).toBe('move');
        expect(game.currentTurn).toBe('b');
    });

    it("ends the turn instead of handing off when neither car is fast enough to draft (§12)", async () => {
        const game = towable({ a: { row: 16, lane: 1, gear: 3, phase: 'move', roll: 4 }, b: { row: 21, lane: 1, gear: 3 } });
        const { outcome } = await run(game, move({ row: 20, lane: 1 }));

        expect(outcome.turnOver).toBe(true);
        expect(seat(game, 'a').phase).toBe('move');
        expect(game.currentTurn).toBe('b');
    });

    it("offers no tow to a car that has just spun — the spin ended the turn (§18)", async () => {
        // Driving out of the Hairpin with nothing banked costs two tyres this
        // car does not have, so it spins back onto the corner's last row (§10)
        // — directly behind `b`, which would otherwise be a tow.
        const game = makeGame(race({
            a: { row: 13, lane: 1, gear: 4, phase: 'move', roll: 3, tyres: 1 },
            b: { row: 15, lane: 1, gear: 4 },
        }));
        const { outcome } = await run(game, move({ row: 16, lane: 2 }));

        expect(seat(game, 'a').row).toBe(14);
        expect(seat(game, 'a').skipNextTurn).toBe(true);
        expect(outcome.turnOver).toBe(true);
        expect(seat(game, 'a').phase).not.toBe('slipstream');
    });

    it("reports the arrival on the outcome, for the end-of-move reveal", async () => {
        const game = towable();
        const { outcome } = await run(game, move({ row: 20, lane: 1 }));
        const { arrival } = outcome as IRaceCarsArrivalOutcome;

        expect(arrival.row).toBe(20);
        expect(arrival.towOffered).toBe(true);
        expect(arrival.spun).toBe(false);
        expect(arrival.finished).toBe(false);
        expect(arrival.tyresSpent).toBe(0);
    });
});

describe("RaceCarsSlipstream (§7 step 3, §12)", () => {
    /**
     * `a` has already moved and is sitting directly behind `b`, at 21, same
     * lane. Both in 4th gear by default — the minimum a draft needs (§12) —
     * so a test that overrides `b` (or adds a third car) still needs to say
     * so explicitly if it wants the draft to hold.
     */
    function towed(driver: Partial<IRaceCarsPlayerState> = {}, others: Record<string, Partial<IRaceCarsPlayerState>> = {}) {
        return makeGame(race({
            a: { row: 20, lane: 1, gear: 4, phase: 'slipstream', roll: 4, ...driver },
            b: { row: 21, lane: 1, gear: 4 },
            ...others,
        }));
    }

    it("takes the tow three rows and ends the turn", async () => {
        const game = towed();
        const { outcome } = await run(game, slipstream({ tow: { row: 23, lane: 2 } }));

        expect(outcome.turnOver).toBe(true);
        expect(seat(game, 'a').row).toBe(23);
        expect(seat(game, 'a').lane).toBe(2);
        expect(log(game)).toContain('took the tow 3 spaces');
        expect(game.currentTurn).toBe('b');
        expectConserved(game);
    });

    it("declines with a null tow, which costs nothing and moves nothing", async () => {
        const game = towed();
        const { outcome } = await run(game, slipstream({ tow: null }));

        expect(outcome.turnOver).toBe(true);
        expect(seat(game, 'a').row).toBe(20);
        expect(seat(game, 'a').tyres).toBe(5);
        expect(log(game)).toContain('waved the tow away');
        expect(game.currentTurn).toBe('b');
    });

    it("refuses a driver who was never offered a tow, whatever their phase says", async () => {
        const game = towed({}, { b: { row: 40, lane: 1 } });
        expect((await run(game, slipstream({ tow: { row: 23, lane: 1 } }))).outcome.validMove).toBe(false);
        expect(seat(game, 'a').row).toBe(20);
    });

    it("refuses a tow outside the server's own three-row reach set", async () => {
        const game = towed();
        for (const tow of [{ row: 30, lane: 1 }, { row: 22, lane: 1 }, { row: 23, lane: 9 }, { row: 23.5, lane: 1 }]) {
            expect((await run(game, slipstream({ tow }))).outcome.validMove).toBe(false);
        }
        expect(seat(game, 'a').row).toBe(20);
    });

    it("refuses a slipstream before the move that earns it, and from a driver off turn", async () => {
        const beforeTheMove = towed({ phase: 'move' });
        expect((await run(beforeTheMove, slipstream({ tow: null }))).outcome.validMove).toBe(false);

        const offTurn = towed();
        expect((await run(offTurn, slipstream({ tow: null }, 'b'))).outcome.validMove).toBe(false);
        expect(offTurn.currentTurn).toBe('a');
    });

    it("charges a tow out of a corner in full — §10's waiver does not reach it (§12)", async () => {
        // Row 14 is the Hairpin's last row with one of its two stops banked. A
        // *move* off it is free (§10: the road allowed nothing slower); a tow
        // off it is a choice, so its three rows are three tyres.
        const game = towed({ row: 14, lane: 1, cornerStops: 1 }, { b: { row: 15, lane: 1, gear: 4 } });
        const { outcome } = await run(game, slipstream({ tow: { row: 17, lane: 2 } }));

        expect(outcome.validMove).toBe(true);
        expect(seat(game, 'a').row).toBe(17);
        expect(seat(game, 'a').tyres).toBe(2);
        expect(log(game)).toContain('overshot Ashcombe Hairpin by 3 spaces');
    });

    it("spins the car when the tow's overshoot cannot be paid (§13)", async () => {
        const game = towed({ row: 13, lane: 1, cornerStops: 1, tyres: 1 }, { b: { row: 14, lane: 1, gear: 4 } });
        const { outcome } = await run(game, slipstream({ tow: { row: 16, lane: 2 } }));

        expect(outcome.turnOver).toBe(true);
        // §10: you pay nothing, and the car is placed on the corner's last row.
        expect(seat(game, 'a').tyres).toBe(1);
        expect(seat(game, 'a').row).toBe(14);
        expect(seat(game, 'a').gear).toBe(0);
        expect(seat(game, 'a').skipNextTurn).toBe(true);
        expect(log(game)).toContain('misses their next turn');
    });

    it("takes a tyre for a tow the traffic cuts short (§9, §12)", async () => {
        // Both lanes of row 23 are taken, so three rows are not reachable and
        // the tow stops on the furthest space that is.
        const game = towed({ row: 20, lane: 1 }, {
            b: { row: 21, lane: 1, gear: 4 },
            c: { row: 23, lane: 1 },
            d: { row: 23, lane: 2 },
            e: { row: 23, lane: 3 },
        });
        const { outcome } = await run(game, slipstream({ tow: { row: 22, lane: 2 } }));

        expect(outcome.validMove).toBe(true);
        expect(seat(game, 'a').row).toBe(22);
        expect(seat(game, 'a').tyres).toBe(4);
        expect(log(game)).toContain('was blocked and had to lift');
    });

    it("chains into a second tow when it ends directly behind a third car it is fast enough to draft (§12)", async () => {
        const game = towed({}, { b: { row: 21, lane: 1, gear: 4 }, c: { row: 24, lane: 1, gear: 4 } });
        const { outcome } = await run(game, slipstream({ tow: { row: 23, lane: 1 } }));

        // The tow lands at row 23, directly behind c at 24, and both cars are
        // still fast enough to draft — the gear a tow leaves unchanged — so a
        // fresh offer stands.
        expect(outcome.turnOver).toBe(false);
        expect((outcome as IRaceCarsArrivalOutcome).arrival.towOffered).toBe(true);
        expect(seat(game, 'a').phase).toBe('slipstream');
        expect(game.currentTurn).toBe('a');
    });

    it("ends the turn on the tow when the third car behind it cannot be drafted (§12)", async () => {
        const game = towed({}, { b: { row: 21, lane: 1, gear: 4 }, c: { row: 24, lane: 1, gear: 3 } });
        const { outcome } = await run(game, slipstream({ tow: { row: 23, lane: 1 } }));

        expect(outcome.turnOver).toBe(true);
        expect((outcome as IRaceCarsArrivalOutcome).arrival.towOffered).toBe(false);
        expect(game.currentTurn).toBe('b');
    });

    it("charges a brake for late braking into a corner the tow was not already in (§12)", async () => {
        // Row 44 is on the Mile; the tow lands at row 47, fresh into Gravel
        // Bend, so it costs a brake on top of anything §10 charges once there.
        const game = towed({ row: 44, lane: 1, brakes: 4 }, { b: { row: 45, lane: 1, gear: 4 } });
        const { outcome } = await run(game, slipstream({ tow: { row: 47, lane: 1 } }));

        expect(outcome.validMove).toBe(true);
        expect(seat(game, 'a').row).toBe(47);
        expect(seat(game, 'a').brakes).toBe(3);
        expect(log(game)).toContain('1 brake for late braking');
        expectConserved(game);
    });

    it("charges nothing extra for towing further into the corner it is already standing in (§12)", async () => {
        // Row 47 is already Gravel Bend's first row; the tow lands at row 50,
        // still inside it — not an entry, so no brake point is spent.
        const game = towed({ row: 47, lane: 1, brakes: 4 }, { b: { row: 48, lane: 1, gear: 4 } });
        const { outcome } = await run(game, slipstream({ tow: { row: 50, lane: 1 } }));

        expect(outcome.validMove).toBe(true);
        expect(seat(game, 'a').row).toBe(50);
        expect(seat(game, 'a').brakes).toBe(4);
    });

    it("refuses a tow into a fresh corner with no brakes left to pay for it (§12)", async () => {
        // Row 44 again, but no brakes: the only reach is a fresh corner entry,
        // so no offer stands and the destination is refused if asked for anyway.
        const game = towed({ row: 44, lane: 1, brakes: 0 }, { b: { row: 45, lane: 1, gear: 4 } });
        const { outcome } = await run(game, slipstream({ tow: { row: 47, lane: 1 } }));

        expect(outcome.validMove).toBe(false);
        expect(seat(game, 'a').row).toBe(44);
    });

    it("refuses a tow neither car is fast enough to draft, whatever their phase says", async () => {
        const game = towed({ gear: 3 }, { b: { row: 21, lane: 1, gear: 3 } });
        expect((await run(game, slipstream({ tow: { row: 23, lane: 2 } }))).outcome.validMove).toBe(false);
        expect(seat(game, 'a').row).toBe(20);
    });
});

describe("crossing the line (§4.1, §4.2)", () => {
    /** `a` is four rows from the line on the last lap; `b` and `c` are not. */
    function lastLap(laps = 1) {
        return makeGame(race({
            a: { row: 74, lane: 1, phase: 'move', roll: 4, lapsCompleted: laps - 1 },
            b: { row: 30, lane: 1 },
            c: { row: 50, lane: 1 },
        }, { laps }));
    }

    it("ends the race the instant a car completes the distance", async () => {
        const game = lastLap();
        const { outcome, gameOver } = await run(game, move({ row: 0, lane: 1 }));

        expect(outcome.validMove).toBe(true);
        expect(gameOver).toBe(true);
        expect(game.complete).toBe(true);
        expect(game.winner).toBe('a');
        // finishGame clears this too, but a replay never reaches finishGame.
        expect(game.currentTurn).toBe('');
        expect(new RaceCarsGameType().CheckGameOver(game)).toBe(true);
    });

    it("classifies the whole field by track progress at the moment of the crossing (§4.2)", async () => {
        const game = lastLap();
        await run(game, move({ row: 0, lane: 1 }));

        expect(seat(game, 'a').finishedPosition).toBe(1);
        expect(seat(game, 'c').finishedPosition).toBe(2);
        expect(seat(game, 'b').finishedPosition).toBe(3);
        expect(game.gameState.history[1].text).toContain('takes the chequered flag');
        expect(game.gameState.history[0].text).toContain('Classified: P1 {{a}}, P2 {{c}}, P3 {{b}}');
    });

    it("does not hand the turn on, and offers no tow, once the flag is out", async () => {
        // `b` sits one row past the line, which would be a tow on any other lap.
        const game = lastLap();
        seat(game, 'b').row = 1;
        const { outcome } = await run(game, move({ row: 0, lane: 1 }));

        expect((outcome as IRaceCarsArrivalOutcome).arrival.towOffered).toBe(false);
        expect(seat(game, 'a').phase).not.toBe('slipstream');
        // CheckEndTurn never runs on a game that just ended (commandPipeline).
        expect(game.specificGameState.roundIndex).toBe(0);
    });

    it("counts a lap without ending a Grand Prix until the distance is done", async () => {
        const game = lastLap(2);
        seat(game, 'a').lapsCompleted = 0;
        const { gameOver } = await run(game, move({ row: 0, lane: 1 }));

        expect(gameOver).toBe(false);
        expect(game.complete).toBe(false);
        expect(seat(game, 'a').lapsCompleted).toBe(1);
        expect(seat(game, 'a').finishedPosition).toBeNull();
    });

    it("can be won on the tow (§12)", async () => {
        const game = makeGame(race({
            a: { row: 72, lane: 1, gear: 4, phase: 'move', roll: 3 },
            b: { row: 76, lane: 1, gear: 4 },
            c: { row: 40, lane: 1 },
        }));

        const { outcome } = await run(game, move({ row: 75, lane: 1 }));
        expect(outcome.turnOver).toBe(false);
        expect(seat(game, 'a').phase).toBe('slipstream');

        const towed = await run(game, slipstream({ tow: { row: 0, lane: 2 } }));
        expect(towed.gameOver).toBe(true);
        expect(game.winner).toBe('a');
        expect(seat(game, 'a').lapsCompleted).toBe(1);
        expect(seat(game, 'b').finishedPosition).toBe(2);
        expect(seat(game, 'c').finishedPosition).toBe(3);
        expect(log(game)).toContain('Classified');
    });
});
