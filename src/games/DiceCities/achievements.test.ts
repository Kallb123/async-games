// Each of Dice Cities' achievements, against the view a check is really handed:
// the game's own replay adapter, asked for no viewer (docs/achievements.md §9,
// §12 test 5). One state that passes and one that doesn't, each.
import { describe, expect, it } from "vitest";
import { criteriaOf, finishedSeat as seat, tableViewOf } from "@/utils/testing/gameAchievements";
import { buildInitialDiceCitiesState } from "./DiceCitiesModels";
import type { IDiceCitiesGameStateResponse } from "./apiModels";
import { DiceCitiesCardIds } from "./cards";
import { achievements, MINES_IN_THE_GAME, TREASURY_COINS } from "./achievements";

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
});
