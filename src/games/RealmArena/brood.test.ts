import { describe, expect, it, vi } from "vitest";
import { at, fieldOf } from "@/utils/games/battlefield/testFixtures";
import { FACTION_IDS, factionById, factionOf, isFactionId, type CharacterId } from "./characters";
import { warbandBudgetOf, waveOf } from "./RealmArenaLogic";
import { overrideRulesetForExperiment, rulesetFor, ruleValuesOf } from "./rulesets";
import { act, armourOf, check, damageTo, fixedRolls, hordeSpawn, isCombatant, spawnThemeOf, isMinion, newFighter, nextFighterId, startTurn, type BattleState, type Fighter } from "./rules";
import { battleOf, makeGame, musterAll, warbandsOf } from "./testFixtures";

vi.mock("./masteryRecord", () => ({ masterySnapshotOf: vi.fn(async () => ({})) }));
vi.mock("@/utils/users/clerk", () => ({ userIdListToNamesAndMap: async (ids: string[]) => ({ usernameList: ids, userIdNameMap: Object.fromEntries(ids.map(id => [id, id])) }) }));

// realm-arena-hold-out.md §4: the Brood, the computer's own Swarm, in rules
// version 13 — its minions, its threat and its horde's caps. "a" is the
// Brood's owner here and "b" the enemy it fights, in a free-for-all.

const V13 = { rulesVersion: 13 };
const BROOD = rulesetFor(13).FACTIONS.brood;
const { CHARACTERS } = rulesetFor(13);
const field = fieldOf(...Array(8).fill("............"));

function fighter(id: number, owner: string, character: CharacterId, col: number, row = 3, extra: Partial<Fighter> = {}): Fighter {
    return { ...newFighter(id, owner, character, at(field, col, row), null, undefined, undefined, false, V13), ap: 6, ...extra };
}
const stateOf = (fighters: Fighter[]): BattleState => ({ field, fighters, ...V13 });
const get = (state: Pick<BattleState, "fighters">, id: number) => state.fighters.find(one => one.id === id)!;
/** A roll every strike and shot lands on. */
const hits = () => fixedRolls(Array(10).fill(1));
const threatOf = (bought: readonly CharacterId[]) => bought.reduce((sum, id) => sum + CHARACTERS[id].threat!, 0);
const MINIONS = ["broodSkitterling", "broodSpitter", "broodBloater"] as const;
/** What a warband with nobody standing buys with `threat` on `round`'s theme. */
const buy = (threat: number, round: number) => hordeSpawn(spawnThemeOf(BROOD, round, V13)!, threat, { minions: 0, others: 0 }, V13);

describe("the Brood's faction (§4.1)", () => {
    it("is fielded by the computer alone: in no list a player picks from, and found through the battle's catalogue", () => {
        expect(FACTION_IDS).not.toContain("brood");
        expect(isFactionId("brood")).toBe(false);
        expect(factionById("brood", V13)).toBe(BROOD);
        // A catalogue without it falls back as an unknown id does.
        expect(factionById("brood", { rulesVersion: 12 })).toBe(rulesetFor(12).FACTIONS.realm);
        for (const id of [...BROOD.characters, ...BROOD.elites!]) expect(factionOf(id, V13), id).toBe("brood");
        // The elites were the Swarm's in version 12, and are still there.
        expect(factionOf("broodQueen", { rulesVersion: 12 })).toBe("swarm");
        expect(factionOf("skitterling", V13)).toBe("swarm");
    });
});

