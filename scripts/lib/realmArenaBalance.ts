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
// player faces. To compare two versions of the planner itself, the team can
// play another (`TeamPlanner`, an older one) while the warbands play this
// checkout's, so the change shows as the warbands' alone.

import { nextAction, temperamentSwitch, turnMemo } from "../../src/games/RealmArena/ai";
import { DIFFICULTY_NAMES, BATTLE_SIZE_NAMES, FACTIONS, type BattleSize, type Difficulty, type FactionId } from "../../src/games/RealmArena/characters";
import type { RealmArenaSettings } from "../../src/games/RealmArena/RealmArenaModels";
import { battlefieldById, mapFor, type CoopMap } from "../../src/games/RealmArena/maps";
import { CURRENT_RULESET_VERSION, overrideRulesetForExperiment, rulesetFor, type RealmArenaRuleset } from "../../src/games/RealmArena/rulesets";
import type { RealmArenaRuleValues } from "../../src/games/RealmArena/ruleValues";
import { battleRoundsOf, owesRally } from "../../src/games/RealmArena/RealmArenaLogic";
import { defaultRally, rallyOptionsOf, rallyTotal, reinforcedHp, type RallyAction } from "../../src/games/RealmArena/rally";
import {
    ACTION_POINTS, check, fighterById, HOLD_OUT_STAR_INFO, HOLD_OUT_STARS, isCombatant, isStanding, isWarband, maxHpOf, moveRules, movementOf, nestsProduce, reachOf, shrineOf, viewOf, warbandNests, waveArrives, weaponReaches,
    type Action, type BattleState, type Fighter, type HoldOutStar,
} from "../../src/games/RealmArena/rules";
import { actBy, battleOf, endTurnBy, makeGame, musterAll, play, seededRandomValues } from "../../src/games/RealmArena/testFixtures";
import { costsFrom, pathTo } from "../../src/utils/games/battlefield/pathfinding";
import { percentile as sortedPercentile } from "../../src/utils/performance";

export type Mission = "holdOut" | "holdTheCentre";
/** Hold Out's own battlefields by name, or the gate fort for the team's size (§30.9). */
export type CoopMapChoice = CoopMap | "gate";

/** One kind of battle to fight over and over: what a host picks on the setup screen. */
export interface BalanceScenario {
    /** The team's size: 1 is Solo (§30.6). */
    players: number;
    /** The faction every player of the team musters from (B6): its ready-made squad, as the warbands' are theirs. */
    team: FactionId;
    enemy: FactionId;
    mission: Mission;
    /** Hold Out's battlefield (§30.9); Hold the Centre is always fought on the gate forts. */
    map: CoopMapChoice;
    difficulty: Difficulty;
    size: BattleSize;
    fog: boolean;
    /** The rules version to fight under (`--rules`); absent is the current one, and leaves the scenario's name as it was. */
    rules?: number;
    /**
     * How the team answers the rally's choice (§39.4) in a battle whose rules
     * make it one (`--rally`): the policy `rallyChoiceFor` describes, or Rally
     * every time. Absent is the policy, and leaves the scenario's name as it
     * was; it changes nothing under rules that have no choice.
     */
    rally?: RallyPolicy;
    /**
     * Whether the Swarm's temperaments (§39.8) shape the planner's choices
     * (`--temperaments`): set on `temperamentSwitch` as each battle begins.
     * Absent is on, as in the game, and leaves the scenario's name as it was;
     * `"off"` is named in it, to see what they do (§40.5).
     */
    temperaments?: "off";
    /**
     * How the team plays a Hold Out whose nests produce the enemy
     * (`--team-policy`): `raid`, where the planner alone would never walk to a
     * nest (`raidAction`), or `planner`, the planner for every character.
     * Absent is `raid`, and leaves the scenario's name as it was; `planner` is
     * named in it. Changes nothing where nests don't produce.
     */
    teamPolicy?: TeamPolicy;
    /**
     * How many of each player's characters raid under `raid` (`--raiders`).
     * Absent is `RAIDERS`, and leaves the scenario's name as it was; any other
     * number is named in it.
     */
    raiders?: number;
    /**
     * Numbers overriding the catalogue's own (`--set`), by path, in path order:
     * `RULES.<KEY>`, `RULES.HOLD_OUT_DIFFICULTY.<difficulty>.<step>` or
     * `CHARACTERS.<id>.<hp|threat|points>` (`parseOverrides`). Applied to the
     * rules version being fought before each battle, in whichever process fights
     * it. Absent is the catalogue as registered, and leaves the scenario's name
     * as it was; the overrides are named in it, so samples fought under
     * different ones never merge.
     */
    set?: Readonly<Record<string, number>>;
}

