import type { IDiceCitiesGameData, IDiceCitiesPlayerState } from "@/games/DiceCities/DiceCitiesModels";
import type { ISnakesAndLaddersGameData } from "@/games/SnakesAndLadders/SnakesAndLaddersModels";
import type { ISmartthinkGameData } from "@/games/Smartthink/SmartthinkModels";
import type { ISettlementsAndCitiesGameData } from "@/games/SettlementsAndCities/SettlementsAndCitiesModels";
import type { SAC_Resource, SAC_DevCard, ISACPlayerState } from "@/games/SettlementsAndCities/board";
import { BOARD_TOPOLOGY, TERRAIN_TO_RESOURCE, calculateLongestRoad, calculateTotalVP, isValidSettlementVertex, isValidRoadEdge, isValidSetupRoadEdge } from "@/games/SettlementsAndCities/board";
import type { IGameData } from "../mongodb/GameData";
import { uuidString } from "./GameDataApi";
import { deserializeJSON, serializable } from "./Serialisable";
import { DiceRoll } from "../games/DiceRoll";
import { DiceCitiesCardIds, DiceCitiesCards } from "@/games/DiceCities/cards";
import { IDiceCitiesCard } from "@/games/DiceCities/apiModels";
import { v4 as uuidv4, NIL as NIL_UUID } from 'uuid';

export interface ICommandOutcome {
    validMove: boolean,
    turnOver: boolean
}

export interface IGameCommand {
    id: uuidString;
    timestamp: string;
    gameId: uuidString;
    senderId: string;
    senderUsername: string;
    readonly className: string;

    myString: () => string;
    Execute: (gameData: IGameData) => Promise<ICommandOutcome>;
    Undo: (gameData: IGameData) => void;
}

export interface IGameType {
    gameType: string,
    friendlyName: string,
    icon: string,
    url: string,
    readonly className: string;

    CheckEndTurn: (gameData: IGameData, commandOutcome: ICommandOutcome) => void;
    CheckGameOver: (gameData: IGameData) => boolean;
}

export interface IDiceCitiesDiceRollOutcome extends ICommandOutcome {
    roll1: number,
    roll2: number | null,
    moneyChanges: Map<string, number>
}

export interface ISmartthinkGuessOutcome extends ICommandOutcome {
    black: number,
    white: number
}

@serializable
export class DiceCitiesGameType implements IGameType {
    gameId: uuidString = uuidv4() as uuidString;
    gameType: string = "DiceCities";
    friendlyName: string = "Dice Cities";
    icon: string = "";
    url: string = "dicecities";
    readonly className: string = "DiceCitiesGameType";

    CheckEndTurn (gameData: IGameData, commandOutcome: ICommandOutcome) {
        const dcGameData: IDiceCitiesGameData = gameData as IDiceCitiesGameData;
        if (dcGameData.specificGameState.awaitingDoubleReroll && commandOutcome.turnOver) {
            dcGameData.specificGameState.hasRolled = false;
            dcGameData.specificGameState.awaitingDoubleReroll = false;
            return;
        }

        if (commandOutcome.turnOver) {
            const currentIndex = gameData.gameState.turnOrder.findIndex(to => to === gameData.currentTurn);
            const nextTurn = gameData.gameState.turnOrder[(currentIndex+1)%gameData.gameState.turnOrder.length];
            gameData.currentTurn = nextTurn;
        }

        return;
    };

    CheckGameOver (gameData: IGameData) {
        const dcGameData: IDiceCitiesGameData = gameData as IDiceCitiesGameData;
        let isFinished = false;
        dcGameData.specificGameState.playerStates.forEach((playerState, userId) => {
            if (playerState.bonusDiningAndStore && playerState.doubleUnlocked && playerState.oneReroll && playerState.rerollDoubles) {
                isFinished = true;
                dcGameData.complete = true;
                dcGameData.winner = userId;
                dcGameData.currentTurn = "";
            }
        });
        return isFinished;
    }
}

@serializable
export class DiceCitiesRequestDiceRoll implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = (new Date()).toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = "Unknown";
    senderUsername: string = "Unknown";
    doubleDice: boolean = false;
    moneyChanges: Map<string, number> = new Map;
    readonly className = "DiceCitiesRequestDiceRoll";

    myString() {
        return `DiceRoll! Double? ${this.doubleDice ? "True" : "False"}`;
    }

    async Execute (gameData: IGameData) {
        const dcGameData = gameData as IDiceCitiesGameData;
        const currentPlayerState = dcGameData.specificGameState.playerStates.get(dcGameData.currentTurn);

        if (dcGameData.specificGameState.hasRolled) {
            return {
                turnOver: false,
                validMove: false
            };
        }

        if (dcGameData.specificGameState.awaitingTSSelection || dcGameData.specificGameState.awaitingBCSelectionOwn
             || dcGameData.specificGameState.awaitingBCSelectionOpponent
        ) {
            return {
                turnOver: false,
                validMove: false
            };
        }

        if (this.doubleDice) {
            if (!currentPlayerState?.doubleUnlocked) {
                return {
                    turnOver: false,
                    validMove: false
                };
            }
        }
        const outcome: IDiceCitiesDiceRollOutcome = doDiceRoll(dcGameData, this.doubleDice);
        dcGameData.specificGameState.hasReRolled = false;
        this.moneyChanges = outcome.moneyChanges;
        let totalRoll = this.doubleDice && outcome.roll2 ? outcome.roll1 + outcome.roll2 : outcome.roll1;

        const senderUsername = this.senderUsername;
        dcGameData.gameState.history.unshift(`${senderUsername} rolled a ${totalRoll}${outcome.roll2 ? ` (${outcome.roll1} and ${outcome.roll2})` : ""}`);

        // TODO: Maybe end turn if nothin available to buy?
        return outcome;
    }

    Undo (gameData: IGameData) {
        const dcGameData: IDiceCitiesGameData = gameData as IDiceCitiesGameData;

        const moneyMap: Map<string, number> = new Map(Object.entries(this.moneyChanges));

        moneyMap.forEach((moneyChange, userId) => {
            const playerState = dcGameData.specificGameState.playerStates.get(userId);
            if (!playerState) {
                return;
            }

            playerState.money += moneyChange;
        });

        dcGameData.gameState.commandHistory.pop();
        dcGameData.specificGameState.hasRolled = false;
        dcGameData.specificGameState.awaitingBCSelectionOwn = false;
        dcGameData.specificGameState.awaitingBCSelectionOpponent = false;
        dcGameData.specificGameState.awaitingTSSelection = false;
        dcGameData.specificGameState.awaitingDoubleReroll = false;
    }
}

@serializable
export class DiceCitiesRequestCardPurchase implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = (new Date()).toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = "Unknown";
    senderUsername: string = "Unknown";
    cardId: uuidString = NIL_UUID as uuidString;
    readonly className = "DiceCitiesRequestCardPurchase";

    myString() {
        return `CardPurchase! Card? ${this.cardId}`;
    }

    async Execute(gameData: IGameData) {
        const dcGameData = gameData as IDiceCitiesGameData;
        const currentPlayerState = dcGameData.specificGameState.playerStates.get(dcGameData.currentTurn);
        if (!currentPlayerState) {
            console.error("Unable to find current player's state");
            return {
                turnOver: false,
                validMove: false
            }
        }

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
        const senderUsername = this.senderUsername;
        dcGameData.gameState.history.unshift(`${senderUsername} bought a ${cardObject.title}`);
        return {
            turnOver: true,
            validMove: true
        };
    }

    Undo (gameData: IGameData) {
        // TODO: Implement Undo
        console.error("Command Undo not implemented yet")
    }
}

