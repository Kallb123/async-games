import { describe, expect, it } from "vitest";
import { nextAction } from "../../src/games/RealmArena/ai";
import {
    formatReport, percentile, scenarioKey, settingsOf, simulateBattle, summarise, summariseAll, wilson,
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
        expect(scenarioKey({ ...SOLO, players: 2, map: "gate" })).toBe("2 players vs Swarm · Hold Out (gate fort)");
        expect(scenarioKey({ ...SOLO, players: 3, enemy: "realm", mission: "holdTheCentre", difficulty: "hard", size: "large", fog: true }))
            .toBe("3 players vs Realm · Hold the Centre · Hard, Large battle, fog");
        expect(scenarioKey({ ...SOLO, players: 2, team: "miners", enemy: "miners" })).toBe("2 players as Miners vs Miners · Hold Out (Sacked Fort)");
    });

    it("sets a battle up as the host's choices would", () => {
        expect(settingsOf(SOLO)).toEqual({ coop: { enemy: "swarm", mission: "holdOut", map: "sackedFort" } });
        expect(settingsOf({ ...SOLO, mission: "holdTheCentre", difficulty: "easy", size: "small", fog: true }))
            .toEqual({ fog: true, size: "small", coop: { enemy: "swarm", difficulty: "easy" } });
        // Hold Out on the gate forts stores no map.
        expect(settingsOf({ ...SOLO, map: "gate" }).coop).toEqual({ enemy: "swarm", mission: "holdOut" });
        expect(settingsOf({ ...SOLO, map: "sunkenVillage" }).coop).toEqual({ enemy: "swarm", mission: "holdOut", map: "sunkenVillage" });
        // A team of another faction is the one faction its players may muster from.
        expect(settingsOf({ ...SOLO, team: "miners" })).toMatchObject({ factions: ["miners"] });
    });
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
