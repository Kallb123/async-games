// The command harness Realm Arena's engine tests share (docs/new-game.md,
// "Verification"): a game in memory, the game's own commands, and the same
// pipeline the command route runs them through. No Mongo, no Clerk.
//
// Test-only. Nothing under src/app imports this.

import type { IGameCommand } from "@/utils/apiModels/gameCommand";
import { runCommand } from "@/utils/games/commandPipeline";
import type { IGameDataDocument } from "@/utils/mongodb/GameData";
import { REALM } from "./characters";
import { battlefieldById } from "./maps";
import { RealmArenaAct, RealmArenaEndTurn, RealmArenaGameType, RealmArenaMuster } from "./RealmArenaLogic";
import { buildInitialRealmArenaState, type IRealmArenaGameData } from "./RealmArenaModels";
import { readyMadeMuster, type Action, type BattleState, type MusterPick } from "./rules";

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
    return readyMadeMuster(battlefieldById(game.specificGameState.map), seat, REALM.readyMade[2]);
}

/** Both players muster their ready-made squads, so the battle begins with seat 0's turn. */
export async function musterBoth(game: RealmArenaTestGame): Promise<void> {
    for (const [seat, player] of game.gameState.turnOrder.entries()) {
        const { outcome } = await play(game, muster(player, readyMadePicks(game, seat)));
        if (!outcome.validMove) throw new Error(`${player}'s muster was refused`);
    }
}

export function battleOf(game: RealmArenaTestGame): BattleState {
    return { field: battlefieldById(game.specificGameState.map), fighters: game.specificGameState.fighters };
}