@serializable
export class DiceCitiesRequestPassTurn implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = (new Date()).toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = "Unknown";
    senderUsername: string = "Unknown";
    readonly className = "DiceCitiesRequestPassTurn";

    myString() {
        return `PassTurn!`;
    }

    async Execute(gameData: IGameData) {
        const dcGameData = gameData as IDiceCitiesGameData;
        if (!dcGameData.specificGameState.hasRolled) {
            return {
                turnOver: false,
                validMove: false
            }
        }
        dcGameData.specificGameState.hasRolled = false;
        const senderUsername = this.senderUsername;
        dcGameData.gameState.history.unshift(`${senderUsername} passed their turn`);
        return {
            turnOver: true,
            validMove: true
        };
    }

    Undo (gameData: IGameData) {
        // TODO: Implement Undo
        console.error("Command Undo not implemented yet")
    }
}

@serializable
export class DiceCitiesRequestUnlockTrainStation implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = (new Date()).toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = "Unknown";
    senderUsername: string = "Unknown";
    readonly className = "DiceCitiesRequestUnlockTrainStation";

    myString() {
        return `Train Station!`;
    }

    async Execute(gameData: IGameData) {
        const dcGameData = gameData as IDiceCitiesGameData;
        const currentPlayerState = dcGameData.specificGameState.playerStates.get(dcGameData.currentTurn);
        if (!currentPlayerState) {
            console.error("Unable to find current player's state");
            return {
                turnOver: false,
                validMove: false
            }
        }

        if (!dcGameData.specificGameState.hasRolled) {
            return {
                turnOver: false,
                validMove: false
            };
        }

        const cardObject = DiceCitiesCards[DiceCitiesCardIds.TRAIN_STATION];

        if (cardObject.cost > currentPlayerState.money) {
            return {
                turnOver: false,
                validMove: false
            };
        }

        if (currentPlayerState.doubleUnlocked) {
            return {
                turnOver: false,
                validMove: false
            };
        }

        // TODO: Add bank money
        currentPlayerState.money -= cardObject.cost;

        currentPlayerState.doubleUnlocked = true;

        dcGameData.specificGameState.hasRolled = false;
        const senderUsername = this.senderUsername;
        dcGameData.gameState.history.unshift(`${senderUsername} bought a ${cardObject.title}`);
        return {
            turnOver: true,
            validMove: true
        };
    }

    Undo (gameData: IGameData) {
        // TODO: Implement Undo
        console.error("Command Undo not implemented yet")
    }
}

@serializable
export class DiceCitiesRequestUnlockShoppingMall implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = (new Date()).toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = "Unknown";
    senderUsername: string = "Unknown";
    readonly className = "DiceCitiesRequestUnlockShoppingMall";

    myString() {
        return `Shopping Mall!`;
    }

    async Execute(gameData: IGameData) {
        const dcGameData = gameData as IDiceCitiesGameData;
        const currentPlayerState = dcGameData.specificGameState.playerStates.get(dcGameData.currentTurn);
        if (!currentPlayerState) {
            console.error("Unable to find current player's state");
            return {
                turnOver: false,
                validMove: false
            }
        }

        if (!dcGameData.specificGameState.hasRolled) {
            return {
                turnOver: false,
                validMove: false
            };
        }

        const cardObject = DiceCitiesCards[DiceCitiesCardIds.SHOPPING_MALL];

        if (cardObject.cost > currentPlayerState.money) {
            return {
                turnOver: false,
                validMove: false
            };
        }

        if (currentPlayerState.bonusDiningAndStore) {
            return {
                turnOver: false,
                validMove: false
            };
        }

        // TODO: Add bank money
        currentPlayerState.money -= cardObject.cost;

        currentPlayerState.bonusDiningAndStore = true;

        dcGameData.specificGameState.hasRolled = false;
        const senderUsername = this.senderUsername;
        dcGameData.gameState.history.unshift(`${senderUsername} bought a ${cardObject.title}`);
        return {
            turnOver: true,
            validMove: true
        };
    }

    Undo (gameData: IGameData) {
        // TODO: Implement Undo
        console.error("Command Undo not implemented yet")
    }
}

@serializable
export class DiceCitiesRequestUnlockAmusementPark implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = (new Date()).toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = "Unknown";
    senderUsername: string = "Unknown";
    readonly className = "DiceCitiesRequestUnlockAmusementPark";

    myString() {
        return `Amusement Park!`;
    }

    async Execute(gameData: IGameData) {
        const dcGameData = gameData as IDiceCitiesGameData;
        const currentPlayerState = dcGameData.specificGameState.playerStates.get(dcGameData.currentTurn);
        if (!currentPlayerState) {
            console.error("Unable to find current player's state");
            return {
                turnOver: false,
                validMove: false
            }
        }

        if (!dcGameData.specificGameState.hasRolled) {
            return {
                turnOver: false,
                validMove: false
            };
        }

        const cardObject = DiceCitiesCards[DiceCitiesCardIds.AMUSEMENT_PARK];

        if (cardObject.cost > currentPlayerState.money) {
            return {
                turnOver: false,
                validMove: false
            };
        }

        if (currentPlayerState.oneReroll) {
            return {
                turnOver: false,
                validMove: false
            };
        }

        // TODO: Add bank money
        currentPlayerState.money -= cardObject.cost;

        currentPlayerState.oneReroll = true;

        dcGameData.specificGameState.hasRolled = false;
        const senderUsername = this.senderUsername;
        dcGameData.gameState.history.unshift(`${senderUsername} bought a ${cardObject.title}`);
        return {
            turnOver: true,
            validMove: true
        };
    }

    Undo (gameData: IGameData) {
        // TODO: Implement Undo
        console.error("Command Undo not implemented yet")
    }
}

@serializable
export class DiceCitiesRequestUnlockRadioTower implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = (new Date()).toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = "Unknown";
    senderUsername: string = "Unknown";
    readonly className = "DiceCitiesRequestUnlockRadioTower";

    myString() {
        return `Radio Tower!`;
    }

    async Execute(gameData: IGameData) {
        const dcGameData = gameData as IDiceCitiesGameData;
        const currentPlayerState = dcGameData.specificGameState.playerStates.get(dcGameData.currentTurn);
        if (!currentPlayerState) {
            console.error("Unable to find current player's state");
            return {
                turnOver: false,
                validMove: false
            }
        }

        if (!dcGameData.specificGameState.hasRolled) {
            return {
                turnOver: false,
                validMove: false
            };
        }

        const cardObject = DiceCitiesCards[DiceCitiesCardIds.RADIO_TOWER];

        if (cardObject.cost > currentPlayerState.money) {
            return {
                turnOver: false,
                validMove: false
            };
        }

        if (currentPlayerState.rerollDoubles) {
            return {
                turnOver: false,
                validMove: false
            };
        }

        // TODO: Add bank money
        currentPlayerState.money -= cardObject.cost;

        currentPlayerState.rerollDoubles = true;

        dcGameData.specificGameState.hasRolled = false;
        const senderUsername = this.senderUsername;
        dcGameData.gameState.history.unshift(`${senderUsername} bought a ${cardObject.title}`);
        return {
            turnOver: true,
            validMove: true
        };
    }

    Undo (gameData: IGameData) {
        // TODO: Implement Undo
        console.error("Command Undo not implemented yet")
    }
}

