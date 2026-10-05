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
});
