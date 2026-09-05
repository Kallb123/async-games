import { GameDataModel, IGameData, IGameDataDocument, publicGameState } from "@/utils/mongodb/GameData";
import { IInvitationData, IInvitationDataDocument, InvitationModel, IInvitationRequest } from "@/utils/mongodb/InvitationData";
import { Model, Schema, models } from "mongoose";
import { ISnakesAndLaddersGameDataResponse, ISnakesAndLaddersGameStateResponse } from "./apiModels";
import { uuidString, GameResultStatGroup } from "@/utils/apiModels/GameDataApi";
import { pluralize } from "@/utils/ui/text";
import { v4 as uuidv4 } from 'uuid';
import { userIdListToNamesAndMap } from "@/utils/users/clerk";
import { SnakesAndLaddersGameType } from "@/utils/apiModels/GameLogic";
import { rollOffTurnOrder } from "@/utils/games/rollOff";

export interface SnakesAndLaddersInvitationRequest extends IInvitationRequest {
    /** House rule: rolling a 6 earns another roll instead of ending the turn. */
    reRollOnSix: boolean;
}

export interface ISnakesAndLaddersInvitationData extends IInvitationData {
    reRollOnSix: boolean;
}

export interface ISnakesAndLaddersInvitationDataDocument extends ISnakesAndLaddersInvitationData, IInvitationDataDocument {
}

export interface ISnakesAndLaddersInvitationDataModel extends Model<ISnakesAndLaddersInvitationDataDocument> {
}


var SnakesAndLaddersInvitationSchema = new Schema<ISnakesAndLaddersInvitationDataDocument>({
    reRollOnSix: Boolean
}, { discriminatorKey: 'kind' });
SnakesAndLaddersInvitationSchema.methods.CreateGame = async function(invite: ISnakesAndLaddersInvitationData, userIdList: string[]) {
    console.log("CreateGame: Snakes and Ladders game");

    const gameType = new SnakesAndLaddersGameType();

    const { turnOrder, history } = rollOffTurnOrder(userIdList);

    const reRollOnSix = this.reRollOnSix === true;
    if (reRollOnSix) {
        history.push({ text: "Setup: re-roll on a 6 is enabled" });
    }

    const initialSpecificGameState = buildInitialSnakesAndLaddersState(userIdList, reRollOnSix);

    const gameData: ISnakesAndLaddersGameData = {
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
        specificGameState: initialSpecificGameState
    };
    return gameData;
};
export var SnakesAndLaddersInvitationModel = models.SnakesAndLaddersInvitation || InvitationModel.discriminator<ISnakesAndLaddersInvitationDataDocument, ISnakesAndLaddersInvitationDataModel>('SnakesAndLaddersInvitation', SnakesAndLaddersInvitationSchema);

export interface ISnakesAndLaddersPlayerState {
    position: number,
    laddersClimbed: number,
    snakesHit: number
}

export interface ISnakesAndLaddersGameState {
    playerPositions: Map<string, ISnakesAndLaddersPlayerState>,
    hasRolled: boolean,
    /** House rule chosen at setup: a 6 earns another roll. Never changes. */
    reRollOnSix: boolean
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
                position: Number,
                laddersClimbed: Number,
                snakesHit: Number
            }
        },
        hasRolled: Boolean,
        reRollOnSix: Boolean
    }
}, { discriminatorKey: 'kind' });

SnakesAndLaddersGameDataSchema.methods.CreateDataResponse = async function(_viewerId: string | null): Promise<ISnakesAndLaddersGameDataResponse> {
    console.log("CreateDataResponse: Snakes and Ladders game");

    const gameDataDocument: ISnakesAndLaddersGameData = this as ISnakesAndLaddersGameData;

    const { usernameList, userIdNameMap } = await userIdListToNamesAndMap(gameDataDocument.userIdList);

    return {
        gameType: gameDataDocument.gameType,
        usernameList,
        userIdList: gameDataDocument.userIdList,
        turnTimer: gameDataDocument.turnTimer,
        currentTurn: gameDataDocument.currentTurn,
        gameState: publicGameState(gameDataDocument.gameState, userIdNameMap),
        complete: gameDataDocument.complete,
        winner: gameDataDocument.winner,
        endReason: gameDataDocument.endReason,
        endDetail: gameDataDocument.endDetail,
        forfeitedBy: gameDataDocument.forfeitedBy,
        specificGameState: gameStateToModel(gameDataDocument.specificGameState, userIdNameMap)
    };
};

