import { Document, Model, Schema, model, models } from "mongoose";
import { IGameDataResponse, IGameResponse, uuidString } from "../apiModels/GameDataApi";
import { userIdListToUsernameList } from "../users/clerk";
import { IGameCommand, IGameType } from "../apiModels/GameLogic";

export interface IGameState {
    turnOrder: string[],
    history: string[],
    commandHistory: IGameCommand[]
}

export interface IGameData {
    gameId: uuidString,
    gameType: IGameType,
    userIdList: string[],
    turnTimer: string,
    currentTurn: string,
    lastTurnTimestamp: string,
    timerWarningNotificationSent: boolean,
    gameState: IGameState,
    complete: boolean,
    winner: string
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
    timerWarningNotificationSent: { type: Boolean, default: false },
    gameState: {
        turnOrder: [String],
        history: [String],
        commandHistory: [
            Schema.Types.Mixed
            // {
            //     id: String,
            //     timestamp: String,
            //     gameId: String,
            //     senderId: String,
            //     className: String
            // }
        ]
    },
    complete: Boolean,
    winner: String
}, {discriminatorKey: 'kind', optimisticConcurrency: true});
GameDataSchema.methods.CreateResponse = async function(): Promise<IGameResponse> {
    console.log("CreateResponse: Generic game");

    const gameDataDocument: IGameData = this as IGameData;

    const usernameList = await userIdListToUsernameList(gameDataDocument.userIdList);
    const currentTurnIndex = gameDataDocument.userIdList.indexOf(gameDataDocument.currentTurn);

    return {
        gameId: gameDataDocument.gameId,
        gameType: gameDataDocument.gameType.gameType,
        friendlyName: gameDataDocument.gameType.friendlyName,
        usernameList,
        turnTimer: gameDataDocument.turnTimer,
        currentTurn: gameDataDocument.currentTurn,
        currentTurnUsername: currentTurnIndex >= 0 ? usernameList[currentTurnIndex] : "",
        lastTurnTimestamp: gameDataDocument.lastTurnTimestamp,
        url: gameDataDocument.gameType.url,
        complete: gameDataDocument.complete,
        winner: (await userIdListToUsernameList([gameDataDocument.winner]))[0]
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
        complete: gameDataDocument.complete,
        winner: gameDataDocument.winner
    }
};
export var GameDataModel = models.GameData || model<IGameDataDocument, IGameDataModel>('GameData', GameDataSchema);

// Saves the document, reporting false (instead of throwing) on a VersionError.
// Two requests against the same game can race past a currentTurn/state check
// and execute concurrently against separately-fetched copies of the document —
// optimistic concurrency (enabled above) makes the loser's save fail instead
// of silently overwriting the winner's changes. Every route that calls
// gameData.save() on a document from this model should go through this.
export async function trySave(gameData: IGameDataDocument): Promise<boolean> {
  try {
    await gameData.save();
    return true;
  } catch (err) {
    if ((err as { name?: string })?.name === 'VersionError') return false;
    throw err;
  }
}
