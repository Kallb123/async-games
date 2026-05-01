import { GameDataModel, IGameData, IGameDataDocument } from "@/utils/mongodb/GameData";
import { IInvitationData, IInvitationDataDocument, InvitationModel, IInvitationRequest } from "@/utils/mongodb/InvitationData";
import { Model, Schema, models } from "mongoose";
import { ISnakesAndLaddersGameDataResponse, ISnakesAndLaddersGameStateResponse } from "./apiModels";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import { v4 as uuidv4 } from 'uuid';
import { userIdListToUsernameList, userIdListToUsernameMap } from "@/utils/users/clerk";
import { SnakesAndLaddersGameType } from "@/utils/apiModels/GameLogic";
import { DiceRoll } from "@/utils/games/DiceRoll";

export interface SnakesAndLaddersInvitationRequest extends IInvitationRequest {
}

export interface ISnakesAndLaddersInvitationData extends IInvitationData {
}

export interface ISnakesAndLaddersInvitationDataDocument extends ISnakesAndLaddersInvitationData, IInvitationDataDocument {
}

export interface ISnakesAndLaddersInvitationDataModel extends Model<ISnakesAndLaddersInvitationDataDocument> {
}

function SortUsersByRoll(userIdList: string[], usernameMap: Map<string, string>, turnOrder: string[], history: string[], dieToRoll: number) {
    let turnRolls = userIdList.map((userId) => {
        return { userId, diceRoll: DiceRoll(dieToRoll) };
    });
    let distinctRolls: Map<number, string[]> = new Map;
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

var SnakesAndLaddersInvitationSchema = new Schema<ISnakesAndLaddersInvitationDataDocument>({}, { discriminatorKey: 'kind' });
SnakesAndLaddersInvitationSchema.methods.CreateGame = async function(invite: ISnakesAndLaddersInvitationData, userIdList: string[]) {
    console.log("CreateGame: Snakes and Ladders game");

    const gameType = new SnakesAndLaddersGameType();

    const turnOrder: string[] = [];
    const history: string[] = [];

    const usernameMap = await userIdListToUsernameMap(userIdList);

    SortUsersByRoll(userIdList, usernameMap, turnOrder, history, 6);

    const playerPositions = new Map<string, ISnakesAndLaddersPlayerState>();
    for (const userId of userIdList) {
        playerPositions.set(userId, { position: 0 });
    }

    const gameData: ISnakesAndLaddersGameData = {
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
            playerPositions,
            hasRolled: false
        }
    };
    return gameData;
};
export var SnakesAndLaddersInvitationModel = models.SnakesAndLaddersInvitation || InvitationModel.discriminator<ISnakesAndLaddersInvitationDataDocument, ISnakesAndLaddersInvitationDataModel>('SnakesAndLaddersInvitation', SnakesAndLaddersInvitationSchema);

export interface ISnakesAndLaddersPlayerState {
    position: number
}

export interface ISnakesAndLaddersGameState {
    playerPositions: Map<string, ISnakesAndLaddersPlayerState>,
    hasRolled: boolean
}

export interface ISnakesAndLaddersGameData extends IGameData {
    specificGameState: ISnakesAndLaddersGameState
}

export interface ISnakesAndLaddersGameDataDocument extends ISnakesAndLaddersGameData, IGameDataDocument {
}

export interface ISnakesAndLaddersGameDataModel extends Model<ISnakesAndLaddersGameDataDocument> {
}

var SnakesAndLaddersGameDataSchema = new Schema<ISnakesAndLaddersGameDataDocument>({
    specificGameState: {
        playerPositions: {
            type: Schema.Types.Map,
            of: {
                position: Number
            }
        },
        hasRolled: Boolean
    }
}, { discriminatorKey: 'kind' });

SnakesAndLaddersGameDataSchema.methods.CreateDataResponse = async function(): Promise<ISnakesAndLaddersGameDataResponse> {
    console.log("CreateDataResponse: Snakes and Ladders game");

    const gameDataDocument: ISnakesAndLaddersGameData = this as ISnakesAndLaddersGameData;

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

function gameStateToModel(gameState: ISnakesAndLaddersGameState, userIdNameMap: { [key: string]: string }): ISnakesAndLaddersGameStateResponse {
    const playerStates: { [key: string]: { username: string, userId: string, position: number } } = {};
    for (const [userId, playerStateModel] of gameState.playerPositions) {
        playerStates[userIdNameMap[userId]] = {
            userId,
            username: userIdNameMap[userId],
            position: playerStateModel.position
        };
    }
    return {
        playerStates,
        hasRolled: gameState.hasRolled
    };
}

export var SnakesAndLaddersGameDataModel = models.SnakesAndLaddersGameData || GameDataModel.discriminator<ISnakesAndLaddersGameDataDocument, ISnakesAndLaddersGameDataModel>('SnakesAndLaddersGameData', SnakesAndLaddersGameDataSchema);