describe("minions (§4.3)", () => {
    it("are the Brood's three cheap ones, at 1 HP", () => {
        for (const id of MINIONS) {
            expect(isMinion({ character: id }, V13), id).toBe(true);
            expect(newFighter(0, "a", id, 0, null, undefined, undefined, false, V13).hp).toBe(1);
        }
        for (const id of ["broodRavager", "broodBroodmother", "broodQueen", "skitterling", "knight"] as const) expect(isMinion({ character: id }, V13), id).toBe(false);
        // Nothing is one before version 13.
        expect(isMinion({ character: "skitterling" }, { rulesVersion: 12 })).toBe(false);
    });

    it("are downed by a blow, whatever it would have done, and score their points' knock-out", () => {
        const state = stateOf([fighter(0, "b", "knight", 4), fighter(1, "a", "broodSkitterling", 5)]);
        const outcome = act(state, "b", { kind: "attack", fighter: 0, target: 1 }, hits());
        expect(get(outcome, 1).hp).toBe(0);
        expect(outcome.events).toContainEqual(expect.objectContaining({ kind: "downed", fighter: 1 }));
        expect(outcome.events).toContainEqual({ kind: "scored", player: "b", points: CHARACTERS.broodSkitterling.points / ruleValuesOf(V13).KNOCKOUT_DIVISOR, reason: "knockout" });
    });

    it("are downed by a burning or poison tick", () => {
        for (const effect of ["burning", "poisoned"] as const) {
            const state = stateOf([fighter(0, "a", "broodSpitter", 5, 3, { effects: { [effect]: 2 }, effectSources: { [effect]: 9 } }), fighter(9, "b", "mage", 1)]);
            const started = startTurn(state, "a");
            expect(get(started, 0).hp, effect).toBe(0);
        }
    });

    it("wear no armour, whatever braces them", () => {
        const braced = fighter(1, "a", "broodSkitterling", 5, 3, { effects: { braced: 1 } });
        expect(armourOf(stateOf([braced]), braced)).toBe(0);
        const knight = fighter(0, "b", "knight", 4);
        expect(damageTo(stateOf([knight, braced]), knight, braced)).toBe(damageTo(stateOf([knight]), knight, { ...braced, effects: {} }));
        // A Brute of the Brood still wears its carapace.
        expect(armourOf(stateOf([]), fighter(2, "a", "carapaceBrute", 6))).toBe(1);
    });

    it("are healed by nothing, while a Broodmother still mends a real one", () => {
        const mother = fighter(0, "a", "broodBroodmother", 5);
        const minion = fighter(1, "a", "broodSpitter", 6);
        const ravager = fighter(2, "a", "broodRavager", 7, 3, { hp: 3 });
        const state = stateOf([mother, minion, ravager, fighter(9, "b", "knight", 11, 7)]);
        expect(check(state, "a", { kind: "regrowth", fighter: 0, target: 1 })).toEqual({ refused: "A minion can't be healed" });
        expect(check(state, "a", { kind: "regrowth", fighter: 0, target: 2 })).toHaveProperty("ap");
    });

    it("is what a Queen of the Brood hatches", () => {
        const state = stateOf([fighter(0, "a", "broodQueen", 5), fighter(1, "b", "knight", 10)]);
        const outcome = act(state, "a", { kind: "hatch", fighter: 0 }, fixedRolls([]));
        const child = outcome.fighters.find(one => one.hatchedBy === 0)!;
        expect(child).toMatchObject({ character: "broodSkitterling", hp: 1 });
    });
});