/** The optional numeric rule values (`RealmArenaRuleValues`): absent from older catalogues, but a rule the engine reads whenever it's there. */
const OPTIONAL_NUMERIC_RULES = ["WAVE_GROWTH_POINTS", "WAVE_CAP", "NEST_POINTS"] as const satisfies readonly (keyof RealmArenaRuleValues)[];

/** The numbers of a character `--set` may change: its HP, and the threat and points it costs. */
const CHARACTER_NUMBERS = ["hp", "threat", "points"] as const;
const DIFFICULTY_STEPS = ["spawnThreat", "nestHp", "shrineHp"] as const;

/** Refuses a `--set` path or value the version fought can't take: not a numeric rule, an unknown character or one without that number, a value out of its range, or any other path. */
function checkOverride(path: string, value: number, ruleset: RealmArenaRuleset, rulesVersion: number): void {
    const parts = path.split(".");
    if (parts[0] === "RULES" && parts.length === 2) {
        const key = parts[1] as keyof RealmArenaRuleValues;
        const known = Object.hasOwn(ruleset.RULES, key) ? typeof ruleset.RULES[key] === "number" : (OPTIONAL_NUMERIC_RULES as readonly string[]).includes(key);
        if (!known) throw new Error(`--set: "${path}" isn't a numeric rule of rules version ${rulesVersion}`);
    } else if (parts[0] === "RULES" && parts.length === 4 && parts[1] === "HOLD_OUT_DIFFICULTY") {
        const steps = ruleset.RULES.HOLD_OUT_DIFFICULTY;
        if (!steps) throw new Error(`--set: "${path}": rules version ${rulesVersion} has no HOLD_OUT_DIFFICULTY`);
        if (!Object.hasOwn(steps, parts[2]) || !(DIFFICULTY_STEPS as readonly string[]).includes(parts[3])) throw new Error(`--set: "${path}" isn't RULES.HOLD_OUT_DIFFICULTY.<easy|normal|hard>.<${DIFFICULTY_STEPS.join("|")}>`);
    } else if (parts[0] === "CHARACTERS" && parts.length === 3 && (CHARACTER_NUMBERS as readonly string[]).includes(parts[2])) {
        if (!Object.hasOwn(ruleset.CHARACTERS, parts[1])) throw new Error(`--set: "${path}": rules version ${rulesVersion} has no character "${parts[1]}"`);
        const field = parts[2] as (typeof CHARACTER_NUMBERS)[number];
        const character = ruleset.CHARACTERS[parts[1] as keyof RealmArenaRuleset["CHARACTERS"]] as unknown as Partial<Record<typeof field, number>>;
        if (character[field] === undefined) throw new Error(`--set: "${path}": "${parts[1]}" has no ${field} in rules version ${rulesVersion}`);
        if (field === "points" ? value < 0 : value <= 0) throw new Error(`--set: "${path}" must be ${field === "points" ? "0 or more" : "above 0"}`);
    } else {
        throw new Error(`--set: "${path}" isn't RULES.<KEY>, RULES.HOLD_OUT_DIFFICULTY.<difficulty>.<step> or CHARACTERS.<id>.<${CHARACTER_NUMBERS.join("|")}>`);
    }
}

/**
 * What `--set` may change, and what it takes effect on: the numeric values of
 * `rulesVersion`'s `RULES` (and the optional ones above), the steps of its
 * `HOLD_OUT_DIFFICULTY`, and a character's `hp` — which is also the HP a
 * Reinforce returns it at (half, `reinforcedHp`) — `threat` and `points`.
 * The engine reads every one of them through `ruleValuesOf(game)` /
 * `rulesetOf(game)` — a module constant like `TEAM_HP_FACTOR` is only what the
 * guide prints — so each takes effect in a battle. Anything else is refused:
 * a value that isn't a plain number (`BANK_CAP: null`, `COVER_PENALTY`, the lists).
 * Returns the overrides in path order.
 */
