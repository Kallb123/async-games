import { IGameDataResponse, uuidString } from "@/utils/apiModels/GameDataApi";
import { cardType } from "./DiceCitiesModels";

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
    gainMultiplier: {type: cardType, amountPerType: number} | null
}
export interface IDiceCitiesCardCountResponse {
    card: uuidString,
    amount: number
}

export interface IDiceCitiesPlayerStateResponse {
    cards: IDiceCitiesCardCountResponse[],
    money: number,
    doubleUnlocked: boolean,
    bonusDiningAndStore: boolean,
    rerollDoubles: boolean,
    oneReroll: boolean
}

export interface IDiceCitiesGameStateResponse {
    bankCards: IDiceCitiesCardCountResponse[],
    playerStates: { [key: string]: IDiceCitiesPlayerStateResponse },
    hasRolled: boolean
}

export interface IDiceCitiesGameDataResponse extends IGameDataResponse {
    enabledDocks: boolean,
    enabledBillionaireRow: boolean,
    specificGameState: IDiceCitiesGameStateResponse
}
