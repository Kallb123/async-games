import type { IDiceCitiesGameData, IDiceCitiesGameState, IDiceCitiesPlayerState } from "@/games/DiceCities/DiceCitiesModels";
import type { IDiceCitiesCard } from "@/games/DiceCities/apiModels";
import type { IGameData } from "@/utils/mongodb/GameData";
import type { uuidString } from "@/utils/apiModels/GameDataApi";
import type { ICommandOutcome, IGameCommand, IGameType } from "@/utils/apiModels/gameCommand";
import { deserializeJSON, serializable } from "@/utils/apiModels/Serialisable";
import { playerHistory, userToken } from "@/utils/games/history";
import { DiceRoll } from "@/utils/games/DiceRoll";
import { mongoMap } from "@/utils/games/mongoMaps";
import { DiceCitiesCardIds, DiceCitiesCards, HARBOUR_BONUS, HARBOUR_MIN_ROLL, TUNA_DICE, TUNA_DIE_SIDES } from "@/games/DiceCities/cards";
import type { DiceCitiesBuildFlag } from "@/games/DiceCities/ui";
import { v4 as uuidv4, NIL as NIL_UUID } from 'uuid';

export interface IDiceCitiesDiceRollOutcome extends ICommandOutcome {
    roll1: number,
    roll2: number | null,
    moneyChanges: Map<string, number>,
    // Per-player totalCoinsEarned deltas from this roll (bank payouts, steals
    // received) - unlike moneyChanges this is never negative, so Undo can
    // subtract it back out when a Radio Tower reroll discards this roll.
    coinsEarnedChanges: Map<string, number>,
    // Net change to the bank's balance from this roll: negative by whatever it
    // paid out (steals only move coins between players). Recorded so Undo can
    // put those coins back when a Radio Tower reroll discards the roll.
    bankChange: number,
    // Docks: what the shared tuna dice totalled, when a Tuna Boat activated.
    tunaRoll?: number | null
}

// The two commands that can pay a roll out - the roll itself, and the Harbour
// bonus that resolves a parked one. Both record what they moved so a Radio
// Tower re-roll can hand every coin back, whichever of them actually paid.
type RollPayoutCommand = DiceCitiesRequestDiceRoll | DiceCitiesRequestHarbourBonus;

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
    bankChange: number = 0;
    // Recorded RNG outcomes, populated on first Execute so the roll can be
    // deterministically replayed (turn recap / planning).
    recordedRoll1?: number;
    recordedRoll2?: number | null;
    recordedTunaRoll?: number | null;
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
             || dcGameData.specificGameState.awaitingHarbourChoice
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
        const outcome: IDiceCitiesDiceRollOutcome = doDiceRoll(dcGameData, this.doubleDice, recordedRolls(this.recordedRoll1, this.recordedRoll2, this.recordedTunaRoll));
        this.recordedRoll1 = outcome.roll1;
        this.recordedRoll2 = outcome.roll2;
        this.recordedTunaRoll = outcome.tunaRoll ?? null;
        dcGameData.specificGameState.hasReRolled = false;
        this.moneyChanges = outcome.moneyChanges;
        this.coinsEarnedChanges = outcome.coinsEarnedChanges;
        this.bankChange = outcome.bankChange;
        let totalRoll = this.doubleDice && outcome.roll2 ? outcome.roll1 + outcome.roll2 : outcome.roll1;

        currentPlayerState!.lastDiceSelection = this.doubleDice ? 2 : 1;

        dcGameData.gameState.history.unshift(playerHistory(this.senderId, `rolled a ${totalRoll}${outcome.roll2 ? ` (${outcome.roll1} and ${outcome.roll2})` : ""}`));

        // TODO: Maybe end turn if nothin available to buy?
        return outcome;
    }

    Undo (gameData: IGameData) {
        undoRollPayout(gameData as IDiceCitiesGameData, this);
        // The discarded roll leaves the log with the coins it moved.
        gameData.gameState.commandHistory.pop();
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

        payCostToBank(dcGameData.specificGameState, currentPlayerState, cardObject.cost);

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
        dcGameData.gameState.history.unshift(playerHistory(this.senderId, `bought a ${cardObject.title}`));
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
        dcGameData.gameState.history.unshift(playerHistory(this.senderId, `passed their turn`));
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
        return buildLandmark(gameData, DiceCitiesCardIds.TRAIN_STATION, "doubleUnlocked", this.senderId);
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
        return buildLandmark(gameData, DiceCitiesCardIds.SHOPPING_MALL, "bonusDiningAndStore", this.senderId);
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
        return buildLandmark(gameData, DiceCitiesCardIds.AMUSEMENT_PARK, "rerollDoubles", this.senderId);
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
        return buildLandmark(gameData, DiceCitiesCardIds.RADIO_TOWER, "oneReroll", this.senderId);
    }

    Undo (gameData: IGameData) {
        // TODO: Implement Undo
        console.error("Command Undo not implemented yet")
    }
}

