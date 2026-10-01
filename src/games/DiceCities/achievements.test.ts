// Each of Dice Cities' achievements, against the view a check is really handed:
// the game's own replay adapter, asked for no viewer (docs/achievements.md §9,
// §12 test 5). One state that passes and one that doesn't, each.
import { describe, expect, it } from "vitest";
import { criteriaOf, finishedSeat as seat, tableViewOf } from "@/utils/testing/gameAchievements";
import { buildInitialDiceCitiesState } from "./DiceCitiesModels";
import type { IDiceCitiesGameStateResponse } from "./apiModels";
import { DiceCitiesCardIds } from "./cards";
import { achievements, MINES_IN_THE_GAME, TREASURY_COINS } from "./achievements";

const { CAFE, FAMILY_RESTAURANT, FOREST, MINE, WHEAT_FIELD, FURNITURE_FACTORY, APPLE_ORCHARD, STADIUM } = DiceCitiesCardIds;

const { turnEndCheck, endCheck, progress } = criteriaOf(achievements);

/** The table's view of a two-player game, after `arrange` has had its way with the state. */
function viewOf(arrange: (state: ReturnType<typeof buildInitialDiceCitiesState>) => void): IDiceCitiesGameStateResponse {
    const state = buildInitialDiceCitiesState(["u1", "u2"]);
    arrange(state);
    return tableViewOf("DiceCitiesGameType", state, { u1: "Alice", u2: "Bob" });
}

