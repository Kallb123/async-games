import { Document, Model, Schema, Types, model, models } from "mongoose";
import { IGameDataResponse, IGameResponse } from "../apiModels/GameDataApi";
import { clerkClient } from "@clerk/nextjs";

export interface IGameState {
    turnOrder: string[],
    history: string[]
}

export interface IGameData {
    gameId: string,
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
    CreateResponse: () => Promise<IGameResponse>;
    CreateDataResponse: () => Promise<IGameDataResponse>;
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
GameDataSchema.methods.CreateResponse = async function(): Promise<IGameResponse> {
    console.log("CreateResponse: Generic game");

    return {  
        gameId: this.gameId,
        gameType: this.gameType,
        friendlyName: this.friendlyName,
        usernameList: await userIdListToUsernameList(this.userIdList),
        turnTimer: this.turnTimer,
        currentTurn: this.currentTurn,
        url: this.url,
    }
};
GameDataSchema.methods.CreateDataResponse = async function(): Promise<IGameDataResponse> {
    console.log("CreateDataResponse: Generic game");

    return {  
        gameId: this.gameId,
        gameType: this.gameType,
        friendlyName: this.friendlyName,
        usernameList: await userIdListToUsernameList(this.userIdList),
        turnTimer: this.turnTimer,
        currentTurn: this.currentTurn,
        url: this.url,
        gameState: this.gameState,
    }
};
export var GameDataModel = models.GameData || model<IGameDataDocument, IGameDataModel>('GameData', GameDataSchema);

export async function userIdListToUsernameList(userIdList: string[]): Promise<string[]> {
    const users = await clerkClient.users.getUserList({userId: userIdList});
    const usernameList: string[] = [];
    userIdList.forEach(userId => {
        const user = users.find(u => u.id === userId);
        if (!user) {
            return;
        }
        usernameList.push(user.username ?? "No username");
    });
    return usernameList;
}