describe("what a horde buys (§4.2, §4.4)", () => {
    it("buys the list round and round, in threat, and stops at the first it can't afford, banking the rest (§5.1)", () => {
        // The Rush at 14: two rounds of Skitterling, Skitterling, Ravager.
        expect(buy(14, 1)).toEqual({ bought: ["broodSkitterling", "broodSkitterling", "broodRavager", "broodSkitterling", "broodSkitterling", "broodRavager"], left: 0 });
        // At 10: Skitterling, Skitterling, Ravager, then two Skitterlings; the Ravager after them is too dear, and 1 is banked.
        expect(buy(10, 1)).toEqual({ bought: ["broodSkitterling", "broodSkitterling", "broodRavager", "broodSkitterling", "broodSkitterling"], left: 1 });
        // The Bile at 7: Spitter, Bloater, Spitter (6); 1 left buys nothing. Its elite comes on the schedule (§5.1), not in its list.
        expect(buy(7, 5)).toEqual({ bought: ["broodSpitter", "broodBloater", "broodSpitter"], left: 1 });
        // Saving up: the Rush at 4 buys two Skitterlings and banks 2 toward the Ravager.
        expect(buy(4, 1)).toEqual({ bought: ["broodSkitterling", "broodSkitterling"], left: 2 });
    });

    it("never spends more than its threat, nor buys past the caps, and is the same every time", () => {
        const { HORDE_CAP, HORDE_REAL_CAP } = ruleValuesOf(V13);
        expect([HORDE_CAP, HORDE_REAL_CAP]).toEqual([16, 4]);
        for (const round of [1, 5, 9, 13]) {
            for (const threat of [0, 5, 14, 30, 60, 200]) {
                const { bought } = buy(threat, round);
                const label = `round ${round}, ${threat} threat`;
                expect(threatOf(bought), label).toBeLessThanOrEqual(threat);
                const minions = bought.filter(id => CHARACTERS[id].minion).length;
                expect(minions, label).toBeLessThanOrEqual(HORDE_CAP!);
                expect(bought.length - minions, label).toBeLessThanOrEqual(HORDE_REAL_CAP!);
                expect(buy(threat, round).bought, label).toEqual(bought);
            }
        }
        // At 200 the Queen's theme stands at both caps.
        const { bought: full, left } = buy(200, 13);
        // Threat the caps leave nothing to spend on is lost.
        expect(left).toBe(0);
        expect(full.filter(id => CHARACTERS[id].minion)).toHaveLength(HORDE_CAP!);
        expect(full.filter(id => !CHARACTERS[id].minion)).toHaveLength(HORDE_REAL_CAP!);
    });

    it("caps its minions by its nests standing where a ruleset sets HORDE_CAP_PER_NEST, and by HORDE_CAP where none does", () => {
        const theme = spawnThemeOf(BROOD, 13, V13)!;
        const minions = (nests?: number) => hordeSpawn(theme, 200, { minions: 0, others: 0 }, V13, nests).bought.filter(id => CHARACTERS[id].minion).length;
        expect(ruleValuesOf(V13).HORDE_CAP_PER_NEST).toBeUndefined();
        expect(minions(1)).toBe(ruleValuesOf(V13).HORDE_CAP);
        const base = rulesetFor(13);
        overrideRulesetForExperiment(13, { ...base, RULES: { ...base.RULES, HORDE_CAP_PER_NEST: 5 } });
        try {
            expect([minions(2), minions(1), minions(0)]).toEqual([10, 5, 0]);
            // Not told the nests (the starting horde), the warband's own cap stands.
            expect(minions()).toBe(base.RULES.HORDE_CAP);
        } finally {
            overrideRulesetForExperiment(13, undefined);
        }
    });

    it("lands no wave in a Hold Out against it: its nests produce it (§5.1)", async () => {
        const game = makeGame(["a", "b", "c"], {}, { ...V13, coop: { mission: "holdOut", enemy: "brood" } });
        await musterAll(game);
        const gs = game.specificGameState;
        gs.roundsPlayed = 3;
        for (const owner of warbandsOf(game)) expect(waveOf(gs, owner, true), owner).toEqual([]);
    });

    it("musters each warband of a Hold Out against the Brood as a starting horde of STARTING_HORDE threat on its first theme (§5.1)", async () => {
        const game = makeGame(["a", "b", "c"], {}, { ...V13, coop: { mission: "holdOut", enemy: "brood" } });
        await musterAll(game);
        const gs = game.specificGameState;
        expect(ruleValuesOf(V13).STARTING_HORDE).toBe(10);
        for (const owner of warbandsOf(game)) {
            const own = gs.fighters.filter(one => one.owner === owner && isCombatant(one, gs)).map(one => one.character);
            expect(own, owner).toEqual(buy(10, 1).bought);
        }
        // Two nests a warband stand from the start, on the ruleset's sites.
        expect(gs.fighters.filter(one => one.character === "nest").length).toBe(6);
        expect(battleOf(game).fighters.every(one => one.owner.startsWith("ai") ? CHARACTERS[one.character].threat !== undefined || one.character === "nest" : true)).toBe(true);
    });
});
