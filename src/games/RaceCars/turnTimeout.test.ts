import { describe, expect, it } from "vitest";
import { resolveStalledTurn } from "@/utils/games/turnTimeout";
import type { IGameDataDocument } from "@/utils/mongodb/GameData";
import { RaceCarsGameType, RaceCarsMove, RaceCarsShift, RaceCarsSlipstream } from "./RaceCarsLogic";
import type { IRaceCarsPlayerState, IRaceCarsSpecificGameState } from "./rules";
import { gearDef, RACE_DISTANCES, SPECS, specDef, trackById } from "./board";
import { race } from "./testFixtures";
import { mongoMap } from "@/utils/games/mongoMaps";

// docs/games/race-cars.md §23.7 PR 6. The cron's plain advance is wrong here
// twice over: a silent driver's car does not move, which makes timing out a way
// to conserve wear — and a turn that times out in the 'slipstream' phase takes
// the whole race down, because only that driver may send RaceCarsSlipstream and
// the command route stops accepting it the moment currentTurn moves past.
//
// So this exercises resolveStalledTurn exactly as the turn-timer cron calls it,
// against a real RaceCarsGameType and real commands, in the shape of
// src/games/BannedIslet/turnTimeout.test.ts.
//
// Ashcombe (§5.2), for reading the fixtures below against:
//   0-9 straight (3) · 10-14 Hairpin (2, two stops) · 15-46 The Mile (3)
//   47-51 Gravel Bend (2, one stop) · 52-61 Esses (2) · 62-65 The Kink (3, one)
//   66-77 Run to the Line (3)

function makeGame(state: IRaceCarsSpecificGameState): IGameDataDocument {
    const turnOrder = [...state.roundOrder];
    return {
        gameId: "g",
        gameType: new RaceCarsGameType(),
        currentTurn: state.roundOrder[state.roundIndex],
        userIdList: turnOrder,
        gameState: { turnOrder, history: [], commandHistory: [] },
        specificGameState: state,
        complete: false,
        winner: "",
        markModified: () => {},
    } as unknown as IGameDataDocument;
}

function commandHistory(game: IGameDataDocument): (RaceCarsShift | RaceCarsMove | RaceCarsSlipstream)[] {
    return game.gameState.commandHistory as unknown as (RaceCarsShift | RaceCarsMove | RaceCarsSlipstream)[];
}

function playedClassNames(game: IGameDataDocument): string[] {
    return commandHistory(game).map(command => command.className);
}

function seat(state: IRaceCarsSpecificGameState, userId: string): IRaceCarsPlayerState {
    return mongoMap(state.players).get(userId)!;
}

