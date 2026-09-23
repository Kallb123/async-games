import { describe, expect, it } from "vitest";

import { unitCount } from "./armies";
import {
    KINGDOM_BUILDER_COMBAT_ROUNDS,
    KINGDOM_BUILDER_TOWN_DEFENCE,
    counterOf,
    defenceAgainst,
    resolveBattle,
    shareSurvivors,
} from "./combat";
import { KINGDOM_BUILDER_UNITS, KINGDOM_BUILDER_UNIT_TYPES, garrisonOf, type KingdomBuilderGarrison } from "./units";
import { KINGDOM_BUILDER_ECONOMY } from "./economy";

const open = { fortified: false };
const town = { fortified: true };

/** What a stack cost to raise, every resource counted alike — how "an even fight" is judged below. */
function priceOf(units: Partial<KingdomBuilderGarrison>): number {
    return KINGDOM_BUILDER_UNIT_TYPES.reduce((total, unitType) => {
        const cost = KINGDOM_BUILDER_ECONOMY.unitCosts[unitType];
        return total + (units[unitType] ?? 0) * Object.values(cost).reduce((sum, amount) => sum + (amount ?? 0), 0);
    }, 0);
}

describe("the matchup table (§7.3)", () => {
    // Each row is a fight a player should be able to call from the counters alone.
    it.each<[string, Partial<KingdomBuilderGarrison>, Partial<KingdomBuilderGarrison>, typeof open, boolean]>([
        ["militia's pikes stop cavalry worth as much", { militia: 3 }, { cavalry: 1 }, open, true],
        ["cavalry ride down infantry", { cavalry: 4 }, { infantry: 4 }, open, true],
        ["infantry break militia", { infantry: 4 }, { militia: 6 }, open, true],
        ["cavalry cut up a siege train with no escort", { cavalry: 2 }, { "siege-engine": 4 }, open, true],
        ["a siege train can't win a fight in the open", { "siege-engine": 4 }, { militia: 4 }, open, false],
        ["scouts are no fighting force", { scout: 6 }, { militia: 3 }, open, false],
        ["a lone unit can't take a town", { militia: 1 }, { militia: 20 }, town, false],
        ["an overwhelming stack takes one", { militia: 20 }, { militia: 1 }, town, true],
        ["behind its defences, an even garrison holds", { militia: 5 }, { militia: 5 }, town, false],
        ["one more unit is enough to break it", { militia: 6 }, { militia: 5 }, town, true],
        ["an even infantry push stalls on the town", { infantry: 10 }, { infantry: 10 }, town, false],
        ["siege engines breach the defences it stalls on", { infantry: 10, "siege-engine": 5 }, { infantry: 10 }, town, true],
    ])("%s", (_, attacker, defender, ground, attackerWins) => {
        expect(resolveBattle(attacker, defender, ground).attackerWon).toBe(attackerWins);
    });

    it("lets the counter, not the price, decide a fight between stacks costing the same", () => {
        expect(priceOf({ militia: 3 })).toBe(priceOf({ cavalry: 1 }));
        expect(resolveBattle({ militia: 3 }, { cavalry: 1 }, open).attackerWon).toBe(true);
        expect(resolveBattle({ cavalry: 1 }, { militia: 3 }, open).attackerWon).toBe(false);
    });

    it("gives every unit a counter above ×1 against something, and none below it", () => {
        for (const unitType of KINGDOM_BUILDER_UNIT_TYPES) {
            const counters = KINGDOM_BUILDER_UNIT_TYPES.map(target => counterOf(unitType, target));
            expect(Math.max(...counters), KINGDOM_BUILDER_UNITS[unitType].name).toBeGreaterThan(1);
            expect(Math.min(...counters)).toBe(1);
        }
    });
});

describe("resolveBattle", () => {
    it("is deterministic: the same stacks fight the same battle", () => {
        const fight = () => resolveBattle({ infantry: 7, cavalry: 2, scout: 1 }, { militia: 9, infantry: 3 }, town);
        expect(fight()).toEqual(fight());
    });

    it("logs every round it fights, and each side's losses add up to what it lost", () => {
        const attacker = garrisonOf({ infantry: 6, militia: 4 });
        const defender = garrisonOf({ militia: 8, cavalry: 1 });
        const battle = resolveBattle(attacker, defender, open);
        expect(battle.rounds.length).toBeGreaterThan(1);
        for (const unitType of KINGDOM_BUILDER_UNIT_TYPES) {
            const lost = (side: "attacker" | "defender") => battle.rounds.reduce((total, round) => total + round[side][unitType], 0);
            expect(battle.attacker[unitType] + lost("attacker")).toBe(attacker[unitType]);
            expect(battle.defender[unitType] + lost("defender")).toBe(defender[unitType]);
        }
    });

    it("strikes both ways at once: a round that ends both sides is lost by the attacker", () => {
        const battle = resolveBattle({ militia: 1 }, { militia: 1 }, open);
        expect(battle.attacker).toEqual(garrisonOf());
        expect(battle.defender).toEqual(garrisonOf());
        expect(battle.attackerWon).toBe(false);
    });

    it("carries damage too small to kill over to the next round", () => {
        // Three militia do 9 a round to a siege engine's 10: it falls in the second round, not never.
        const battle = resolveBattle({ militia: 3 }, { "siege-engine": 1 }, open);
        expect(battle.rounds.map(round => round.defender["siege-engine"])).toEqual([0, 1]);
        expect(battle.attackerWon).toBe(true);
    });

    it("stops after the last round, and a stand-off holds for the defender", () => {
        const battle = resolveBattle({ "siege-engine": 3 }, { "siege-engine": 3 }, open);
        expect(battle.rounds).toHaveLength(KINGDOM_BUILDER_COMBAT_ROUNDS);
        expect(unitCount(battle.attacker)).toBeGreaterThan(0);
        expect(unitCount(battle.defender)).toBeGreaterThan(0);
        expect(battle.attackerWon).toBe(false);
    });

    it("wins at once against nobody, without a round", () => {
        expect(resolveBattle({ militia: 1 }, {}, town)).toEqual({
            attackerWon: true, attacker: garrisonOf({ militia: 1 }), defender: garrisonOf(), rounds: [], defence: KINGDOM_BUILDER_TOWN_DEFENCE,
        });
    });
});

describe("defenceAgainst", () => {
    it("gives a garrison its town's defences, which each siege engine chips at, down to none", () => {
        expect(defenceAgainst({ infantry: 10 }, town)).toBe(KINGDOM_BUILDER_TOWN_DEFENCE);
        expect(defenceAgainst({ "siege-engine": 2 }, town)).toBeCloseTo(0.15);
        expect(defenceAgainst({ "siege-engine": 50 }, town)).toBe(0);
    });

    it("gives nothing in the open", () => {
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

    it("gives a remainder to the largest share, and to the earlier stack on a tie", () => {
        expect(shareSurvivors([{ militia: 1 }, { militia: 1 }, { militia: 2 }], { militia: 1 })).toEqual([
            garrisonOf(), garrisonOf(), garrisonOf({ militia: 1 }),
        ]);
        expect(shareSurvivors([{ militia: 1 }, { militia: 1 }], { militia: 1 })).toEqual([garrisonOf({ militia: 1 }), garrisonOf()]);
    });

    it("never hands back more than came in", () => {
        const shares = shareSurvivors([{ scout: 2 }, { scout: 3 }], { scout: 9 });
        expect(shares.reduce((total, share) => total + share.scout, 0)).toBe(5);
    });
});