@serializable
export class DiceCitiesRequestTvStationSelection implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = (new Date()).toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = "Unknown";
    senderUsername: string = "Unknown";
    selectedUser: string = "";
    selectedUserName: string = "";
    readonly className = "DiceCitiesRequestTvStationSelection";

    myString() {
        return `TV Station Selection: ${this.selectedUserName || this.selectedUser}!`;
    }

    async Execute(gameData: IGameData) {
        const dcGameData = gameData as IDiceCitiesGameData;
        // This should be happening as part of the roll
        if (dcGameData.specificGameState.hasRolled) {
            return {
                turnOver: false,
                validMove: false
            }
        }
        if (!dcGameData.specificGameState.awaitingTSSelection) {
            return {
                turnOver: false,
                validMove: false
            }
        }

        const selectedUserId = this.selectedUser;
        const selectedState = dcGameData.specificGameState.playerStates.get(selectedUserId);
        if (!selectedState) {
            return {
                turnOver: false,
                validMove: false
            }
        }
        const rollerState = dcGameData.specificGameState.playerStates.get(dcGameData.currentTurn);
        if (!rollerState) {
            return {
                turnOver: false,
                validMove: false
            }
        }

        const tvStationCard = DiceCitiesCards[DiceCitiesCardIds.TV_STATION];
        const cardSteal = tvStationCard.stealChosenGain;
        const amountToSteal = Math.min(cardSteal, selectedState.money);

        selectedState.money -= amountToSteal;
        rollerState.money += amountToSteal;

        const senderUsername = this.senderUsername;
        dcGameData.gameState.history.unshift(`${senderUsername} stole ${amountToSteal} coins from ${this.selectedUserName || this.selectedUser}`);
        dcGameData.specificGameState.awaitingTSSelection = false;
        if (!dcGameData.specificGameState.awaitingBCSelectionOwn && !dcGameData.specificGameState.awaitingBCSelectionOpponent) {
            dcGameData.specificGameState.hasRolled = true;
        }
        return {
            turnOver: false,
            validMove: true
        };
    }

    Undo (gameData: IGameData) {
        // TODO: Implement Undo
        console.error("Command Undo not implemented yet")
    }
}

@serializable
export class DiceCitiesRequestBusinessCenterOwnSelection implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = (new Date()).toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = "Unknown";
    senderUsername: string = "Unknown";
    selectedCard: uuidString = NIL_UUID as uuidString;
    readonly className = "DiceCitiesRequestBusinessCenterOwnSelection";

    myString() {
        return `Business Center Own Selection: ${this.selectedCard}!`;
    }

    async Execute(gameData: IGameData) {
        const dcGameData = gameData as IDiceCitiesGameData;
        // This should be happening as part of the roll
        if (dcGameData.specificGameState.hasRolled) {
            return {
                turnOver: false,
                validMove: false
            }
        }
        if (!dcGameData.specificGameState.awaitingBCSelectionOwn && !dcGameData.specificGameState.awaitingBCSelectionOpponent) {
            return {
                turnOver: false,
                validMove: false
            }
        }

        const rollerState = dcGameData.specificGameState.playerStates.get(dcGameData.currentTurn);
        if (!rollerState) {
            return {
                turnOver: false,
                validMove: false
            }
        }

        // Check valid type
        const selectedOwnCard = DiceCitiesCards[this.selectedCard];
        if (selectedOwnCard.type === "landmark") {
            return {
                turnOver: false,
                validMove: false
            }
        }

        const cardOwned = rollerState.cards.find(cc => cc.card === this.selectedCard);
        if (!cardOwned || cardOwned.amount === 0) {
            return {
                turnOver: false,
                validMove: false
            }
        }

        dcGameData.specificGameState.awaitingBCSelectionOwn = false;
        dcGameData.specificGameState.bcSelectedOwnCard = this.selectedCard;

        // Still waiting?
        if (dcGameData.specificGameState.awaitingBCSelectionOpponent) {
            return {
                turnOver: false,
                validMove: true
            }
        }

        if (!dcGameData.specificGameState.bcSelectedOpponent || !dcGameData.specificGameState.bcSelectedOpponentCard) {
            return {
                turnOver: false,
                validMove: false
            }
        }

        const selectedOpponentState = dcGameData.specificGameState.playerStates.get(dcGameData.specificGameState.bcSelectedOpponent);
        if (!selectedOpponentState) {
            return {
                turnOver: false,
                validMove: false
            }
        }
        const selectedOpponentCard = DiceCitiesCards[dcGameData.specificGameState.bcSelectedOpponentCard];
        if (selectedOpponentCard.type === "landmark") {
            return {
                turnOver: false,
                validMove: false
            }
        }

        // Both selections made
        removeCardFromPlayerState(this.selectedCard, rollerState);
        addCardToPlayerState(this.selectedCard, selectedOpponentState);
        removeCardFromPlayerState(dcGameData.specificGameState.bcSelectedOpponentCard, selectedOpponentState);
        addCardToPlayerState(dcGameData.specificGameState.bcSelectedOpponentCard, rollerState);

        const senderUsername = this.senderUsername;
        const selectedOpponentUsername = dcGameData.specificGameState.bcSelectedOpponent;
        dcGameData.gameState.history.unshift(`${senderUsername} stole a ${selectedOpponentCard.title} for a ${selectedOwnCard.title} coins from ${selectedOpponentUsername}`);
        dcGameData.specificGameState.bcSelectedOpponent = "";
        dcGameData.specificGameState.bcSelectedOpponent = "";
        dcGameData.specificGameState.bcSelectedOpponentCard = NIL_UUID as uuidString;
        if (!dcGameData.specificGameState.awaitingTSSelection) {
            dcGameData.specificGameState.hasRolled = true;
        }
        return {
            turnOver: false,
            validMove: true
        };
    }

    Undo (gameData: IGameData) {
        // TODO: Implement Undo
        console.error("Command Undo not implemented yet")
    }
}