// Docks only: the fifth landmark. Built like the other four - and, unlike them,
// buildable before any of them - but it never counts toward the win.
@serializable
export class DiceCitiesRequestUnlockHarbour implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = (new Date()).toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = "Unknown";
    senderUsername: string = "Unknown";
    readonly className = "DiceCitiesRequestUnlockHarbour";

    myString() {
        return `Harbour!`;
    }

    async Execute(gameData: IGameData) {
        if ((gameData as IDiceCitiesGameData).specificGameState.enabledDocks !== true) {
            return {
                turnOver: false,
                validMove: false
            };
        }
        return buildLandmark(gameData, DiceCitiesCardIds.HARBOUR, "harbourUnlocked", this.senderId);
    }

    Undo (gameData: IGameData) {
        // TODO: Implement Undo
        console.error("Command Undo not implemented yet")
    }
}

// Docks only: answers the Harbour's "you may add 2" on a parked 10-or-better
// roll. The dice have already been thrown and are held in state; this is what
// settles the total and pays everyone out.
@serializable
export class DiceCitiesRequestHarbourBonus implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = (new Date()).toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = "Unknown";
    senderUsername: string = "Unknown";
    addBonus: boolean = false;
    moneyChanges: Map<string, number> = new Map;
    coinsEarnedChanges: Map<string, number> = new Map;
    bankChange: number = 0;
    // Recorded RNG outcome of the shared tuna throw, so the payout replays.
    recordedTunaRoll?: number | null;
    readonly className = "DiceCitiesRequestHarbourBonus";

    myString() {
        return `Harbour bonus! Take it? ${this.addBonus ? "True" : "False"}`;
    }

    async Execute(gameData: IGameData) {
        const dcGameData = gameData as IDiceCitiesGameData;
        const gameState = dcGameData.specificGameState;
        if (!gameState.awaitingHarbourChoice || gameState.harbourRoll1 === null) {
            return {
                turnOver: false,
                validMove: false
            };
        }

        const rollerState = dcGameData.specificGameState.playerStates.get(dcGameData.currentTurn);
        if (!rollerState) {
            return {
                turnOver: false,
                validMove: false
            };
        }

        const rolled = gameState.harbourRoll1 + (gameState.harbourRoll2 ?? 0);
        const totalRoll = this.addBonus ? rolled + HARBOUR_BONUS : rolled;

        const outcome = resolveRoll(dcGameData, rollerState, totalRoll, gameState.harbourRoll1, gameState.harbourRoll2, this.recordedTunaRoll ?? undefined);
        this.moneyChanges = outcome.moneyChanges;
        this.coinsEarnedChanges = outcome.coinsEarnedChanges;
        this.bankChange = outcome.bankChange;
        this.recordedTunaRoll = outcome.tunaRoll ?? null;

        gameState.awaitingHarbourChoice = false;
        gameState.harbourRoll1 = null;
        gameState.harbourRoll2 = null;

        dcGameData.gameState.history.unshift(playerHistory(this.senderId, this.addBonus
            ? `used the Harbour to turn a ${rolled} into a ${totalRoll}`
            : `passed on the Harbour's bonus and stayed on ${rolled}`));
        return outcome;
    }

    Undo (gameData: IGameData) {
        // Leaves itself in the command log on purpose: the roll it settled paid
        // nothing on its own, so the log needs this entry to replay the turn.
        undoRollPayout(gameData as IDiceCitiesGameData, this);
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

        dcGameData.gameState.history.unshift(playerHistory(this.senderId, `stole ${amountToSteal} coins from ${userToken(selectedUserId)}`));
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

        dcGameData.gameState.history.unshift(playerHistory(
            this.senderId,
            `stole a ${selectedOpponentCard.title} for a ${selectedOwnCard.title} coins from ${userToken(dcGameData.specificGameState.bcSelectedOpponent)}`
        ));
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

        dcGameData.gameState.history.unshift(playerHistory(
            this.senderId,
            `stole a ${selectedOpponentCard.title} for a ${selectedOwnCard.title} coins from ${userToken(dcGameData.specificGameState.bcSelectedOpponent)}`
        ));
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
    recordedTunaRoll?: number | null;
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
        const rollerState = dcGameData.specificGameState.playerStates.get(dcGameData.currentTurn);
        if (!rollerState) {
            return {
                turnOver: false,
                validMove: false
            }
        }
        const lastCommand = dcGameData.gameState.commandHistory.findLast(() => true);
        // Persisted history hands back plain objects that need rehydrating, but
        // during replay the entry is already the live command instance - and
        // stringifying that would flatten its recorded moneyChanges Map to {},
        // leaving Undo nothing to reverse.
        const lastPayout = isRollPayoutCommand(lastCommand)
            ? lastCommand
            : deserializeJSON(JSON.stringify(lastCommand));
        if (!isRollPayoutCommand(lastPayout)) {
            console.log("last command:", lastCommand);
            return {
                turnOver: false,
                validMove: false
            }
        }
        // The roll being discarded set this when it was made.
        const doubleDice = rollerState.lastDiceSelection === 2;

        // Reverses the discarded roll: every coin it moved goes back where it
        // came from, including to the bank.
        lastPayout.Undo(dcGameData);

        dcGameData.specificGameState.awaitingBCSelectionOpponent = false;
        dcGameData.specificGameState.awaitingBCSelectionOwn = false;
        dcGameData.specificGameState.awaitingTSSelection = false;
        dcGameData.specificGameState.awaitingDoubleReroll = false;
        dcGameData.specificGameState.bcSelectedOpponent = "";
        dcGameData.specificGameState.bcSelectedOpponent = "";
        dcGameData.specificGameState.bcSelectedOpponentCard = NIL_UUID as uuidString;
        dcGameData.specificGameState.hasReRolled = true;

        const outcome: IDiceCitiesDiceRollOutcome = doDiceRoll(dcGameData, doubleDice, recordedRolls(this.recordedRoll1, this.recordedRoll2, this.recordedTunaRoll));
        this.recordedRoll1 = outcome.roll1;
        this.recordedRoll2 = outcome.roll2;
        this.recordedTunaRoll = outcome.tunaRoll ?? null;
        let totalRoll = doubleDice && outcome.roll2 ? outcome.roll1 + outcome.roll2 : outcome.roll1;

        dcGameData.gameState.history.unshift(playerHistory(this.senderId, `re-rolled for a ${totalRoll}${outcome.roll2 ? ` (${outcome.roll1} and ${outcome.roll2})` : ""}`));
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

// Coins a player spends on a card go back into the bank - the coin supply is
// fixed, so spending is what refills it.
function payCostToBank(gameState: IDiceCitiesGameState, playerState: IDiceCitiesPlayerState, cost: number) {
    playerState.money -= cost;
    gameState.bankMoney += cost;
}

// Draws up to `amount` out of the bank, returning what it could actually pay.
// The bank never pays out coins it doesn't hold, so a player can't be handed
// coins that don't exist.
function takeFromBank(gameState: IDiceCitiesGameState, amount: number): number {
    const paid = Math.min(amount, gameState.bankMoney);
    gameState.bankMoney -= paid;
    return paid;
}

// The RNG a roll has to reproduce when it is replayed: the dice, plus the
// shared tuna throw when a Tuna Boat was in play.
interface IRecordedRolls {
    roll1: number,
    roll2: number | null,
    tunaRoll: number | null
}

// The tuna haul's own throw: TUNA_DICE dice summed, so it is 2-12 with a peak
// at 7 rather than the flat spread a single die of twice the size would give.
function rollTunaHaul(): number {
    let total = 0;
    for (let i = 0; i < TUNA_DICE; i++) {
        total += DiceRoll(TUNA_DIE_SIDES);
    }
    return total;
}

// Bundles recorded dice values for replay, or returns undefined for a fresh roll.
function recordedRolls(roll1?: number, roll2?: number | null, tunaRoll?: number | null): IRecordedRolls | undefined {
    return roll1 === undefined ? undefined : { roll1, roll2: roll2 ?? null, tunaRoll: tunaRoll ?? null };
}

// True for the commands that can pay a roll out - so a Radio Tower re-roll can
// reverse whichever of them settled the roll it is discarding.
function isRollPayoutCommand(command: unknown): command is RollPayoutCommand {
    return command instanceof DiceCitiesRequestDiceRoll || command instanceof DiceCitiesRequestHarbourBonus;
}

// Hands back every coin a roll's payout moved - to the players it came from and
// to the bank - and clears whatever the roll left the turn waiting on.
function undoRollPayout(dcGameData: IDiceCitiesGameData, command: RollPayoutCommand) {
    mongoMap(command.moneyChanges).forEach((moneyChange, userId) => {
        const playerState = dcGameData.specificGameState.playerStates.get(userId);
        if (!playerState) {
            return;
        }

        playerState.money -= moneyChange;
    });

    // Hand the bank back whatever this roll drew out of it, so the coin
    // supply still adds up once the roll is discarded.
    dcGameData.specificGameState.bankMoney -= command.bankChange;

    mongoMap(command.coinsEarnedChanges).forEach((coinsEarnedChange, userId) => {
        const playerState = dcGameData.specificGameState.playerStates.get(userId);
        if (!playerState) {
            return;
        }

        playerState.totalCoinsEarned -= coinsEarnedChange;
    });

    dcGameData.specificGameState.hasRolled = false;
    dcGameData.specificGameState.awaitingBCSelectionOwn = false;
    dcGameData.specificGameState.awaitingBCSelectionOpponent = false;
    dcGameData.specificGameState.awaitingTSSelection = false;
    dcGameData.specificGameState.awaitingDoubleReroll = false;
    dcGameData.specificGameState.awaitingHarbourChoice = false;
    dcGameData.specificGameState.harbourRoll1 = null;
    dcGameData.specificGameState.harbourRoll2 = null;
}

// Every landmark is bought the same way: by the active player, after their
// roll, at full price, once. All that differs is the flag it lights up.
function buildLandmark(gameData: IGameData, cardId: DiceCitiesCardIds, flag: DiceCitiesBuildFlag, senderId: string): ICommandOutcome {
    const dcGameData = gameData as IDiceCitiesGameData;
    const currentPlayerState = dcGameData.specificGameState.playerStates.get(dcGameData.currentTurn);
    if (!currentPlayerState) {
        console.error("Unable to find current player's state");
        return {
            turnOver: false,
            validMove: false
        };
    }

    if (!dcGameData.specificGameState.hasRolled) {
        return {
            turnOver: false,
            validMove: false
        };
    }

    const cardObject = DiceCitiesCards[cardId];

    if (cardObject.cost > currentPlayerState.money) {
        return {
            turnOver: false,
            validMove: false
        };
    }

    if (currentPlayerState[flag]) {
        return {
            turnOver: false,
            validMove: false
        };
    }

    payCostToBank(dcGameData.specificGameState, currentPlayerState, cardObject.cost);

    currentPlayerState[flag] = true;

    dcGameData.specificGameState.hasRolled = false;
    dcGameData.gameState.history.unshift(playerHistory(senderId, `bought a ${cardObject.title}`));
    return {
        turnOver: true,
        validMove: true
    };
}

// Docks: a Harbour owner gets to say whether a 10-or-better total takes the
// Harbour's +2, so a roll that big is parked rather than paid out.
function harbourChoiceOffered(dcGameData: IDiceCitiesGameData, rollerState: IDiceCitiesPlayerState, totalRoll: number): boolean {
    return dcGameData.specificGameState.enabledDocks === true && rollerState.harbourUnlocked === true && totalRoll >= HARBOUR_MIN_ROLL;
}

// A zeroed per-player delta map, the starting point for a roll's bookkeeping.
function zeroedChanges(dcGameData: IDiceCitiesGameData): Map<string, number> {
    const changes: Map<string, number> = new Map;
    dcGameData.specificGameState.playerStates.forEach((_ps, userId) => changes.set(userId, 0));
    return changes;
}

// A card only pays if its owner has the Harbour, when the Docks says so.
function cardIsActive(card: IDiceCitiesCard, playerState: IDiceCitiesPlayerState): boolean {
    return !card.requiresHarbour || playerState.harbourUnlocked === true;
}

function doDiceRoll(dcGameData: IDiceCitiesGameData, isDouble: boolean, recorded?: IRecordedRolls): IDiceCitiesDiceRollOutcome {
    const roll1 = recorded?.roll1 ?? DiceRoll(6);
    let roll2: number | null = null;
    if (isDouble) {
        roll2 = recorded?.roll2 ?? DiceRoll(6);
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
            coinsEarnedChanges: new Map,
            bankChange: 0
        };
    }

    if (roll1 === roll2 && rollerState.oneReroll) {
        dcGameData.specificGameState.awaitingDoubleReroll = true;
    }

    const totalRoll = roll1 + (roll2 ?? 0);

    // Park the roll until the Harbour's owner has decided about its +2 - nobody
    // is paid until the total is settled.
    if (harbourChoiceOffered(dcGameData, rollerState, totalRoll)) {
        dcGameData.specificGameState.awaitingHarbourChoice = true;
        dcGameData.specificGameState.harbourRoll1 = roll1;
        dcGameData.specificGameState.harbourRoll2 = roll2;
        dcGameData.specificGameState.hasRolled = false;
        return {
            turnOver: false,
            validMove: true,
            roll1,
            roll2,
            moneyChanges: zeroedChanges(dcGameData),
            coinsEarnedChanges: zeroedChanges(dcGameData),
            bankChange: 0,
            tunaRoll: null
        };
    }

    return resolveRoll(dcGameData, rollerState, totalRoll, roll1, roll2, recorded?.tunaRoll ?? undefined);
}

