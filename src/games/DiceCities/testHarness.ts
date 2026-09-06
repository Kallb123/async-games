// Shared fixtures for the Dice Cities test suites.
//
// Deliberately not a `.test.ts`: vitest collects `src/**/*.test.ts`, so this
// sits beside the suites without being run as one, and importing it does not
// re-execute anybody's `describe` blocks.
//
// It exists because both DiceCitiesLogic.test.ts and recap.test.ts have to
// hand the replay engine a whole game - a `commandHistory` of real command
// instances plus the twelve-field IGameData wrapper around it - and there is
// only one shape of either. Kept to what a replayed game needs; a test that
// wants a hand-built mid-game state still writes its own, since there is no
// one shape of that.

import {
    DiceCitiesGameType,
    DiceCitiesRequestCardPurchase,
    DiceCitiesRequestDiceRoll,
    DiceCitiesRequestHarbourBonus,
    DiceCitiesRequestPassTurn,
} from "./DiceCitiesLogic";
import { DiceCitiesCardIds, STARTING_PLAYER_COINS } from "./cards";
import { buildInitialDiceCitiesState } from "./DiceCitiesModels";
import type { IDiceCitiesGameState } from "./DiceCitiesModels";
import type { IGameCommand } from "@/utils/apiModels/GameLogic";
import type { IGameData } from "@/utils/mongodb/GameData";

/** The two seats every fixture here plays with. */
export const PLAYERS = ["u1", "u2"];

/** A roll with its dice pre-recorded, so payouts are deterministic. Passing a
 *  second die rolls two, which the Docks' higher numbers need. */
export function rollCommand(roll1: number, sender = "u1", roll2?: number): DiceCitiesRequestDiceRoll {
    const command = new DiceCitiesRequestDiceRoll();
    command.senderId = sender;
    command.senderUsername = sender;
    command.recordedRoll1 = roll1;
    if (roll2 !== undefined) {
        command.doubleDice = true;
        command.recordedRoll2 = roll2;
    }
    return command;
}

/** Answers the Harbour's offer on a parked roll, with the shared tuna die
 *  pre-recorded so a Tuna Boat payout is deterministic too. */
export function harbourCommand(addBonus: boolean, tunaRoll?: number, sender = "u1"): DiceCitiesRequestHarbourBonus {
    const command = new DiceCitiesRequestHarbourBonus();
    command.senderId = sender;
    command.senderUsername = sender;
    command.addBonus = addBonus;
    command.recordedTunaRoll = tunaRoll ?? null;
    return command;
}

export function passCommand(sender = "u1"): DiceCitiesRequestPassTurn {
    const command = new DiceCitiesRequestPassTurn();
    command.senderId = sender;
    command.senderUsername = sender;
    return command;
}

export function buyCommand(cardId: DiceCitiesCardIds, sender = "u1"): DiceCitiesRequestCardPurchase {
    const command = new DiceCitiesRequestCardPurchase();
    command.senderId = sender;
    command.senderUsername = sender;
    command.cardId = cardId;
    return command;
}

/** Stamps a sender onto a command that carries no other state - the landmark
 *  unlocks, whose whole payload is who sent them. */
export function sentBy<T extends { senderId: string; senderUsername: string }>(command: T, sender = "u1"): T {
    command.senderId = sender;
    command.senderUsername = sender;
    return command;
}

/**
 * Rolls of 1 until `saver` can afford `coins`, alternating turns.
 *
 * Both players open on 3 coins holding a Wheat Field, which pays every owner a
 * coin on any roll of 1 whoever rolled it. So a run of 1s is the shortest
 * honest way to get a player to a card's price - and it has to be honest,
 * because the replay rebuilds the opening and deals the cards itself: a card
 * nobody bought in the command log is a card nobody owns.
 */
export function saveUpTo(coins: number, saver: string, other: string): IGameCommand[] {
    const commands: IGameCommand[] = [];
    for (let money = STARTING_PLAYER_COINS, turn = 0; money < coins; money++, turn++) {
        const sender = turn % 2 === 0 ? saver : other;
        commands.push(rollCommand(1, sender), passCommand(sender));
    }
    return commands;
}

/**
 * A game the replay engine can rebuild: the command log plus the wrapper the
 * engine reads it through. `specificGameState` is what the game was *played*
 * with - the replay adapter reads the Docks flag, the bank total and the theme
 * off it to restock the same market - so it is the one field worth varying.
 */
export function replayableGame(
    commandHistory: IGameCommand[],
    specificGameState: IDiceCitiesGameState = buildInitialDiceCitiesState(PLAYERS),
    currentTurn = "u1",
): IGameData {
    return {
        gameId: "g1",
        gameType: new DiceCitiesGameType(),
        userIdList: PLAYERS,
        turnTimer: "1d",
        currentTurn,
        lastTurnTimestamp: "2026-07-21T09:00:00.000Z",
        timerWarningNotificationSent: false,
        gameState: { turnOrder: PLAYERS, history: [], commandHistory },
        complete: false,
        winner: "",
        enabledBillionaireRow: false,
        specificGameState,
    } as unknown as IGameData;
}
