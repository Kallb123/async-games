import type { ISnakesAndLaddersGameData } from "@/games/SnakesAndLadders/SnakesAndLaddersModels";
import type { IGameData } from "../../mongodb/GameData";
import type { uuidString } from "../GameDataApi";
import type { ICommandOutcome, IGameCommand, IGameType } from "../gameCommand";
import { serializable } from "../Serialisable";
import { DiceRoll } from "../../games/DiceRoll";
import { v4 as uuidv4, NIL as NIL_UUID } from 'uuid';

export const SNAKES_AND_LADDERS_LADDERS: Record<number, number> = {
    4: 14,
    9: 31,
    20: 38,
    28: 84,
    40: 59,
    51: 67,
    63: 81,
    71: 91
};

export const SNAKES_AND_LADDERS_SNAKES: Record<number, number> = {
    17: 7,
    54: 34,
    62: 19,
    64: 60,
    87: 24,
    93: 73,
    95: 75,
    99: 78
};

export interface ISnakesAndLaddersDiceRollOutcome extends ICommandOutcome {
    roll: number,
    newPosition: number,
    landedOnSnake: boolean,
    landedOnLadder: boolean
}

@serializable
export class SnakesAndLaddersGameType implements IGameType {
    gameId: uuidString = uuidv4() as uuidString;
    gameType: string = "SnakesAndLadders";
    friendlyName: string = "Snakes and Ladders";
    icon: string = "";
    url: string = "snakesandladders";
    readonly className: string = "SnakesAndLaddersGameType";

    CheckEndTurn(gameData: IGameData, commandOutcome: ICommandOutcome) {
        if (commandOutcome.turnOver) {
            const slGameData = gameData as ISnakesAndLaddersGameData;
            if (slGameData.specificGameState) {
                slGameData.specificGameState.hasRolled = false;
            }
            const currentIndex = gameData.gameState.turnOrder.findIndex(to => to === gameData.currentTurn);
            const nextTurn = gameData.gameState.turnOrder[(currentIndex + 1) % gameData.gameState.turnOrder.length];
            gameData.currentTurn = nextTurn;
        }
    }

    CheckGameOver(gameData: IGameData) {
        const slGameData = gameData as ISnakesAndLaddersGameData;
        for (const [userId, playerState] of slGameData.specificGameState.playerPositions) {
            if (playerState.position >= 100) {
                slGameData.complete = true;
                slGameData.winner = userId;
                slGameData.currentTurn = "";
                return true;
            }
        }
        return false;
    }
}

@serializable
export class SnakesAndLaddersRequestDiceRoll implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = (new Date()).toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = "Unknown";
    senderUsername: string = "Unknown";
    readonly className = "SnakesAndLaddersRequestDiceRoll";
    // Recorded RNG outcome. Left unset until the first time Execute runs, then
    // populated so the command can be deterministically replayed (turn recap /
    // planning). Persisted as part of gameState.commandHistory.
    recordedRoll?: number;

    myString() {
        return `SnakesAndLadders DiceRoll!`;
    }

    async Execute(gameData: IGameData) {
        const slGameData = gameData as ISnakesAndLaddersGameData;

        if (slGameData.specificGameState.hasRolled) {
            return {
                turnOver: false,
                validMove: false,
                roll: 0,
                newPosition: 0,
                landedOnSnake: false,
                landedOnLadder: false
            };
        }

        const playerState = slGameData.specificGameState.playerPositions.get(slGameData.currentTurn);
        if (!playerState) {
            return {
                turnOver: false,
                validMove: false,
                roll: 0,
                newPosition: 0,
                landedOnSnake: false,
                landedOnLadder: false
            };
        }

        // Reuse a previously recorded roll when replaying; otherwise roll fresh
        // and record it so future replays are deterministic.
        const roll = this.recordedRoll ?? DiceRoll(6);
        this.recordedRoll = roll;
        const rawPosition = playerState.position + roll;

        let newPosition = playerState.position;
        let landedOnSnake = false;
        let landedOnLadder = false;

        if (rawPosition <= 100) {
            newPosition = rawPosition;

            if (SNAKES_AND_LADDERS_SNAKES[newPosition] !== undefined) {
                landedOnSnake = true;
                newPosition = SNAKES_AND_LADDERS_SNAKES[newPosition];
            } else if (SNAKES_AND_LADDERS_LADDERS[newPosition] !== undefined) {
                landedOnLadder = true;
                newPosition = SNAKES_AND_LADDERS_LADDERS[newPosition];
            }
        }

        playerState.position = newPosition;
        slGameData.specificGameState.hasRolled = true;

        const senderUsername = this.senderUsername;
        if (landedOnSnake) {
            slGameData.gameState.history.unshift(`${senderUsername} rolled a ${roll} and slid down a snake to square ${newPosition}`);
        } else if (landedOnLadder) {
            slGameData.gameState.history.unshift(`${senderUsername} rolled a ${roll} and climbed a ladder to square ${newPosition}`);
        } else if (rawPosition > 100) {
            slGameData.gameState.history.unshift(`${senderUsername} rolled a ${roll} but needs exactly ${100 - playerState.position} to win – no move`);
        } else {
            slGameData.gameState.history.unshift(`${senderUsername} rolled a ${roll} and moved to square ${newPosition}`);
        }

        const outcome: ISnakesAndLaddersDiceRollOutcome = {
            turnOver: true,
            validMove: true,
            roll,
            newPosition,
            landedOnSnake,
            landedOnLadder
        };
        return outcome;
    }

    Undo(gameData: IGameData) {
        console.error("Command Undo not implemented yet");
    }
}