@serializable
export class DiceCitiesRequestBusinessCenterOpponentSelection implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = (new Date()).toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = "Unknown";
    senderUsername: string = "Unknown";
    selectedUser: string = "Unknown";
    selectedCard: uuidString = NIL_UUID as uuidString;
    readonly className = "DiceCitiesRequestBusinessCenterOpponentSelection";

    myString() {
        return `Business Center Opponent Selection: ${this.selectedUser} ${this.selectedCard}!`;
    }

    async Execute(gameData: IGameData) {
        const dcGameData = gameData as IDiceCitiesGameData;
        // This should be happening as part of the roll
        if (dcGameData.specificGameState.hasRolled) {
            return {
                turnOver: false,
                validMove: false
            }
        }
        if (!dcGameData.specificGameState.awaitingBCSelectionOwn && !dcGameData.specificGameState.awaitingBCSelectionOpponent) {
            return {
                turnOver: false,
                validMove: false
            }
        }

        const rollerState = dcGameData.specificGameState.playerStates.get(dcGameData.currentTurn);
        if (!rollerState) {
            return {
                turnOver: false,
                validMove: false
            }
        }

        // Check valid type
        const selectedOpponentCard = DiceCitiesCards[this.selectedCard];
        if (selectedOpponentCard.type === "landmark") {
            return {
                turnOver: false,
                validMove: false
            }
        }

        const opponentState = dcGameData.specificGameState.playerStates.get(this.selectedUser);
        if (!opponentState) {
            return {
                turnOver: false,
                validMove: false
            }
        }

        const opponentCardOwned = opponentState.cards.find(cc => cc.card === this.selectedCard);
        if (!opponentCardOwned || opponentCardOwned.amount === 0) {
            return {
                turnOver: false,
                validMove: false
            }
        }

        dcGameData.specificGameState.awaitingBCSelectionOpponent = false;
        dcGameData.specificGameState.bcSelectedOpponent = this.selectedUser;
        dcGameData.specificGameState.bcSelectedOpponentCard = this.selectedCard;

        // Still waiting?
        if (dcGameData.specificGameState.awaitingBCSelectionOwn) {
            return {
                turnOver: false,
                validMove: true
            }
        }

        if (!dcGameData.specificGameState.bcSelectedOwnCard) {
            return {
                turnOver: false,
                validMove: false
            }
        }

        const selectedOwnCard = DiceCitiesCards[dcGameData.specificGameState.bcSelectedOwnCard];
        if (selectedOwnCard.type === "landmark") {
            return {
                turnOver: false,
                validMove: false
            }
        }

        // Both selections made
        removeCardFromPlayerState(dcGameData.specificGameState.bcSelectedOwnCard, rollerState);
        addCardToPlayerState(dcGameData.specificGameState.bcSelectedOwnCard, opponentState);
        removeCardFromPlayerState(this.selectedCard, opponentState);
        addCardToPlayerState(this.selectedCard, rollerState);

        const senderUsername = this.senderUsername;
        const selectedOpponentUsername = dcGameData.specificGameState.bcSelectedOpponent;
        dcGameData.gameState.history.unshift(`${senderUsername} stole a ${selectedOpponentCard.title} for a ${selectedOwnCard.title} coins from ${selectedOpponentUsername}`);
        dcGameData.specificGameState.bcSelectedOpponent = "";
        dcGameData.specificGameState.bcSelectedOpponent = "";
        dcGameData.specificGameState.bcSelectedOpponentCard = NIL_UUID as uuidString;
        if (!dcGameData.specificGameState.awaitingTSSelection) {
            dcGameData.specificGameState.hasRolled = true;
        }
        return {
            turnOver: false,
            validMove: true
        };
    }

    Undo (gameData: IGameData) {
        // TODO: Implement Undo
        console.error("Command Undo not implemented yet")
    }
}

@serializable
export class DiceCitiesRequestRadioTowerReroll implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = (new Date()).toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = "Unknown";
    senderUsername: string = "Unknown";
    readonly className = "DiceCitiesRequestRadioTowerReroll";

    myString() {
        return `Reroll with Radio Tower!`;
    }

    async Execute(gameData: IGameData) {
        const dcGameData = gameData as IDiceCitiesGameData;
        if (!dcGameData.specificGameState.hasRolled) {
            return {
                turnOver: false,
                validMove: false
            }
        }
        if (dcGameData.specificGameState.hasReRolled) {
            return {
                turnOver: false,
                validMove: false
            }
        }
        const lastCommand = dcGameData.gameState.commandHistory.findLast(() => true);
        const lastCommandDeserialised = deserializeJSON(JSON.stringify(lastCommand));
        if (!(lastCommandDeserialised instanceof DiceCitiesRequestDiceRoll)) {
            console.log("last command:", lastCommand);
            return {
                turnOver: false,
                validMove: false
            }
        }
        const doubleDice = lastCommandDeserialised.doubleDice;

        // TODO: Implement undo!
        lastCommandDeserialised.Undo(dcGameData);

        dcGameData.specificGameState.awaitingBCSelectionOpponent = false;
        dcGameData.specificGameState.awaitingBCSelectionOwn = false;
        dcGameData.specificGameState.awaitingTSSelection = false;
        dcGameData.specificGameState.awaitingDoubleReroll = false;
        dcGameData.specificGameState.bcSelectedOpponent = "";
        dcGameData.specificGameState.bcSelectedOpponent = "";
        dcGameData.specificGameState.bcSelectedOpponentCard = NIL_UUID as uuidString;
        dcGameData.specificGameState.hasReRolled = true;

        const outcome: IDiceCitiesDiceRollOutcome = doDiceRoll(dcGameData, doubleDice);
        let totalRoll = doubleDice && outcome.roll2 ? outcome.roll1 + outcome.roll2 : outcome.roll1;

        const senderUsername = this.senderUsername;
        dcGameData.gameState.history.unshift(`${senderUsername} re-rolled for a ${totalRoll}${outcome.roll2 ? ` (${outcome.roll1} and ${outcome.roll2})` : ""}`);
        return outcome;
    }

    Undo (gameData: IGameData) {
        // TODO: Implement Undo
        console.error("Command Undo not implemented yet")
    }
}

function addCardToPlayerState(cardId: uuidString, playerState: IDiceCitiesPlayerState) {
    const cardOwned = playerState.cards.find(cc => cc.card === cardId);
    if (cardOwned) {
        cardOwned.amount++;
        return;
    }
    playerState.cards.push({
        card: cardId,
        amount: 1
    });
    return;
}

function removeCardFromPlayerState(cardId: uuidString, playerState: IDiceCitiesPlayerState) {
    const cardOwned = playerState.cards.find(cc => cc.card === cardId);
    if (cardOwned) {
        cardOwned.amount--;
        return;
    }
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
        stGameData.specificGameState.guessRows.unshift({ guess: this.guess, black: feedback.black, white: feedback.white });
        stGameData.gameState.history.unshift(`${this.senderUsername} guessed ${this.guess.map(v => v + 1).join('-')} and received ${feedback.black} black, ${feedback.white} white`);
        return { turnOver: true, validMove: true, black: feedback.black, white: feedback.white } as ISmartthinkGuessOutcome;
    }

    Undo(gameData: IGameData) {
        console.error("Command Undo not implemented yet");
    }
}

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

        const roll = DiceRoll(6);
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

