// Realm Arena's balance harness (docs/games/realm-arena.md §29.11, §30): whole
// co-op battles fought from the muster to their end with the computer's
// planner (`nextAction`) playing the team as well as the warbands, through the
// same command pipeline a live battle runs, and the statistics they add up to.
// `scripts/realmarena-balance.ts` runs hundreds of them across every core and
// prints the report; the `Realm Arena balance` workflow runs it on demand.
//
// The planner plays the team as it plays a warband: by its own score, heading
// for the keep, with no plan beyond the action in front of it. A team of people
// should do better, so read the numbers as a floor and as a comparison — the
// same seeds under two versions of the rules — rather than as the odds a
// player faces.

import { nextAction, turnMemo } from "../../src/games/RealmArena/ai";
import { DIFFICULTY_NAMES, BATTLE_SIZE_NAMES, type BattleSize, type Difficulty, type FactionId } from "../../src/games/RealmArena/characters";
import type { RealmArenaSettings } from "../../src/games/RealmArena/RealmArenaModels";
import { ACTION_POINTS, battleRounds, isStanding, isWarband, viewOf, waveArrives } from "../../src/games/RealmArena/rules";
import { actBy, battleOf, endTurnBy, makeGame, musterAll, play } from "../../src/games/RealmArena/testFixtures";

export type Mission = "holdOut" | "holdTheCentre";
export type CoopMapChoice = "sackedFort" | "gate";

/** One kind of battle to fight over and over: what a host picks on the setup screen. */
export interface BalanceScenario {
    /** The team's size: 1 is Solo (§30.6). */
    players: number;
    enemy: FactionId;
    mission: Mission;
    /** Hold Out's battlefield (§30.9); Hold the Centre is always fought on the gate forts. */
    map: CoopMapChoice;
    difficulty: Difficulty;
    size: BattleSize;
    fog: boolean;
}

/** One side's strength at the end of a round. */
export interface RoundCount {
    team: number;
    enemy: number;
    teamHp: number;
}

/** What one battle came to. */
export interface BattleSample {
    scenario: string;
    seed: number;
    won: boolean;
    /** The ending's own words: "overrun in round 6", "held out for all 13 rounds". */
    detail: string;
    /** The round the battle ended in, counted from 1. */
    endedRound: number;
    rounds: number;
    /** Who stood at the end of each round played, the first first. */
    byRound: RoundCount[];
    /** How many characters the team mustered. */
    teamFielded: number;
    /** How many characters the enemy fielded in all, every wave's included. */
    enemyFielded: number;
    teamDowned: number;
    enemyDowned: number;
    /** The rounds a wave landed as. */
    waves: number[];
    ms: number;
}

/** The name a scenario's samples are grouped under, and the report heads it with. */
export function scenarioKey(s: BalanceScenario): string {
    const team = s.players === 1 ? "1 player (Solo)" : `${s.players} players`;
    const mission = s.mission === "holdOut" ? `Hold Out (${s.map === "sackedFort" ? "Sacked Fort" : "gate fort"})` : "Hold the Centre";
    const extras = [
        s.difficulty !== "normal" ? DIFFICULTY_NAMES[s.difficulty] : undefined,
        s.size !== "normal" ? `${BATTLE_SIZE_NAMES[s.size]} battle` : undefined,
        s.fog ? "fog" : undefined,
    ].filter(Boolean);
    return `${team} vs ${s.enemy === "swarm" ? "Swarm" : "Realm"} · ${mission}${extras.length ? ` · ${extras.join(", ")}` : ""}`;
}

/** What the host would have chosen to set this battle up. */
export function settingsOf(s: BalanceScenario): RealmArenaSettings {
    return {
        ...(s.fog ? { fog: true } : {}),
        ...(s.size !== "normal" ? { size: s.size } : {}),
        coop: {
            enemy: s.enemy,
            ...(s.mission === "holdOut" ? { mission: "holdOut" as const } : {}),
            ...(s.mission === "holdOut" && s.map === "sackedFort" ? { map: "sackedFort" as const } : {}),
            ...(s.difficulty !== "normal" ? { difficulty: s.difficulty } : {}),
        },
    };
}

/**
 * Every roll from here on drawn from `seed` (mulberry32), so a battle with the
 * same seed rolls the same dice under any version of the rules. The engine
 * rolls through `crypto.getRandomValues` and nothing else (`randomInt`).
 */
export function seedRolls(seed: number): void {
    let state = seed >>> 0;
    globalThis.crypto.getRandomValues = (<T extends ArrayBufferView | null>(array: T): T => {
        const values = array as unknown as Uint32Array;
        for (let i = 0; i < values.length; i++) {
            state = (state + 0x6d2b79f5) >>> 0;
            let t = state;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            values[i] = (t ^ (t >>> 14)) >>> 0;
        }
        return array;
    }) as Crypto["getRandomValues"];
}

/** The seats of a team of `players`. */
const seatsFor = (players: number) => Array.from({ length: players }, (_, k) => `p${k + 1}`);

