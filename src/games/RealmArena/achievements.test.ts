import { describe, expect, it } from "vitest";

import type { FinishedSeat, MatchCriteria } from "@/utils/games/achievements";
import type { IRealmArenaSpecificGameStateResponse } from "./apiModels";
import { achievements, achievementsFor } from "./achievements";
import type { Fighter } from "./rules";

const seat = (outcome: FinishedSeat["outcome"]): FinishedSeat => ({ userId: "a", outcome, turns: 12 });

function fighter(owner: string, hp = 5): Fighter {
    return { id: 1, owner, character: "knight", square: 0, hp, ap: 0, banked: 0, effects: {}, cooldowns: {}, spent: [], item: null };
}

function view(overrides: Partial<IRealmArenaSpecificGameStateResponse> = {}): IRealmArenaSpecificGameStateResponse {
    return {
        map: "twinGateFort",
        phase: "battle",
        round: 15,
        battleRounds: 15,
        budget: 80,
        fog: true,
        coop: true,
        fighters: [fighter("a"), fighter("b"), fighter("ai:0")],
        ghosts: [],
        clouds: [],
        blasted: [],
        mustered: ["a", "b"],
        myMuster: null,
        mastery: {},
        scores: { a: 10, b: 10 },
        canUndo: false,
        ...overrides,
    };
}

// The catalogue under each ruleset: Hold Out's achievements are judged differently where the nests produce the enemy (version 13).
const V12 = achievementsFor({ rulesVersion: 12 });
const V13 = achievementsFor({ rulesVersion: 13 });

function check(id: string, state: IRealmArenaSpecificGameStateResponse, outcome: FinishedSeat["outcome"], catalogue = V12): boolean {
    const criterion = catalogue.find(one => one.id === id)?.criteria as MatchCriteria<IRealmArenaSpecificGameStateResponse>;
    if (criterion.kind !== "match" || criterion.at !== "end") throw new Error(`${id} is not an end achievement`);
    return criterion.check(state, seat(outcome));
}

