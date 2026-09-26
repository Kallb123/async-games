import { describe, expect, it } from "vitest";

import {
    KINGDOM_BUILDER_COMBAT_STATS,
    KINGDOM_BUILDER_TOWN_DEFENCE,
    defenceAgainst,
    resolveBattle,
    shareSurvivors,
} from "./combat";
import { garrisonOf } from "./units";

const open = { fortified: false };
const town = { fortified: true };

describe("Kingdom Builder combat stats", () => {
    it("uses the five army stat lines", () => {
        expect(KINGDOM_BUILDER_COMBAT_STATS.cavalry).toEqual({ health: 20, attack: 10, defence: 8 });
        expect(KINGDOM_BUILDER_COMBAT_STATS.archer).toEqual({ health: 3, attack: 4, defence: 1 });
        expect(KINGDOM_BUILDER_COMBAT_STATS.spearman).toEqual({ health: 5, attack: 3, defence: 3 });
        expect(KINGDOM_BUILDER_COMBAT_STATS.infantry).toEqual({ health: 10, attack: 5, defence: 5 });
        expect(KINGDOM_BUILDER_COMBAT_STATS.militia).toEqual({ health: 5, attack: 2, defence: 2 });
    });
});

describe("resolveBattle", () => {
    it("lets defending archers fire first, so casualties cannot return fire", () => {
        const battle = resolveBattle({ archer: 1 }, { archer: 1 }, open);
        expect(battle.attacker.archer).toBe(0);
        expect(battle.defender.archer).toBe(1);
        expect(battle.rounds).toEqual([{ attacker: garrisonOf({ archer: 1 }), defender: garrisonOf() }]);
    });

    it("has archers target spearmen before their damage overflows", () => {
        const battle = resolveBattle({ spearman: 1, militia: 1 }, { archer: 4 }, open);
        expect(battle.attacker.spearman).toBe(0);
        expect(battle.attacker.militia).toBe(0);
    });

    it("lets opposing spearmen intercept horsemen before their charge", () => {
        const battle = resolveBattle({ spearman: 11 }, { cavalry: 1, archer: 2 }, open);
        expect(battle.defender.cavalry).toBe(0);
        expect(battle.defender.archer).toBe(2);
        expect(battle.rounds.slice(0, 2)).toEqual([
            { attacker: garrisonOf({ spearman: 1 }), defender: garrisonOf() },
            { attacker: garrisonOf(), defender: garrisonOf({ cavalry: 1 }) },
        ]);
    });

    it("does not overflow a spear interception beyond horsemen", () => {
        const battle = resolveBattle({ spearman: 20 }, { cavalry: 2, archer: 1 }, open);
        expect(battle.defender.cavalry).toBe(0);
        expect(battle.defender.archer).toBe(1);
    });

    it("has horsemen target archers and then overflow", () => {
        const battle = resolveBattle({ cavalry: 1 }, { archer: 2, militia: 1 }, open);
        expect(battle.defender.archer).toBe(0);
        expect(battle.defender.militia).toBe(0);
    });

    it("lets attacking horsemen charge before defending horsemen", () => {
        const battle = resolveBattle({ cavalry: 3 }, { cavalry: 1 }, open);
        expect(battle.attacker.cavalry).toBe(3);
        expect(battle.defender.cavalry).toBe(0);
    });

    it("resolves remaining spearmen defender first", () => {
        const battle = resolveBattle({ spearman: 3 }, { spearman: 3 }, open);
        expect(battle.rounds[0]).toEqual({ attacker: garrisonOf({ spearman: 1 }), defender: garrisonOf() });
    });

    it("then resolves militia and infantry defender first", () => {
        const militia = resolveBattle({ militia: 4 }, { militia: 4 }, open);
        expect(militia.rounds[0]).toEqual({ attacker: garrisonOf({ militia: 1 }), defender: garrisonOf() });
        const infantry = resolveBattle({ infantry: 3 }, { infantry: 3 }, open);
        expect(infantry.rounds[0]).toEqual({ attacker: garrisonOf({ infantry: 1 }), defender: garrisonOf() });
    });

    it("is deterministic and accounts for every logged casualty", () => {
        const attacker = garrisonOf({ archer: 7, spearman: 5, cavalry: 2, infantry: 4, militia: 3 });
        const defender = garrisonOf({ archer: 5, spearman: 6, cavalry: 1, infantry: 3, militia: 5 });
        const battle = resolveBattle(attacker, defender, town);
        expect(resolveBattle(attacker, defender, town)).toEqual(battle);
        for (const unitType of Object.keys(attacker) as (keyof typeof attacker)[]) {
            const lost = (side: "attacker" | "defender") => battle.rounds.reduce((total, round) => total + round[side][unitType], 0);
            expect(battle.attacker[unitType] + lost("attacker")).toBe(attacker[unitType]);
            expect(battle.defender[unitType] + lost("defender")).toBe(defender[unitType]);
        }
    });

    it("wins at once against nobody, without a strike", () => {
        expect(resolveBattle({ militia: 1 }, {}, town)).toEqual({
            attackerWon: true, attacker: garrisonOf({ militia: 1 }), defender: garrisonOf(), rounds: [], defence: KINGDOM_BUILDER_TOWN_DEFENCE,
        });
    });
});

describe("defenceAgainst", () => {
    it("gives a town its bonus and lets siege engines remove it", () => {
        expect(defenceAgainst({ infantry: 10 }, town)).toBe(KINGDOM_BUILDER_TOWN_DEFENCE);
        expect(defenceAgainst({ "siege-engine": 2 }, town)).toBeCloseTo(0.15);
        expect(defenceAgainst({ "siege-engine": 50 }, town)).toBe(0);
        expect(defenceAgainst({ infantry: 10 }, open)).toBe(0);
    });
});

describe("shareSurvivors", () => {
    it("hands survivors back in proportion to what each stack brought", () => {
        expect(shareSurvivors([{ militia: 6, cavalry: 1 }, { militia: 2, infantry: 3 }], { militia: 4, cavalry: 1, infantry: 1 })).toEqual([
            garrisonOf({ militia: 3, cavalry: 1 }),
            garrisonOf({ militia: 1, infantry: 1 }),
        ]);
    });

    it("assigns remainders largest-first, with stable ties, and never invents units", () => {
        expect(shareSurvivors([{ militia: 1 }, { militia: 1 }, { militia: 2 }], { militia: 1 })).toEqual([
            garrisonOf(), garrisonOf(), garrisonOf({ militia: 1 }),
        ]);
        expect(shareSurvivors([{ scout: 2 }, { scout: 3 }], { scout: 9 }).reduce((total, share) => total + share.scout, 0)).toBe(5);
    });
});
