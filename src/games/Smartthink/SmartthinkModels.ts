import { GameDataModel, IGameData, IGameDataDocument } from "@/utils/mongodb/GameData";
import { IInvitationData, IInvitationDataDocument, InvitationModel, IInvitationRequest } from "@/utils/mongodb/InvitationData";
import { Model, Schema, models } from "mongoose";
import { ISmartthinkGameDataResponse, ISmartthinkGameStateResponse } from "./apiModels";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import { v4 as uuidv4 } from 'uuid';
import { userIdListToUsernameList, userIdListToUsernameMap } from "@/utils/users/clerk";
import { SmartthinkGameType } from "@/utils/apiModels/GameLogic";
import { DiceRoll } from "@/utils/games/DiceRoll";

export interface SmartthinkInvitationRequest extends IInvitationRequest {
}

export interface ISmartthinkInvitationData extends IInvitationData {
}

export interface ISmartthinkInvitationDataDocument extends ISmartthinkInvitationData, IInvitationDataDocument {
}

export interface ISmartthinkInvitationDataModel extends Model<ISmartthinkInvitationDataDocument> {
}

export interface ISmartthinkGuessRow {
    guess: number[];
    black: number;
    white: number;
}

export interface ISmartthinkGameState {
    secretCode: number[];
    guessRows: ISmartthinkGuessRow[];
    secretCodeSet: boolean;
    codeSetterId: string;
    codeSetterUsername: string;
    maxGuesses: number;
}

export interface ISmartthinkGameData extends IGameData {
    specificGameState: ISmartthinkGameState;
}

export interface ISmartthinkGameDataDocument extends ISmartthinkGameData, IGameDataDocument {
}

export interface ISmartthinkGameDataModel extends Model<ISmartthinkGameDataDocument> {
}

function SortUsersByRoll(userIdList: string[], usernameMap: Map<string, string>, turnOrder: string[], history: string[], dieToRoll: number) {
    const turnRolls = userIdList.map((userId) => ({ userId, diceRoll: DiceRoll(dieToRoll) }));
    const distinctRolls: Map<number, string[]> = new Map;
    turnRolls.forEach(turnRoll => {
        const lookup = distinctRolls.get(turnRoll.diceRoll);
        if (lookup) {
            lookup.push(turnRoll.userId);
        } else {
            distinctRolls.set(turnRoll.diceRoll, [turnRoll.userId]);
        }
    });
    const sortedRolls = [...distinctRolls.keys()].sort((a, b) => b - a);
    sortedRolls.forEach(roll => {
        const usersInRoll = distinctRolls.get(roll);
        if (!usersInRoll) {
            return;
        }
        if (usersInRoll.length > 1) {
            const usernamesInRoll = usersInRoll.map(userId => usernameMap.get(userId));
            history.push(`${usernamesInRoll.join(" & ")} rolled a ${roll} and are re-rolling`);
            SortUsersByRoll(usersInRoll, usernameMap, turnOrder, history, dieToRoll);
        } else {
            turnOrder.push(usersInRoll[0]);
            history.push(`${usernameMap.get(usersInRoll[0])} rolled a ${roll}`);
        }
    });
}

