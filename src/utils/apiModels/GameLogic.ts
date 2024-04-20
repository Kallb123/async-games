import { IDiceCitiesGameData } from "@/games/DiceCities/DiceCitiesModels";
import { IGameData } from "../mongodb/GameData";
import { uuidString } from "./GameDataApi";
import { serializable } from "./Serialisable";
import { DiceRoll } from "../games/DiceRoll";
import { DiceCitiesCards } from "@/games/DiceCities/cards";
import { IDiceCitiesCard } from "@/games/DiceCities/apiModels";
import { v4 as uuidv4, parse as parseUuid } from 'uuid';

export interface ICommandOutcome {
    validMove: boolean,
    turnOver: boolean
}

export interface IGameCommand {
    id: uuidString;
    timestamp: string;
    gameId: uuidString;
    senderId: string;
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
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = (new Date()).toISOString();
    gameId: uuidString = uuidv4() as uuidString;
    senderId: string = "Unknown";
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
        const rollerState = dcGameData.specificGameState.playerStates.get(dcGameData.currentTurn);
        if (!rollerState) {
            console.error("Unable to find rolling player's state");
            return {
                turnOver: false,
                validMove: false
            };
        }
        // Award red cards
        dcGameData.specificGameState.playerStates.forEach((playerState, userId) => {
            if (userId === dcGameData.currentTurn) {
                return;
            }
            const hitCards : IDiceCitiesCard[] = playerState.cards.flatMap(cardCount => {
                const cardObject = DiceCitiesCards[cardCount.card.toString()];
                if (!cardObject.rollNumber.includes(totalRoll)) {
                    return [];
                }
                if (cardObject.stealRollerGain === 0) {
                    return [];
                }
                if (!cardObject.onOponentsTurn) {
                    return [];
                }
                console.log(`Rolled ${totalRoll}, ${cardObject.title} stealing money from roller to ${userId}. CurrentTurn: ${dcGameData.currentTurn}`);
                return [cardObject];
            });
            hitCards.forEach(card => {
                const cardAmount = card.type === "dining" && playerState.bonusDiningAndStore ? card.stealRollerGain+1 : card.stealRollerGain;
                const amountToSteal = Math.min(rollerState.money, cardAmount);
                playerState.money += amountToSteal;
                rollerState.money -= amountToSteal;
            });
        });
        // Award bank money (green and blue)
        dcGameData.specificGameState.playerStates.forEach((playerState, userId) => {
            const hitCards : IDiceCitiesCard[] = playerState.cards.flatMap(cardCount => {
                const cardObject = DiceCitiesCards[cardCount.card.toString()];
                if (!cardObject.rollNumber.includes(totalRoll)) {
                    return [];
                }
                if (cardObject.bankGain === 0 && cardObject.gainMultiplier === null) {
                    return [];
                }
                if (userId === dcGameData.currentTurn) {
                    if (cardObject.onOwnTurn) {
                        console.log(`Rolled ${totalRoll}, adding money from ${cardObject.title} to ${userId}. CurrentTurn: ${dcGameData.currentTurn}`);
                        return [cardObject];
                    }
                } else {
                    if (cardObject.onOponentsTurn) {
                        console.log(`Rolled ${totalRoll}, adding money from ${cardObject.title} to ${userId}. CurrentTurn: ${dcGameData.currentTurn}`);
                        return [cardObject];
                    }
                }
                return [];
            });
            hitCards.forEach(card => {
                let cardAmount = 0;
                if (card.bankGain > 0) {
                    cardAmount = card.type === "store" && playerState.bonusDiningAndStore ? card.bankGain+1 : card.bankGain;
                } else if (card.gainMultiplier) {
                    const numCards = playerState.cards.filter(cc => {
                        const cardObject = DiceCitiesCards[cc.card.toString()];
                        if (card.gainMultiplier?.type.includes(cardObject.type)) {
                            return true;
                        }
                        return null;
                    }).length;
                    cardAmount = card.gainMultiplier.amountPerType * numCards;
                } else {
                    // What card is this??
                    console.error("Ended up with no money for card:", card);
                }
                // TODO: Consider bank money? (42*1 + 24*5 + 12*10 = 42+120+120 = 282)
                playerState.money += cardAmount;
            });
        });
        // Award purple cards

        dcGameData.specificGameState.hasRolled = true;
        dcGameData.gameState.history.unshift(`${this.senderId} rolled a ${totalRoll}`);

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
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = (new Date()).toISOString();
    gameId: uuidString = uuidv4() as uuidString;
    senderId: string = "Unknown";
    cardId: uuidString = uuidv4() as uuidString;
    readonly className = "DiceCitiesRequestCardPurchase";

    myString() {
        return `CardPurchase! Card? ${this.cardId}`;
    }

    Execute(gameData: IGameData) {
        const dcGameData = gameData as IDiceCitiesGameData;
        const currentPlayerState = dcGameData.specificGameState.playerStates.get(dcGameData.currentTurn);
        if (!currentPlayerState) {
            console.error("Unable to find current player's state");
            return {
                turnOver: false,
                validMove: false
            }
        }
        console.log("Executing for currentTurn:", dcGameData.currentTurn);
        console.log("currentState", currentPlayerState);

        if (!dcGameData.specificGameState.hasRolled) {
            return {
                turnOver: false,
                validMove: false
            };
        }

        const cardObject = DiceCitiesCards[this.cardId];

        if (cardObject.cost > currentPlayerState.money) {
            return {
                turnOver: false,
                validMove: false
            };
        }

        const currentOwned = currentPlayerState.cards.find(cc => cc.card === this.cardId);
        if (currentOwned && currentOwned.amount >= cardObject.ownLimit) {
            return {
                turnOver: false,
                validMove: false
            };
        }
        
        const bankCard = dcGameData.specificGameState.bankCards.find(cc => cc.card === this.cardId);
        if (!bankCard || bankCard.amount === 0) {
            return {
                turnOver: false,
                validMove: false
            };
        }

        // TODO: Add bank money
        currentPlayerState.money -= cardObject.cost;

        bankCard.amount--;
        if (currentOwned) {
            currentOwned.amount++;
        } else {
            currentPlayerState.cards.push({
                amount: 1,
                card: this.cardId
            });
        }

        dcGameData.specificGameState.hasRolled = false;
        dcGameData.gameState.history.unshift(`${this.senderId} bought a ${cardObject.title}`);
        return {
            turnOver: true,
            validMove: true
        };
    }
}

@serializable
export class DiceCitiesRequestPassTurn implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = (new Date()).toISOString();
    gameId: uuidString = uuidv4() as uuidString;
    senderId: string = "Unknown";
    readonly className = "DiceCitiesRequestPassTurn";

    myString() {
        return `PassTurn!`;
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
        dcGameData.gameState.history.unshift(`${this.senderId} passed their turn`);
        return {
            turnOver: true,
            validMove: true
        };
    }
}
