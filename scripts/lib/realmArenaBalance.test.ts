import { describe, expect, it } from "vitest";
import { battleOf, makeGame, musterAll } from "../../src/games/RealmArena/testFixtures";
import { nextAction } from "../../src/games/RealmArena/ai";
import type { HoldOutStar } from "../../src/games/RealmArena/rules";
import { holdOutDifficultyOf, movementOf } from "../../src/games/RealmArena/rules";
import { ruleValuesOf, rulesetFor } from "../../src/games/RealmArena/rulesets";
import {
    applyOverrides, formatReport, parseOverrides, percentile, raidersOf, scenarioKey, settingsOf, simulateBattle, summarise, summariseAll, wilson,
    type BalanceScenario, type BattleSample,
} from "./realmArenaBalance";

// The arithmetic behind `npm run ra-balance`: the battles themselves are the
// engine's, played by the planner, and coop.test.ts already fights whole ones —
// all but one here, which holds which planner plays which side.

const SOLO: BalanceScenario = { players: 1, team: "realm", enemy: "swarm", mission: "holdOut", map: "sackedFort", difficulty: "normal", size: "normal", fog: false };

function sample(fields: Partial<BattleSample>): BattleSample {
    return {
        scenario: "s", seed: 1, won: false, detail: "overrun in round 3", endedRound: 3, rounds: 4,
        byRound: [], teamFielded: 4, enemyFielded: 6, teamDowned: 4, enemyDowned: 2, waves: [4], ms: 1000,
        ...fields,
    };
}

describe("the balance harness's scenarios", () => {
    it("names a scenario by what the host picked, leaving out what's normal, and the battlefield it's fought on", () => {
        // A Hold Out battlefield the team doesn't fit falls back (§35.3): Solo on the Ruined Fort, two on the Sacked Fort.
        expect(scenarioKey(SOLO)).toBe("1 player (Solo) vs Swarm · Hold Out (Ruined Fort)");
        expect(scenarioKey({ ...SOLO, players: 3, map: "sunkenVillage" })).toBe("3 players vs Swarm · Hold Out (Sunken Village)");
        expect(scenarioKey({ ...SOLO, players: 2, map: "sunkenVillage" })).toBe("2 players vs Swarm · Hold Out (Sacked Fort)");
        // A team of four has Hold Out's own battlefields to itself (§37).
        expect(scenarioKey({ ...SOLO, players: 4, map: "sunkenVillage" })).toBe("4 players vs Swarm · Hold Out (Sunken Village)");
        expect(scenarioKey({ ...SOLO, players: 4 })).toBe("4 players vs Swarm · Hold Out (Sacked Fort)");
        expect(scenarioKey({ ...SOLO, players: 2, map: "gate" })).toBe("2 players vs Swarm · Hold Out (gate fort)");
        expect(scenarioKey({ ...SOLO, players: 3, enemy: "realm", mission: "holdTheCentre", difficulty: "hard", size: "large", fog: true }))
            .toBe("3 players vs Realm · Hold the Centre · Hard, Large battle, fog");
        expect(scenarioKey({ ...SOLO, players: 2, team: "miners", enemy: "miners" })).toBe("2 players as Miners vs Miners · Hold Out (Sacked Fort)");
        // The rally policy (§39.4) is the default and unsaid; Rally always is named.
        expect(scenarioKey({ ...SOLO, rules: 12, rally: "policy" })).toBe("1 player (Solo) vs Swarm · Hold Out (Ruined Fort) · rules v12");
        expect(scenarioKey({ ...SOLO, rules: 12, rally: "always" })).toBe("1 player (Solo) vs Swarm · Hold Out (Ruined Fort) · rules v12, rally always");
        // The raid policy is the default where nests produce the enemy and unsaid; the planner alone and another number of raiders are named.
        expect(scenarioKey({ ...SOLO, rules: 13, teamPolicy: "planner" })).toBe("1 player (Solo) vs Swarm · Hold Out (Ruined Fort) · rules v13, team policy planner");
        expect(scenarioKey({ ...SOLO, rules: 13, teamPolicy: "raid", raiders: 2 })).toBe(scenarioKey({ ...SOLO, rules: 13 }));
        expect(scenarioKey({ ...SOLO, rules: 13, raiders: 3 })).toBe("1 player (Solo) vs Swarm · Hold Out (Ruined Fort) · rules v13, 3 raiders");
        // The temperaments (§39.8) are on by default and unsaid; off is named.
        expect(scenarioKey({ ...SOLO, rules: 12, temperaments: "off" })).toBe("1 player (Solo) vs Swarm · Hold Out (Ruined Fort) · rules v12, temperaments off");
    });

    it("sets a battle up as the host's choices would", () => {
        expect(settingsOf(SOLO)).toEqual({ coop: { enemy: "swarm", mission: "holdOut", map: "sackedFort" } });
        expect(settingsOf({ ...SOLO, mission: "holdTheCentre", difficulty: "easy", size: "small", fog: true }))
            .toEqual({ fog: true, size: "small", coop: { enemy: "swarm", difficulty: "easy" } });
        // Hold Out on the gate forts stores no map.
        expect(settingsOf({ ...SOLO, map: "gate" }).coop).toEqual({ enemy: "swarm", mission: "holdOut" });
        expect(settingsOf({ ...SOLO, map: "sunkenVillage" }).coop).toEqual({ enemy: "swarm", mission: "holdOut", map: "sunkenVillage" });
        expect(settingsOf({ ...SOLO, players: 4 }).coop).toEqual({ enemy: "swarm", mission: "holdOut", map: "sackedFort" });
        // A team of another faction is the one faction its players may muster from.
        expect(settingsOf({ ...SOLO, team: "miners" })).toMatchObject({ factions: ["miners"] });
    });
});

