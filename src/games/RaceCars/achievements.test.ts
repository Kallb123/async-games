// Each of Race Cars' achievements, against the view a check is really handed:
// the game's own replay adapter, asked for no viewer (docs/achievements.md §9,
// §12 test 5). One state that passes and one that doesn't, each.
import { describe, expect, it } from "vitest";
import type { ICommandOutcome } from "@/utils/apiModels/gameCommand";
import { criteriaOf, finishedSeat as finished, tableViewOf } from "@/utils/testing/gameAchievements";
import { cornerAt, spacesInCorner } from "./board";
import { moveOptions, type IRaceCarsPlayerState, type IRaceCarsSpecificGameState } from "./rules";
import type { IRaceCarsSpecificGameStateResponse } from "./apiModels";
import { RaceCarsGameType } from "./RaceCarsLogic";
import { makeGame, move, race, run, seat } from "./testFixtures";
import { MONACO } from "./tracks/monaco";
import { achievements, DONINGTON_GRID_SLOT, LONG_BEACH_GRID_SLOT, RASCASSE_CORNER_ID } from "./achievements";

const { turnEndCheck, endCheck, progress } = criteriaOf(achievements);

const NAMES = { a: "Alice", b: "Bob", c: "Cara", d: "Dev" };

/** The table's view of this race. */
function viewOf(state: IRaceCarsSpecificGameState): IRaceCarsSpecificGameStateResponse {
    return tableViewOf("RaceCarsGameType", state, NAMES);
}