function doDiceRoll(dcGameData: IDiceCitiesGameData, isDouble: boolean): IDiceCitiesDiceRollOutcome {
    const roll1 = DiceRoll(6);
    let roll2: number | null = null;
    let totalRoll = roll1;
    if (isDouble) {
        roll2 = DiceRoll(6);
        totalRoll += roll2;
    }
    const rollerState = dcGameData.specificGameState.playerStates.get(dcGameData.currentTurn);
    if (!rollerState) {
        console.error("Unable to find rolling player's state");
        return {
            turnOver: false,
            validMove: false,
            roll1: 0,
            roll2: 0,
            moneyChanges: new Map
        };
    }
    
    if (roll1 === roll2 && rollerState.rerollDoubles) {
        dcGameData.specificGameState.awaitingDoubleReroll = true;
    }

    const moneyChanges: Map<string, number> = new Map;
    dcGameData.specificGameState.playerStates.forEach((ps, userId) => {
        moneyChanges.set(userId, 0);
    });
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
            moneyChanges.set(userId, (moneyChanges.get(userId) ?? 0) + amountToSteal);
            rollerState.money -= amountToSteal;
            moneyChanges.set(dcGameData.currentTurn, (moneyChanges.get(dcGameData.currentTurn) ?? 0) - amountToSteal);
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
                    let output = [];
                    for(let i = 0; i < cardCount.amount; i++) {
                        console.log(`Rolled ${totalRoll}, adding money from ${cardObject.title} to ${userId}. CurrentTurn: ${dcGameData.currentTurn}`);
                        output.push(cardObject);
                    }
                    return output;
                }
            } else {
                if (cardObject.onOponentsTurn) {
                    let output = [];
                    for(let i = 0; i < cardCount.amount; i++) {
                        console.log(`Rolled ${totalRoll}, adding money from ${cardObject.title} to ${userId}. CurrentTurn: ${dcGameData.currentTurn}`);
                        output.push(cardObject);
                    }
                    return output;
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
            moneyChanges.set(userId, (moneyChanges.get(userId) ?? 0) + cardAmount);
        });
    });
    // Award purple cards
    const stadiumCard = DiceCitiesCards[DiceCitiesCardIds.STADIUM];
    if (stadiumCard.rollNumber.includes(totalRoll)) {
        const stadiumCount = rollerState.cards.find(cc => cc.card === DiceCitiesCardIds.STADIUM);
        if (stadiumCount && stadiumCount.amount > 0) {
            dcGameData.specificGameState.playerStates.forEach((playerState, userId) => {
                if (userId === dcGameData.currentTurn) {
                    return;
                }

                const cardAmount = stadiumCard.stealAllGain;
                const amountToSteal = Math.min(playerState.money, cardAmount);
                playerState.money -= amountToSteal;
                moneyChanges.set(userId, (moneyChanges.get(userId) ?? 0) - amountToSteal);
                rollerState.money += amountToSteal;
                moneyChanges.set(dcGameData.currentTurn, (moneyChanges.get(dcGameData.currentTurn) ?? 0) + amountToSteal);
            });
        }
    }
    let shouldRolled: boolean = true;
    const tvStationCard = DiceCitiesCards[DiceCitiesCardIds.TV_STATION];
    if (tvStationCard.rollNumber.includes(totalRoll)) {
        const tvStationCount = rollerState.cards.find(cc => cc.card === DiceCitiesCardIds.TV_STATION);
        if (tvStationCount && tvStationCount.amount > 0) {
            // TODO: Check if someone to steal off
            // TODO: If there's only 2 players, can we skip the choice?
            shouldRolled = false;
            dcGameData.specificGameState.awaitingTSSelection = true;
        }
    }
    const businessCenterCard = DiceCitiesCards[DiceCitiesCardIds.BUSINESS_CENTER];
    if (businessCenterCard.rollNumber.includes(totalRoll)) {
        const businessCenterCount = rollerState.cards.find(cc => cc.card === DiceCitiesCardIds.BUSINESS_CENTER);
        if (businessCenterCount && businessCenterCount.amount > 0) {
            // TODO: Check if someone to steal off
            shouldRolled = false;
            dcGameData.specificGameState.awaitingBCSelectionOwn = true;
            dcGameData.specificGameState.awaitingBCSelectionOpponent = true;
        }
    }

    dcGameData.specificGameState.hasRolled = shouldRolled;
    // TODO: Maybe end turn if nothin available to buy?

    const outcome: IDiceCitiesDiceRollOutcome = {
        turnOver: false,
        validMove: true,
        roll1,
        roll2,
        moneyChanges
    }
    return outcome;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SETTLEMENTS AND CITIES
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Helper: randomly discard half of a player's cards ───────────────────────
function sacDiscardHalf(ps: ISACPlayerState): void {
    const total = sacTotalResources(ps);
    if (total <= 7) return;
    let toDiscard = Math.floor(total / 2);
    const pool: SAC_Resource[] = [];
    const resourceKeys: SAC_Resource[] = ['lumber', 'wool', 'grain', 'brick', 'ore'];
    for (const r of resourceKeys) {
        for (let i = 0; i < ps.resources[r]; i++) pool.push(r);
    }
    // Fisher-Yates shuffle the pool then take first `toDiscard`
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    for (let i = 0; i < toDiscard; i++) {
        ps.resources[pool[i]]--;
    }
}

function sacTotalResources(ps: ISACPlayerState): number {
    return ps.resources.lumber + ps.resources.wool + ps.resources.grain +
           ps.resources.brick + ps.resources.ore;
}

// ─── Helper: update longest road / largest army ───────────────────────────────
function sacUpdateLongestRoad(sacData: ISettlementsAndCitiesGameData): void {
    const gs = sacData.specificGameState;
    let maxLen = 0;
    let maxPlayer: string | null = null;
    for (const [userId] of gs.playerStates) {
        const len = calculateLongestRoad(userId, gs.vertices, gs.edges);
        if (len > maxLen) { maxLen = len; maxPlayer = userId; }
    }
    if (maxLen >= 5) {
        if (gs.longestRoadOwner === null) {
            if (maxPlayer) gs.longestRoadOwner = maxPlayer;
        } else {
            const currentLen = calculateLongestRoad(gs.longestRoadOwner, gs.vertices, gs.edges);
            if (maxLen > currentLen && maxPlayer && maxPlayer !== gs.longestRoadOwner) {
                gs.longestRoadOwner = maxPlayer;
            }
        }
    }
}

function sacUpdateLargestArmy(sacData: ISettlementsAndCitiesGameData): void {
    const gs = sacData.specificGameState;
    let maxKnights = 0;
    let maxPlayer: string | null = null;
    for (const [userId, ps] of gs.playerStates) {
        if (ps.knightsPlayed > maxKnights) { maxKnights = ps.knightsPlayed; maxPlayer = userId; }
    }
    if (maxKnights >= 3) {
        if (gs.largestArmyOwner === null) {
            if (maxPlayer) gs.largestArmyOwner = maxPlayer;
        } else {
            const currentKnights = gs.playerStates.get(gs.largestArmyOwner)?.knightsPlayed ?? 0;
            if (maxKnights > currentKnights && maxPlayer && maxPlayer !== gs.largestArmyOwner) {
                gs.largestArmyOwner = maxPlayer;
            }
        }
    }
}

// ─── Helper: advance setup turn ──────────────────────────────────────────────
function sacAdvanceSetup(sacData: ISettlementsAndCitiesGameData): void {
    const gs = sacData.specificGameState;
    const N = sacData.gameState.turnOrder.length;
    gs.setupStep++;
    if (gs.setupStep >= 2 * N) {
        // Setup complete – start main game
        gs.phase = 'main';
        gs.setupStep = 0;
        sacData.currentTurn = sacData.gameState.turnOrder[0];
    } else {
        const s = gs.setupStep;
        const idx = s < N ? s : 2 * N - 1 - s;
        sacData.currentTurn = sacData.gameState.turnOrder[idx];
    }
}

// ─── Game type ────────────────────────────────────────────────────────────────

@serializable
export class SettlementsAndCitiesGameType implements IGameType {
    gameId: uuidString = uuidv4() as uuidString;
    gameType: string = "SettlementsAndCities";
    friendlyName: string = "Settlements and Cities";
    icon: string = "";
    url: string = "settlementsandcities";
    readonly className: string = "SettlementsAndCitiesGameType";