/**
 * One battle of `scenario`, fought to its end with every roll drawn from
 * `seed`: each player's turn is the planner's actions for the team until it
 * has none worth taking, as a warband's is, then End turn — which plays the
 * warband that follows it.
 */
export async function simulateBattle(scenario: BalanceScenario, seed: number): Promise<BattleSample> {
    const started = performance.now();
    seedRolls(seed);
    const players = seatsFor(scenario.players);
    const game = makeGame(players, {}, settingsOf(scenario));
    await musterAll(game);
    const rounds = battleRounds(players.length);
    const byRound: RoundCount[] = [];
    const waves: number[] = [];
    const teamFielded = battleOf(game).fighters.filter(fighter => !isWarband(fighter.owner)).length;

    for (let turn = 0; !game.complete; turn++) {
        if (turn > rounds * players.length * 2 + 10) throw new Error(`${scenarioKey(scenario)}, seed ${seed}: the battle outlasted its turn limit`);
        const player = game.currentTurn;
        const roundBefore = game.specificGameState.roundsPlayed;
        const memo = turnMemo();
        const cap = ACTION_POINTS * battleOf(game).fighters.filter(fighter => fighter.owner === player && isStanding(fighter)).length;
        for (let step = 0; step < cap && !game.complete; step++) {
            const action = nextAction(viewOf(battleOf(game), player), player, game.specificGameState.roundsPlayed + 1, undefined, memo);
            if (!action) break;
            if (!(await play(game, actBy(player, action))).outcome.validMove) break;
        }
        if (game.complete) break;
        const { outcome } = await play(game, endTurnBy(player));
        if (!outcome.validMove) throw new Error(`${scenarioKey(scenario)}, seed ${seed}: ${player}'s End turn was refused`);
        const roundAfter = game.specificGameState.roundsPlayed;
        if (roundAfter > roundBefore) {
            // Counted after the wave that lands as the next round begins, so a
            // round's enemy count includes the characters it brought.
            const fighters = battleOf(game).fighters.filter(isStanding);
            const team = fighters.filter(fighter => !isWarband(fighter.owner));
            byRound.push({ team: team.length, enemy: fighters.length - team.length, teamHp: team.reduce((sum, fighter) => sum + fighter.hp, 0) });
            if (scenario.mission === "holdOut" && waveArrives(roundAfter + 1, rounds)) waves.push(roundAfter + 1);
        }
    }

    const fighters = battleOf(game).fighters;
    const enemy = fighters.filter(fighter => isWarband(fighter.owner));
    const team = fighters.filter(fighter => !isWarband(fighter.owner));
    return {
        scenario: scenarioKey(scenario),
        seed,
        won: game.endReason === "teamwin",
        detail: game.endDetail ?? "",
        endedRound: Math.min(game.specificGameState.roundsPlayed + 1, rounds),
        rounds,
        byRound,
        teamFielded,
        enemyFielded: enemy.length,
        teamDowned: team.filter(fighter => !isStanding(fighter)).length,
        enemyDowned: enemy.filter(fighter => !isStanding(fighter)).length,
        waves,
        ms: Math.round(performance.now() - started),
    };
}

// ─── Statistics ─────────────────────────────────────────────────────────────

export interface ScenarioStats {
    scenario: string;
    battles: number;
    wins: number;
    /** The share won, and its 95% Wilson interval. */
    winRate: number;
    winLow: number;
    winHigh: number;
    rounds: number;
    /** The round each battle ended in. */
    endedMean: number;
    endedP10: number;
    endedMedian: number;
    endedP90: number;
    /** Of the battles lost, the round the team was overrun in, on average; undefined with none lost. */
    overrunMean?: number;
    /** For each round, the share of battles with the team still standing at its end. */
    survival: number[];
    /** For each round, the average team and enemy left standing at its end, over the battles still going: undefined once none is. */
    teamByRound: (number | undefined)[];
    enemyByRound: (number | undefined)[];
    teamFielded: number;
    enemyFielded: number;
    teamDowned: number;
    enemyDowned: number;
    /** Characters of the enemy downed for each of the team's lost: above 1 is the team trading well. */
    exchange: number;
    /** How often each ending's words came up, commonest first, with the round stripped from "overrun in round 6". */
    endings: { detail: string; count: number }[];
    msMean: number;
}

const mean = (values: readonly number[]) => values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

/** The value `p` of the way through `values` (0 to 1), nearest rank. */
export function percentile(values: readonly number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
}

/** The 95% Wilson score interval for `wins` of `n`: honest at 0%, 100% and small samples, where ±2σ isn't. */
export function wilson(wins: number, n: number): { low: number; high: number } {
    if (n === 0) return { low: 0, high: 1 };
    const z = 1.96;
    const p = wins / n;
    const centre = p + z * z / (2 * n);
    const spread = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
    const denominator = 1 + z * z / n;
    return { low: Math.max(0, (centre - spread) / denominator), high: Math.min(1, (centre + spread) / denominator) };
}

