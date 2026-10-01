// Each of Settlements & Cities' achievements, against the view a check is really
// handed: the game's own replay adapter, asked for no viewer (docs/achievements.md
// §9, §12 test 5). One state that passes and one that doesn't, each.
import { describe, expect, it } from "vitest";
import { criteriaOf, finishedSeat as seat, tableViewOf } from "@/utils/testing/gameAchievements";
import { BOARD_TOPOLOGY, createInitialPlayerState } from "./board";
import type { ISACHex, ISACSpecificGameState, ISACVertex } from "./board";
import type { ISACSpecificGameStateResponse } from "./apiModels";
import { makeState, player } from "./testFixtures";
import { achievements, CITIES_TO_PLAN, DANGEROUS_HAND, SETUP_ROADS, SLEEVE_VP_CARDS } from "./achievements";

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

    it("Roads? Where we're going wants the win and no roads past the two from setup", () => {
        const check = endCheck("settlementsandcities.no-roads");
        const road = (owner: string, count: number) => Array.from({ length: count }, () => ({ hasRoad: true, owner }));
        const none = viewOf({ edges: [...road("u1", SETUP_ROADS), ...road("u2", 6)] });
        const built = viewOf({ edges: road("u1", SETUP_ROADS + 1) });

        expect(check(none, seat("u1", "win"))).toBe(true);
        expect(check(none, seat("u1", "loss"))).toBe(false);
        expect(check(built, seat("u1", "win"))).toBe(false);
    });

    it("No Animals Were Harmed wants the win and a player who never held wool, however it came", () => {
        const check = endCheck("settlementsandcities.no-animals-harmed");
        const viewWith = (overrides: Parameters<typeof player>[0]): ISACSpecificGameStateResponse => {
            const state = makeState({ playerStates: new Map([["u1", player(overrides)], ["u2", player()]]) });
            return tableViewOf("SettlementsAndCitiesGameType", state, { u1: "Alice", u2: "Bob" }, true);
        };
        const clean = viewWith({});
        const gathered = viewWith({ resourcesGatheredByType: { lumber: 0, wool: 2, grain: 0, brick: 0, ore: 0 } });
        const traded = viewWith({ woolTraded: 1 });

        expect(check(clean, seat("u1", "win"))).toBe(true);
        expect(check(clean, seat("u1", "loss"))).toBe(false);
        // A view from a game still in play never passes: the flag isn't sent.
        expect(check(viewOf({}), seat("u1", "win"))).toBe(false);
        expect(check(gathered, seat("u1", "win"))).toBe(false);
        expect(check(traded, seat("u1", "win"))).toBe(false);
    });

    /** A finished game's view, with Alice's seat as `overrides` makes it. */
    const finishedWith = (overrides: Parameters<typeof player>[0], board: Partial<ISACSpecificGameState> = {}): ISACSpecificGameStateResponse => {
        const state = makeState({ playerStates: new Map([["u1", player(overrides)], ["u2", player()]]), ...board });
        return tableViewOf("SettlementsAndCitiesGameType", state, { u1: "Alice", u2: "Bob" }, true);
    };

    it("Against the Odds wants the win with no building touching a 6 or an 8", () => {
        const check = endCheck("settlementsandcities.against-the-odds");
        // Every hex a 5 except the first, and one of Alice's settlements on a
        // corner of it or well away from it.
        const boardWith = (firstToken: number, onFirstHex: boolean): Partial<ISACSpecificGameState> => {
            const hexes: ISACHex[] = BOARD_TOPOLOGY.hexVertices.map((_, h) => ({ terrain: "forest", numberToken: h === 0 ? firstToken : 5 }));
            const vertices: ISACVertex[] = Array.from({ length: BOARD_TOPOLOGY.numVertices }, () => ({ building: null, owner: null }));
            const corner = onFirstHex
                ? BOARD_TOPOLOGY.hexVertices[0][0]
                : BOARD_TOPOLOGY.vertexHexes.findIndex(touching => !touching.includes(0));
            vertices[corner] = { building: "city", owner: "u1" };
            // Bob's building on the 8 is his problem.
            vertices[BOARD_TOPOLOGY.hexVertices[0][3]] = { building: "settlement", owner: "u2" };
            return { hexes, vertices };
        };
        const clear = viewOf(boardWith(8, false));

        expect(check(clear, seat("u1", "win"))).toBe(true);
        expect(check(clear, seat("u1", "loss"))).toBe(false);
        expect(check(viewOf(boardWith(8, true)), seat("u1", "win"))).toBe(false);
        expect(check(viewOf(boardWith(6, true)), seat("u1", "win"))).toBe(false);
        expect(check(viewOf(boardWith(9, true)), seat("u1", "win"))).toBe(true);
    });

    it("Gluten Free wants the win and a player who never held grain, however it came", () => {
        const check = endCheck("settlementsandcities.gluten-free");
        const clean = finishedWith({ woolTraded: 3 });

        expect(check(clean, seat("u1", "win"))).toBe(true);
        expect(check(clean, seat("u1", "loss"))).toBe(false);
        // A view from a game still in play never passes: the flag isn't sent.
        expect(check(viewOf({}), seat("u1", "win"))).toBe(false);
        expect(check(finishedWith({ resourcesGatheredByType: { ...createInitialPlayerState().resourcesGatheredByType!, grain: 1 } }), seat("u1", "win"))).toBe(false);
        expect(check(finishedWith({ grainTraded: 1 }), seat("u1", "win"))).toBe(false);
    });

    it("Suburbia wants the win without a single city of the player's own", () => {
        const check = endCheck("settlementsandcities.suburbia");
        const sprawl = viewOf({ vertices: [...buildings("u1", "settlement", 5), ...buildings("u2", "city", 4)] });
        const upgraded = viewOf({ vertices: [...buildings("u1", "settlement", 4), ...buildings("u1", "city", 1)] });

        expect(check(sprawl, seat("u1", "win"))).toBe(true);
        expect(check(sprawl, seat("u1", "loss"))).toBe(false);
        expect(check(upgraded, seat("u1", "win"))).toBe(false);
    });

    it("Ace Up the Sleeve counts victory point cards, bought this turn or before, once the game is over", () => {
        const check = endCheck("settlementsandcities.ace-up-the-sleeve");
        const two = finishedWith({ devCards: { victoryPoint: 1 }, newDevCards: { victoryPoint: SLEEVE_VP_CARDS - 1 } });
        const one = finishedWith({ devCards: { victoryPoint: SLEEVE_VP_CARDS - 1 } });

        expect(check(two, seat("u1", "win"))).toBe(true);
        expect(check(two, seat("u1", "loss"))).toBe(false);
        expect(check(one, seat("u1", "win"))).toBe(false);
    });

    it("Living Dangerously reads the size of a hand, which the whole table sees", () => {
        const check = turnEndCheck("settlementsandcities.living-dangerously");
        const handOf = (lumber: number) => viewOf({ playerStates: new Map([["u1", player({ resources: { lumber } })], ["u2", player()]]) });

        expect(check(handOf(DANGEROUS_HAND), { userId: "u1" })).toBe(true);
        expect(check(handOf(DANGEROUS_HAND - 1), { userId: "u1" })).toBe(false);
        expect(check(handOf(DANGEROUS_HAND), { userId: "u2" })).toBe(false);
    });

    it("Road Warrior wants the win, Longest Road and an empty road supply", () => {
        const check = endCheck("settlementsandcities.road-warrior");
        const allOut = finishedWith({ remainingRoads: 0 }, { longestRoadOwner: "u1" });

        expect(check(allOut, seat("u1", "win"))).toBe(true);
        expect(check(allOut, seat("u1", "loss"))).toBe(false);
        expect(check(finishedWith({ remainingRoads: 1 }, { longestRoadOwner: "u1" }), seat("u1", "win"))).toBe(false);
        expect(check(finishedWith({ remainingRoads: 0 }, { longestRoadOwner: "u2" }), seat("u1", "win"))).toBe(false);
    });
});