// Pays a settled total out across every city: restaurants first, then the bank's
// blue/green income, then the roller's purple majors. Split out from the roll
// itself because the Docks' Harbour can change the total after the dice land.
function resolveRoll(dcGameData: IDiceCitiesGameData, rollerState: IDiceCitiesPlayerState, totalRoll: number, roll1: number, roll2: number | null, recordedTunaRoll?: number): IDiceCitiesDiceRollOutcome {
    const moneyChanges: Map<string, number> = zeroedChanges(dcGameData);
    const coinsEarnedChanges: Map<string, number> = zeroedChanges(dcGameData);
    // What the bank paid out this roll, and what it couldn't cover.
    let bankPaid = 0;
    let bankShortfall = 0;
    // The Docks' shared tuna haul: two dice for the whole table, thrown at most
    // once per roll and only if a Tuna Boat actually activates. Every owner
    // earns the same total.
    let tunaRoll: number | null = null;
    const tunaHaul = (): number => {
        if (tunaRoll === null) {
            tunaRoll = recordedTunaRoll ?? rollTunaHaul();
        }
        return tunaRoll;
    };
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
            if (!cardIsActive(cardObject, playerState)) {
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
            if (cardObject.bankGain === 0 && cardObject.gainMultiplier === null && !cardObject.sharedDieGain) {
                return [];
            }
            if (!cardIsActive(cardObject, playerState)) {
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
            const multiplier = card.gainMultiplier;
            if (card.sharedDieGain) {
                cardAmount = tunaHaul();
            } else if (card.bankGain > 0) {
                cardAmount = card.bankGain;
            } else if (multiplier) {
                // A card counts if its icon group is named, or if the card
                // itself is - the Fruit and Vegetable Market counts every farm,
                // where the Flower Shop counts Flower Orchards alone.
                const numCards = playerState.cards.reduce((total, cc) => {
                    const cardObject = DiceCitiesCards[cc.card.toString()];
                    const counted = multiplier.type?.includes(cardObject.type)
                        || multiplier.cardIds?.includes(cardObject.cardId);
                    return counted ? total + cc.amount : total;
                }, 0);
                cardAmount = multiplier.amountPerType * numCards;
            } else {
                // What card is this??
                console.error("Ended up with no money for card:", card);
            }
            // The Shopping Mall pays a store card an extra coin every time it
            // activates, whatever worked out what it earns. Applied here rather
            // than inside the flat-amount branch, where it used to sit and so
            // never reached a card paid by a multiplier.
            if (card.type === "store" && playerState.bonusDiningAndStore) {
                cardAmount += 1;
            }
            // Card income comes out of the bank's fixed supply: if it can't cover
            // the full amount the player is paid what's left, not coins that
            // don't exist.
            const paid = takeFromBank(dcGameData.specificGameState, cardAmount);
            bankPaid += paid;
            bankShortfall += cardAmount - paid;
            playerState.money += paid;
            playerState.totalCoinsEarned += paid;
            coinsEarnedChanges.set(userId, (coinsEarnedChanges.get(userId) ?? 0) + paid);
            moneyChanges.set(userId, (moneyChanges.get(userId) ?? 0) + paid);
        });
    });
    if (tunaRoll !== null) {
        dcGameData.gameState.history.unshift({ text: `The tuna haul was ${tunaRoll} - every Tuna Boat paid out ${tunaRoll} coins` });
    }
    if (bankShortfall > 0) {
        dcGameData.gameState.history.unshift({ text: `The bank ran out of coins - ${bankShortfall} coin${bankShortfall === 1 ? "" : "s"} of income went unpaid` });
    }
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
        coinsEarnedChanges,
        bankChange: -bankPaid,
        tunaRoll
    }
    return outcome;
}
