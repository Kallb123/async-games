// Realm Arena's balance runs: hundreds of co-op battles, the computer playing
// both sides, added up into how often the team wins, how long it lasts and how
// the fight goes round by round (scripts/lib/realmArenaBalance.ts). Run it
// before and after a change to the numbers, with the same seeds, and compare.
//
//   npm run ra-balance                                   # 100 of each: Solo, 2 and 3 players of the Realm, against every faction, Hold Out on the Sacked Fort
//   npm run ra-balance -- --runs 300 --players 3 --enemies swarm --difficulties easy,normal,hard
//   npm run ra-balance -- --teams realm,miners --enemies realm,swarm,miners # each team faction against each enemy
//   npm run ra-balance -- --missions holdOut,holdTheCentre --maps gate --fog on,off
//   npm run ra-balance -- --shard 2/4 --out samples-2.json # one quarter of the battles, every sample kept
//   npm run ra-balance -- --merge samples-*.json          # the report for samples already fought
//
// Every battle runs in a child process, one per core (`--workers`), since a
// battle is a few seconds of the planner's arithmetic and nothing else. A
// battle's dice come from its seed, so the same seeds under two versions of
// the rules differ only where the rules do — and where a warband's turn ran
// into its two-second deadline, which a busy machine makes likelier.
//
// The `Realm Arena balance` workflow runs it on demand, sharded across
// runners, and puts the report on the run's summary page.

import { fork } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { parseArgs } from "node:util";
import { FACTION_IDS, type BattleSize, type Difficulty, type FactionId } from "../src/games/RealmArena/characters";
import {
    formatReport, scenarioKey, simulateBattle, summariseAll,
    type BalanceScenario, type BattleSample, type CoopMapChoice, type Mission,
} from "./lib/realmArenaBalance";

interface Job {
    scenario: BalanceScenario;
    seed: number;
}

type Reply = { sample: BattleSample } | { error: string; job: Job };

const list = (value: string) => value.split(",").map(part => part.trim()).filter(Boolean);

function oneOf<T extends string>(name: string, values: string[], allowed: readonly T[]): T[] {
    for (const value of values) {
        if (!allowed.includes(value as T)) throw new Error(`--${name}: "${value}" isn't one of ${allowed.join(", ")}`);
    }
    return values as T[];
}

/** What the command line says to fight: each a comma-separated list but the runs and the first seed. */
type MatrixArgs = Record<"runs" | "seed" | "players" | "teams" | "enemies" | "missions" | "maps" | "difficulties" | "sizes" | "fog", string>;

/** Every battle the arguments ask for, scenario by scenario, then seed by seed. */
function jobsFrom(args: MatrixArgs): Job[] {
    const runs = Number(args.runs);
    const firstSeed = Number(args.seed);
    if (!Number.isInteger(runs) || runs < 1) throw new Error("--runs must be a whole number of battles, at least 1");
    if (!Number.isInteger(firstSeed)) throw new Error("--seed must be a whole number");
    const players = list(args.players).map(Number);
    if (players.some(count => !Number.isInteger(count) || count < 1 || count > 3)) throw new Error("--players must be team sizes from 1 to 3");
    const teams = oneOf<FactionId>("teams", list(args.teams), FACTION_IDS);
    const enemies = oneOf<FactionId>("enemies", list(args.enemies), FACTION_IDS);
    const missions = oneOf<Mission>("missions", list(args.missions), ["holdOut", "holdTheCentre"]);
    const maps = oneOf<CoopMapChoice>("maps", list(args.maps), ["sackedFort", "gate"]);
    const difficulties = oneOf<Difficulty>("difficulties", list(args.difficulties), ["easy", "normal", "hard"]);
    const sizes = oneOf<BattleSize>("sizes", list(args.sizes), ["small", "normal", "large"]);
    const fogs = oneOf("fog", list(args.fog), ["off", "on"]).map(fog => fog === "on");

    const scenarios = new Map<string, BalanceScenario>();
    for (const mission of missions) for (const map of mission === "holdOut" ? maps : ["gate" as const])
        for (const team of teams) for (const enemy of enemies) for (const count of players) for (const difficulty of difficulties) for (const size of sizes) for (const fog of fogs) {
            const scenario: BalanceScenario = { players: count, team, enemy, mission, map, difficulty, size, fog };
            scenarios.set(scenarioKey(scenario), scenario);
        }
    return [...scenarios.values()].flatMap(scenario => Array.from({ length: runs }, (_, k) => ({ scenario, seed: firstSeed + k })));
}

/** The jobs for shard `i/n`: every nth, from the ith, so each shard gets its share of every scenario. */
function shardOf(jobs: Job[], shard: string): Job[] {
    const match = /^(\d+)\/(\d+)$/.exec(shard);
    if (!match) throw new Error("--shard must be i/n, as 2/4");
    const [i, n] = [Number(match[1]), Number(match[2])];
    if (n < 1 || i < 1 || i > n) throw new Error("--shard must be i/n with 1 ≤ i ≤ n");
    return jobs.filter((_, k) => k % n === i - 1);
}

