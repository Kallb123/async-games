import type { IGameData } from "../mongodb/GameData";
import { markDirty } from "./markDirty";
import type { uuidString } from "../apiModels/GameDataApi";
import type { ICommandOutcome, IGameCommand } from "../apiModels/gameCommand";
import { serializable } from "../apiModels/Serialisable";
import { createAdapterRegistry } from "./adapterRegistry";
import { playerHistory } from "./history";
import { MAX_CONSECUTIVE_MISSED_TURNS } from "./TurnTimer";
import { v4 as uuidv4, NIL as NIL_UUID } from 'uuid';

// A player who misses MAX_CONSECUTIVE_MISSED_TURNS in a row used to end the
// game for everybody (the turn-timer cron's abandon path). That is still the
// answer for a game that can't carry on without its full roster — a two-seat
// duel, a solo game — but a four-player race shouldn't end for three people
// because the fourth stopped turning up. A game that can carry on without a
// seat registers a dropout adapter below, and the cron drops the absent
// player instead: they leave the running order, their pieces stop counting,
// and everyone else plays on.
//
// The seat is never taken out of `gameState.turnOrder`. That is the seat
// order — colours, the roster, the replay engine's initial state are all
// keyed on it — so a dropped player is *added* to `gameState.droppedPlayers`
// instead, and every game that registers an adapter walks its rotation with
// `nextActivePlayer`, which steps over them.
//
// The drop is a command (`PlayerDropped`) run through the ordinary pipeline,
// not a direct edit: it lands on `commandHistory`, so the recap and match
// review replay it at the moment it happened rather than showing a seat
// vanish from a state the commands can't account for. It is server-only —
// no game lists it in gameCommands.ts, so a client can't send it.

export interface IPlayerDropoutAdapter {
    className: string; // gameType.className
    /**
     * The fewest seats that must still be playing once this one is gone for
     * the game to carry on. Below it, the cron abandons the game as before.
     * Two for a competitive game (a one-player race has nobody to beat); a
     * co-op table whose rules hand a missing player's pieces to the others
     * may go lower.
     */
    minPlayers: number;
    /**
     * Whether `userId` can be dropped from the game as it stands right now —
     * a game may refuse a phase it can't reshape (Settlements & Cities' setup
     * draft). Absent means always.
     */
    canDrop?(gameData: IGameData, userId: string): boolean;
    /**
     * Takes the seat out of the game's own state: whatever the game needs so
     * the absent player's pieces stop acting, scoring or being targeted.
     * Runs inside `PlayerDropped.Execute`, after `userId` has been added to
     * `droppedPlayers` and while somebody else holds the turn.
     */
    dropPlayer(gameData: IGameData, userId: string): void;
}

const adapters = createAdapterRegistry<IPlayerDropoutAdapter>();
export function registerPlayerDropoutAdapter(adapter: IPlayerDropoutAdapter) {
    adapters.register(adapter);
}
export function getPlayerDropoutAdapter(className: string): IPlayerDropoutAdapter | undefined {
    return adapters.get(className);
}

/** The players dropped from this game, in the order they went. */
export function droppedPlayersOf(gameData: Pick<IGameData, 'gameState'>): string[] {
    return gameData.gameState.droppedPlayers ?? [];
}

export function isDropped(gameData: Pick<IGameData, 'gameState'>, userId: string): boolean {
    return droppedPlayersOf(gameData).includes(userId);
}

/** The seats still playing, in seat order. */
export function activeTurnOrder(gameData: Pick<IGameData, 'gameState'>): string[] {
    const dropped = droppedPlayersOf(gameData);
    return gameData.gameState.turnOrder.filter(userId => !dropped.includes(userId));
}

/**
 * The seat after `userId` round the table, stepping over anybody dropped. The
 * plain `turnOrder[(i + 1) % length]` walk every game used, for a table that
 * may have lost a seat. `userId` itself may be dropped (the cron advancing
 * past a player it is about to drop): the walk still starts from their seat.
 */
export function nextActivePlayer(gameData: Pick<IGameData, 'gameState'>, userId: string): string {
    const order = gameData.gameState.turnOrder;
    const dropped = droppedPlayersOf(gameData);
    const start = order.indexOf(userId);
    for (let step = 1; step <= order.length; step++) {
        const candidate = order[(start + step + order.length) % order.length];
        if (!dropped.includes(candidate)) return candidate;
    }
    return userId;
}

/**
 * Whether `userId` can be dropped from this game rather than it being
 * abandoned: the game registers an adapter, the player is still seated, the
 * adapter is happy with the phase, and enough players are left without them.
 *
 * Deliberately silent on whose turn it is. The cron asks this before playing
 * out the missing player's last turn, when it is still theirs; and a replay
 * (buildTimeline) hands every command the turn of its own sender before
 * running it, so `PlayerDropped` arrives there holding the dropped player's.
 */
export function canDropPlayer(gameData: IGameData, userId: string): boolean {
    const adapter = getPlayerDropoutAdapter(gameData.gameType.className);
    if (!adapter) return false;
    if (!gameData.gameState.turnOrder.includes(userId) || isDropped(gameData, userId)) return false;
    if (activeTurnOrder(gameData).length - 1 < adapter.minPlayers) return false;
    return adapter.canDrop?.(gameData, userId) ?? true;
}

/**
 * The server's own command for "this player has gone quiet and the game is
 * carrying on without them". `senderId` is the dropped player. Never sent by
 * a client: see the note at the top of this file.
 */
@serializable
export class PlayerDropped implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = (new Date()).toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = "Unknown";
    senderUsername: string = "Unknown";
    readonly className = "PlayerDropped";
    version?: number;
    /**
     * Who held the turn when the player was dropped — somebody else by then,
     * since the cron plays out their last turn first. Only a replay needs it:
     * buildTimeline gives every command its sender's turn before running it,
     * and this puts the turn back where it really was for the snapshot.
     */
    resumesWith: string = "";

    myString() {
        return `was removed after missing ${MAX_CONSECUTIVE_MISSED_TURNS} turns in a row`;
    }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        // Rechecked here rather than trusted from the caller, because a replay
        // runs this too, and because a drop the game can't absorb must refuse
        // rather than half-apply.
        if (!canDropPlayer(gameData, this.senderId)) {
            return { validMove: false, turnOver: false };
        }
        const adapter = getPlayerDropoutAdapter(gameData.gameType.className)!;

        gameData.gameState.droppedPlayers = [...droppedPlayersOf(gameData), this.senderId];
        adapter.dropPlayer(gameData, this.senderId);
        // Every adapter edits specificGameState in place, often deep inside a
        // Map; a replay's plain object has no markModified to call.
        markDirty(gameData);
        gameData.gameState.history.unshift(playerHistory(this.senderId,
            `missed ${MAX_CONSECUTIVE_MISSED_TURNS} turns in a row and has left the game — play carries on without them`));

        // Nobody's turn changes hands: the cron only drops a player once their
        // last turn has passed to somebody else, and restarts that player's
        // timer itself. A replay arrives holding the dropped player's turn
        // (see resumesWith), and is handed back the real one.
        if (gameData.currentTurn === this.senderId && this.resumesWith) {
            gameData.currentTurn = this.resumesWith;
        }
        return { validMove: true, turnOver: false };
    }
}
