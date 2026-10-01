// Each of Race Cars' achievements, against the view a check is really handed:
// the game's own replay adapter, asked for no viewer (docs/achievements.md §9,
// §12 test 5). One state that passes and one that doesn't, each.
import { describe, expect, it } from "vitest";
import type { CareerCriteria, FinishedSeat, GameRecord, MatchCriteria } from "@/utils/games/achievements";
import type { ICommandOutcome } from "@/utils/apiModels/gameCommand";
import { getReplayAdapter } from "@/utils/games/replay";
import { spacesInCorner } from "./board";
import type { IRaceCarsPlayerState, IRaceCarsSpecificGameState } from "./rules";
import type { IRaceCarsSpecificGameStateResponse } from "./apiModels";
import { RaceCarsGameType } from "./RaceCarsLogic";
import { makeGame, race } from "./testFixtures";
import { MONACO } from "./tracks/monaco";
import { achievements, DONINGTON_GRID_SLOT, LONG_BEACH_GRID_SLOT, RASCASSE_CORNER_ID } from "./achievements";

const byId = (id: string) => achievements.find(achievement => achievement.id === id)!;
const turnEndCheck = (id: string) =>
    (byId(id).criteria as Extract<MatchCriteria<IRaceCarsSpecificGameStateResponse>, { at: "turnEnd" }>).check;
const endCheck = (id: string) =>
    (byId(id).criteria as Extract<MatchCriteria<IRaceCarsSpecificGameStateResponse>, { at: "end" }>).check;
const progress = (id: string) => (byId(id).criteria as CareerCriteria<GameRecord>).progress;

const NAMES = { a: "Alice", b: "Bob", c: "Cara", d: "Dev" };

/** The table's view of this race. */
function viewOf(state: IRaceCarsSpecificGameState): IRaceCarsSpecificGameStateResponse {
    return getReplayAdapter("RaceCarsGameType")!.toResponseState(state, NAMES, null, []) as IRaceCarsSpecificGameStateResponse;
}

const finished = (userId: string, outcome: FinishedSeat["outcome"]): FinishedSeat => ({ userId, outcome, turns: 40 });

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
        const monaco = (seat: Partial<IRaceCarsPlayerState>) =>
            viewOf(race({ a: seat, b: {} }, { trackId: MONACO.id }));

        it("names La Rascasse, and the corner is on the board", () => {
            expect(MONACO.corners.find(corner => corner.id === RASCASSE_CORNER_ID)?.name).toBe("La Rascasse");
            expect(rascasse).toBeDefined();
        });

        it("is earned by a car spun into La Rascasse", () => {
            const spun = monaco({ row: rascasse.row, lane: rascasse.lane, gear: 0, skipNextTurn: true });

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
            const ashcombe = viewOf(race({ a: { row: rascasse.row, lane: rascasse.lane, gear: 0, skipNextTurn: true }, b: {} }));

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
});