/** Fights every job across `workers` child processes, a battle at a time each, and returns every sample. */
async function fightAll(jobs: Job[], workers: number): Promise<{ samples: BattleSample[]; failures: string[] }> {
    const samples: BattleSample[] = [];
    const failures: string[] = [];
    const queue = [...jobs];
    const started = Date.now();
    let done = 0;
    const report = () => {
        const elapsed = (Date.now() - started) / 1000;
        const left = jobs.length - done;
        const line = `${done}/${jobs.length} battles · ${Math.round(elapsed)} s · about ${Math.round(elapsed / done * left)} s left`;
        // A terminal redraws one line; a CI log gets a line every twentieth of the way.
        if (process.stderr.isTTY) process.stderr.write(`\r${line}   `);
        else if (done % Math.max(1, Math.round(jobs.length / 20)) === 0 || left === 0) process.stderr.write(`${line}\n`);
    };

    await Promise.all(Array.from({ length: Math.min(workers, jobs.length) }, () => new Promise<void>((resolve, reject) => {
        // The same script, run through the same loader (tsx), as a worker.
        const child = fork(process.argv[1], ["--worker"], { execArgv: process.execArgv, stdio: ["ignore", "inherit", "inherit", "ipc"] });
        let current: Job | undefined;
        const next = () => {
            current = queue.shift();
            if (current) child.send(current);
            else child.disconnect();
        };
        child.on("message", (reply: Reply) => {
            if ("sample" in reply) samples.push(reply.sample);
            else failures.push(`${scenarioKey(reply.job.scenario)}, seed ${reply.job.seed}: ${reply.error}`);
            done++;
            report();
            next();
        });
        child.on("exit", code => {
            if (current && code !== 0) reject(new Error(`a worker died (exit ${code}) on ${scenarioKey(current.scenario)}, seed ${current.seed}`));
            else resolve();
        });
        next();
    })));
    if (process.stderr.isTTY) process.stderr.write("\n");
    return { samples, failures };
}

/** The child's side: fight each battle it's sent and send back what it came to. */
function serve(): void {
    process.on("message", async (job: Job) => {
        try {
            process.send!({ sample: await simulateBattle(job.scenario, job.seed) } satisfies Reply);
        } catch (error) {
            process.send!({ error: error instanceof Error ? error.stack ?? error.message : String(error), job } satisfies Reply);
        }
    });
}

async function main(): Promise<void> {
    const { values: args, positionals } = parseArgs({
        allowPositionals: true,
        options: {
            worker: { type: "boolean", default: false },
            runs: { type: "string", default: "100" },
            seed: { type: "string", default: "1" },
            players: { type: "string", default: "1,2,3" },
            teams: { type: "string", default: "realm" },
            enemies: { type: "string", default: FACTION_IDS.join(",") },
            missions: { type: "string", default: "holdOut" },
            maps: { type: "string", default: "sackedFort" },
            difficulties: { type: "string", default: "normal" },
            sizes: { type: "string", default: "normal" },
            fog: { type: "string", default: "off" },
            workers: { type: "string", default: String(availableParallelism()) },
            shard: { type: "string" },
            out: { type: "string" },
            merge: { type: "boolean", default: false },
            heading: { type: "string", default: "Realm Arena balance" },
        },
    });
    if (args.worker) return serve();

    let samples: BattleSample[];
    let failures: string[] = [];
    if (args.merge) {
        if (positionals.length === 0) throw new Error("--merge needs the sample files to read");
        samples = positionals.flatMap(file => JSON.parse(readFileSync(file, "utf8")) as BattleSample[]);
    } else {
        let jobs = jobsFrom(args);
        if (args.shard) jobs = shardOf(jobs, args.shard);
        const workers = Math.max(1, Number(args.workers) || 1);
        process.stderr.write(`Fighting ${jobs.length} battles on ${workers} workers\n`);
        ({ samples, failures } = await fightAll(jobs, workers));
    }
    // Scenario by scenario, then by seed, however the workers finished: the
    // scenario's name sorts by team size, then enemy, then the rest.
    samples.sort((a, b) => a.scenario.localeCompare(b.scenario) || a.seed - b.seed);
    if (args.out) writeFileSync(args.out, JSON.stringify(samples));

    const report = formatReport(summariseAll(samples), args.heading)
        + (failures.length > 0 ? `\n### Battles that broke (${failures.length})\n\n${failures.map(line => `- ${line.split("\n")[0]}`).join("\n")}\n` : "");
    process.stdout.write(report);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
    for (const failure of failures) process.stderr.write(`${failure}\n`);
    if (failures.length > 0) process.exitCode = 1;
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
