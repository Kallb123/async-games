import type { IDiceCitiesGameData, IDiceCitiesPlayerState } from "@/games/DiceCities/DiceCitiesModels";
import type { IDiceCitiesCard } from "@/games/DiceCities/apiModels";
import type { IGameData } from "@/utils/mongodb/GameData";
import type { uuidString } from "@/utils/apiModels/GameDataApi";
import type { ICommandOutcome, IGameCommand, IGameType } from "@/utils/apiModels/gameCommand";
import { deserializeJSON, serializable } from "@/utils/apiModels/Serialisable";
import { DiceRoll } from "@/utils/games/DiceRoll";
import { DiceCitiesCardIds, DiceCitiesCards } from "@/games/DiceCities/cards";
import { v4 as uuidv4, NIL as NIL_UUID } from 'uuid';

export interface IDiceCitiesDiceRollOutcome extends ICommandOutcome {
    roll1: number,
    roll2: number | null,
    moneyChanges: Map<string, number>,
    // Per-player totalCoinsEarned deltas from this roll (bank payouts, steals
    // received) - unlike moneyChanges this is never negative, so Undo can
    // subtract it back out when a Radio Tower reroll discards this roll.
    coinsEarnedChanges: Map<string, number>
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
    coinsEarnedChanges: Map<string, number> = new Map;
    // Recorded RNG outcomes, populated on first Execute so the roll can be
    // deterministically replayed (turn recap / planning).
    recordedRoll1?: number;
    recordedRoll2?: number | null;
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
        const outcome: IDiceCitiesDiceRollOutcome = doDiceRoll(dcGameData, this.doubleDice, recordedRolls(this.recordedRoll1, this.recordedRoll2));
        this.recordedRoll1 = outcome.roll1;
        this.recordedRoll2 = outcome.roll2;
        dcGameData.specificGameState.hasReRolled = false;
        this.moneyChanges = outcome.moneyChanges;
        this.coinsEarnedChanges = outcome.coinsEarnedChanges;
        let totalRoll = this.doubleDice && outcome.roll2 ? outcome.roll1 + outcome.roll2 : outcome.roll1;

        currentPlayerState!.lastDiceSelection = this.doubleDice ? 2 : 1;

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

        const coinsEarnedMap: Map<string, number> = new Map(Object.entries(this.coinsEarnedChanges));

        coinsEarnedMap.forEach((coinsEarnedChange, userId) => {
            const playerState = dcGameData.specificGameState.playerStates.get(userId);
            if (!playerState) {
                return;
            }

            playerState.totalCoinsEarned -= coinsEarnedChange;
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
        rollerState.totalCoinsEarned += amountToSteal;

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
    // Recorded RNG outcomes for the re-roll, so it can be deterministically replayed.
    recordedRoll1?: number;
    recordedRoll2?: number | null;
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

        const outcome: IDiceCitiesDiceRollOutcome = doDiceRoll(dcGameData, doubleDice, recordedRolls(this.recordedRoll1, this.recordedRoll2));
        this.recordedRoll1 = outcome.roll1;
        this.recordedRoll2 = outcome.roll2;
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

// Bundles recorded dice values for replay, or returns undefined for a fresh roll.
function recordedRolls(roll1?: number, roll2?: number | null): { roll1: number, roll2: number | null } | undefined {
    return roll1 === undefined ? undefined : { roll1, roll2: roll2 ?? null };
}

function doDiceRoll(dcGameData: IDiceCitiesGameData, isDouble: boolean, recorded?: { roll1: number, roll2: number | null }): IDiceCitiesDiceRollOutcome {
    const roll1 = recorded?.roll1 ?? DiceRoll(6);
    let roll2: number | null = null;
    let totalRoll = roll1;
    if (isDouble) {
        roll2 = recorded?.roll2 ?? DiceRoll(6);
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
            moneyChanges: new Map,
            coinsEarnedChanges: new Map
        };
    }

    if (roll1 === roll2 && rollerState.oneReroll) {
        dcGameData.specificGameState.awaitingDoubleReroll = true;
    }

    const moneyChanges: Map<string, number> = new Map;
    const coinsEarnedChanges: Map<string, number> = new Map;
    dcGameData.specificGameState.playerStates.forEach((ps, userId) => {
        moneyChanges.set(userId, 0);
        coinsEarnedChanges.set(userId, 0);
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
            playerState.totalCoinsEarned += amountToSteal;
            coinsEarnedChanges.set(userId, (coinsEarnedChanges.get(userId) ?? 0) + amountToSteal);
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
                const numCards = playerState.cards.reduce((total, cc) => {
                    const cardObject = DiceCitiesCards[cc.card.toString()];
                    if (card.gainMultiplier?.type.includes(cardObject.type)) {
                        return total + cc.amount;
                    }
                    return total;
                }, 0);
                cardAmount = card.gainMultiplier.amountPerType * numCards;
            } else {
                // What card is this??
                console.error("Ended up with no money for card:", card);
            }
            // TODO: Consider bank money? (42*1 + 24*5 + 12*10 = 42+120+120 = 282)
            playerState.money += cardAmount;
            playerState.totalCoinsEarned += cardAmount;
            coinsEarnedChanges.set(userId, (coinsEarnedChanges.get(userId) ?? 0) + cardAmount);
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
                rollerState.totalCoinsEarned += amountToSteal;
                coinsEarnedChanges.set(dcGameData.currentTurn, (coinsEarnedChanges.get(dcGameData.currentTurn) ?? 0) + amountToSteal);
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
        moneyChanges,
        coinsEarnedChanges
    }
    return outcome;
}
