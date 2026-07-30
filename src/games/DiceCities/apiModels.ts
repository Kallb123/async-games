import { IGameDataResponse, uuidString } from "@/utils/apiModels/GameDataApi";
import type { cardType } from "./DiceCitiesModels";

export interface IDiceCitiesCard {
    cardId: uuidString,
    title: string,
    cost: number,
    rollNumber: number[],
    text: string,
    art: string,
    type: cardType,
    icon: string,
    ownLimit: number,
    bankGain: number,
    onOwnTurn: boolean,
    onOponentsTurn: boolean,
    stealRollerGain: number,
    stealAllGain: number,
    stealChosenGain: number,
    tradeCards: boolean,
    gainMultiplier: {type: cardType[], amountPerType: number} | null
}
export interface IDiceCitiesCardCountResponse {
    card: uuidString,
    amount: number
}

export interface IDiceCitiesPlayerStateResponse {
    username: string,
    userId: string,
    cards: IDiceCitiesCardCountResponse[],
    money: number,
    totalCoinsEarned: number,
    doubleUnlocked: boolean,
    bonusDiningAndStore: boolean,
    rerollDoubles: boolean,
    oneReroll: boolean,
    lastDiceSelection: 1 | 2
}

export interface IDiceCitiesGameStateResponse {
    bankCards: IDiceCitiesCardCountResponse[],
    /** Coins the bank has left to pay out, of its BANK_TOTAL_COINS supply. */
    bankMoney: number,
    playerStates: { [key: string]: IDiceCitiesPlayerStateResponse },
    hasRolled: boolean,
    awaitingTSSelection: boolean,
    awaitingBCSelectionOwn: boolean,
    awaitingBCSelectionOpponent: boolean,
    bcSelectedOwnCard: uuidString | null,
    bcSelectedOpponent: string | null,
    bcSelectedOpponentCard: uuidString | null,
    awaitingDoubleReroll: boolean,
    hasReRolled: boolean
}

export interface IDiceCitiesGameDataResponse extends IGameDataResponse {
    enabledDocks: boolean,
    enabledBillionaireRow: boolean,
    specificGameState: IDiceCitiesGameStateResponse
}