var SmartthinkInvitationSchema = new Schema<ISmartthinkInvitationDataDocument>({}, { discriminatorKey: 'kind' });
SmartthinkInvitationSchema.methods.CreateGame = async function(invite: ISmartthinkInvitationData, userIdList: string[]) {
    console.log("CreateGame: Smartthink game");

    const gameType = new SmartthinkGameType();

    const turnOrder: string[] = [];
    const history: string[] = [];
    const usernameMap = await userIdListToUsernameMap(userIdList);

    SortUsersByRoll(userIdList, usernameMap, turnOrder, history, 6);

    const codeSetterId = turnOrder[0];
    const codeSetterUsername = usernameMap.get(codeSetterId) ?? "";

    const gameData: ISmartthinkGameData = {
        gameId: uuidv4() as uuidString,
        gameType: gameType,
        userIdList,
        turnTimer: this.turnTimer,
        currentTurn: turnOrder[0],
        lastTurnTimestamp: (new Date()).toISOString(),
        timerWarningNotificationSent: false,
        gameState: {
            turnOrder,
            history,
            commandHistory: []
        },
        complete: false,
        winner: "",
        specificGameState: {
            secretCode: [],
            guessRows: [],
            secretCodeSet: false,
            codeSetterId,
            codeSetterUsername,
            maxGuesses: 10
        }
    };
    return gameData;
};
export var SmartthinkInvitationModel = models.SmartthinkInvitation || InvitationModel.discriminator<ISmartthinkInvitationDataDocument, ISmartthinkInvitationDataModel>('SmartthinkInvitation', SmartthinkInvitationSchema);

export interface ISmartthinkGuessRowResponse {
    guess: number[];
    black: number;
    white: number;
}

export interface ISmartthinkPlayerResponse {
    userId: string;
    username: string;
    role: 'Codemaker' | 'Codebreaker';
}

function gameStateToModel(gameState: ISmartthinkGameState, userIdNameMap: { [key: string]: string }): ISmartthinkGameStateResponse {
    const players: ISmartthinkPlayerResponse[] = Object.keys(userIdNameMap).map(userId => {
        const username = userIdNameMap[userId];
        return {
            userId,
            username,
            role: userId === gameState.codeSetterId ? 'Codemaker' : 'Codebreaker'
        };
    });

    const codeBreaker = players.find(player => player.userId !== gameState.codeSetterId);

    return {
        secretCodeSet: gameState.secretCodeSet,
        codeSetterId: gameState.codeSetterId,
        codeSetterUsername: gameState.codeSetterUsername,
        codeBreakerId: codeBreaker?.userId ?? "",
        codeBreakerUsername: codeBreaker?.username ?? "",
        guessRows: gameState.guessRows.map((row) => ({
            guess: row.guess,
            black: row.black,
            white: row.white
        })),
        maxGuesses: gameState.maxGuesses,
        remainingGuesses: gameState.maxGuesses - gameState.guessRows.length,
        players
    };
}

var SmartthinkGameDataSchema = new Schema<ISmartthinkGameDataDocument>({
    specificGameState: {
        secretCode: [Number],
        guessRows: [{
            guess: [Number],
            black: Number,
            white: Number
        }],
        secretCodeSet: Boolean,
        codeSetterId: String,
        codeSetterUsername: String,
        maxGuesses: Number
    }
}, { discriminatorKey: 'kind' });

SmartthinkGameDataSchema.methods.CreateDataResponse = async function(): Promise<ISmartthinkGameDataResponse> {
    console.log("CreateDataResponse: Smartthink game");

    const gameDataDocument: ISmartthinkGameData = this as ISmartthinkGameData;

    const usernameList = await userIdListToUsernameList(gameDataDocument.userIdList);
    const userIdNameMap: { [key: string]: string } = {};
    (gameDataDocument.userIdList as string[]).forEach((userId: string, i: number) => {
        userIdNameMap[userId] = usernameList[i];
    });

    return {
        gameType: gameDataDocument.gameType,
        usernameList,
        turnTimer: gameDataDocument.turnTimer,
        currentTurn: gameDataDocument.currentTurn,
        gameState: gameDataDocument.gameState,
        complete: gameDataDocument.complete,
        winner: gameDataDocument.winner,
        specificGameState: gameStateToModel(gameDataDocument.specificGameState, userIdNameMap)
    };
};

export var SmartthinkGameDataModel = models.SmartthinkGameData || GameDataModel.discriminator<ISmartthinkGameDataDocument, ISmartthinkGameDataModel>('SmartthinkGameData', SmartthinkGameDataSchema);
