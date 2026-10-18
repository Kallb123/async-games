// The command harness Realm Arena's engine tests share (docs/new-game.md,
// "Verification"): a game in memory, the game's own commands, and the same
// pipeline the command route runs them through. No Mongo, no Clerk.
//
// Test-only. Nothing under src/app imports this.

import { vi } from "vitest";
import type { IGameCommand } from "@/utils/apiModels/gameCommand";
import { runCommand } from "@/utils/games/commandPipeline";
import { gameCommandVersion } from "@/utils/ui/games";
import type { IGameDataDocument } from "@/utils/mongodb/GameData";
import { readyMadeSquad } from "./characters";
import { battlefieldById } from "./maps";
import { CURRENT_RULESET_VERSION, rulesetOf } from "./rulesets";
import { meta } from "./meta";
import type { MasterySnapshot } from "./mastery";
import { battleOf as battleOfState, budgetOf, playableFactions, RealmArenaAct, RealmArenaEndTurn, RealmArenaGameType, RealmArenaMuster } from "./RealmArenaLogic";
import { buildInitialRealmArenaState, RealmArenaGameDataModel, type IRealmArenaGameData, type RealmArenaSettings } from "./RealmArenaModels";
import type { IRealmArenaGameDataResponse } from "./apiModels";
import { pathTo } from "@/utils/games/battlefield/pathfinding";
import { distance } from "@/utils/games/battlefield/terrain";
import { allied, areaAround, check, isStanding, moveAp, reachOf, readyMadeMuster, warbandOwner, type Action, type BattleState, type Fighter, type MusterPick } from "./rules";

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

/** Runs a command through the pipeline, as the command route does. */
export function play(game: RealmArenaTestGame, command: IGameCommand) {
    return runCommand(game, game.gameType, command);
}

export const muster = (sender: string, picks: MusterPick[]) => cmd(RealmArenaMuster, sender, { picks });
export const actBy = (sender: string, action: Action) => cmd(RealmArenaAct, sender, { action });
export const endTurnBy = (sender: string, keepStill: number[] = []) => cmd(RealmArenaEndTurn, sender, { keepStill });

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
        .filter(one => !allied(battle, one.owner, fighter.owner) && isStanding(one))
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

/** The teams the co-op tests field: two players, and three. */
export const TEAMS = [["a", "b"], ["a", "b", "c"]];

/** Every roll from here on drawn from a seed, so a battle plays the same each run (mulberry32). */
export function seedRolls(seed: number): void {
    let state = seed >>> 0;
    vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(<T extends ArrayBufferView | null>(array: T): T => {
        const values = array as unknown as Uint32Array;
        for (let i = 0; i < values.length; i++) {
            state = (state + 0x6d2b79f5) >>> 0;
            let t = state;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            values[i] = (t ^ (t >>> 14)) >>> 0;
        }
        return array;
    });
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
