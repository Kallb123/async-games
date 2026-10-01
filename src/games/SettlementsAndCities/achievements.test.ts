// Each of Settlements & Cities' achievements, against the view a check is really
// handed: the game's own replay adapter, asked for no viewer (docs/achievements.md
// §9, §12 test 5). One state that passes and one that doesn't, each.
import { describe, expect, it } from "vitest";
import { criteriaOf, finishedSeat as seat, tableViewOf } from "@/utils/testing/gameAchievements";
import type { ISACSpecificGameState, ISACVertex } from "./board";
import type { ISACSpecificGameStateResponse } from "./apiModels";
import { makeState, player } from "./testFixtures";
import { achievements, CITIES_TO_PLAN } from "./achievements";

const { turnEndCheck, endCheck, progress } = criteriaOf(achievements);

/** The table's view of a two-player game in this state. */
function viewOf(overrides: Partial<ISACSpecificGameState>): ISACSpecificGameStateResponse {
    const state = makeState({ playerStates: new Map([["u1", player()], ["u2", player()]]), ...overrides });
    return tableViewOf("SettlementsAndCitiesGameType", state, { u1: "Alice", u2: "Bob" });
}

const buildings = (owner: string, building: ISACVertex["building"], count: number): ISACVertex[] =>
    Array.from({ length: count }, () => ({ building, owner }));

describe("Settlements & Cities' achievements", () => {
    it("Settler counts games played, won or not", () => {
        expect(progress("settlementsandcities.settler")({ played: 5, won: 0 })).toBe(5);
        expect(progress("settlementsandcities.settler")({ played: 4, won: 4 })).toBe(4);
    });

    it("City Planner counts the player's cities on the board, and not their settlements or anyone else's", () => {
        const check = turnEndCheck("settlementsandcities.city-planner");
        const four = viewOf({ vertices: [...buildings("u1", "city", CITIES_TO_PLAN), ...buildings("u1", "settlement", 1)] });
        const three = viewOf({ vertices: [...buildings("u1", "city", CITIES_TO_PLAN - 1), ...buildings("u1", "settlement", 2), ...buildings("u2", "city", 4)] });

        expect(check(four, { userId: "u1" })).toBe(true);
        expect(check(three, { userId: "u1" })).toBe(false);
        expect(check(four, { userId: "u2" })).toBe(false);
    });

    it("Double Honours wants the win and both bonuses", () => {
        const check = endCheck("settlementsandcities.double-honours");
        const both = viewOf({ longestRoadOwner: "u1", largestArmyOwner: "u1" });
        const one = viewOf({ longestRoadOwner: "u1", largestArmyOwner: "u2" });

        expect(check(both, seat("u1", "win"))).toBe(true);
        expect(check(both, seat("u1", "loss"))).toBe(false);
        expect(check(one, seat("u1", "win"))).toBe(false);
    });
});
