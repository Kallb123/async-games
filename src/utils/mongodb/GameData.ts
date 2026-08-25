import { Document, Model, Schema, model, models } from "mongoose";
import { GameEndReason, IGameDataResponse, IGameResponse, uuidString } from "../apiModels/GameDataApi";
import { UserDirectory, userIdListToUsernameList } from "../users/clerk";
import { IGameCommand, IGameType } from "../apiModels/GameLogic";

export interface IGameState {
    turnOrder: string[],
    history: string[],
    commandHistory: IGameCommand[]
}

// The response-safe view of a game's shared state: turn order and the plain-text
// history log, and deliberately not commandHistory.
//
// commandHistory is the engine's private replay log, and every game hangs its
// own fields off its commands — Smartthink's secret code, Train Time's kept
// ticket ids and deck reshuffles, SAC's robber/discard RNG. Sending it hands
// each player state their game keeps hidden. IGameDataResponse['gameState'] has
// always been declared without it, but TypeScript can't hold the line on its
// own: excess-property checks don't apply to a whole-object assignment or to
// spread properties, so `gameState: doc.gameState` type-checks and ships
// everything. Every CreateDataResponse goes through here instead.
//
// `history` is a parameter because games whose log records userIds swap them
// for usernames on the way out (see World Domination and Settlements & Cities).
export function publicGameState(
    gameState: IGameState,
    history: string[] = gameState.history
): IGameDataResponse['gameState'] {
    return { turnOrder: gameState.turnOrder, history };
}

export interface IGameData {
    gameId: uuidString,
    gameType: IGameType,
    userIdList: string[],
    turnTimer: string,
    currentTurn: string,
    lastTurnTimestamp: string,
    timerWarningNotificationSent: boolean,
    // Consecutive turntimer expiries for each player since they last acted,
    // keyed by userId. Reset to 0 whenever that player takes a turn; once a
    // player's count reaches MAX_CONSECUTIVE_MISSED_TURNS the cron abandons
    // the game instead of rotating past them again — see turntimer/route.ts.
    missedTurnCounts: Map<string, number>,
    gameState: IGameState,
    // The invitation/lobby this game was started from, when it came from one.
    // The invitation is deleted the moment the game exists, so this is the
    // only link back to it — it lets a host still sitting on their lobby
    // screen find the game their lobby became (see /api/lobby/[inviteId]/game).
    inviteId?: uuidString,
    complete: boolean,
    winner: string,
    endReason?: GameEndReason,
    forfeitedBy?: string
}

export interface IGameDataDocument extends IGameData, Document {
    // Instance methods
    //
    // Synchronous, and given every name it needs up front: a list of games
    // resolves its players in one Clerk call and hands the result to each game
    // (see UserDirectory), rather than every game fetching its own.
    CreateResponse: (directory: UserDirectory) => IGameResponse;
    // `viewerId` is the signed-in player the response is being built for.
    //
    // A game's response is not the same for everybody: hands, tickets and dev
    // cards belong to one player, and the only way to send a player their own
    // secrets without sending everyone else's is to know who is asking. The
    // parameter is required rather than optional so that a game with hidden
    // information can't quietly inherit the everybody-sees-everything view —
    // adding a game makes the compiler ask the question at every call site.
    //
    // Games whose whole state is public (Snakes & Ladders, Dice Cities) ignore
    // it. Pass null only where nobody in particular is asking.
    CreateDataResponse: (viewerId: string | null) => Promise<IGameDataResponse>;
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
    missedTurnCounts: { type: Schema.Types.Map, of: Number, default: () => new Map() },
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
    inviteId: String,
    complete: Boolean,
    winner: String,
    endReason: String,
    forfeitedBy: String
}, {discriminatorKey: 'kind', optimisticConcurrency: true});
GameDataSchema.methods.CreateResponse = function(directory: UserDirectory): IGameResponse {
    console.log("CreateResponse: Generic game");

    const gameDataDocument: IGameData = this as IGameData;

    const usernameList = gameDataDocument.userIdList.map(userId => directory.name(userId));
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
        // Empty until somebody wins, rather than "Unknown player": a game still
        // being played has no winner to name.
        winner: directory.name(gameDataDocument.winner),
        endReason: gameDataDocument.endReason,
        forfeitedBy: gameDataDocument.forfeitedBy
            ? directory.name(gameDataDocument.forfeitedBy)
            : undefined
    }
};
GameDataSchema.methods.CreateDataResponse = async function(_viewerId: string | null): Promise<IGameDataResponse> {
    console.log("CreateDataResponse: Generic game");

    const gameDataDocument: IGameData = this as IGameData;

    return {
        gameType: gameDataDocument.gameType,
        usernameList: await userIdListToUsernameList(gameDataDocument.userIdList),
        turnTimer: gameDataDocument.turnTimer,
        currentTurn: gameDataDocument.currentTurn,
        gameState: publicGameState(gameDataDocument.gameState),
        complete: gameDataDocument.complete,
        winner: gameDataDocument.winner,
        endReason: gameDataDocument.endReason,
        forfeitedBy: gameDataDocument.forfeitedBy
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