describe("the balance harness's rally choice (§39.4)", () => {
    it("fights a whole battle under rules 12, the team making each choice it owes, by either policy", async () => {
        for (const rally of ["policy", "always"] as const) {
            const battle = await simulateBattle({ ...SOLO, size: "small", rules: 12, rally }, 3);
            expect(battle.endedRound).toBeGreaterThan(0);
            expect(battle.waves.length).toBeGreaterThan(0);
        }
    }, 60_000);
});

describe("the balance harness's team planner", () => {
    it("asks the team's planner for the team's turns and never the warbands', and names it", async () => {
        // This checkout's planner under another name, noting whom it's asked for.
        const askedFor = new Set<string>();
        const planner = { nextAction: ((view, owner, ...rest) => (askedFor.add(owner), nextAction(view, owner, ...rest))) as typeof nextAction };
        const battle = await simulateBattle({ ...SOLO, size: "small" }, 1, { planner, label: "main @ 4ba0a86" });
        expect([...askedFor]).toEqual(["p1"]);
        expect(battle.teamPlanner).toBe("main @ 4ba0a86");
        expect(battle.scenario).toBe(`${scenarioKey({ ...SOLO, size: "small" })} · team plays main @ 4ba0a86`);
    }, 30_000);
});

describe("the balance harness's statistics", () => {
    it("takes percentiles by nearest rank", () => {
        expect(percentile([5, 1, 3, 2, 4], 0.5)).toBe(3);
        expect(percentile([5, 1, 3, 2, 4], 0.1)).toBe(1);
        expect(percentile([5, 1, 3, 2, 4], 0.9)).toBe(5);
        expect(percentile([], 0.5)).toBe(0);
    });

    it("gives a Wilson interval that stays inside 0–100% and narrows with more battles", () => {
        expect(wilson(0, 10).low).toBe(0);
        expect(wilson(0, 10).high).toBeCloseTo(0.278, 2);
        expect(wilson(10, 10).high).toBe(1);
        const few = wilson(5, 10), many = wilson(50, 100);
        expect(many.high - many.low).toBeLessThan(few.high - few.low);
        expect(many.low).toBeLessThan(0.5);
        expect(many.high).toBeGreaterThan(0.5);
    });

    it("adds a scenario's battles up round by round", () => {
        const stats = summarise([
            sample({ won: true, detail: "held out for all 4 rounds", endedRound: 4, teamDowned: 1, enemyDowned: 6,
                byRound: [{ team: 4, enemy: 5, teamHp: 20 }, { team: 4, enemy: 3, teamHp: 18 }, { team: 3, enemy: 9, teamHp: 10 }, { team: 3, enemy: 2, teamHp: 9 }] }),
            sample({ byRound: [{ team: 2, enemy: 6, teamHp: 8 }, { team: 1, enemy: 6, teamHp: 3 }] }),
        ]);
        expect(stats).toMatchObject({ battles: 2, wins: 1, winRate: 0.5, rounds: 4, endedMean: 3.5, overrunMean: 3, teamDowned: 2.5, enemyDowned: 4, exchange: 1.6 });
        // The lost battle was overrun in round 3, so only the win stands past round 2.
        expect(stats.survival).toEqual([1, 1, 0.5, 0.5]);
        expect(stats.teamByRound).toEqual([3, 2.5, 3, 3]);
        expect(stats.enemyByRound).toEqual([5.5, 4.5, 9, 2]);
        expect(stats.endings).toEqual([{ detail: "held out for all 4 rounds", count: 1 }, { detail: "overrun", count: 1 }]);
    });

    it("counts a battle won early as standing to the end, and leaves a round nobody reached blank", () => {
        const stats = summarise([sample({ won: true, detail: "beat the last wave in round 2, on Hard", endedRound: 2, byRound: [{ team: 1, enemy: 1, teamHp: 3 }] })]);
        expect(stats.survival).toEqual([1, 1, 1, 1]);
        expect(stats.teamByRound).toEqual([1, undefined, undefined, undefined]);
        expect(stats.endings).toEqual([{ detail: "beat the last wave", count: 1 }]);
        expect(stats.overrunMean).toBeUndefined();
    });

    it("groups battles by scenario and reports each", () => {
        const all = summariseAll([sample({ scenario: "a" }), sample({ scenario: "b", won: true }), sample({ scenario: "a", seed: 2 })]);
        expect(all.map(s => [s.scenario, s.battles, s.wins])).toEqual([["a", 2, 0], ["b", 1, 1]]);
        const report = formatReport(all);
        expect(report).toContain("| a | 2 | 0% (0%–66%) |");
        expect(report).toContain("### b");
        expect(report).toContain("| Team still standing | 100% | 100% | 100% | 100% |");
        expect(report).toContain("| Team characters left | — | — | — | — |");
        expect(report).not.toContain("the warbands play this checkout's");
    });

    it("says the warbands play this checkout's planner when the team plays another", () => {
        const [stats] = summariseAll([sample({ scenario: "a · team plays main @ 4ba0a86", teamPlanner: "main @ 4ba0a86" })]);
        expect(stats.teamPlanner).toBe("main @ 4ba0a86");
        expect(formatReport([stats])).toContain("the warbands play this checkout's");
    });
});