export function parseOverrides(text: string, rulesVersion: number = CURRENT_RULESET_VERSION): Record<string, number> {
    const ruleset = rulesetFor(rulesVersion);
    const found = new Map<string, number>();
    for (const entry of text.split(",").map(part => part.trim()).filter(Boolean)) {
        const match = /^([^=\s]+)=(.*)$/.exec(entry);
        if (!match) throw new Error(`--set: "${entry}" isn't PATH=NUMBER`);
        const [, path, raw] = match;
        const value = raw.trim() === "" ? NaN : Number(raw);
        if (!Number.isFinite(value)) throw new Error(`--set: "${path}" needs a finite number, not "${raw}"`);
        checkOverride(path, value, ruleset, rulesVersion);
        if (found.has(path)) throw new Error(`--set: "${path}" is given twice`);
        found.set(path, value);
    }
    return Object.fromEntries([...found].sort(([a], [b]) => a.localeCompare(b)));
}

let overriddenVersion: number | undefined;

/**
 * Makes `rulesetFor(scenario's rules version)` answer with a copy of the
 * catalogue carrying `scenario.set`, and every other version as registered: the
 * shared, frozen catalogues are never touched, so v11 keeps what v12 reuses of
 * it. Undoes whatever an earlier scenario set. Idempotent, so every battle may
 * call it; the process's rules are this scenario's from here on.
 */
export function applyOverrides(scenario: Pick<BalanceScenario, "rules" | "set">): void {
    if (overriddenVersion !== undefined) overrideRulesetForExperiment(overriddenVersion, undefined);
    overriddenVersion = undefined;
    if (!scenario.set || Object.keys(scenario.set).length === 0) return;
    const version = scenario.rules ?? CURRENT_RULESET_VERSION;
    const base = rulesetFor(version);
    for (const [path, value] of Object.entries(scenario.set)) checkOverride(path, value, base, version);
    const rules: Record<string, unknown> = { ...base.RULES };
    const characters: Record<string, unknown> = { ...base.CHARACTERS };
    for (const [path, value] of Object.entries(scenario.set)) {
        const [group, id, field, step] = path.split(".");
        if (group === "CHARACTERS") characters[id] = { ...(characters[id] as object), [field]: value };
        else if (step !== undefined) rules.HOLD_OUT_DIFFICULTY = { ...(rules.HOLD_OUT_DIFFICULTY as object), [field]: { ...(rules.HOLD_OUT_DIFFICULTY as Record<string, object>)[field], [step]: value } };
        else rules[id] = value;
    }
    overrideRulesetForExperiment(version, { ...base, RULES: rules as unknown as RealmArenaRuleValues, CHARACTERS: characters as unknown as RealmArenaRuleset["CHARACTERS"] });
    overriddenVersion = version;
}

/** How the harness's team makes a rally choice (`--rally`). */
export type RallyPolicy = "policy" | "always";

/**
 * What the harness's team chooses when a wave leaves it a rally to make
 * (§39.4). The planner scores battles, not menus, so the harness answers for
 * it, and `ai.ts` knows nothing of it (a warband never rallies). The policy
 * prices a Reinforce and a Rally in the one currency, HP: Reinforce when the
 * best downed character would return (half its max HP) with more than half of
 * what a Rally would hand back to this player's own standing characters,
 * otherwise Rally. A player with nobody standing has no Rally to price, so
 * takes `defaultRally`. Resupply is never chosen: the planner's items are a minor part
 * of its play and a menu row it can't weigh. `always` is Rally every time, the
 * heal as it was before the choice, for the player's own squad.
 */
