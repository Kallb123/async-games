import type { ISmartthinkGameData } from "@/games/Smartthink/SmartthinkModels";
import type { IGameData } from "../../mongodb/GameData";
import type { uuidString } from "../GameDataApi";
import type { ICommandOutcome, IGameCommand, IGameType } from "../gameCommand";
import { serializable } from "../Serialisable";
import { v4 as uuidv4, NIL as NIL_UUID } from 'uuid';

export interface ISmartthinkGuessOutcome extends ICommandOutcome {
    black: number,
    white: number
}

@serializable
export class SmartthinkGameType implements IGameType {
    gameId: uuidString = uuidv4() as uuidString;
    gameType: string = "Smartthink";
    friendlyName: string = "Smartthink";
    icon: string = "";
    url: string = "smartthink";
    readonly className: string = "SmartthinkGameType";

    CheckEndTurn(gameData: IGameData, commandOutcome: ICommandOutcome) {
        if (commandOutcome.turnOver) {
            const stGameData = gameData as ISmartthinkGameData;
            // Setting the secret code hands the turn to the codebreaker. From then on
            // the codebreaker keeps guessing every turn until the game ends, so the turn
            // never returns to the codemaker (feedback is calculated automatically).
            if (stGameData.specificGameState.secretCodeSet) {
                gameData.currentTurn = stGameData.specificGameState.codeBreakerId;
                return;
            }
            const currentIndex = gameData.gameState.turnOrder.findIndex(to => to === gameData.currentTurn);
            const nextTurn = gameData.gameState.turnOrder[(currentIndex + 1) % gameData.gameState.turnOrder.length];
            gameData.currentTurn = nextTurn;
        }
    }

    CheckGameOver(gameData: IGameData) {
        const stGameData = gameData as ISmartthinkGameData;
        if (stGameData.specificGameState.guessRows.some(row => row.black === 4)) {
            stGameData.complete = true;
            stGameData.winner = stGameData.specificGameState.codeBreakerId;
            stGameData.currentTurn = "";
            return true;
        }
        if (stGameData.specificGameState.guessRows.length >= stGameData.specificGameState.maxGuesses) {
            stGameData.complete = true;
            stGameData.winner = stGameData.specificGameState.codeSetterId;
            stGameData.currentTurn = "";
            return true;
        }
        return false;
    }
}

@serializable
export class SmartthinkSetSecretCode implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = (new Date()).toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = "Unknown";
    senderUsername: string = "Unknown";
    secretCode: number[] = [0, 0, 0, 0];
    readonly className = "SmartthinkSetSecretCode";

    myString() {
        return `Smartthink SetSecretCode: ${this.secretCode.join(',')}`;
    }

    async Execute(gameData: IGameData) {
        const stGameData = gameData as ISmartthinkGameData;
        if (stGameData.specificGameState.secretCodeSet) {
            return { turnOver: false, validMove: false };
        }
        if (this.senderId !== stGameData.specificGameState.codeSetterId) {
            return { turnOver: false, validMove: false };
        }
        if (this.secretCode.length !== 4 || this.secretCode.some(value => value < 0 || value > 5)) {
            return { turnOver: false, validMove: false };
        }
        stGameData.specificGameState.secretCode = this.secretCode;
        stGameData.specificGameState.secretCodeSet = true;
        stGameData.gameState.history.unshift(`${this.senderUsername} set the secret code`);
        return { turnOver: true, validMove: true };
    }

    Undo(gameData: IGameData) {
        console.error("Command Undo not implemented yet");
    }
}

function calculateSmartthinkFeedback(secretCode: number[], guess: number[]) {
    const secretCounts = new Map<number, number>();
    const guessCounts = new Map<number, number>();
    let black = 0;

    for (let i = 0; i < 4; i++) {
        if (guess[i] === secretCode[i]) {
            black++;
        } else {
            secretCounts.set(secretCode[i], (secretCounts.get(secretCode[i]) ?? 0) + 1);
            guessCounts.set(guess[i], (guessCounts.get(guess[i]) ?? 0) + 1);
        }
    }

    let white = 0;
    for (const [colour, guessCount] of guessCounts) {
        const secretCount = secretCounts.get(colour) ?? 0;
        white += Math.min(secretCount, guessCount);
    }

    return { black, white };
}

@serializable
export class SmartthinkSubmitGuess implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = (new Date()).toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = "Unknown";
    senderUsername: string = "Unknown";
    guess: number[] = [0, 0, 0, 0];
    readonly className = "SmartthinkSubmitGuess";

    myString() {
        return `Smartthink SubmitGuess: ${this.guess.join(',')}`;
    }

    async Execute(gameData: IGameData) {
        const stGameData = gameData as ISmartthinkGameData;
        if (!stGameData.specificGameState.secretCodeSet) {
            return { turnOver: false, validMove: false };
        }
        if (this.senderId !== stGameData.specificGameState.codeBreakerId) {
            return { turnOver: false, validMove: false };
        }
        if (stGameData.specificGameState.guessRows.length >= stGameData.specificGameState.maxGuesses) {
            return { turnOver: false, validMove: false };
        }
        if (this.guess.length !== 4 || this.guess.some(value => value < 0 || value > 5)) {
            return { turnOver: false, validMove: false };
        }

        const feedback = calculateSmartthinkFeedback(stGameData.specificGameState.secretCode, this.guess);
        stGameData.specificGameState.guessRows.push({ guess: this.guess, black: feedback.black, white: feedback.white });
        stGameData.gameState.history.unshift(`${this.senderUsername} guessed ${this.guess.map(v => v + 1).join('-')} and received ${feedback.black} black, ${feedback.white} white`);
        return { turnOver: true, validMove: true, black: feedback.black, white: feedback.white } as ISmartthinkGuessOutcome;
    }

    Undo(gameData: IGameData) {
        console.error("Command Undo not implemented yet");
    }
}
