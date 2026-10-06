import { describe, expect, it } from "vitest";

import type { FinishedSeat, MatchCriteria } from "@/utils/games/achievements";
import type { IRealmArenaSpecificGameStateResponse } from "./apiModels";
import { achievements } from "./achievements";
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

function check(id: string, state: IRealmArenaSpecificGameStateResponse, outcome: FinishedSeat["outcome"]): boolean {
    const criterion = achievements.find(one => one.id === id)?.criteria as MatchCriteria<IRealmArenaSpecificGameStateResponse>;
    if (criterion.kind !== "match" || criterion.at !== "end") throw new Error(`${id} is not an end achievement`);
    return criterion.check(state, seat(outcome));
}

describe("Realm Arena achievements", () => {
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
        for (const map of ["sackedFortTwo", "sackedFortThree"] as const) {
            expect(check("realmarena.hold-the-keep", view({ mission: "holdOut", map }), "win")).toBe(true);
            expect(check("realmarena.hold-the-keep", view({ mission: "holdOut", map }), "loss")).toBe(false);
        }
        expect(check("realmarena.hold-the-keep", view({ mission: "holdOut" }), "win")).toBe(false);
    });

    it("awards Broken Tide only for a Hold Out won with the whole enemy down", () => {
        const wiped = [fighter("a"), fighter("b"), fighter("ai:0", 0), fighter("ai:1", 0)];
        expect(check("realmarena.broken-tide", view({ mission: "holdOut", fighters: wiped }), "win")).toBe(true);
        expect(check("realmarena.broken-tide", view({ mission: "holdOut", fighters: wiped }), "loss")).toBe(false);
        expect(check("realmarena.broken-tide", view({ mission: "holdOut" }), "win")).toBe(false);
        expect(check("realmarena.broken-tide", view({ mission: "holdOut", fighters: [fighter("a")] }), "win")).toBe(false);
        expect(check("realmarena.broken-tide", view({ fighters: wiped }), "win")).toBe(false);
    });

    it("awards Unbroken only for a Hold Out won with the whole team standing", () => {
        expect(check("realmarena.unbroken", view({ mission: "holdOut" }), "win")).toBe(true);
        expect(check("realmarena.unbroken", view({ mission: "holdOut" }), "loss")).toBe(false);
        expect(check("realmarena.unbroken", view({ mission: "holdOut", fighters: [fighter("a"), fighter("b", 0), fighter("ai:0")] }), "win")).toBe(false);
        expect(check("realmarena.unbroken", view(), "win")).toBe(false);
    });
});