export function rallyChoiceFor(battle: BattleState, seats: readonly string[], player: string, policy: RallyPolicy = "policy"): RallyAction {
    const rally: RallyAction = { kind: "rally", choice: "rally" };
    if (policy === "always") return rally;
    // Nobody standing has no Rally to price: the default's Reinforce, or Rally when there's no room.
    if (!battle.fighters.some(fighter => fighter.owner === player && isStanding(fighter))) return defaultRally(battle, seats, player);
    const reinforce = rallyOptionsOf(battle, seats, player).find(option => option.choice === "reinforce");
    if (!reinforce?.available) return rally;
    const best = reinforce.downed!.reduce((a, b) => reinforcedHp(b, battle) > reinforcedHp(a, battle) ? b : a);
    return reinforcedHp(best, battle) > rallyTotal(battle, player) / 2 ? { kind: "rally", choice: "reinforce", fighter: best.id } : rally;
}

/** How the harness's team plays a Hold Out whose nests produce the enemy (`--team-policy`). */
export type TeamPolicy = "raid" | "planner";

/**
 * How many of a player's characters raid unless a scenario says (`--raiders`):
 * the fastest three. Two, as §7 first proposed, die with a nest left and leave
 * too few guards behind (realm-arena-balance.md, rules version 13).
 */
export const RAIDERS = 3;

/**
 * The raid policy (realm-arena-hold-out.md §7). The planner heads for the keep
 * and never walks to a nest, so left alone it could only ever hold to the
 * round cap. Each player's `RAIDERS` fastest standing characters (`movementOf`,
 * ties by id) raid instead, picked again at the start of every one of that
 * player's turns, and the rest guard the Shrine as the planner plays them.
 */
export const raidersOf = (battle: BattleState, player: string, count = RAIDERS): Fighter[] =>
    battle.fighters.filter(fighter => fighter.owner === player && isCombatant(fighter, battle))
        .sort((a, b) => movementOf(b, battle) - movementOf(a, battle) || a.id - b.id)
        .slice(0, count);

/**
 * What one raider does next, or undefined when it has nothing useful left (no
 * nest standing, none it can walk to, or no square that gets it closer): attack
 * a standing nest its weapon reaches (the weakest, any warband's), otherwise
 * move along its reach to the square closest by walking to the nearest nest,
 * preferring one the nest is in weapon range from. Every action is one `check`
 * accepts, so the command pipeline takes it.
 */
export function raidAction(battle: BattleState, player: string, raider: Fighter): Action | undefined {
    const nests = warbandNests(battle.fighters, battle).filter(isStanding);
    if (nests.length === 0 || raider.ap < 1) return undefined;
    const accepted = (action: Action) => !("refused" in check(battle, player, action));
    for (const nest of [...nests].sort((a, b) => a.hp - b.hp || a.id - b.id)) {
        const attack: Action = { kind: "attack", fighter: raider.id, target: nest.id };
        if (weaponReaches(battle, raider, nest.square) && accepted(attack)) return attack;
    }
    // Walking costs to each nest from the nest itself, round bodies: the way the raider would go were nothing in it.
    const { climb } = moveRules(battle, raider);
    const walks = nests.map(nest => ({ nest, costs: costsFrom(battle.field, [nest.square], { climb }) }));
    const { nest, costs } = walks.reduce((best, walk) => walk.costs[raider.square] < best.costs[raider.square] ? walk : best);
    if (costs[raider.square] === Infinity) return undefined;
    // Closer is in range of the nest first, then fewer steps from it.
    const rank = (square: number) => (weaponReaches(battle, { ...raider, square }, nest.square) ? 0 : 1e6) + costs[square];
    const reach = reachOf(battle, raider);
    let best = raider.square, bestRank = rank(raider.square);
    for (let square = 0; square < reach.costs.length; square++) {
        if (square === raider.square || reach.costs[square] === Infinity || costs[square] >= bestRank) continue;
        const r = rank(square);
        if (r < bestRank) [best, bestRank] = [square, r];
    }
    const path = best === raider.square ? undefined : pathTo(reach, best);
    const move: Action | undefined = path && { kind: "move", fighter: raider.id, path: path.squares };
    return move && accepted(move) ? move : undefined;
}

/**
 * What plays a side: the planner's `nextAction`, and its turn's memo where it
 * has one (`turnMemo` came after the planner, so an older one may not).
 */
export interface Planner {
    nextAction: typeof nextAction;
    turnMemo?: typeof turnMemo;
}