describe("Race Cars' achievements", () => {
    it("Rookie Season counts races played, won or not", () => {
        expect(progress("racecars.rookie-season")({ played: 5, won: 0 })).toBe(5);
        expect(progress("racecars.rookie-season")({ played: 4, won: 4 })).toBe(4);
    });

    it("El Maestro counts wins", () => {
        expect(progress("racecars.el-maestro")({ played: 9, won: 4 })).toBe(4);
        expect(progress("racecars.el-maestro")({ played: 9, won: 5 })).toBe(5);
    });

    describe("Donington '93", () => {
        const check = turnEndCheck("racecars.donington-93");
        const ENDED: ICommandOutcome = { validMove: true, turnOver: true };

        /**
         * Round one, down to its last turn, with `leader` furthest round the
         * lap: the four cars dealt onto the grid in order, so `d` started
         * fourth. Ending that turn is what builds round two's order.
         */
        function endOfRoundOne(leader: string): IRaceCarsSpecificGameState {
            const at = (userId: string): Partial<IRaceCarsPlayerState> => ({ row: userId === leader ? 20 : 10, phase: "shift" });
            return race({ a: at("a"), b: at("b"), c: at("c"), d: at("d") }, { roundIndex: 3 });
        }

        it("is earned by the car that started fourth and led out of round one", () => {
            const state = endOfRoundOne("d");
            new RaceCarsGameType().CheckEndTurn(makeGame(state), ENDED);

            expect(state.round).toBe(2);
            expect(check(viewOf(state), { userId: "d" })).toBe(true);
            expect(check(viewOf(state), { userId: "a" })).toBe(false);
        });

        it("wants fourth on the grid or further back, not third", () => {
            const state = endOfRoundOne("c");
            new RaceCarsGameType().CheckEndTurn(makeGame(state), ENDED);

            expect(DONINGTON_GRID_SLOT).toBe(4);
            expect(check(viewOf(state), { userId: "c" })).toBe(false);
        });

        it("is not earned while round one is still being driven", () => {
            const state = endOfRoundOne("d");
            state.roundOrder = ["d", "a", "b", "c"];

            expect(check(viewOf(state), { userId: "d" })).toBe(false);
        });
    });

    describe("Rascassegate", () => {
        const check = turnEndCheck("racecars.rascassegate");
        const [rascasse] = spacesInCorner(MONACO, RASCASSE_CORNER_ID);
        const [piscine] = spacesInCorner(MONACO, "section16");
        const spunAtRascasse = { row: rascasse.row, lane: rascasse.lane, gear: 0, skipNextTurn: true } as const;
        const monaco = (seat: Partial<IRaceCarsPlayerState>) =>
            viewOf(race({ a: seat, b: {} }, { trackId: MONACO.id }));

        it("names La Rascasse, and the corner is on the board", () => {
            expect(MONACO.corners.find(corner => corner.id === RASCASSE_CORNER_ID)?.name).toBe("La Rascasse");
            expect(rascasse).toBeDefined();
        });

        it("is earned by overshooting La Rascasse with no tyres to pay for it", async () => {
            // A real spin through the move command, so "a spin at La Rascasse
            // rests in La Rascasse" is the rules' answer rather than the fixture's.
            // From the corner's first row, not its last: off the last, the road
            // gives no way to stay in, and the stops are waived (§10).
            const entry = spacesInCorner(MONACO, RASCASSE_CORNER_ID).reduce((first, space) => space.row < first.row ? space : first);
            const state = race({ a: { row: entry.row, lane: entry.lane, gear: 5, roll: 15, tyres: 0, brakes: 0 }, b: {} }, { trackId: MONACO.id });
            const [past] = moveOptions(state, "a", 15).spaces;
            expect(cornerAt(MONACO, past.row, past.lane)?.id).not.toBe(RASCASSE_CORNER_ID);

            const game = makeGame(state);
            await run(game, move({ row: past.row, lane: past.lane, brake: 0 }));

            expect(seat(game, "a").skipNextTurn).toBe(true);
            expect(check(viewOf(game.specificGameState), { userId: "a" })).toBe(true);
        });

        it("is earned by a car spun into La Rascasse", () => {
            const spun = monaco(spunAtRascasse);

            expect(check(spun, { userId: "a" })).toBe(true);
            expect(check(spun, { userId: "b" })).toBe(false);
        });

        it("is not earned by a car driving through it, or spinning somewhere else", () => {
            const driving = monaco({ row: rascasse.row, lane: rascasse.lane, gear: 2 });
            const elsewhere = monaco({ row: piscine.row, lane: piscine.lane, gear: 0, skipNextTurn: true });

            expect(check(driving, { userId: "a" })).toBe(false);
            expect(check(elsewhere, { userId: "a" })).toBe(false);
        });

        it("is only Monaco's", () => {
            const ashcombe = viewOf(race({ a: spunAtRascasse, b: {} }));

            expect(check(ashcombe, { userId: "a" })).toBe(false);
        });
    });

    it("Long Beach '83 wants the win from third on the grid or further back", () => {
        const check = endCheck("racecars.long-beach-83");
        const view = viewOf(race({ a: {}, b: {}, c: {} }));

        expect(LONG_BEACH_GRID_SLOT).toBe(3);
        expect(check(view, finished("c", "win"))).toBe(true);
        expect(check(view, finished("c", "loss"))).toBe(false);
        expect(check(view, finished("b", "win"))).toBe(false);
    });

    it("Three Wheels at Silverstone wants the win with no tyres left", () => {
        const check = endCheck("racecars.three-wheeler");
        const bald = viewOf(race({ a: { tyres: 0 }, b: { tyres: 0 } }));
        const one = viewOf(race({ a: { tyres: 1 }, b: {} }));

        expect(check(bald, finished("a", "win"))).toBe(true);
        expect(check(bald, finished("b", "loss"))).toBe(false);
        expect(check(one, finished("a", "win"))).toBe(false);
    });

    it("answers no, rather than throwing, for a seat the view doesn't hold", () => {
        const view = viewOf(race({ a: {}, b: {} }, { round: 2 }));
        expect(turnEndCheck("racecars.donington-93")(view, { userId: "z" })).toBe(false);
        expect(turnEndCheck("racecars.rascassegate")(view, { userId: "z" })).toBe(false);
        expect(endCheck("racecars.long-beach-83")(view, finished("z", "win"))).toBe(false);
        expect(endCheck("racecars.three-wheeler")(view, finished("z", "win"))).toBe(false);
    });
});
