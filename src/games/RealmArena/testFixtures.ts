// The command harness Realm Arena's engine tests share (docs/new-game.md,
// "Verification"): a game in memory, the game's own commands, and the same
// pipeline the command route runs them through. No Mongo, no Clerk.
//
// Test-only. Nothing under src/app imports this.
//
// Must not import vitest (directly or through a helper): the balance harness
// (scripts/lib/realmArenaBalance.ts) loads this file under tsx, outside a test
// run, where importing vitest throws. Mock-based helpers live in seedRolls.ts.

import type { IGameCommand } from "@/utils/apiModels/gameCommand";
import { runCommand, type RunCommandResult } from "@/utils/games/commandPipeline";
import { getComputerTurnAdapter, isComputerTurn } from "@/utils/games/computerTurns";
import { gameCommandVersion } from "@/utils/ui/games";
import type { IGameDataDocument } from "@/utils/mongodb/GameData";
import { readyMadeSquad, type CharacterId } from "./characters";
import { battlefieldById } from "./maps";
import { CURRENT_RULESET_VERSION, rulesetOf } from "./rulesets";
import { meta } from "./meta";
import type { MasterySnapshot } from "./mastery";
import { battleOf as battleOfState, budgetOf, owesRally, playableFactions, RealmArenaAct, RealmArenaEndTurn, RealmArenaGameType, RealmArenaMuster, RealmArenaWarbandTurn } from "./RealmArenaLogic";
import { buildInitialRealmArenaState, RealmArenaGameDataModel, type IRealmArenaGameData, type RealmArenaSettings } from "./RealmArenaModels";
import type { IRealmArenaGameDataResponse } from "./apiModels";
import { pathTo } from "@/utils/games/battlefield/pathfinding";
import { distance, type Square } from "@/utils/games/battlefield/terrain";
import { defaultRally, type RallyAction } from "./rally";
import { allied, areaAround, check, isCombatant, isStanding, moveAp, newFighter, nextFighterId, reachOf, readyMadeMuster, warbandOwner, type Action, type BattleState, type Fighter, type MusterPick } from "./rules";

export const PLAYERS = ["a", "b"];

export type RealmArenaTestGame = IRealmArenaGameData & IGameDataDocument;

/**
 * A battle before anyone has mustered, seats in `PLAYERS` order, created with
 * the ranks `mastery` gives (nobody ranked, unless it says), and whatever the
 * host chose in `settings`: fog of war (§27), the battle's size (§30.5) and
 * co-op (§29).
 */
export function makeGame(turnOrder: string[] = PLAYERS, mastery: MasterySnapshot = {}, settings: RealmArenaSettings = {}): RealmArenaTestGame {
    return {
        gameId: "g",
        gameType: new RealmArenaGameType(),
        currentTurn: turnOrder[0],
        userIdList: [...turnOrder],
        turnTimer: "unlimited",
        gameState: { turnOrder: [...turnOrder], history: [], commandHistory: [] },
        // Under the current rules unless a test says otherwise (`rulesVersion`: 6 for the old).
        specificGameState: buildInitialRealmArenaState(turnOrder, mastery, { rulesVersion: CURRENT_RULESET_VERSION, ...settings }),
        complete: false,
        winner: "",
        markModified: () => {},
    } as unknown as RealmArenaTestGame;
}

/**
 * What the server sends `viewer`: the game's own `CreateDataResponse`, on a
 * document built from the game in memory. A test file calling it mocks
 * `@/utils/users/clerk`, which the response names players through.
 */
export async function responseFor(game: RealmArenaTestGame, viewer: string | null) {
    const { markModified: _, ...data } = game;
    return new RealmArenaGameDataModel(structuredClone(data)).CreateDataResponse(viewer) as Promise<IRealmArenaGameDataResponse>;
}

/**
 * A command from `sender`, with `fields` set on it, stamped with the game's
 * current command version as an up-to-date client stamps it
 * (docs/command-versions.md) — so a replay accepts it.
 */