/** A planner other than this checkout's for the team to play, and the name the report gives it: "main @ 4ba0a86". */
export interface TeamPlanner {
    planner: Planner;
    label: string;
}

/** One side's strength at the end of a round. */
export interface RoundCount {
    team: number;
    enemy: number;
    teamHp: number;
}

/** What one battle came to. */
export interface BattleSample {
    /** The scenario's name (`scenarioKey`), and the team's planner after it when it isn't this checkout's. */
    scenario: string;
    /** The team's planner, when it isn't this checkout's (`TeamPlanner`). */
    teamPlanner?: string;
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
    /**
     * Where nests produce the enemy (`nestsProduce`), how the Hold Out came out;
     * absent otherwise, so a version-12 sample is what it always was.
     */
    stars?: HoldOutStar[];
    /** Whether every nest fell (the Brood broke), and the round it did in. */
    broodBroken?: boolean;
    brokeRound?: number;
    /** The Shrine's HP at the end, and its most. */
    shrineHp?: number;
    shrineMax?: number;
    nestsLeft?: number;
    ms: number;
}

/** The name a scenario's samples are grouped under, and the report heads it with. */
export function scenarioKey(s: BalanceScenario): string {
    const seats = s.players === 1 ? "1 player (Solo)" : `${s.players} players`;
    // A Realm team, as every scenario was before the team could choose, is left unsaid.
    const team = s.team === "realm" ? seats : `${seats} as ${factionName(s.team)}`;
    const mission = s.mission === "holdOut" ? `Hold Out (${s.map === "gate" ? "gate fort" : battlefieldById(mapFor(s.players, true, s.map)).name})` : "Hold the Centre";
    const extras = [
        s.difficulty !== "normal" ? DIFFICULTY_NAMES[s.difficulty] : undefined,
        s.size !== "normal" ? `${BATTLE_SIZE_NAMES[s.size]} battle` : undefined,
        s.fog ? "fog" : undefined,
        s.rules !== undefined ? `rules v${s.rules}` : undefined,
        s.rally === "always" ? "rally always" : undefined,
        s.teamPolicy === "planner" ? "team policy planner" : undefined,
        s.teamPolicy !== "planner" && s.raiders !== undefined && s.raiders !== RAIDERS ? `${s.raiders} raiders` : undefined,
        s.temperaments === "off" ? "temperaments off" : undefined,
        s.set && Object.keys(s.set).length > 0 ? `set ${Object.entries(s.set).map(([path, value]) => `${path}=${value}`).join(" ")}` : undefined,
    ].filter(Boolean);
    return `${team} vs ${factionName(s.enemy)} · ${mission}${extras.length ? ` · ${extras.join(", ")}` : ""}`;
}

/** A faction as a scenario's name says it: "Realm", "Swarm", "Miners". */
const factionName = (id: FactionId) => FACTIONS[id].name.replace(/^The /, "");

