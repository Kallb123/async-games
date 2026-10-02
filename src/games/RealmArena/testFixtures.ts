// The command harness Realm Arena's engine tests share (docs/new-game.md,
// "Verification"): a game in memory, the game's own commands, and the same
// pipeline the command route runs them through. No Mongo, no Clerk.
//
// Test-only. Nothing under src/app imports this.

import type { IGameCommand } from "@/utils/apiModels/gameCommand";
import { runCommand } from "@/utils/games/commandPipeline";
import type { IGameDataDocument } from "@/utils/mongodb/GameData";
import { REALM, type PlayerCount } from "./characters";
import { battlefieldById } from "./maps";
import { battleOf as battleOfState, RealmArenaAct, RealmArenaEndTurn, RealmArenaGameType, RealmArenaMuster } from "./RealmArenaLogic";
import { buildInitialRealmArenaState, type IRealmArenaGameData } from "./RealmArenaModels";
import { pathTo } from "@/utils/games/battlefield/pathfinding";
import { distance } from "@/utils/games/battlefield/terrain";
import { check, isStanding, moveAp, reachOf, readyMadeMuster, type Action, type BattleState, type Fighter, type MusterPick } from "./rules";

export const PLAYERS = ["a", "b"];

export type RealmArenaTestGame = IRealmArenaGameData & IGameDataDocument;

/** A battle before anyone has mustered, seats in `PLAYERS` order. */
export function makeGame(turnOrder: string[] = PLAYERS): RealmArenaTestGame {
    return {
        gameId: "g",
        gameType: new RealmArenaGameType(),
        currentTurn: turnOrder[0],
        userIdList: [...turnOrder],
        turnTimer: "unlimited",
        gameState: { turnOrder: [...turnOrder], history: [], commandHistory: [] },
        specificGameState: buildInitialRealmArenaState(turnOrder),
        complete: false,
        winner: "",
        markModified: () => {},
    } as unknown as RealmArenaTestGame;
}

/** A command from `sender`, with `fields` set on it. */
export function cmd<T extends IGameCommand>(Command: new () => T, sender: string, fields: Partial<T> = {}): T {
    return Object.assign(new Command(), { gameId: "g", senderId: sender, senderUsername: sender }, fields);
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
    const squad = REALM.readyMade[game.gameState.turnOrder.length as PlayerCount];
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

/** The enemy nearest a fighter, or undefined when none is standing. */
function nearestEnemy(game: RealmArenaTestGame, fighter: Fighter): Fighter | undefined {
    const { field, fighters } = battleOf(game);
    return fighters
        .filter(one => one.owner !== fighter.owner && isStanding(one))
        .sort((x, y) => distance(field, fighter.square, x.square) - distance(field, fighter.square, y.square))[0];
}

/**
 * One action for a fighter, by a simple script: attack whoever it can, and
 * otherwise close on the nearest enemy as far as its AP take it.
 */
export function scriptedAction(game: RealmArenaTestGame, fighter: Fighter): Action | undefined {
    const battle = battleOf(game);
    for (const enemy of battle.fighters.filter(one => one.owner !== fighter.owner && isStanding(one))) {
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
