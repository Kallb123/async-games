import { Document, Model, Schema, model, models } from "mongoose";

export interface IGameState {
    turnOrder: string[],
    history: string[]
}

export interface IGameData {
    gameId: `${string}-${string}-${string}-${string}-${string}`,
    gameType: string,
    userIdList: string[],
    turnTimer: string,
    currentTurn: string,
    lastTurnTimestamp: string,
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
    userIdList: [String],
    turnTimer: String,
    currentTurn: String,
    lastTurnTimestamp: String,
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
    currentTurn: string
}

export interface IDiceCitiesGameState {
    bankCards: any[]
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
    enabledBillionaireRow: Boolean
}, {discriminatorKey: 'kind'});

export var DiceCitiesGameDataModel = models.DiceCitiesGameData || GameDataModel.discriminator<IDiceCitiesGameDataDocument, IDiceCitiesGameDataModel>('DiceCitiesGameData', DiceCitiesGameDataSchema);

