import { describe, expect, it } from "vitest";
import { formatReport, percentile, scenarioKey, settingsOf, summarise, summariseAll, wilson, type BalanceScenario, type BattleSample } from "./realmArenaBalance";

// The arithmetic behind `npm run ra-balance`: the battles themselves are the
// engine's, played by the planner, and coop.test.ts already fights whole ones.

const SOLO: BalanceScenario = { players: 1, enemy: "swarm", mission: "holdOut", map: "sackedFort", difficulty: "normal", size: "normal", fog: false };

function sample(fields: Partial<BattleSample>): BattleSample {
    return {
        scenario: "s", seed: 1, won: false, detail: "overrun in round 3", endedRound: 3, rounds: 4,
        byRound: [], teamFielded: 4, enemyFielded: 6, teamDowned: 4, enemyDowned: 2, waves: [4], ms: 1000,
        ...fields,
    };
}

describe("the balance harness's scenarios", () => {
    it("names a scenario by what the host picked, leaving out what's normal", () => {
        expect(scenarioKey(SOLO)).toBe("1 player (Solo) vs Swarm · Hold Out (Sacked Fort)");
        expect(scenarioKey({ ...SOLO, players: 3, enemy: "realm", mission: "holdTheCentre", difficulty: "hard", size: "large", fog: true }))
            .toBe("3 players vs Realm · Hold the Centre · Hard, Large battle, fog");
    });

    it("sets a battle up as the host's choices would", () => {
        expect(settingsOf(SOLO)).toEqual({ coop: { enemy: "swarm", mission: "holdOut", map: "sackedFort" } });
        expect(settingsOf({ ...SOLO, mission: "holdTheCentre", difficulty: "easy", size: "small", fog: true }))
            .toEqual({ fog: true, size: "small", coop: { enemy: "swarm", difficulty: "easy" } });
        // Hold Out on the gate forts stores no map.
        expect(settingsOf({ ...SOLO, map: "gate" }).coop).toEqual({ enemy: "swarm", mission: "holdOut" });
    });
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
    });
});
