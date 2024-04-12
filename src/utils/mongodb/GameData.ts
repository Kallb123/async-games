import { Document, Model, Schema, model, models, Types } from "mongoose";

export interface IGameState {
    turnOrder: string[],
    history: string[]
}

export interface IGameData {
    gameId: `${string}-${string}-${string}-${string}-${string}`,
    gameType: string,
    friendlyName: string,
    userIdList: string[],
    turnTimer: string,
    currentTurn: string,
    lastTurnTimestamp: string,
    url: string,
    gameState: IGameState
}

export interface IGameDataDocument extends IGameData, Document {
    // Instance methods
}

export interface IGameDataModel extends Model<IGameDataDocument> {
    // Static methods
}

export var GameDataSchema = new Schema<IGameDataDocument> ({
    gameId: Schema.Types.UUID,
    gameType: String,
    friendlyName: String,
    userIdList: [String],
    turnTimer: String,
    currentTurn: String,
    lastTurnTimestamp: String,
    url: String,
    gameState: {
        turnOrder: [String],
        history: [String]
    }
}, {discriminatorKey: 'kind'});
export var GameDataModel = models.GameData || model<IGameDataDocument, IGameDataModel>('GameData', GameDataSchema);

export interface GameResponse {
    gameId: `${string}-${string}-${string}-${string}-${string}`,
    usernameList: string[],
    turnTimer: string,
    currentTurn: string,
    url: string
}

export type cardType = "farm" | "pasture" | "store" | "dining" | "production" | "landmark" | "factory" | "market";

export interface IDiceCitiesCard {
    cardId: Types.UUID,
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

export interface IDiceCitiesCardCount {
    card: Types.UUID,
    amount: number
}

export interface IDiceCitiesPlayerState {
    cards: IDiceCitiesCardCount[],
    money: number,
    doubleUnlocked: boolean,
    bonusDiningAndStore: boolean,
    rerollDoubles: boolean,
    oneReroll: boolean
}

export interface IDiceCitiesGameState {
    bankCards: IDiceCitiesCardCount[],
    playerStates: { [key: string]: IDiceCitiesPlayerState }
}

export interface IDiceCitiesGameData extends IGameData {
    enabledDocks: boolean,
    enabledBillionaireRow: boolean,
    specificGameState: IDiceCitiesGameState
}

export interface IDiceCitiesGameDataDocument extends IDiceCitiesGameData, IGameDataDocument {
    // Instance methods
}

export interface IDiceCitiesGameDataModel extends Model<IDiceCitiesGameDataDocument> {
    // Static methods
}

var DiceCitiesGameDataSchema = new Schema<IDiceCitiesGameDataDocument>({
    enabledDocks: Boolean,
    enabledBillionaireRow: Boolean,
    specificGameState: {
        bankCards: [{
            card: Schema.Types.UUID,
            amount: Number
        }],
        playerStates: {
            type: Map,
            of: {
                cards: [{
                    card: Schema.Types.UUID,
                    amount: Number
                }],
                money: Number,
                doubleUnlocked: Boolean,
                bonusDiningAndStore: Boolean,
                rerollDoubles: Boolean,
                oneReroll: Boolean
            }
        }
    }
}, {discriminatorKey: 'kind'});

export var DiceCitiesGameDataModel = models.DiceCitiesGameData || GameDataModel.discriminator<IDiceCitiesGameDataDocument, IDiceCitiesGameDataModel>('DiceCitiesGameData', DiceCitiesGameDataSchema);