/** What the host would have chosen to set this battle up. */
export function settingsOf(s: BalanceScenario): RealmArenaSettings {
    return {
        ...(s.team !== "realm" ? { factions: [s.team] } : {}),
        ...(s.fog ? { fog: true } : {}),
        ...(s.size !== "normal" ? { size: s.size } : {}),
        ...(s.rules !== undefined ? { rulesVersion: s.rules } : {}),
        coop: {
            enemy: s.enemy,
            ...(s.mission === "holdOut" ? { mission: "holdOut" as const } : {}),
            ...(s.mission === "holdOut" && s.map !== "gate" ? { map: s.map } : {}),
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
    globalThis.crypto.getRandomValues = seededRandomValues(seed);
}

/** The seats of a team of `players`. */
const seatsFor = (players: number) => Array.from({ length: players }, (_, k) => `p${k + 1}`);

/**
 * One battle of `scenario`, fought to its end with every roll drawn from
 * `seed`: each player's turn is the planner's actions for the team until it
 * has none worth taking, as a warband's is, then End turn — which plays the
 * warband that follows it. The team plays `team`'s planner if given, and this
 * checkout's otherwise; the warbands always play this checkout's.
 */
export async function simulateBattle(scenario: BalanceScenario, seed: number, team?: TeamPlanner): Promise<BattleSample> {
    // The switch is the planner module's, so each worker (or a run in this process) sets its own before it plays.
    temperamentSwitch.on = scenario.temperaments !== "off";
    applyOverrides(scenario);
    const started = performance.now();
    const planner: Planner = team?.planner ?? { nextAction, turnMemo };
    seedRolls(seed);
    const players = seatsFor(scenario.players);
    const game = makeGame(players, {}, settingsOf(scenario));
    await musterAll(game);
    const rounds = battleRoundsOf(game.specificGameState);
    const byRound: RoundCount[] = [];
    const waves: number[] = [];
    const teamFielded = battleOf(game).fighters.filter(fighter => !isWarband(fighter.owner)).length;
    // Where the nests produce the enemy the team raids them, unless asked to leave it to the planner.
    const raiding = scenario.teamPolicy !== "planner" && nestsProduce(scenario.mission, game.specificGameState);

    for (let turn = 0; !game.complete; turn++) {
        if (turn > rounds * players.length * 2 + 10) throw new Error(`${scenarioKey(scenario)}, seed ${seed}: the battle outlasted its turn limit`);
        const player = game.currentTurn;
        const roundBefore = game.specificGameState.roundsPlayed;
        const memo = planner.turnMemo?.();
        // The team makes the rally's choice first, as the board asks it to (§39.4).
        if (owesRally(game.specificGameState, player)) {
            const choice = rallyChoiceFor(battleOf(game), players, player, scenario.rally);
            if (!(await play(game, actBy(player, choice))).outcome.validMove) throw new Error(`${scenarioKey(scenario)}, seed ${seed}: ${player}'s rally choice was refused`);
        }
        const cap = ACTION_POINTS * battleOf(game).fighters.filter(fighter => fighter.owner === player && isStanding(fighter)).length;
        // The raiders (`raidersOf`) of this turn, and those that have nothing left to raid with, which the planner plays from then on.
        const raiders = raiding ? raidersOf(battleOf(game), player, scenario.raiders).map(fighter => fighter.id) : [];
        const released = new Set<number>();
        // A refused raid releases the raider without spending AP, so it may take a step more than the AP would.
        for (let step = 0; step < cap + raiders.length && !game.complete; step++) {
            const battle = battleOf(game);
            const raider = raiders.map(id => fighterById(battle, id)).find(fighter => fighter && !released.has(fighter.id) && isStanding(fighter) && fighter.ap > 0);
            const raid = raider && raidAction(battle, player, raider);
            if (raider && !raid) { released.add(raider.id); continue; }
            let action = raid;
            if (!action) {
                // The raiders still raiding can't act for the planner: it sees them with no AP.
                const view = viewOf(battle, player);
                const held = new Set(raiders.filter(id => !released.has(id)));
                action = planner.nextAction(held.size === 0 ? view : { ...view, fighters: view.fighters.map(fighter => held.has(fighter.id) ? { ...fighter, ap: 0 } : fighter) }, player, game.specificGameState.roundsPlayed + 1, undefined, memo);
            }
            if (!action) break;
            if (!(await play(game, actBy(player, action))).outcome.validMove) {
                if (raid && raider) { released.add(raider.id); continue; }
                break;
            }
        }
        if (game.complete) break;
        const { outcome } = await play(game, endTurnBy(player));
        if (!outcome.validMove) throw new Error(`${scenarioKey(scenario)}, seed ${seed}: ${player}'s End turn was refused`);
        const roundAfter = game.specificGameState.roundsPlayed;
        if (roundAfter > roundBefore) {
            // Counted after the wave that lands as the next round begins, so a
            // round's enemy count includes the characters it brought.
            const fighters = battleOf(game).fighters.filter(isStanding);
            const teamStanding = fighters.filter(fighter => !isWarband(fighter.owner));
            byRound.push({ team: teamStanding.length, enemy: fighters.length - teamStanding.length, teamHp: teamStanding.reduce((sum, fighter) => sum + fighter.hp, 0) });
            if (scenario.mission === "holdOut" && waveArrives(roundAfter + 1, rounds)) waves.push(roundAfter + 1);
        }
    }

    const fighters = battleOf(game).fighters;
    const enemy = fighters.filter(fighter => isWarband(fighter.owner));
    const teamFighters = fighters.filter(fighter => !isWarband(fighter.owner));
    const hold = nestsProduce(scenario.mission, game.specificGameState) ? holdOutRecord(game.specificGameState.stars, fighters, game.endDetail ?? "", game.specificGameState) : {};
    return {
        scenario: scenarioKey(scenario) + (team ? ` · team plays ${team.label}` : ""),
        ...(team ? { teamPlanner: team.label } : {}),
        seed,
        won: game.endReason === "teamwin",
        detail: game.endDetail ?? "",
        endedRound: Math.min(game.specificGameState.roundsPlayed + 1, rounds),
        rounds,
        byRound,
        teamFielded,
        enemyFielded: enemy.length,
        teamDowned: teamFighters.filter(fighter => !isStanding(fighter)).length,
        enemyDowned: enemy.filter(fighter => !isStanding(fighter)).length,
        waves,
        ...hold,
        ms: Math.round(performance.now() - started),
    };
}

/** How a Hold Out against nests that produce the enemy came out, as `BattleSample` keeps it. */
function holdOutRecord(stars: readonly HoldOutStar[] | undefined, fighters: readonly Fighter[], detail: string, context: BattleState | Pick<BattleState, "rulesVersion">) {
    const nests = warbandNests(fighters, context);
    const shrine = shrineOf({ fighters: [...fighters] });
    const nestsLeft = nests.filter(isStanding).length;
    const broodBroken = nests.length > 0 && nestsLeft === 0;
    const brokeRound = /^broke the Brood in round (\d+)/.exec(detail)?.[1];
    return {
        stars: [...stars ?? []],
        broodBroken,
        ...(brokeRound ? { brokeRound: Number(brokeRound) } : {}),
        ...(shrine ? { shrineHp: Math.max(0, shrine.hp), shrineMax: maxHpOf(shrine, context) } : {}),
        nestsLeft,
    };
}

// ─── Statistics ─────────────────────────────────────────────────────────────

/** A share of the battles, and its 95% Wilson interval. */
export interface Rate {
    rate: number;
    low: number;
    high: number;
}

/** What a Hold Out whose nests produce the enemy came to over a scenario's battles (§6, §7). */
export interface HoldOutStats {
    /** The share won with at least one, two and all three stars: the ★ ★★ ★★★ columns of §7's targets. */
    atLeast: [Rate, Rate, Rate];
    /** The share earning each star, by `HOLD_OUT_STARS`. */
    byStar: Record<HoldOutStar, Rate>;
    /** The share of battles whose Brood broke, and the round it broke in, on average and in the middle; undefined with none broken. */
    broken: Rate;
    brokeMean?: number;
    brokeMedian?: number;
    /** The Shrine's HP at the end, on average, and its most. */
    shrineHpMean: number;
    shrineMax: number;
    /** Nests standing at the end, on average. */
    nestsLeftMean: number;
}

export interface ScenarioStats {
    scenario: string;
    /** The team's planner, when it isn't this checkout's. */
    teamPlanner?: string;
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
    /** Only for battles where nests produce the enemy: a version-12 scenario has none, and its report reads as it did. */
    hold?: HoldOutStats;
    msMean: number;
}

const mean = (values: readonly number[]) => values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

/** The value `p` of the way through `values` (0 to 1), nearest rank, as the app takes every percentile (src/utils/performance.ts). */
export function percentile(values: readonly number[], p: number): number {
    return sortedPercentile([...values].sort((a, b) => a - b), p);
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

const rateOf = (count: number, n: number): Rate => ({ rate: count / n, ...(({ low, high }) => ({ low, high }))(wilson(count, n)) });

/** The Hold Out numbers of the samples that carry them; undefined when none does (a version-12 run). */
function holdOutStats(samples: readonly BattleSample[]): HoldOutStats | undefined {
    const held = samples.filter(sample => sample.stars !== undefined);
    if (held.length === 0) return undefined;
    const n = held.length;
    const earned = (star: HoldOutStar) => held.filter(sample => sample.stars!.includes(star)).length;
    const broke = held.filter(sample => sample.brokeRound !== undefined).map(sample => sample.brokeRound!);
    return {
        atLeast: [1, 2, 3].map(count => rateOf(held.filter(sample => sample.won && sample.stars!.length >= count).length, n)) as HoldOutStats["atLeast"],
        byStar: Object.fromEntries(HOLD_OUT_STARS.map(star => [star, rateOf(earned(star), n)])) as Record<HoldOutStar, Rate>,
        broken: rateOf(held.filter(sample => sample.broodBroken).length, n),
        ...(broke.length > 0 ? { brokeMean: mean(broke), brokeMedian: percentile(broke, 0.5) } : {}),
        shrineHpMean: mean(held.map(sample => sample.shrineHp ?? 0)),
        shrineMax: Math.max(...held.map(sample => sample.shrineMax ?? 0)),
        nestsLeftMean: mean(held.map(sample => sample.nestsLeft ?? 0)),
    };
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
    // The round and the difficulty come off each ending, so "the Shrine fell" (lost at the Shrine) stays apart from "overrun" (the team wiped out).
    for (const { detail } of samples) {
        const kind = detail.replace(/ in round \d+/, "").replace(/, on \w+$/, "");
        endings.set(kind, (endings.get(kind) ?? 0) + 1);
    }
    const hold = holdOutStats(samples);
    const teamDowned = mean(samples.map(sample => sample.teamDowned));
    const enemyDowned = mean(samples.map(sample => sample.enemyDowned));
    return {
        scenario: samples[0].scenario,
        ...(samples[0].teamPlanner ? { teamPlanner: samples[0].teamPlanner } : {}),
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
        ...(hold ? { hold } : {}),
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
        ...(stats.some(s => s.teamPlanner)
            ? ["", "Where a scenario says which planner the team plays, the warbands play this checkout's: a change to the planner shows as the warbands' alone."]
            : []),
        "",
        "| Scenario | Battles | Team wins (95% CI) | Ended in round: mean · p10 / median / p90 | Overrun, on average | Team fielded / lost | Enemy fielded / downed | Enemy downed per team loss |",
        "|---|---:|---|---|---:|---|---|---:|",
        ...stats.map(s => `| ${s.scenario} | ${s.battles} | ${pct(s.winRate)} (${pct(s.winLow)}–${pct(s.winHigh)}) | ${one(s.endedMean)} of ${s.rounds} · ${s.endedP10} / ${s.endedMedian} / ${s.endedP90} | ${s.overrunMean === undefined ? "—" : `round ${one(s.overrunMean)}`} | ${one(s.teamFielded)} / ${one(s.teamDowned)} | ${one(s.enemyFielded)} / ${one(s.enemyDowned)} | ${one(s.exchange)} |`),
    ];
    // Only where nests produce the enemy: a version-12 report has no such table.
    const holds = stats.filter(s => s.hold);
    if (holds.length > 0) {
        const named = HOLD_OUT_STARS.map(star => HOLD_OUT_STAR_INFO[star].name);
        const range = ({ rate, low, high }: Rate) => `${pct(rate)} (${pct(low)}–${pct(high)})`;
        lines.push(
            "",
            "Stars, where the nests produce the enemy: ★ is a win, ★★ a win with two stars at least, ★★★ all three.",
            "",
            `| Scenario | ★ | ★★ | ★★★ | ${named.join(" | ")} | Brood broken | Broke in round: mean / median | Shrine HP at the end | Nests left |`,
            `|---|---|---|---|${named.map(() => "---:").join("|")}|---:|---|---|---:|`,
            ...holds.map(s => {
                const h = s.hold!;
                return `| ${s.scenario} | ${h.atLeast.map(range).join(" | ")} | ${HOLD_OUT_STARS.map(star => pct(h.byStar[star].rate)).join(" | ")} | ${pct(h.broken.rate)} | ${h.brokeMean === undefined ? "—" : `${one(h.brokeMean)} / ${h.brokeMedian}`} | ${one(h.shrineHpMean)} of ${h.shrineMax} | ${one(h.nestsLeftMean)} |`;
            }),
        );
    }
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
