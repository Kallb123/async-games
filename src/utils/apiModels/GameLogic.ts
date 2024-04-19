import { IDiceCitiesGameData } from "@/games/DiceCities/DiceCitiesModels";
import { IGameData } from "../mongodb/GameData";
import { uuidString } from "./GameDataApi";
import { serializable } from "./Serialisable";
import { DiceRoll } from "../games/DiceRoll";
import { DiceCitiesCards } from "@/games/DiceCities/cards";
import { IDiceCitiesCard } from "@/games/DiceCities/apiModels";

export interface ICommandOutcome {
    validMove: boolean,
    turnOver: boolean
}

export interface IGameCommand {
    id: uuidString;
    timestamp: string;
    gameId: uuidString;
    readonly className: string;

    myString: () => string;
    Execute: (gameData: IGameData) => ICommandOutcome;
}

export interface IDiceCitiesDiceRollOutcome extends ICommandOutcome {
    roll1: number,
    roll2: number | null
}

@serializable
export class DiceCitiesRequestDiceRoll implements IGameCommand {
    id: uuidString = "uuuid-uuid-uuid-uuid-uuid";
    timestamp: string = (new Date()).toISOString();
    gameId: uuidString = "uuuid-uuid-uuid-uuid-uuid";
    doubleDice: boolean = false;
    readonly className = "DiceCitiesRequestDiceRoll";

    myString() {
        return `DiceRoll! Double? ${this.doubleDice ? "True" : "False"}`;
    }

    Execute(gameData: IGameData) {
        const dcGameData = gameData as IDiceCitiesGameData;
        const currentPlayerState = dcGameData.specificGameState.playerStates.get(dcGameData.currentTurn);

        if (dcGameData.specificGameState.hasRolled) {
            return {
                turnOver: false,
                validMove: false
            };
        }

        const roll1 = DiceRoll(6);
        let roll2: number | null = null;
        let totalRoll = roll1;
        if (this.doubleDice) {
            if (!currentPlayerState?.doubleUnlocked) {
                return {
                    turnOver: false,
                    validMove: false
                };
            }
            roll2 = DiceRoll(6);
            totalRoll += roll2;
        }
        // Award bank money
        dcGameData.specificGameState.playerStates.forEach((playerState, userId) => {
            const hitCards : IDiceCitiesCard[] = playerState.cards.flatMap(cardCount => {
                const cardObject = DiceCitiesCards[cardCount.card.toString()];
                if (cardObject.bankGain > 0) {
                    if (userId = dcGameData.currentTurn) {
                        if (cardObject.onOwnTurn) {
                            return cardObject;
                        }
                    } else {
                        if (cardObject.onOponentsTurn) {
                            return cardObject;
                        }
                    }
                }
                return [];
            });
            hitCards.forEach(card => {
                // TODO: Multiplier cards
                playerState.money += card.bankGain;
            });
        });
        // Award stolen money
        // Award stolen property

        dcGameData.specificGameState.hasRolled = true;

        const outcome: IDiceCitiesDiceRollOutcome = {
            turnOver: false, // TODO
            validMove: true,
            roll1,
            roll2
        }
        return outcome;
    }
}

@serializable
export class DiceCitiesRequestCardPurchase implements IGameCommand {
    id: uuidString = "uuuid-uuid-uuid-uuid-uuid";
    timestamp: string = (new Date()).toISOString();
    gameId: uuidString = "uuuid-uuid-uuid-uuid-uuid";
    cardId: uuidString = "uuuid-uuid-uuid-uuid-uuid";
    readonly className = "DiceCitiesRequestCardPurchase";

    myString() {
        return `CardPurchase! Card? ${this.cardId}`;
    }

    Execute(gameData: IGameData) {
        const dcGameData = gameData as IDiceCitiesGameData;
        return {
            turnOver: true,
            validMove: true
        };
    }
}

@serializable
export class DiceCitiesRequestPassTurn implements IGameCommand {
    id: uuidString = "uuuid-uuid-uuid-uuid-uuid";
    timestamp: string = (new Date()).toISOString();
    gameId: uuidString = "uuuid-uuid-uuid-uuid-uuid";
    readonly className = "DiceCitiesRequestCardPurchase";

    myString() {
        return `PassTurn! Card?`;
    }

    Execute(gameData: IGameData) {
        const dcGameData = gameData as IDiceCitiesGameData;
        if (!dcGameData.specificGameState.hasRolled) {
            return {
                turnOver: false,
                validMove: false
            }
        }
        dcGameData.specificGameState.hasRolled = false;
        return {
            turnOver: true,
            validMove: true
        };
    }
}