export function cmd<T extends IGameCommand>(Command: new () => T, sender: string, fields: Partial<T> = {}): T {
    return Object.assign(new Command(), { gameId: "g", senderId: sender, senderUsername: sender, version: gameCommandVersion(meta) }, fields);
}

/** Runs a command through the pipeline, as the command route does, and nothing after it. */
export function playOne(game: RealmArenaTestGame, command: IGameCommand) {
    return runCommand(game, game.gameType, command);
}

/**
 * Runs a command through the pipeline, as the command route does, then — as
 * the server does once it's saved (`playComputerTurns`) — every warband turn
 * it handed on to, one command each, until the turn is a player's again or the
 * battle is over (docs/games/realm-arena-hold-out.md §3). The command's own
 * result, with the warbands' after it in `computer`.
 */
export async function play(game: RealmArenaTestGame, command: IGameCommand): Promise<RunCommandResult & { computer: RunCommandResult[] }> {
    const result = await playOne(game, command);
    return { ...result, computer: result.outcome.validMove ? await playComputerTurnsIn(game) : [] };
}

/**
 * The warband turns the game is waiting on, played as the server's runner
 * plays them: one `RealmArenaWarbandTurn` each, until the turn is a player's
 * again or the battle is over. Their results, in order; none if the turn is
 * already a player's.
 */
export async function playComputerTurnsIn(game: RealmArenaTestGame): Promise<RunCommandResult[]> {
    const computer: RunCommandResult[] = [];
    for (let turn = 0; isComputerTurn(game); turn++) {
        if (turn > 50) throw new Error("the warbands never handed the turn back");
        const warband = getComputerTurnAdapter(game.gameType.className)?.buildCommand(game);
        if (!warband) throw new Error(`no warband turn to play for ${game.currentTurn}`);
        warband.version = gameCommandVersion(meta);
        const played = await playOne(game, warband);
        if (!played.outcome.validMove) throw new Error(`${game.currentTurn}'s turn was refused`);
        computer.push(played);
    }
    return computer;
}

export const muster = (sender: string, picks: MusterPick[]) => cmd(RealmArenaMuster, sender, { picks });
export const actBy = (sender: string, action: Action | RallyAction) => cmd(RealmArenaAct, sender, { action });
export const endTurnBy = (sender: string, keepStill: number[] = []) => cmd(RealmArenaEndTurn, sender, { keepStill });
/** A warband's turn from `seat` (`ai:k`) with its actions and rolls scripted, as a replay carries them: `playOne` it once an End turn has handed the turn over. */
export const warbandTurnBy = (seat: string, recordedActions: Action[] = [], recordedRolls?: number[]) =>
    cmd(RealmArenaWarbandTurn, seat, { recordedActions, ...recordedRolls ? { recordedRolls } : {} });

/**
 * Every action the warbands took in a battle, as its command history recorded
 * them: in each `RealmArenaWarbandTurn`, and, in a battle played under an older
 * command version, on the End turns that held their turns.
 */
export function recordedWarbandActions(game: RealmArenaTestGame): Action[] {
    return game.gameState.commandHistory.flatMap(command => {
        if (command.className === "RealmArenaWarbandTurn") return (command as RealmArenaWarbandTurn).recordedActions ?? [];
        const ended = command as RealmArenaEndTurn;
        return [...ended.recordedEnemyActions ?? [], ...(ended.recordedMoreEnemyActions ?? []).flat()];
    });
}

/** The ready-made squad for a seat, where a timed-out muster would put it. */
export function readyMadePicks(game: RealmArenaTestGame, seat: number): MusterPick[] {
    // The battle's first faction, as a muster that names none musters from (B6).
    const squad = readyMadeSquad(rulesetOf(game.specificGameState).FACTIONS[playableFactions(game.specificGameState)[0]], budgetOf(game.specificGameState));
    return readyMadeMuster(battlefieldById(game.specificGameState.map), seat, squad);
}