    CheckEndTurn(gameData: IGameData, commandOutcome: ICommandOutcome): void {
        const sacData = gameData as ISettlementsAndCitiesGameData;
        const gs = sacData.specificGameState;
        if (!commandOutcome.turnOver) return;

        if (gs.phase === 'setup') {
            sacAdvanceSetup(sacData);
        } else {
            // Reset per-turn flags
            gs.hasRolled = false;
            gs.lastRoll = null;
            gs.pendingRobber = false;
            gs.pendingRoadBuilding = 0;
            gs.playedDevCard = false;
            // Promote newDevCards to playable devCards
            for (const [, ps] of gs.playerStates) {
                const keys: SAC_DevCard[] = ['knight', 'victoryPoint', 'roadBuilding', 'yearOfPlenty', 'monopoly'];
                for (const k of keys) {
                    ps.devCards[k] += ps.newDevCards[k];
                    ps.newDevCards[k] = 0;
                }
            }
            const currentIndex = gameData.gameState.turnOrder.findIndex(t => t === gameData.currentTurn);
            gameData.currentTurn = gameData.gameState.turnOrder[(currentIndex + 1) % gameData.gameState.turnOrder.length];
        }
    }

    CheckGameOver(gameData: IGameData): boolean {
        const sacData = gameData as ISettlementsAndCitiesGameData;
        const gs = sacData.specificGameState;
        if (gs.phase !== 'main') return false;
        for (const [userId, ps] of gs.playerStates) {
            const vp = calculateTotalVP(userId, gs.vertices, ps.devCards, gs.longestRoadOwner, gs.largestArmyOwner);
            if (vp >= 10) {
                sacData.complete = true;
                sacData.winner = userId;
                sacData.currentTurn = '';
                return true;
            }
        }
        return false;
    }
}

// ─── Setup commands ───────────────────────────────────────────────────────────

@serializable
export class SACPlaceSettlementSetup implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    vertexId: number = 0;
    readonly className = 'SACPlaceSettlementSetup';

    myString() { return `SAC PlaceSettlementSetup vertex=${this.vertexId}`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const sacData = gameData as ISettlementsAndCitiesGameData;
        const gs = sacData.specificGameState;

        if (gs.phase !== 'setup' || gs.pendingRoadSetup) return { validMove: false, turnOver: false };
        if (!isValidSettlementVertex(this.vertexId, gs.vertices)) return { validMove: false, turnOver: false };

        gs.vertices[this.vertexId].building = 'settlement';
        gs.vertices[this.vertexId].owner = this.senderId;

        const ps = gs.playerStates.get(this.senderId);
        if (ps) {
            ps.remainingSettlements--;
            // Give starting resources for the second round of placements
            const N = sacData.gameState.turnOrder.length;
            if (gs.setupStep >= N) {
                for (const hexId of BOARD_TOPOLOGY.vertexHexes[this.vertexId]) {
                    const hex = gs.hexes[hexId];
                    if (hex.numberToken !== null) {
                        const resource = TERRAIN_TO_RESOURCE[hex.terrain];
                        if (resource) ps.resources[resource]++;
                    }
                }
            }
        }

        gs.pendingRoadSetup = true;
        gs.lastSetupSettlementVertex = this.vertexId;

        sacData.gameState.history.unshift(
            `${this.senderUsername} placed a settlement (setup)`
        );
        return { validMove: true, turnOver: false };
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}

@serializable
export class SACPlaceRoadSetup implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    edgeId: number = 0;
    readonly className = 'SACPlaceRoadSetup';

    myString() { return `SAC PlaceRoadSetup edge=${this.edgeId}`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const sacData = gameData as ISettlementsAndCitiesGameData;
        const gs = sacData.specificGameState;

        if (gs.phase !== 'setup' || !gs.pendingRoadSetup) return { validMove: false, turnOver: false };
        if (gs.lastSetupSettlementVertex === null) return { validMove: false, turnOver: false };
        if (!isValidSetupRoadEdge(this.edgeId, gs.lastSetupSettlementVertex, gs.edges)) {
            return { validMove: false, turnOver: false };
        }

        gs.edges[this.edgeId].hasRoad = true;
        gs.edges[this.edgeId].owner = this.senderId;

        const ps = gs.playerStates.get(this.senderId);
        if (ps) ps.remainingRoads--;

        gs.pendingRoadSetup = false;
        gs.lastSetupSettlementVertex = null;

        sacData.gameState.history.unshift(`${this.senderUsername} placed a road (setup)`);
        return { validMove: true, turnOver: true };
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}

// ─── Main-phase pre-roll: play knight ─────────────────────────────────────────

@serializable
export class SACPlayKnight implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    readonly className = 'SACPlayKnight';

    myString() { return `SAC PlayKnight`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const sacData = gameData as ISettlementsAndCitiesGameData;
        const gs = sacData.specificGameState;

        if (gs.phase !== 'main') return { validMove: false, turnOver: false };
        if (gs.hasRolled) return { validMove: false, turnOver: false };
        if (gs.playedDevCard) return { validMove: false, turnOver: false };

        const ps = gs.playerStates.get(this.senderId);
        if (!ps || ps.devCards.knight < 1) return { validMove: false, turnOver: false };

        ps.devCards.knight--;
        ps.knightsPlayed++;
        gs.playedDevCard = true;
        gs.pendingRobber = true;

        sacUpdateLargestArmy(sacData);

        sacData.gameState.history.unshift(`${this.senderUsername} played a Knight card`);
        return { validMove: true, turnOver: false };
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}

// ─── Roll dice ────────────────────────────────────────────────────────────────

@serializable
export class SACRollDice implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    readonly className = 'SACRollDice';

    myString() { return `SAC RollDice`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const sacData = gameData as ISettlementsAndCitiesGameData;
        const gs = sacData.specificGameState;

        if (gs.phase !== 'main') return { validMove: false, turnOver: false };
        if (gs.hasRolled) return { validMove: false, turnOver: false };
        if (gs.pendingRobber) return { validMove: false, turnOver: false };

        const roll = DiceRoll(6) + DiceRoll(6);
        gs.lastRoll = roll;

        if (roll === 7) {
            sacData.gameState.history.unshift(`${this.senderUsername} rolled a ${roll}`);
            // Discard phase: auto-discard for all players with >7 cards
            for (const [, ps] of gs.playerStates) {
                sacDiscardHalf(ps);
            }
            gs.pendingRobber = true;
        } else {
            const resourceDistributions = new Map<string, Partial<Record<SAC_Resource, number>>>();
            // Distribute resources
            for (const [hexId, hex] of gs.hexes.entries()) {
                if (hex.numberToken !== roll) continue;
                if (hexId === gs.robberHexIndex) continue;
                const resource = TERRAIN_TO_RESOURCE[hex.terrain];
                if (!resource) continue;

                for (const vertexId of BOARD_TOPOLOGY.hexVertices[hexId]) {
                    const vertex = gs.vertices[vertexId];
                    if (!vertex.owner) continue;
                    const ps = gs.playerStates.get(vertex.owner);
                    if (!ps) continue;
                    const amount = vertex.building === 'city' ? 2 : 1;
                    ps.resources[resource] += amount;

                    const playerResources = resourceDistributions.get(vertex.owner) ?? {};
                    playerResources[resource] = (playerResources[resource] ?? 0) + amount;
                    resourceDistributions.set(vertex.owner, playerResources);
                }
            }

            const summary = Array.from(resourceDistributions.entries()).map(([userId, resources]) => {
                const resourceList = Object.entries(resources)
                    .map(([resource, amount]) => `${amount} ${resource}`)
                    .join(', ');
                return `${userId} received ${resourceList}`;
            }).join('; ');

            sacData.gameState.history.unshift(
                `${this.senderUsername} rolled a ${roll}${summary ? `: ${summary}` : ''}`
            );
        }

        gs.hasRolled = true;
        return { validMove: true, turnOver: false };
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}