describe("Race Cars turn timeout (§23.7 PR 6)", () => {
    it("drives the whole turn from a stall in 'shift' — the car is not left parked", async () => {
        // b is half a circuit away, so nothing here is about the tow.
        const state = race({
            a: { row: 20, lane: 1, gear: 2, phase: 'shift' },
            b: { row: 60, lane: 1 },
        }, { round: 2 });
        const game = makeGame(state);

        expect(await resolveStalledTurn(game, "a", "Alice")).toBe('advanced');

        // Both halves of §7 run: the plain advance moved currentTurn and left
        // the car where it was, which is how timing out became a way to
        // conserve wear.
        expect(playedClassNames(game)).toEqual(['RaceCarsShift', 'RaceCarsMove']);
        const car = seat(state, "a");
        expect(car.gear).toBe(3);                       // climbs on a clear straight
        expect(car.row).toBe(20 + car.roll!);
        expect(car.roll).toBeGreaterThanOrEqual(gearDef(3).min);
        expect(car.roll).toBeLessThanOrEqual(gearDef(3).max);
        expect(car.tyres).toBe(5);                      // The Mile charges nothing

        // And the die it threw is written back onto the command, or a replay of
        // this race rolls a different number than the one it was driven on.
        expect((commandHistory(game)[0] as RaceCarsShift).recordedRoll).toBe(car.roll);

        // The next driver gets a turn that starts at §7 step 1.
        expect(game.currentTurn).toBe("b");
        expect(seat(state, "b").phase).toBe('shift');
        expect(seat(state, "b").roll).toBeNull();
    });

    it("spends the roll already thrown when the stall is in 'move', never a second one", async () => {
        // A 17 from row 38 is row 55, four rows past Gravel Bend; four brakes
        // make it a 13, which lands the Bend's last row (§11).
        const state = race({
            a: { row: 38, lane: 1, gear: 5, phase: 'move', roll: 17 },
            b: { row: 5, lane: 1 },
        });
        const game = makeGame(state);

        expect(await resolveStalledTurn(game, "a", "Alice")).toBe('advanced');

        // A blind RaceCarsShift here would re-roll a die already thrown — which
        // is the reason this adapter branches on the driver's phase instead of
        // handing back a fixed three-command sequence.
        expect(playedClassNames(game)).toEqual(['RaceCarsMove']);
        const car = seat(state, "a");
        expect(car.gear).toBe(5);
        expect(car.row).toBe(51);
        expect(car.brakes).toBe(0);                     // the minimum spend that avoids the overshoot is all four
        expect(car.tyres).toBe(5);                      // and so nothing is overshot
        expect(car.cornerStops).toBe(1);
        expect(game.currentTurn).toBe("b");
    });

    it("resolves a stall in 'slipstream', which nothing else could (§12)", async () => {
        const state = race({
            a: { row: 20, lane: 1, gear: 4, phase: 'slipstream' },
            b: { row: 21, lane: 1, gear: 4 },
        });
        const game = makeGame(state);

        expect(await resolveStalledTurn(game, "a", "Alice")).toBe('advanced');

        // Without the adapter this is the state that takes the race down: only
        // a may send RaceCarsSlipstream, and the command route stops accepting
        // it the moment currentTurn moves past — after which every other
        // driver's shift is refused against a phase that is not theirs, and the
        // game ends as an abandonment blamed on whoever happened to be current.
        expect(playedClassNames(game)).toEqual(['RaceCarsSlipstream']);
        expect(seat(state, "a").row).toBe(23);
        expect(game.currentTurn).toBe("b");
    });

    it("declines a tow that would push it out of a corner it still owes (§12)", async () => {
        const state = race({
            a: { row: 13, lane: 1, gear: 4, cornerStops: 1, phase: 'slipstream' },
            b: { row: 14, lane: 1, gear: 4 },
        });
        const game = makeGame(state);

        expect(await resolveStalledTurn(game, "a", "Alice")).toBe('advanced');

        expect(playedClassNames(game)).toEqual(['RaceCarsSlipstream']);
        const car = seat(state, "a");
        expect(car.row).toBe(13);                       // §12's tow gets no waiver, so it stays put
        expect(car.tyres).toBe(5);
        expect(game.currentTurn).toBe("b");
    });

    it("leaves a corner's last row without paying for it, the way §10 waives it", async () => {
        // A car that began its turn on Gravel Bend's last row could not have
        // avoided leaving it, so the stops it still owes are written off. The
        // conservative line has to price that the same way `resolveArrival`
        // does, or the cron brakes away a pool against an overshoot that was
        // never going to be charged.
        const state = race({
            a: { row: 51, lane: 1, cornerStops: 0, gear: 3, phase: 'move', roll: 5 },
            b: { row: 20, lane: 1 },
        });
        const game = makeGame(state);

        expect(await resolveStalledTurn(game, "a", "Alice")).toBe('advanced');

        const car = seat(state, "a");
        expect(car.row).toBe(56);
        expect(car.tyres).toBe(5);
        expect(car.brakes).toBe(4);
        expect(game.currentTurn).toBe("b");
    });

    it("spins rather than naming nothing, when the cheapest overshoot still cannot be paid (§10)", async () => {
        // No brakes and no tyres: every candidate overshoots and none of them is
        // affordable. A preference list with no fallthrough would build a
        // command with an undefined destination here, which Execute refuses and
        // resolveStalledTurn reports as 'stuck' — on which the cron returns
        // before saving, discarding the missed-turn increment with it.
        const state = race({
            a: { row: 38, lane: 1, gear: 5, phase: 'move', roll: 17, brakes: 0, tyres: 0 },
            b: { row: 5, lane: 1 },
        });
        const game = makeGame(state);

        expect(await resolveStalledTurn(game, "a", "Alice")).toBe('advanced');

        expect(playedClassNames(game)).toEqual(['RaceCarsMove']);
        const car = seat(state, "a");
        expect(car.row).toBe(51);                       // §13: placed back on the corner's last row
        expect(car.gear).toBe(0);
        expect(car.skipNextTurn).toBe(true);
        expect(game.currentTurn).toBe("b");
    });

    it("takes first again in a car that spun last round, rather than leaving it in neutral", async () => {
        // Gear 0 is where a spun car sits and never somewhere a driver may
        // choose to go (§8.2), so the conservative line has to pick it up again
        // — into first, because §6a replaced the standing start's extra ratio.
        const state = race({
            a: { row: 5, lane: 1, gear: 0, phase: 'shift', startRoll: 12 },
            b: { row: 40, lane: 1, startRoll: 8 },
        }, { round: 2 });
        const game = makeGame(state);

        expect(await resolveStalledTurn(game, "a", "Alice")).toBe('advanced');

        expect(playedClassNames(game)).toEqual(['RaceCarsShift', 'RaceCarsMove']);
        const car = seat(state, "a");
        expect(car.gear).toBe(1);                       // first, and first only, out of neutral (§6a, §8.2)
        expect(car.row).toBe(5 + car.roll!);
        expect(car.row).toBeLessThanOrEqual(9);         // and short of the Hairpin it cannot stop in
        expect(game.currentTurn).toBe("b");
    });

    it("throws §6a's d20 for a driver who lets the startup round time out", async () => {
        // The startup round is the one turn with nothing to decide, so the cron
        // sends the same command every driver sends — and a stall (a 1) ends the
        // turn there, while anything else hands on to the move it rolled for.
        const state = race({
            a: { row: 2, lane: 1, gear: 0, phase: 'start' },
            b: { row: 0, lane: 1, gear: 0, phase: 'start' },
        });
        const game = makeGame(state);

        expect(await resolveStalledTurn(game, "a", "Alice")).toBe('advanced');

        const car = seat(state, "a");
        expect(playedClassNames(game)[0]).toBe('RaceCarsLaunch');
        expect(car.startRoll).not.toBeNull();
        // Either it bogged down and nothing else ran, or it got away and the
        // conservative move spent the number it got away on.
        if (car.startRoll === 1) {
            expect(playedClassNames(game)).toEqual(['RaceCarsLaunch']);
            expect(car.gear).toBe(0);
            expect(car.row).toBe(2);
        } else {
            expect(car.gear).toBe(1);
            expect(car.row).toBeGreaterThan(2);
        }
        expect(game.currentTurn).toBe("b");
        expect(seat(state, "b").phase).toBe('start');
    });

    it("steers round a slick rather than driving over it (§14)", async () => {
        // §23.7's preference order asks for "the furthest legal destination that
        // neither overshoots nor crosses oil", and crossing is a real cost even
        // to a driver who is not there: a 6 spins the car and costs them the
        // turn after this one as well. Lane 1 is oiled for the whole move, so
        // the line the cron takes has to be a different lane.
        //
        // PR 7 is what lays a slick in play; `walk` and `resolveArrival` have
        // understood them since PR 1, so the branch is provable now rather than
        // left unexercised until then.
        const state = race({
            a: { row: 20, lane: 1, gear: 3, phase: 'move', roll: 4 },
            b: { row: 60, lane: 1 },
        }, {
            oilSpills: true,
            slicks: [22, 23, 24].map(row => ({ row, lane: 1, laidOnRound: 1 })),
        });
        const game = makeGame(state);

        expect(await resolveStalledTurn(game, "a", "Alice")).toBe('advanced');

        const car = seat(state, "a");
        expect(car.row).toBe(24);
        expect(car.lane).toBe(2);                       // the nearest lane no slick sits in
        expect(car.skipNextTurn).toBe(false);           // so no oil die was thrown at all
    });

    it("declines a tow it could only take across oil (§12, §14)", async () => {
        // Three free rows are not free if they are three oiled rows, and
        // declining costs nothing — so the tow is priced the way §23.7 asks and
        // waved away.
        const state = race({
            a: { row: 20, lane: 1, gear: 4, phase: 'slipstream' },
            b: { row: 21, lane: 1, gear: 4 },
        }, {
            oilSpills: true,
            slicks: [1, 2, 3].map(lane => ({ row: 21, lane, laidOnRound: 1 })),
        });
        const game = makeGame(state);

        expect(await resolveStalledTurn(game, "a", "Alice")).toBe('advanced');

        expect(playedClassNames(game)).toEqual(['RaceCarsSlipstream']);
        expect(seat(state, "a").row).toBe(20);
        expect(game.currentTurn).toBe("b");
    });

    it("ends the race when the conservative line crosses the line (§4.1)", async () => {
        const state = race({
            a: { row: 74, lane: 1, gear: 3, phase: 'move', roll: 5 },
            b: { row: 40, lane: 1 },
        });
        const game = makeGame(state);

        expect(await resolveStalledTurn(game, "a", "Alice")).toBe('gameOver');

        // 'gameOver' rather than 'advanced' is what makes the cron call
        // finishGame: a race a silent driver happened to win is still won.
        expect(game.complete).toBe(true);
        expect(game.winner).toBe("a");
        expect(seat(state, "a").lapsCompleted).toBe(1);
        expect(seat(state, "a").finishedPosition).toBe(1);
        expect(seat(state, "b").finishedPosition).toBe(2);
    });

    // §23.8's auto-played race, driven entirely through the cron's own path.
    // The seven cases above are hand-picked board states; this is the one that
    // says the adapter is total at board states nobody thought to pick — and
    // 'stuck' is the assertion that matters, because it is the outcome on which
    // the cron returns before saving, throwing the missed-turn increment away
    // and re-reading the same game every tick forever.
    it.each(
        SPECS.flatMap(spec => RACE_DISTANCES.map(distance => [spec.id, distance.id, distance.laps] as const)),
    )("drives a whole %s %s race without ever getting stuck", async (specId, _distanceId, laps) => {
        const spec = specDef(specId);
        const grid = trackById('ashcombe').grid;
        const drivers = ['a', 'b', 'c', 'd', 'e', 'f'];
        const state = race(
            Object.fromEntries(drivers.map((userId, slot) => [userId, {
                ...grid[slot],
                gear: 0,
                phase: 'shift' as const,
                tyres: spec.tyres,
                brakes: spec.brakes,
                gearbox: spec.gearbox,
            }])),
            { laps, spec: specId },
        );
        const game = makeGame(state);

        // Four times §16's tuning, which puts a Sprint at roughly a dozen turns
        // a driver, so a race that reaches this is one that never finishes
        // rather than a slow one.
        const TURN_LIMIT = drivers.length * 48 * laps;
        let turns = 0;
        while (!game.complete && turns < TURN_LIMIT) {
            const driverId = game.currentTurn;
            const resolution = await resolveStalledTurn(game, driverId, driverId);
            expect(resolution).not.toBe('stuck');
            expect(resolution).not.toBe('declined');
            expect(resolution).not.toBe('noAdapter');
            turns++;

            // §23.8's conservation check, every turn: a pool outside its spec
            // or two cars on one space is a path derivation that walked through
            // a car, and the auto-played race is where that shows up.
            const spaces = new Set<string>();
            for (const [, ps] of mongoMap(state.players)) {
                expect(ps.tyres).toBeGreaterThanOrEqual(0);
                expect(ps.tyres).toBeLessThanOrEqual(spec.tyres);
                expect(ps.brakes).toBeGreaterThanOrEqual(0);
                expect(ps.brakes).toBeLessThanOrEqual(spec.brakes);
                expect(ps.gearbox).toBeGreaterThanOrEqual(0);
                expect(ps.gearbox).toBeLessThanOrEqual(spec.gearbox);
                spaces.add(`${ps.row}:${ps.lane}`);
            }
            expect(spaces.size).toBe(drivers.length);
        }

        expect(game.complete).toBe(true);
        expect(drivers).toContain(game.winner);
    });

    it("declines a turn for a seat the race doesn't hold, rather than looping on it", async () => {
        const state = race({ a: {}, b: {} }, { roundOrder: ['ghost', 'a', 'b'] });
        const game = makeGame(state);

        // 'declined' banks the missed turn against the abandon ladder; 'stuck'
        // would throw the increment away and re-read this game every tick
        // forever.
        expect(await resolveStalledTurn(game, "ghost", "Ghost")).toBe('declined');
        expect(playedClassNames(game)).toEqual([]);
    });
});