describe("the balance harness's raid policy and stars (rules 13)", () => {
    const BROOD: BalanceScenario = { ...SOLO, enemy: "brood", size: "small", rules: 13 };

    it("raids with each player's fastest characters, ties by id, and never a nest-less version's", async () => {
        const game = makeGame(["p1"], {}, { rulesVersion: 13, coop: { enemy: "brood", mission: "holdOut" } });
        await musterAll(game);
        const battle = battleOf(game);
        const raiders = raidersOf(battle, "p1");
        expect(raiders).toHaveLength(2);
        const speeds = battle.fighters.filter(fighter => fighter.owner === "p1").map(fighter => movementOf(fighter, battle)).sort((a, b) => b - a);
        expect(raiders.map(fighter => movementOf(fighter, battle))).toEqual(speeds.slice(0, 2));
        expect(raidersOf(battle, "p1", 1)).toEqual(raiders.slice(0, 1));
        expect(raidersOf(battle, "nobody")).toEqual([]);
    }, 30_000);

    it("fights a whole battle by either policy, keeping what a Hold Out came to, and the raiders reach the nests", async () => {
        const raid = await simulateBattle(BROOD, 1);
        const planner = await simulateBattle({ ...BROOD, teamPolicy: "planner" }, 1);
        for (const battle of [raid, planner]) {
            expect(battle.stars).toBeDefined();
            expect(battle.shrineMax).toBeGreaterThan(0);
            expect(battle.nestsLeft).toBeGreaterThanOrEqual(0);
            expect(battle.broodBroken).toBe(battle.nestsLeft === 0);
            expect(battle.brokeRound !== undefined).toBe(battle.won && battle.broodBroken);
        }
        // Nests are only ever downed by someone walking to them: the planner's team never does, so a raid that hurt none would be no raid.
        expect(raid.nestsLeft).toBeLessThan(raid.won ? 1 : 100);
        expect(raid.scenario).toBe(scenarioKey(BROOD));
        expect(planner.scenario).toBe(scenarioKey({ ...BROOD, teamPolicy: "planner" }));
    }, 60_000);

    it("leaves a version-12 sample without stars", async () => {
        const old = await simulateBattle({ ...SOLO, size: "small", rules: 12 }, 3);
        expect(old.stars).toBeUndefined();
        expect(old.shrineHp).toBeUndefined();
    }, 60_000);

    it("keeps the Shrine falling apart from the team being overrun", () => {
        const stats = summarise([
            sample({ detail: "the Shrine fell in round 7" }),
            sample({ detail: "the Shrine fell in round 9" }),
            sample({ detail: "overrun in round 5" }),
            sample({ won: true, detail: "broke the Brood in round 8" }),
            sample({ won: true, detail: "held the Shrine for all 15 rounds" }),
        ]);
        expect(stats.endings).toEqual([
            { detail: "the Shrine fell", count: 2 }, { detail: "overrun", count: 1 }, { detail: "broke the Brood", count: 1 }, { detail: "held the Shrine for all 15 rounds", count: 1 },
        ]);
    });

    it("adds the stars up, and leaves a report without them when no battle has any", () => {
        const won = (stars: HoldOutStar[], extra: Partial<BattleSample> = {}) => sample({ won: true, detail: "held the Shrine for all 15 rounds", stars, broodBroken: false, shrineHp: 20, shrineMax: 30, nestsLeft: 2, ...extra });
        const stats = summarise([
            won(["held", "broke", "unscathed"], { detail: "broke the Brood in round 8", broodBroken: true, brokeRound: 8, shrineHp: 30, nestsLeft: 0 }),
            won(["held", "unscathed"], { shrineHp: 25 }),
            won(["held"], { shrineHp: 10 }),
            sample({ detail: "the Shrine fell in round 9", stars: [], shrineHp: 0, shrineMax: 30, nestsLeft: 3, broodBroken: false }),
        ]);
        expect(stats.hold!.atLeast.map(r => r.rate)).toEqual([0.75, 0.5, 0.25]);
        expect(stats.hold!.byStar.held.rate).toBe(0.75);
        expect(stats.hold!.byStar.broke.rate).toBe(0.25);
        expect(stats.hold!.byStar.unscathed.rate).toBe(0.5);
        expect(stats.hold).toMatchObject({ brokeMean: 8, brokeMedian: 8, shrineHpMean: 16.25, shrineMax: 30, nestsLeftMean: 1.75 });
        expect(stats.hold!.broken.rate).toBe(0.25);
        const report = formatReport([stats]);
        expect(report).toContain("Broke the Brood");
        expect(report).toContain("| 75% (30%–95%) | 50% (15%–85%) | 25% (5%–70%) |");
        // A version-12 run's report has no star table.
        expect(summarise([sample({})]).hold).toBeUndefined();
        expect(formatReport([summarise([sample({})])])).not.toContain("★");
    });

    it("reads the difficulty's steps from the version fought", () => {
        expect(holdOutDifficultyOf({ rulesVersion: 13, coop: { difficulty: "hard" } })).toEqual({ spawnThreat: 1, nestHp: 3, shrineHp: -10 });
    });
});

