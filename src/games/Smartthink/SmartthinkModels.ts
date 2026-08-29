import { GameDataModel, IGameData, IGameDataDocument, publicGameState } from "@/utils/mongodb/GameData";
import { IInvitationData, IInvitationDataDocument, InvitationModel, IInvitationRequest } from "@/utils/mongodb/InvitationData";
import { Model, Schema, models } from "mongoose";
import { ISmartthinkGameDataResponse, ISmartthinkGameStateResponse } from "./apiModels";
import { IGameResponse, uuidString, GameResultStatGroup } from "@/utils/apiModels/GameDataApi";
import { pluralize } from "@/utils/ui/text";
import { v4 as uuidv4 } from 'uuid';
import { UserDirectory, userIdListToUsernameList, userIdListToUsernameMap } from "@/utils/users/clerk";
import { SmartthinkGameType } from "@/utils/apiModels/GameLogic";
import { DiceRoll } from "@/utils/games/DiceRoll";

export const SMARTTHINK_COMPUTER_ID = "Computer";
export const SMARTTHINK_COMPUTER_USERNAME = "Computer";

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
    codeBreakerId: string;
    codeBreakerUsername: string;
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
            history.push(`Setup: ${usernamesInRoll.join(" & ")} rolled a ${roll} and are re-rolling`);
            SortUsersByRoll(usersInRoll, usernameMap, turnOrder, history, dieToRoll);
        } else {
            turnOrder.push(usersInRoll[0]);
            // The first player settled into turnOrder is the roll-off winner.
            history.push(`Setup: ${usernameMap.get(usersInRoll[0])} rolled a ${roll}${turnOrder.length === 1 ? " and goes first" : ""}`);
        }
    });
}

function generateSmartthinkSecretCode(): number[] {
    return Array.from({ length: 4 }, () => Math.floor(Math.random() * 6));
}

export function CreateSmartthinkSoloGameData(userId: string, username: string, turnTimer: string): ISmartthinkGameData {
    const gameType = new SmartthinkGameType();

    return {
        gameId: uuidv4() as uuidString,
        gameType,
        userIdList: [userId],
        turnTimer,
        currentTurn: userId,
        lastTurnTimestamp: (new Date()).toISOString(),
        timerWarningNotificationSent: false,
        missedTurnCounts: new Map(),
        gameState: {
            turnOrder: [userId],
            history: [`Setup: ${SMARTTHINK_COMPUTER_USERNAME} set the secret code`],
            commandHistory: []
        },
        complete: false,
        winner: "",
        specificGameState: {
            secretCode: generateSmartthinkSecretCode(),
            guessRows: [],
            secretCodeSet: true,
            codeSetterId: SMARTTHINK_COMPUTER_ID,
            codeSetterUsername: SMARTTHINK_COMPUTER_USERNAME,
            codeBreakerId: userId,
            codeBreakerUsername: username,
            maxGuesses: 10
        }
    };
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
    const codeBreakerId = turnOrder[1];
    const codeBreakerUsername = usernameMap.get(codeBreakerId) ?? "";

    const gameData: ISmartthinkGameData = {
        gameId: uuidv4() as uuidString,
        gameType: gameType,
        userIdList,
        turnTimer: this.turnTimer,
        currentTurn: turnOrder[0],
        lastTurnTimestamp: (new Date()).toISOString(),
        timerWarningNotificationSent: false,
        missedTurnCounts: new Map(),
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
            codeBreakerId,
            codeBreakerUsername,
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

// Builds the starting specificGameState for replay. The secret code is the only
// creation-time randomness; in solo games it's set at creation (and never
// changes), so we seed it from the persisted state. In 2-player games it starts
// empty and is restored by replaying the SmartthinkSetSecretCode command.
export function buildInitialSmartthinkState(gameState: ISmartthinkGameState): ISmartthinkGameState {
    const isSolo = gameState.codeSetterId === SMARTTHINK_COMPUTER_ID;
    return {
        secretCode: isSolo ? [...gameState.secretCode] : [],
        guessRows: [],
        secretCodeSet: isSolo,
        codeSetterId: gameState.codeSetterId,
        codeSetterUsername: gameState.codeSetterUsername,
        codeBreakerId: gameState.codeBreakerId,
        codeBreakerUsername: gameState.codeBreakerUsername,
        maxGuesses: gameState.maxGuesses,
    };
}

export function gameStateToModel(gameState: ISmartthinkGameState, userIdNameMap: { [key: string]: string }): ISmartthinkGameStateResponse {
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
        codeBreakerId: gameState.codeBreakerId || codeBreaker?.userId || "",
        codeBreakerUsername: gameState.codeBreakerUsername || codeBreaker?.username || "",
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
        codeBreakerId: String,
        codeBreakerUsername: String,
        maxGuesses: Number
    }
}, { discriminatorKey: 'kind' });