// ─── Move robber ──────────────────────────────────────────────────────────────

@serializable
export class SACMoveRobber implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    hexId: number = 0;
    stealFromUserId: string | null = null;
    readonly className = 'SACMoveRobber';

    myString() { return `SAC MoveRobber hex=${this.hexId} stealFrom=${this.stealFromUserId}`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const sacData = gameData as ISettlementsAndCitiesGameData;
        const gs = sacData.specificGameState;

        if (!gs.pendingRobber) return { validMove: false, turnOver: false };
        if (this.hexId === gs.robberHexIndex) return { validMove: false, turnOver: false };
        if (this.hexId < 0 || this.hexId >= gs.hexes.length) return { validMove: false, turnOver: false };

        // Determine eligible players (have settlement/city adjacent, have resources, not self)
        const adjacentUserIds = new Set<string>();
        for (const vertexId of BOARD_TOPOLOGY.hexVertices[this.hexId]) {
            const v = gs.vertices[vertexId];
            if (v.owner && v.owner !== this.senderId && v.building) {
                const tps = gs.playerStates.get(v.owner);
                if (tps && sacTotalResources(tps) > 0) adjacentUserIds.add(v.owner);
            }
        }

        if (this.stealFromUserId !== null) {
            if (!adjacentUserIds.has(this.stealFromUserId)) return { validMove: false, turnOver: false };
            // Steal one random resource
            const victim = gs.playerStates.get(this.stealFromUserId)!;
            const pool: SAC_Resource[] = [];
            const resourceKeys: SAC_Resource[] = ['lumber', 'wool', 'grain', 'brick', 'ore'];
            for (const r of resourceKeys) {
                for (let i = 0; i < victim.resources[r]; i++) pool.push(r);
            }
            if (pool.length > 0) {
                const stolen = pool[Math.floor(Math.random() * pool.length)];
                victim.resources[stolen]--;
                const thief = gs.playerStates.get(this.senderId);
                if (thief) thief.resources[stolen]++;
                sacData.gameState.history.unshift(
                    `${this.senderUsername} moved the robber and stole a resource`
                );
            }
        } else if (adjacentUserIds.size > 0) {
            // Must specify someone to steal from
            return { validMove: false, turnOver: false };
        } else {
            sacData.gameState.history.unshift(`${this.senderUsername} moved the robber`);
        }

        gs.robberHexIndex = this.hexId;
        gs.pendingRobber = false;
        return { validMove: true, turnOver: false };
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}

// ─── Build road ───────────────────────────────────────────────────────────────

@serializable
export class SACBuildRoad implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    edgeId: number = 0;
    readonly className = 'SACBuildRoad';

    myString() { return `SAC BuildRoad edge=${this.edgeId}`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const sacData = gameData as ISettlementsAndCitiesGameData;
        const gs = sacData.specificGameState;

        if (gs.phase !== 'main') return { validMove: false, turnOver: false };
        if (gs.pendingRobber) return { validMove: false, turnOver: false };

        const isFreeRoad = gs.pendingRoadBuilding > 0;
        if (!isFreeRoad && !gs.hasRolled) return { validMove: false, turnOver: false };

        if (!isValidRoadEdge(this.edgeId, this.senderId, gs.vertices, gs.edges)) {
            return { validMove: false, turnOver: false };
        }

        const ps = gs.playerStates.get(this.senderId);
        if (!ps) return { validMove: false, turnOver: false };
        if (ps.remainingRoads <= 0) return { validMove: false, turnOver: false };

        if (!isFreeRoad) {
            if (ps.resources.brick < 1 || ps.resources.lumber < 1) return { validMove: false, turnOver: false };
            ps.resources.brick--;
            ps.resources.lumber--;
        } else {
            gs.pendingRoadBuilding--;
        }

        gs.edges[this.edgeId].hasRoad = true;
        gs.edges[this.edgeId].owner = this.senderId;
        ps.remainingRoads--;

        sacUpdateLongestRoad(sacData);
        sacData.gameState.history.unshift(`${this.senderUsername} built a road`);
        return { validMove: true, turnOver: false };
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}

// ─── Build settlement ─────────────────────────────────────────────────────────

@serializable
export class SACBuildSettlement implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    vertexId: number = 0;
    readonly className = 'SACBuildSettlement';

    myString() { return `SAC BuildSettlement vertex=${this.vertexId}`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const sacData = gameData as ISettlementsAndCitiesGameData;
        const gs = sacData.specificGameState;

        if (gs.phase !== 'main' || !gs.hasRolled) return { validMove: false, turnOver: false };
        if (gs.pendingRobber) return { validMove: false, turnOver: false };

        if (!isValidSettlementVertex(this.vertexId, gs.vertices)) return { validMove: false, turnOver: false };

        // Must be connected by own road
        const connectedByRoad = BOARD_TOPOLOGY.vertexEdges[this.vertexId].some(
            eid => gs.edges[eid].hasRoad && gs.edges[eid].owner === this.senderId
        );
        if (!connectedByRoad) return { validMove: false, turnOver: false };

        const ps = gs.playerStates.get(this.senderId);
        if (!ps) return { validMove: false, turnOver: false };
        if (ps.remainingSettlements <= 0) return { validMove: false, turnOver: false };
        if (ps.resources.brick < 1 || ps.resources.lumber < 1 ||
            ps.resources.wool < 1 || ps.resources.grain < 1) {
            return { validMove: false, turnOver: false };
        }

        ps.resources.brick--;
        ps.resources.lumber--;
        ps.resources.wool--;
        ps.resources.grain--;
        ps.remainingSettlements--;

        gs.vertices[this.vertexId].building = 'settlement';
        gs.vertices[this.vertexId].owner = this.senderId;

        sacData.gameState.history.unshift(`${this.senderUsername} built a settlement`);
        return { validMove: true, turnOver: false };
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}

// ─── Build city ───────────────────────────────────────────────────────────────

@serializable
export class SACBuildCity implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    vertexId: number = 0;
    readonly className = 'SACBuildCity';

    myString() { return `SAC BuildCity vertex=${this.vertexId}`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const sacData = gameData as ISettlementsAndCitiesGameData;
        const gs = sacData.specificGameState;

        if (gs.phase !== 'main' || !gs.hasRolled) return { validMove: false, turnOver: false };
        if (gs.pendingRobber) return { validMove: false, turnOver: false };

        const vertex = gs.vertices[this.vertexId];
        if (vertex.building !== 'settlement' || vertex.owner !== this.senderId) {
            return { validMove: false, turnOver: false };
        }

        const ps = gs.playerStates.get(this.senderId);
        if (!ps) return { validMove: false, turnOver: false };
        if (ps.remainingCities <= 0) return { validMove: false, turnOver: false };
        if (ps.resources.grain < 2 || ps.resources.ore < 3) return { validMove: false, turnOver: false };

        ps.resources.grain -= 2;
        ps.resources.ore -= 3;
        ps.remainingCities--;
        ps.remainingSettlements++;

        gs.vertices[this.vertexId].building = 'city';

        sacData.gameState.history.unshift(`${this.senderUsername} built a city`);
        return { validMove: true, turnOver: false };
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}