describe("Realm Arena achievements", () => {
    it("lists the current ruleset's catalogue, and Three Stars only where the nests produce the enemy", () => {
        expect(achievements.map(one => one.id)).toEqual(achievementsFor().map(one => one.id));
        expect(V12.map(one => one.id)).not.toContain("realmarena.three-stars");
        expect(V12.map(one => one.id)).not.toContain("realmarena.three-stars-hard");
        expect(V13.map(one => one.id)).toEqual([...V12.map(one => one.id), "realmarena.three-stars", "realmarena.three-stars-hard"]);
        for (const one of [...V12, ...V13]) expect(one.description, one.id).not.toMatch(/undefined|NaN|threat/i);
        expect(V13.find(one => one.id === "realmarena.three-stars")!.description).toBe("Earn all three stars in a battle of Hold Out: Held, Broke the Brood and Unscathed.");
    });

    it("awards the co-op win only for a win against the computer", () => {
        expect(check("realmarena.shoulder-to-shoulder", view(), "win")).toBe(true);
        expect(check("realmarena.shoulder-to-shoulder", view(), "loss")).toBe(false);
        expect(check("realmarena.shoulder-to-shoulder", view({ coop: false }), "win")).toBe(false);
    });

    it("requires every player character to be standing for None Left Behind", () => {
        expect(check("realmarena.none-left-behind", view(), "win")).toBe(true);
        expect(check("realmarena.none-left-behind", view({
            fighters: [fighter("a"), fighter("b", 0), fighter("ai:0", 0)],
        }), "win")).toBe(false);
        expect(check("realmarena.none-left-behind", view({
            fighters: [fighter("a"), fighter("b"), fighter("ai:0", 0)],
        }), "win")).toBe(true);
        expect(check("realmarena.none-left-behind", view({ fighters: [fighter("ai:0", 0)] }), "win")).toBe(false);
    });

    it("awards Last Stand only for winning Hold Out", () => {
        expect(check("realmarena.last-stand", view({ mission: "holdOut" }), "win")).toBe(true);
        expect(check("realmarena.last-stand", view({ mission: "holdOut" }), "loss")).toBe(false);
        expect(check("realmarena.last-stand", view(), "win")).toBe(false);
        expect(check("realmarena.last-stand", view({ coop: false, mission: "holdOut" }), "win")).toBe(false);
    });

    it("awards Against the Odds only for winning against the computer on Hard", () => {
        expect(check("realmarena.against-the-odds", view({ difficulty: "hard" }), "win")).toBe(true);
        expect(check("realmarena.against-the-odds", view({ difficulty: "hard" }), "loss")).toBe(false);
        expect(check("realmarena.against-the-odds", view(), "win")).toBe(false);
        expect(check("realmarena.against-the-odds", view({ difficulty: "easy" }), "win")).toBe(false);
        expect(check("realmarena.against-the-odds", view({ coop: false, difficulty: "hard" }), "win")).toBe(false);
    });

    it("awards Lone Wolf only for winning Hold Out on your own", () => {
        const solo = [fighter("a"), fighter("a", 0), fighter("ai:0")];
        expect(check("realmarena.lone-wolf", view({ mission: "holdOut", fighters: solo }), "win")).toBe(true);
        expect(check("realmarena.lone-wolf", view({ mission: "holdOut", fighters: solo }), "loss")).toBe(false);
        expect(check("realmarena.lone-wolf", view({ mission: "holdOut" }), "win")).toBe(false);
        expect(check("realmarena.lone-wolf", view({ fighters: solo }), "win")).toBe(false);
    });

    it("awards Hold the Keep only for winning Hold Out on the Sacked Fort", () => {
        for (const map of ["sackedFortTwo", "sackedFortThree", "sackedFortFour"] as const) {
            expect(check("realmarena.hold-the-keep", view({ mission: "holdOut", map }), "win")).toBe(true);
            expect(check("realmarena.hold-the-keep", view({ mission: "holdOut", map }), "loss")).toBe(false);
        }
        expect(check("realmarena.hold-the-keep", view({ mission: "holdOut" }), "win")).toBe(false);
        // Not on the Sunken Village, for three or four.
        for (const map of ["sunkenVillageThree", "sunkenVillageFour"] as const) expect(check("realmarena.hold-the-keep", view({ mission: "holdOut", map }), "win")).toBe(false);
    });

    it("awards Broken Tide at version 12 only for a Hold Out won with the whole enemy down", () => {
        const wiped = [fighter("a"), fighter("b"), fighter("ai:0", 0), fighter("ai:1", 0)];
        expect(check("realmarena.broken-tide", view({ mission: "holdOut", fighters: wiped }), "win")).toBe(true);
        expect(check("realmarena.broken-tide", view({ mission: "holdOut", fighters: wiped }), "loss")).toBe(false);
        expect(check("realmarena.broken-tide", view({ mission: "holdOut" }), "win")).toBe(false);
        expect(check("realmarena.broken-tide", view({ mission: "holdOut", fighters: [fighter("a")] }), "win")).toBe(false);
        expect(check("realmarena.broken-tide", view({ fighters: wiped }), "win")).toBe(false);
    });

    it("awards Broken Tide at version 13 only for a Hold Out won by breaking the Brood by round 10", () => {
        const broke: Partial<IRealmArenaSpecificGameStateResponse> = { mission: "holdOut", stars: ["held", "broke"] };
        expect(check("realmarena.broken-tide", view({ ...broke, round: 10 }), "win", V13)).toBe(true);
        expect(check("realmarena.broken-tide", view({ ...broke, round: 4 }), "win", V13)).toBe(true);
        expect(check("realmarena.broken-tide", view({ ...broke, round: 10 }), "loss", V13)).toBe(false);
        // Too late, or won at the cap without breaking it, or no stars at all.
        expect(check("realmarena.broken-tide", view({ ...broke, round: 11 }), "win", V13)).toBe(false);
        expect(check("realmarena.broken-tide", view({ mission: "holdOut", round: 15, stars: ["held", "unscathed"] }), "win", V13)).toBe(false);
        expect(check("realmarena.broken-tide", view({ mission: "holdOut", round: 5 }), "win", V13)).toBe(false);
        expect(check("realmarena.broken-tide", view({ ...broke, round: 5, mission: undefined }), "win", V13)).toBe(false);
    });

    it("awards Unbroken only for a Hold Out won with the whole team standing", () => {
        expect(check("realmarena.unbroken", view({ mission: "holdOut" }), "win")).toBe(true);
        expect(check("realmarena.unbroken", view({ mission: "holdOut" }), "loss")).toBe(false);
        expect(check("realmarena.unbroken", view({ mission: "holdOut", fighters: [fighter("a"), fighter("b", 0), fighter("ai:0")] }), "win")).toBe(false);
        expect(check("realmarena.unbroken", view(), "win")).toBe(false);
    });

    it("awards Regicide only for a Hold Out won with a Brood Queen down", () => {
        const queen = (hp: number): Fighter => ({ ...fighter("ai:0", hp), character: "broodQueen" });
        const downed = [fighter("a"), fighter("b"), queen(0), fighter("ai:1")];
        expect(check("realmarena.regicide", view({ mission: "holdOut", fighters: downed }), "win")).toBe(true);
        expect(check("realmarena.regicide", view({ mission: "holdOut", fighters: downed }), "loss")).toBe(false);
        // A Queen still standing, no Queen at all, or not Hold Out.
        expect(check("realmarena.regicide", view({ mission: "holdOut", fighters: [fighter("a"), queen(20)] }), "win")).toBe(false);
        expect(check("realmarena.regicide", view({ mission: "holdOut" }), "win")).toBe(false);
        expect(check("realmarena.regicide", view({ fighters: downed }), "win")).toBe(false);
        // A fallen Queen on the team's side of the board is no one's regicide.
        expect(check("realmarena.regicide", view({ mission: "holdOut", fighters: [{ ...fighter("a", 0), character: "broodQueen" }] }), "win")).toBe(false);
    });

    it("awards Scorched Earth at version 12 only for a Hold Out won after every nest was down at once", () => {
        const cleared = view({ mission: "holdOut", nestsCleared: true });
        expect(check("realmarena.scorched-earth", cleared, "win")).toBe(true);
        expect(check("realmarena.scorched-earth", cleared, "loss")).toBe(false);
        expect(check("realmarena.scorched-earth", view({ mission: "holdOut" }), "win")).toBe(false);
        expect(check("realmarena.scorched-earth", view({ nestsCleared: true }), "win")).toBe(false);
    });

    it("awards Scorched Earth at version 13 only for a Hold Out won by breaking the Brood with the whole team standing", () => {
        const shrine: Fighter = { ...fighter("shrine"), character: "shrine" };
        const broke: Partial<IRealmArenaSpecificGameStateResponse> = { mission: "holdOut", stars: ["held", "broke"] };
        expect(check("realmarena.scorched-earth", view({ ...broke }), "win", V13)).toBe(true);
        // The Shrine is the team's, and stands in any win.
        expect(check("realmarena.scorched-earth", view({ ...broke, fighters: [fighter("a"), fighter("b"), shrine, fighter("ai:0", 0)] }), "win", V13)).toBe(true);
        expect(check("realmarena.scorched-earth", view({ ...broke }), "loss", V13)).toBe(false);
        expect(check("realmarena.scorched-earth", view({ ...broke, fighters: [fighter("a"), fighter("b", 0), fighter("ai:0")] }), "win", V13)).toBe(false);
        // Won at the cap, or with no stars.
        expect(check("realmarena.scorched-earth", view({ mission: "holdOut", stars: ["held"] }), "win", V13)).toBe(false);
        expect(check("realmarena.scorched-earth", view({ mission: "holdOut" }), "win", V13)).toBe(false);
        expect(check("realmarena.scorched-earth", view({ ...broke, mission: undefined }), "win", V13)).toBe(false);
    });

    it("awards Three Stars only for a Hold Out won with every star, and the Hard one only on Hard", () => {
        const all: Partial<IRealmArenaSpecificGameStateResponse> = { mission: "holdOut", stars: ["held", "broke", "unscathed"] };
        expect(check("realmarena.three-stars", view({ ...all }), "win", V13)).toBe(true);
        expect(check("realmarena.three-stars", view({ ...all, difficulty: "hard" }), "win", V13)).toBe(true);
        expect(check("realmarena.three-stars", view({ ...all }), "loss", V13)).toBe(false);
        expect(check("realmarena.three-stars", view({ mission: "holdOut", stars: ["held", "broke"] }), "win", V13)).toBe(false);
        expect(check("realmarena.three-stars", view({ mission: "holdOut" }), "win", V13)).toBe(false);
        expect(check("realmarena.three-stars", view({ ...all, mission: undefined }), "win", V13)).toBe(false);

        expect(check("realmarena.three-stars-hard", view({ ...all, difficulty: "hard" }), "win", V13)).toBe(true);
        expect(check("realmarena.three-stars-hard", view({ ...all, difficulty: "hard" }), "loss", V13)).toBe(false);
        expect(check("realmarena.three-stars-hard", view({ ...all }), "win", V13)).toBe(false);
        expect(check("realmarena.three-stars-hard", view({ ...all, difficulty: "easy" }), "win", V13)).toBe(false);
        expect(check("realmarena.three-stars-hard", view({ mission: "holdOut", stars: ["held", "broke"], difficulty: "hard" }), "win", V13)).toBe(false);
    });
});