/** Every player musters their ready-made squad, so the battle begins with seat 0's turn. */
export async function musterAll(game: RealmArenaTestGame): Promise<void> {
    for (const [seat, player] of game.gameState.turnOrder.entries()) {
        const { outcome } = await play(game, muster(player, readyMadePicks(game, seat)));
        if (!outcome.validMove) throw new Error(`${player}'s muster was refused`);
    }
}

export const battleOf = (game: RealmArenaTestGame): BattleState => battleOfState(game.specificGameState);

/**
 * Somewhere for `thrower` to throw a fire flask that lands on nobody but
 * blasts low cover (§22): it's given the flask and stood within throwing range
 * of a square beside some cover, with nobody else in the 3×3 round that
 * square. Returns the square to throw at.
 */
export function blastSpot(game: RealmArenaTestGame, thrower: Fighter): number {
    thrower.item = "fireFlask";
    const battle = battleOf(game);
    const { field } = battle;
    const clear = (square: number) => battle.fighters.every(one => one.id === thrower.id || distance(field, one.square, square) >= 2);
    for (let aim = 0; aim < field.tiles.length; aim++) {
        if (!field.tiles[aim].terrain.standable || !clear(aim) || !areaAround(field, aim).some(square => field.tiles[square].terrain.destructible)) continue;
        for (const spot of areaAround(field, aim).flatMap(square => areaAround(field, square))) {
            if (!field.tiles[spot].terrain.standable || areaAround(field, aim).includes(spot) || !clear(spot)) continue;
            const placed = { ...battle, fighters: battle.fighters.map(one => one.id === thrower.id ? { ...one, square: spot } : one) };
            if ("refused" in check(placed, thrower.owner, { kind: "throw", fighter: thrower.id, at: aim })) continue;
            thrower.square = spot;
            return aim;
        }
    }
    throw new Error("nowhere to blast");
}

/** A move (or a sneak) by `fighter` to the first square it can stop on for the fewest AP. */
export function oneStep(game: RealmArenaTestGame, fighter: Fighter, kind: "move" | "sneak" = "move"): Action {
    const reach = reachOf(battleOf(game), fighter, kind === "sneak");
    let best: number | undefined;
    for (let square = 0; square < reach.costs.length; square++) {
        const cost = reach.costs[square];
        if (cost > 0 && cost !== Infinity && (best === undefined || cost < reach.costs[best])) best = square;
    }
    if (best === undefined || moveAp(fighter, reach.costs[best], kind === "sneak") > fighter.ap) {
        throw new Error(`${fighter.character} has nowhere to go`);
    }
    return { kind, fighter: fighter.id, path: pathTo(reach, best)!.squares };
}

/** The enemy nearest a fighter, or undefined when none is standing. */
function nearestEnemy(game: RealmArenaTestGame, fighter: Fighter): Fighter | undefined {
    const battle = battleOf(game);
    return battle.fighters
        // A nest (§39.7) is attacked when it's reached, never walked to.
        .filter(one => !allied(battle, one.owner, fighter.owner) && isCombatant(one, battle))
        .sort((x, y) => distance(battle.field, fighter.square, x.square) - distance(battle.field, fighter.square, y.square))[0];
}

/**
 * One action for a fighter, by a simple script: attack whoever it can, and
 * otherwise close on the nearest enemy as far as its AP take it.
 */
export function scriptedAction(game: RealmArenaTestGame, fighter: Fighter): Action | undefined {
    const battle = battleOf(game);
    for (const enemy of battle.fighters.filter(one => !allied(battle, one.owner, fighter.owner) && isStanding(one))) {
        const attack: Action = { kind: "attack", fighter: fighter.id, target: enemy.id };
        if (!("refused" in check(battle, fighter.owner, attack))) return attack;
    }
    const target = nearestEnemy(game, fighter);
    if (!target || fighter.ap < 1) return undefined;
    const reach = reachOf(battle, fighter);
    const gap = (square: number) => distance(battle.field, square, target.square);
    let best: number | undefined;
    for (let square = 0; square < reach.costs.length; square++) {
        const cost = reach.costs[square];
        if (cost === Infinity || moveAp(fighter, cost) > fighter.ap) continue;
        if (best === undefined || gap(square) < gap(best) || (gap(square) === gap(best) && cost < reach.costs[best])) best = square;
    }
    if (best === undefined || gap(best) >= gap(fighter.square)) return undefined;
    return { kind: "move", fighter: fighter.id, path: pathTo(reach, best)!.squares };
}