SmartthinkGameDataSchema.methods.CreateResponse = function(directory: UserDirectory): IGameResponse {
    console.log("CreateResponse: Smartthink game");

    const gameDataDocument: ISmartthinkGameData = this as ISmartthinkGameData;

    // The computer is not a Clerk user, so it is named here rather than looked
    // up — which is also why it never reaches the directory's Clerk call.
    const nameFor = (userId: string | undefined) => userId === SMARTTHINK_COMPUTER_ID
        ? SMARTTHINK_COMPUTER_USERNAME
        : directory.name(userId);

    const usernameList = gameDataDocument.userIdList.map(userId => directory.name(userId));
    // userIdList stays parallel to usernameList: the computer is not a Clerk
    // user but it is a seat, so its id rides alongside its name.
    const userIdList = [...gameDataDocument.userIdList];
    if (gameDataDocument.specificGameState.codeSetterId === SMARTTHINK_COMPUTER_ID) {
        usernameList.push(SMARTTHINK_COMPUTER_USERNAME);
        userIdList.push(SMARTTHINK_COMPUTER_ID);
    }

    const winner = nameFor(gameDataDocument.winner);
    const currentTurnUsername = nameFor(gameDataDocument.currentTurn);

    return {
        gameId: gameDataDocument.gameId,
        gameType: gameDataDocument.gameType.gameType,
        friendlyName: gameDataDocument.gameType.friendlyName,
        usernameList,
        userIdList,
        turnTimer: gameDataDocument.turnTimer,
        currentTurn: gameDataDocument.currentTurn,
        currentTurnUsername,
        lastTurnTimestamp: gameDataDocument.lastTurnTimestamp,
        url: gameDataDocument.gameType.url,
        complete: gameDataDocument.complete,
        winner
    };
};

SmartthinkGameDataSchema.methods.CreateDataResponse = async function(_viewerId: string | null): Promise<ISmartthinkGameDataResponse> {
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
        userIdList: gameDataDocument.userIdList,
        turnTimer: gameDataDocument.turnTimer,
        currentTurn: gameDataDocument.currentTurn,
        gameState: publicGameState(gameDataDocument.gameState),
        complete: gameDataDocument.complete,
        winner: gameDataDocument.winner,
        endReason: gameDataDocument.endReason,
        forfeitedBy: gameDataDocument.forfeitedBy,
        specificGameState: gameStateToModel(gameDataDocument.specificGameState, userIdNameMap)
    };
};

export var SmartthinkGameDataModel = models.SmartthinkGameData || GameDataModel.discriminator<ISmartthinkGameDataDocument, ISmartthinkGameDataModel>('SmartthinkGameData', SmartthinkGameDataSchema);

// Boiled-down stats for the GameResult read model, computed once at game-end
// (see recordGameResult in GameResultData.ts).
export interface ISmartthinkGameResultStats {
    totalGuesses: number;
}

export const smartthinkGameResultStatsSchemaDef = {
    totalGuesses: Number
};

export function computeSmartthinkResultStats(gameData: ISmartthinkGameData): ISmartthinkGameResultStats {
    return { totalGuesses: gameData.specificGameState.guessRows.length };
}

// Renders ISmartthinkGameResultStats as a single game-wide stat group (the
// guess count isn't per-player), for the shared GameResultStats UI.
export function formatSmartthinkResultStats(stats: ISmartthinkGameResultStats, usernameById: Map<string, string>): GameResultStatGroup[] {
    return [{ lines: [`Solved in ${pluralize(stats.totalGuesses, 'guess', 'guesses')}`] }];
}