describe("Dice Cities' achievements", () => {
    it("Mayor counts wins at Dice Cities", () => {
        expect(progress("dicecities.mayor")({ played: 9, won: 4 })).toBe(4);
        expect(progress("dicecities.mayor")({ played: 9, won: 5 })).toBe(5);
    });

    it("Mine Baron wants every Mine in the game, not merely more than anyone else", () => {
        const check = turnEndCheck("dicecities.mine-baron");
        const all = viewOf(state => state.playerStates.get("u1")!.cards.push({ card: DiceCitiesCardIds.MINE, amount: MINES_IN_THE_GAME }));
        // Three, with nobody else holding any: what a dropped player's cards
        // leaving the game can look like.
        const three = viewOf(state => state.playerStates.get("u1")!.cards.push({ card: DiceCitiesCardIds.MINE, amount: 3 }));

        expect(check(all, { userId: "u1" })).toBe(true);
        expect(check(all, { userId: "u2" })).toBe(false);
        expect(check(three, { userId: "u1" })).toBe(false);
    });

    it("Treasury wants the coins in hand", () => {
        const check = turnEndCheck("dicecities.treasury");
        const rich = viewOf(state => { state.playerStates.get("u1")!.money = TREASURY_COINS; });
        const nearly = viewOf(state => { state.playerStates.get("u1")!.money = TREASURY_COINS - 1; });

        expect(check(rich, { userId: "u1" })).toBe(true);
        expect(check(nearly, { userId: "u1" })).toBe(false);
    });

    it("answers no, rather than throwing, for a seat the view doesn't hold", () => {
        const view = viewOf(() => { });
        expect(turnEndCheck("dicecities.mine-baron")(view, { userId: "u9" })).toBe(false);
        expect(turnEndCheck("dicecities.treasury")(view, { userId: "u9" })).toBe(false);
    });

    it("What Dock? wants the win with every rival holding a Harbour and you without", () => {
        const check = endCheck("dicecities.what-dock");
        const docks = (mine: boolean, theirs: boolean, enabled = true) => viewOf(state => {
            state.enabledDocks = enabled;
            state.playerStates.get("u1")!.harbourUnlocked = mine;
            state.playerStates.get("u2")!.harbourUnlocked = theirs;
        });

        expect(check(docks(false, true), seat("u1", "win"))).toBe(true);
        expect(check(docks(false, true), seat("u1", "loss"))).toBe(false);
        expect(check(docks(true, true), seat("u1", "win"))).toBe(false);
        expect(check(docks(false, false), seat("u1", "win"))).toBe(false);
        expect(check(docks(false, true, false), seat("u1", "win"))).toBe(false);
    });

    // What Alice has acquired since the deal; undefined for a game that predates the tally.
    const acquiring = (acquiredCards: string[] | undefined) =>
        viewOf(state => { state.playerStates.get("u1")!.acquiredCards = acquiredCards; });

    it("Down to the Last Coin wants the win with an empty purse", () => {
        const check = endCheck("dicecities.last-coin");
        const broke = viewOf(state => { state.playerStates.get("u1")!.money = 0; });
        const one = viewOf(state => { state.playerStates.get("u1")!.money = 1; });

        expect(check(broke, seat("u1", "win"))).toBe(true);
        expect(check(broke, seat("u1", "loss"))).toBe(false);
        expect(check(one, seat("u1", "win"))).toBe(false);
    });

    it("Small Business wants the win with nothing pricier than 3 ever owned", () => {
        const check = endCheck("dicecities.small-business");

        expect(check(acquiring([CAFE, FOREST]), seat("u1", "win"))).toBe(true);
        expect(check(acquiring([CAFE, FOREST]), seat("u1", "loss"))).toBe(false);
        // Owned once, even if a Business Center has since taken it away.
        expect(check(acquiring([CAFE, MINE]), seat("u1", "win"))).toBe(false);
        expect(check(acquiring([STADIUM]), seat("u1", "win"))).toBe(false);
        expect(check(acquiring(undefined), seat("u1", "win"))).toBe(false);
    });

    it("Big Dice Energy wants the win with nothing gained that pays on a 6 or lower", () => {
        const check = endCheck("dicecities.big-dice-energy");

        // The starting Wheat Field doesn't count: it's in every city's cards, not its acquisitions.
        expect(check(acquiring([FURNITURE_FACTORY, APPLE_ORCHARD]), seat("u1", "win"))).toBe(true);
        expect(check(acquiring([FURNITURE_FACTORY, APPLE_ORCHARD]), seat("u1", "loss"))).toBe(false);
        // A second Wheat Field does, and so does a Stadium.
        expect(check(acquiring([FURNITURE_FACTORY, WHEAT_FIELD]), seat("u1", "win"))).toBe(false);
        expect(check(acquiring([STADIUM]), seat("u1", "win"))).toBe(false);
        expect(check(acquiring(undefined), seat("u1", "win"))).toBe(false);
    });

    it("Dine & Dash wants the win with restaurants and nothing else gained", () => {
        const check = endCheck("dicecities.dine-and-dash");

        expect(check(acquiring([CAFE, FAMILY_RESTAURANT]), seat("u1", "win"))).toBe(true);
        expect(check(acquiring([CAFE, FAMILY_RESTAURANT]), seat("u1", "loss"))).toBe(false);
        expect(check(acquiring([CAFE, FOREST]), seat("u1", "win"))).toBe(false);
        // Winning on the starting cards alone is no diet of restaurants.
        expect(check(acquiring([]), seat("u1", "win"))).toBe(false);
        expect(check(acquiring(undefined), seat("u1", "win"))).toBe(false);
    });

    it("Collector wants one of every pile in this game's market, sold out or not", () => {
        const check = turnEndCheck("dicecities.collector");
        const every = viewOf(state => {
            state.playerStates.get("u1")!.cards = state.bankCards.map(pile => ({ card: pile.card, amount: 1 }));
            state.bankCards[0].amount = 0;
        });
        const allButOne = viewOf(state => {
            state.playerStates.get("u1")!.cards = state.bankCards.slice(1).map(pile => ({ card: pile.card, amount: 1 }));
        });

        expect(check(every, { userId: "u1" })).toBe(true);
        expect(check(every, { userId: "u2" })).toBe(false);
        expect(check(allButOne, { userId: "u1" })).toBe(false);
        expect(check(every, { userId: "u9" })).toBe(false);
    });
});