// Builds the deterministic starting specificGameState for a Snakes & Ladders
// game. Used both at game creation and by the replay engine to reconstruct
// historical / planned states from commandHistory.
export function buildInitialSnakesAndLaddersState(userIdList: string[], reRollOnSix: boolean): ISnakesAndLaddersGameState {
    const playerPositions = new Map<string, ISnakesAndLaddersPlayerState>();
    for (const userId of userIdList) {
        playerPositions.set(userId, { position: 0, laddersClimbed: 0, snakesHit: 0 });
    }
    return {
        playerPositions,
        hasRolled: false,
        reRollOnSix
    };
}

export function gameStateToModel(gameState: ISnakesAndLaddersGameState, userIdNameMap: { [key: string]: string }): ISnakesAndLaddersGameStateResponse {
    const playerStates: { [key: string]: { username: string, userId: string, position: number } } = {};
    for (const [userId, playerStateModel] of gameState.playerPositions) {
        playerStates[userId] = {
            userId,
            username: userIdNameMap[userId],
            position: playerStateModel.position
        };
    }
    return {
        playerStates,
        hasRolled: gameState.hasRolled,
        reRollOnSix: gameState.reRollOnSix === true
    };
}

export var SnakesAndLaddersGameDataModel = models.SnakesAndLaddersGameData || GameDataModel.discriminator<ISnakesAndLaddersGameDataDocument, ISnakesAndLaddersGameDataModel>('SnakesAndLaddersGameData', SnakesAndLaddersGameDataSchema);

// Boiled-down stats for the GameResult read model, computed once at game-end
// (see recordGameResult in GameResultData.ts). Ladders/snakes counts are
// tallied live in SnakesAndLaddersRequestDiceRoll.Execute since they can't be
// reconstructed from final position alone.
export interface ISnakesAndLaddersPlayerResultStats {
    laddersClimbed: number;
    snakesHit: number;
}

export interface ISnakesAndLaddersGameResultStats {
    playerStats: Map<string, ISnakesAndLaddersPlayerResultStats>;
}

export const snakesAndLaddersGameResultStatsSchemaDef = {
    playerStats: {
        type: Schema.Types.Map,
        of: {
            laddersClimbed: Number,
            snakesHit: Number
        }
    }
};

export function computeSnakesAndLaddersResultStats(gameData: ISnakesAndLaddersGameData): ISnakesAndLaddersGameResultStats {
    const playerStats = new Map<string, ISnakesAndLaddersPlayerResultStats>();
    for (const [userId, playerState] of gameData.specificGameState.playerPositions) {
        playerStats.set(userId, { laddersClimbed: playerState.laddersClimbed, snakesHit: playerState.snakesHit });
    }
    return { playerStats };
}

// Renders ISnakesAndLaddersGameResultStats as one stat group per player, for
// the shared GameResultStats UI.
export function formatSnakesAndLaddersResultStats(stats: ISnakesAndLaddersGameResultStats, usernameById: Map<string, string>): GameResultStatGroup[] {
    const groups: GameResultStatGroup[] = [];
    for (const [userId, playerStats] of stats.playerStats) {
        groups.push({
            username: usernameById.get(userId) ?? userId,
            lines: [
                `Climbed ${pluralize(playerStats.laddersClimbed, 'ladder')}`,
                `Hit ${pluralize(playerStats.snakesHit, 'snake')}`,
            ],
        });
    }
    return groups;
}