describe("the balance harness's overrides (--set)", () => {
    it("reads PATH=NUMBER pairs in path order and refuses anything else", () => {
        expect(parseOverrides("RULES.NEST_POINTS=10, CHARACTERS.broodQueen.hp=24,RULES.WAVE_GROWTH_POINTS=25", 12))
            .toEqual({ "CHARACTERS.broodQueen.hp": 24, "RULES.NEST_POINTS": 10, "RULES.WAVE_GROWTH_POINTS": 25 });
        // A rule that is null in the version fought isn't a number there.
        expect(() => parseOverrides("RULES.BANK_CAP=3", 8)).toThrow(/numeric rule/);
        for (const bad of ["RULES.NOPE=1", "RULES.COVER_PENALTY=1", "RULES.ARMOUR=x", "RULES.ARMOUR=", "RULES.ARMOUR=Infinity", "RULES.ARMOUR",
            "CHARACTERS.nobody.hp=3", "CHARACTERS.knight.threat=3", "CHARACTERS.knight.points=-3", "CHARACTERS.knight.threat=0", "CHARACTERS.knight.hp=0", "ABILITIES.heal.hp=3", "RULES.ARMOUR=1,RULES.ARMOUR=2"]) {
            expect(() => parseOverrides(bad, 12), bad).toThrow(/--set/);
        }
    });

    it("reaches a character's threat and points and the difficulty's steps, in the version that has them", () => {
        expect(parseOverrides("CHARACTERS.carapaceBrute.threat=9,CHARACTERS.carapaceBrute.points=0,RULES.HOLD_OUT_DIFFICULTY.hard.nestHp=-2.5", 13))
            .toEqual({ "CHARACTERS.carapaceBrute.points": 0, "CHARACTERS.carapaceBrute.threat": 9, "RULES.HOLD_OUT_DIFFICULTY.hard.nestHp": -2.5 });
        for (const bad of ["CHARACTERS.carapaceBrute.threat=0", "CHARACTERS.carapaceBrute.points=-1", "CHARACTERS.knight.threat=2", "CHARACTERS.nobody.threat=2",
            "RULES.HOLD_OUT_DIFFICULTY.brutal.nestHp=1", "RULES.HOLD_OUT_DIFFICULTY.hard.nope=1", "RULES.HOLD_OUT_DIFFICULTY.hard=1", "RULES.HOLD_OUT_DIFFICULTY.hard.nestHp=x"]) {
            expect(() => parseOverrides(bad, 13), bad).toThrow(/--set/);
        }
        // Version 12 has no HOLD_OUT_DIFFICULTY, and its characters no threat.
        expect(() => parseOverrides("RULES.HOLD_OUT_DIFFICULTY.hard.nestHp=1", 12)).toThrow(/no HOLD_OUT_DIFFICULTY/);
        expect(() => parseOverrides("CHARACTERS.broodQueen.threat=3", 12)).toThrow(/no threat/);
        try {
            applyOverrides({ rules: 13, set: { "CHARACTERS.carapaceBrute.threat": 9, "CHARACTERS.carapaceBrute.points": 4, "RULES.HOLD_OUT_DIFFICULTY.hard.nestHp": 7 } });
            expect(rulesetFor(13).CHARACTERS.carapaceBrute).toMatchObject({ threat: 9, points: 4 });
            expect(rulesetFor(13).CHARACTERS.carapaceBrute.hp).toBe(rulesetFor(12).CHARACTERS.carapaceBrute.hp);
            expect(holdOutDifficultyOf({ rulesVersion: 13, coop: { difficulty: "hard" } })).toEqual({ spawnThreat: 1, nestHp: 7, shrineHp: -10 });
            expect(holdOutDifficultyOf({ rulesVersion: 13, coop: { difficulty: "easy" } })).toEqual({ spawnThreat: -1, nestHp: -3, shrineHp: 10 });
            applyOverrides({ rules: 13 });
            expect(rulesetFor(13).CHARACTERS.carapaceBrute.threat).toBe(12);
            expect(holdOutDifficultyOf({ rulesVersion: 13, coop: { difficulty: "hard" } }).nestHp).toBe(3);
        } finally {
            applyOverrides({});
        }
    });

    it("names the overrides in the scenario", () => {
        expect(scenarioKey({ ...SOLO, rules: 12, set: { "RULES.NEST_POINTS": 10, "RULES.WAVE_GROWTH_POINTS": 25 } }))
            .toBe("1 player (Solo) vs Swarm · Hold Out (Ruined Fort) · rules v12, set RULES.NEST_POINTS=10 RULES.WAVE_GROWTH_POINTS=25");
        expect(scenarioKey({ ...SOLO, rules: 12, set: {} })).toBe(scenarioKey({ ...SOLO, rules: 12 }));
    });

    it("reaches the version fought and no other, and goes when the next scenario has none", () => {
        const v11 = { armour: ruleValuesOf({ rulesVersion: 11 }).ARMOUR, hp: rulesetFor(11).CHARACTERS.knight.hp, growth12: rulesetFor(12).RULES.WAVE_GROWTH_POINTS, hp12: rulesetFor(12).CHARACTERS.knight.hp, queen: rulesetFor(12).CHARACTERS.broodQueen.hp };
        try {
            applyOverrides({ rules: 12, set: { "RULES.WAVE_GROWTH_POINTS": 30, "RULES.ARMOUR": 3, "CHARACTERS.knight.hp": 99 } });
            expect(v11.growth12).not.toBe(30);
            expect(ruleValuesOf({ rulesVersion: 12 }).WAVE_GROWTH_POINTS).toBe(30);
            expect(ruleValuesOf({ rulesVersion: 12 }).ARMOUR).toBe(3);
            expect(rulesetFor(12).CHARACTERS.knight.hp).toBe(99);
            expect(rulesetFor(12).CHARACTERS.broodQueen.hp).toBe(v11.queen);
            expect(ruleValuesOf({ rulesVersion: 11 }).ARMOUR).toBe(v11.armour);
            expect(rulesetFor(11).CHARACTERS.knight.hp).toBe(v11.hp);
            applyOverrides({ rules: 12 });
            expect(ruleValuesOf({ rulesVersion: 12 }).WAVE_GROWTH_POINTS).toBe(v11.growth12);
            expect(rulesetFor(12).CHARACTERS.knight.hp).toBe(v11.hp12);
        } finally {
            applyOverrides({});
        }
    });
});
