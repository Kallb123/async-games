import { Document, Model, Schema, model, models } from "mongoose";
import { IGameDataResponse, IGameResponse, uuidString } from "../apiModels/GameDataApi";
import { userIdListToUsernameList } from "../users/clerk";
import { IGameType } from "../apiModels/GameLogic";

export interface IGameState {
    turnOrder: string[],
    history: string[]
}

export interface IGameData {
    gameId: uuidString,
    gameType: IGameType,
    userIdList: string[],
    turnTimer: string,
    currentTurn: string,
    lastTurnTimestamp: string,
    gameState: IGameState
}

export interface IGameDataDocument extends IGameData, Document {
    // Instance methods
    CreateResponse: () => Promise<IGameResponse>;
    CreateDataResponse: () => Promise<IGameDataResponse>;
}

export interface IGameDataModel extends Model<IGameDataDocument> {
    // Static methods
}

export var GameDataSchema = new Schema<IGameDataDocument> ({
    gameId: String,
    gameType: {
        gameId: String,
        gameType: String,
        friendlyName: String,
        icon: String,
        url: String,
        className: String
    },
    userIdList: [String],
    turnTimer: String,
    currentTurn: String,
    lastTurnTimestamp: String,
    gameState: {
        turnOrder: [String],
        history: [String]
    }
}, {discriminatorKey: 'kind'});
GameDataSchema.methods.CreateResponse = async function(): Promise<IGameResponse> {
    console.log("CreateResponse: Generic game");

    const gameDataDocument: IGameData = this as IGameData;

    return {  
        gameId: gameDataDocument.gameId,
        gameType: gameDataDocument.gameType.gameType,
        friendlyName: gameDataDocument.gameType.friendlyName,
        usernameList: await userIdListToUsernameList(gameDataDocument.userIdList),
        turnTimer: gameDataDocument.turnTimer,
        currentTurn: gameDataDocument.currentTurn,
        url: gameDataDocument.gameType.url,
    }
};
GameDataSchema.methods.CreateDataResponse = async function(): Promise<IGameDataResponse> {
    console.log("CreateDataResponse: Generic game");

    const gameDataDocument: IGameData = this as IGameData;

    return {
        gameType: gameDataDocument.gameType,
        usernameList: await userIdListToUsernameList(gameDataDocument.userIdList),
        turnTimer: gameDataDocument.turnTimer,
        currentTurn: gameDataDocument.currentTurn,
        gameState: gameDataDocument.gameState,
    }
};
export var GameDataModel = models.GameData || model<IGameDataDocument, IGameDataModel>('GameData', GameDataSchema);