/** One battle turn by the script: every action it can find, then End turn. */
export async function playScriptedTurn(game: RealmArenaTestGame): Promise<void> {
    const player = game.currentTurn;
    // A rally owed (§39.4, rules version 12) is chosen first, by default.
    if (owesRally(game.specificGameState, player)) {
        const choice = defaultRally(battleOf(game), game.specificGameState.seats, player);
        if (!(await play(game, actBy(player, choice))).outcome.validMove) throw new Error(`${player}'s rally was refused`);
    }
    for (let step = 0; step < 40 && !game.complete; step++) {
        const action = battleOf(game).fighters
            .filter(one => one.owner === player && isStanding(one))
            .map(one => scriptedAction(game, one))
            .find(Boolean);
        if (!action) break;
        if (!(await play(game, actBy(player, action))).outcome.validMove) throw new Error(`${player}'s ${action.kind} was refused`);
    }
    if (!game.complete && !(await play(game, endTurnBy(player))).outcome.validMove) throw new Error(`${player}'s End turn was refused`);
}

/**
 * A battle fought from the muster to its end by the scripted squads, with
 * whatever the host chose in `settings` — in co-op, the scripted squads as the
 * team against the computer's warbands (§29).
 */
export async function playScriptedBattle(settings: RealmArenaSettings = {}, players: string[] = PLAYERS): Promise<RealmArenaTestGame> {
    const game = makeGame(players, undefined, settings);
    await musterAll(game);
    for (let turn = 0; !game.complete; turn++) {
        if (turn > 100) throw new Error("the battle outlasted its turn limit");
        await playScriptedTurn(game);
    }
    return game;
}

/** The teams the co-op tests field on every battlefield: two players, and three. */
export const TEAMS = [["a", "b"], ["a", "b", "c"]];

/** A team of four, which only Hold Out on a battlefield of its own seats (§37): the Sacked Fort or the Sunken Village. */
export const FOUR_TEAM = ["a", "b", "c", "d"];

/** Adds a fighter of any character to the battle at full AP, and returns it: the state is shared, so a later `battleOf` sees it. */
export function addFighter(game: RealmArenaTestGame, owner: string, character: CharacterId, square: Square): Fighter {
    const gs = game.specificGameState;
    const fighter = { ...newFighter(nextFighterId(gs.fighters), owner, character, square, null, undefined, undefined, false, gs), ap: 4 };
    gs.fighters.push(fighter);
    return fighter;
}

/** The warbands of a co-op battle, by owner. */
export const warbandsOf = (game: RealmArenaTestGame) => game.gameState.turnOrder.map((_, k) => warbandOwner(k));

/**
 * A co-op battle fought to its end, the team played by the fixtures' script,
 * timing each player's turn — the warband's turn that follows is nearly all
 * of it.
 */
export async function coopBattle(players: string[], settings: RealmArenaSettings): Promise<{ game: RealmArenaTestGame; times: number[] }> {
    const game = makeGame(players, {}, settings);
    await musterAll(game);
    const times: number[] = [];
    for (let turn = 0; !game.complete; turn++) {
        if (turn > 100) throw new Error("the battle outlasted its turn limit");
        const start = performance.now();
        await playScriptedTurn(game);
        times.push(performance.now() - start);
    }
    return { game, times };
}

/**
 * A `crypto.getRandomValues` that fills every array from `seed` (mulberry32),
 * so a battle plays the same each run; the sequence carries on across calls.
 * Pure: `seedRolls.ts` (vitest) and the balance harness install it.
 */
export function seededRandomValues(seed: number): Crypto["getRandomValues"] {
    let state = seed >>> 0;
    return (<T extends ArrayBufferView | null>(array: T): T => {
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