/** One scenario's samples, added up. */
export function summarise(samples: readonly BattleSample[]): ScenarioStats {
    if (samples.length === 0) throw new Error("no battles to summarise");
    const rounds = Math.max(...samples.map(sample => sample.rounds));
    const wins = samples.filter(sample => sample.won).length;
    const { low, high } = wilson(wins, samples.length);
    const ended = samples.map(sample => sample.endedRound);
    const lost = samples.filter(sample => !sample.won);
    const perRound = (pick: (count: RoundCount) => number) => Array.from({ length: rounds }, (_, r) => {
        const going = samples.filter(sample => sample.byRound.length > r).map(sample => pick(sample.byRound[r]));
        return going.length === 0 ? undefined : mean(going);
    });
    const endings = new Map<string, number>();
    for (const { detail } of samples) {
        const kind = detail.replace(/ in round \d+/, "").replace(/, on \w+$/, "");
        endings.set(kind, (endings.get(kind) ?? 0) + 1);
    }
    const teamDowned = mean(samples.map(sample => sample.teamDowned));
    const enemyDowned = mean(samples.map(sample => sample.enemyDowned));
    return {
        scenario: samples[0].scenario,
        battles: samples.length,
        wins,
        winRate: wins / samples.length,
        winLow: low,
        winHigh: high,
        rounds,
        endedMean: mean(ended),
        endedP10: percentile(ended, 0.1),
        endedMedian: percentile(ended, 0.5),
        endedP90: percentile(ended, 0.9),
        overrunMean: lost.length > 0 ? mean(lost.map(sample => sample.endedRound)) : undefined,
        // A battle won early (the last wave beaten) counts as standing to the end.
        survival: Array.from({ length: rounds }, (_, r) => samples.filter(sample => sample.won || sample.byRound.length > r && sample.byRound[r].team > 0).length / samples.length),
        teamByRound: perRound(count => count.team),
        enemyByRound: perRound(count => count.enemy),
        teamFielded: mean(samples.map(sample => sample.teamFielded)),
        enemyFielded: mean(samples.map(sample => sample.enemyFielded)),
        teamDowned,
        enemyDowned,
        exchange: teamDowned === 0 ? Infinity : enemyDowned / teamDowned,
        endings: [...endings].map(([detail, count]) => ({ detail, count })).sort((a, b) => b.count - a.count),
        msMean: mean(samples.map(sample => sample.ms)),
    };
}

/** Every scenario's samples summarised, in the order each first appears. */
export function summariseAll(samples: readonly BattleSample[]): ScenarioStats[] {
    const groups = new Map<string, BattleSample[]>();
    for (const sample of samples) groups.set(sample.scenario, [...groups.get(sample.scenario) ?? [], sample]);
    return [...groups.values()].map(summarise);
}

// ─── The report ─────────────────────────────────────────────────────────────

const pct = (value: number) => `${Math.round(value * 100)}%`;
const one = (value: number | undefined) => value === undefined ? "—" : Number.isFinite(value) ? value.toFixed(1) : "∞";

/** The report as Markdown: an overview table, then each scenario round by round. Reads as plain text in a terminal too. */
export function formatReport(stats: readonly ScenarioStats[], heading = "Realm Arena balance"): string {
    const lines = [
        `## ${heading}`,
        "",
        "The computer's planner plays the team as well as the warbands, so read these as a floor and as a comparison between runs, not as a player's odds.",
        "",
        "| Scenario | Battles | Team wins (95% CI) | Ended in round: mean · p10 / median / p90 | Overrun, on average | Team fielded / lost | Enemy fielded / downed | Enemy downed per team loss |",
        "|---|---:|---|---|---:|---|---|---:|",
        ...stats.map(s => `| ${s.scenario} | ${s.battles} | ${pct(s.winRate)} (${pct(s.winLow)}–${pct(s.winHigh)}) | ${one(s.endedMean)} of ${s.rounds} · ${s.endedP10} / ${s.endedMedian} / ${s.endedP90} | ${s.overrunMean === undefined ? "—" : `round ${one(s.overrunMean)}`} | ${one(s.teamFielded)} / ${one(s.teamDowned)} | ${one(s.enemyFielded)} / ${one(s.enemyDowned)} | ${one(s.exchange)} |`),
    ];
    for (const s of stats) {
        const rounds = Array.from({ length: s.rounds }, (_, r) => r);
        lines.push(
            "",
            `### ${s.scenario}`,
            "",
            `Endings: ${s.endings.map(({ detail, count }) => `${detail} ×${count}`).join(", ")}. About ${(s.msMean / 1000).toFixed(1)} s a battle.`,
            "",
            `| Round | ${rounds.map(r => r + 1).join(" | ")} |`,
            `|---|${rounds.map(() => "---:").join("|")}|`,
            `| Team still standing | ${s.survival.map(pct).join(" | ")} |`,
            `| Team characters left | ${s.teamByRound.map(one).join(" | ")} |`,
            `| Enemy characters left | ${s.enemyByRound.map(one).join(" | ")} |`,
        );
    }
    return lines.join("\n") + "\n";
}