// ─── Buy dev card ─────────────────────────────────────────────────────────────

@serializable
export class SACBuyDevCard implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    readonly className = 'SACBuyDevCard';

    myString() { return `SAC BuyDevCard`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const sacData = gameData as ISettlementsAndCitiesGameData;
        const gs = sacData.specificGameState;

        if (gs.phase !== 'main' || !gs.hasRolled) return { validMove: false, turnOver: false };
        if (gs.pendingRobber) return { validMove: false, turnOver: false };
        if (gs.devCardDeck.length === 0) return { validMove: false, turnOver: false };

        const ps = gs.playerStates.get(this.senderId);
        if (!ps) return { validMove: false, turnOver: false };
        if (ps.resources.wool < 1 || ps.resources.grain < 1 || ps.resources.ore < 1) {
            return { validMove: false, turnOver: false };
        }

        ps.resources.wool--;
        ps.resources.grain--;
        ps.resources.ore--;

        const card = gs.devCardDeck.pop()!;
        ps.newDevCards[card]++;

        sacData.gameState.history.unshift(`${this.senderUsername} bought a development card`);
        return { validMove: true, turnOver: false };
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}

// ─── Play Road Building ───────────────────────────────────────────────────────

@serializable
export class SACPlayRoadBuilding implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    readonly className = 'SACPlayRoadBuilding';

    myString() { return `SAC PlayRoadBuilding`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const sacData = gameData as ISettlementsAndCitiesGameData;
        const gs = sacData.specificGameState;

        if (gs.phase !== 'main' || !gs.hasRolled) return { validMove: false, turnOver: false };
        if (gs.pendingRobber || gs.playedDevCard) return { validMove: false, turnOver: false };

        const ps = gs.playerStates.get(this.senderId);
        if (!ps || ps.devCards.roadBuilding < 1) return { validMove: false, turnOver: false };

        ps.devCards.roadBuilding--;
        gs.playedDevCard = true;
        gs.pendingRoadBuilding = 2;

        sacData.gameState.history.unshift(`${this.senderUsername} played Road Building`);
        return { validMove: true, turnOver: false };
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}

// ─── Play Year of Plenty ──────────────────────────────────────────────────────

@serializable
export class SACPlayYearOfPlenty implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    resource1: SAC_Resource = 'lumber';
    resource2: SAC_Resource = 'lumber';
    readonly className = 'SACPlayYearOfPlenty';

    myString() { return `SAC PlayYearOfPlenty r1=${this.resource1} r2=${this.resource2}`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const sacData = gameData as ISettlementsAndCitiesGameData;
        const gs = sacData.specificGameState;

        if (gs.phase !== 'main' || !gs.hasRolled) return { validMove: false, turnOver: false };
        if (gs.pendingRobber || gs.playedDevCard) return { validMove: false, turnOver: false };

        const ps = gs.playerStates.get(this.senderId);
        if (!ps || ps.devCards.yearOfPlenty < 1) return { validMove: false, turnOver: false };

        ps.devCards.yearOfPlenty--;
        gs.playedDevCard = true;
        ps.resources[this.resource1]++;
        ps.resources[this.resource2]++;

        sacData.gameState.history.unshift(
            `${this.senderUsername} played Year of Plenty (+${this.resource1}, +${this.resource2})`
        );
        return { validMove: true, turnOver: false };
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}

// ─── Play Monopoly ────────────────────────────────────────────────────────────

@serializable
export class SACPlayMonopoly implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    resource: SAC_Resource = 'lumber';
    readonly className = 'SACPlayMonopoly';

    myString() { return `SAC PlayMonopoly resource=${this.resource}`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const sacData = gameData as ISettlementsAndCitiesGameData;
        const gs = sacData.specificGameState;

        if (gs.phase !== 'main' || !gs.hasRolled) return { validMove: false, turnOver: false };
        if (gs.pendingRobber || gs.playedDevCard) return { validMove: false, turnOver: false };

        const ps = gs.playerStates.get(this.senderId);
        if (!ps || ps.devCards.monopoly < 1) return { validMove: false, turnOver: false };

        ps.devCards.monopoly--;
        gs.playedDevCard = true;

        let total = 0;
        for (const [userId, other] of gs.playerStates) {
            if (userId === this.senderId) continue;
            total += other.resources[this.resource];
            other.resources[this.resource] = 0;
        }
        ps.resources[this.resource] += total;

        sacData.gameState.history.unshift(
            `${this.senderUsername} played Monopoly on ${this.resource} (+${total})`
        );
        return { validMove: true, turnOver: false };
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}

// ─── Maritime trade ───────────────────────────────────────────────────────────

@serializable
export class SACMaritimeTrade implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    offerResource: SAC_Resource = 'lumber';
    wantResource: SAC_Resource = 'wool';
    readonly className = 'SACMaritimeTrade';

    myString() { return `SAC MaritimeTrade offer=${this.offerResource} want=${this.wantResource}`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const sacData = gameData as ISettlementsAndCitiesGameData;
        const gs = sacData.specificGameState;

        if (gs.phase !== 'main' || !gs.hasRolled) return { validMove: false, turnOver: false };
        if (gs.pendingRobber) return { validMove: false, turnOver: false };
        if (this.offerResource === this.wantResource) return { validMove: false, turnOver: false };

        const ps = gs.playerStates.get(this.senderId);
        if (!ps) return { validMove: false, turnOver: false };

        // Determine trade ratio
        let ratio = 4;
        for (const harbor of gs.harbors) {
            const hasAccess = harbor.vertices.some(vid => {
                const v = gs.vertices[vid];
                return v.owner === this.senderId && v.building !== null;
            });
            if (!hasAccess) continue;
            if (harbor.type === '3to1' && ratio > 3) ratio = 3;
            if (harbor.type === this.offerResource) { ratio = 2; break; }
        }

        if (ps.resources[this.offerResource] < ratio) return { validMove: false, turnOver: false };

        ps.resources[this.offerResource] -= ratio;
        ps.resources[this.wantResource]++;

        sacData.gameState.history.unshift(
            `${this.senderUsername} traded ${ratio}x ${this.offerResource} → 1x ${this.wantResource}`
        );
        return { validMove: true, turnOver: false };
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}

// ─── End turn ─────────────────────────────────────────────────────────────────

@serializable
export class SACEndTurn implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    readonly className = 'SACEndTurn';

    myString() { return `SAC EndTurn`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const sacData = gameData as ISettlementsAndCitiesGameData;
        const gs = sacData.specificGameState;

        if (gs.phase !== 'main') return { validMove: false, turnOver: false };
        if (!gs.hasRolled) return { validMove: false, turnOver: false };
        if (gs.pendingRobber) return { validMove: false, turnOver: false };
        if (gs.pendingRoadBuilding > 0) return { validMove: false, turnOver: false };

        sacData.gameState.history.unshift(`${this.senderUsername} ended their turn`);
        return { validMove: true, turnOver: true };
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}
