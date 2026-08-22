import { GameDataModel, IGameData, IGameDataDocument } from "@/utils/mongodb/GameData";
import { IInvitationData, IInvitationDataDocument, InvitationModel, IInvitationRequest } from "@/utils/mongodb/InvitationData";
import { Model, Schema, models } from "mongoose";
import { auth } from "@clerk/nextjs/server";
import { v4 as uuidv4 } from 'uuid';
import { uuidString, GameResultStatGroup } from "@/utils/apiModels/GameDataApi";
import { pluralize } from "@/utils/ui/text";
import { userIdListToUsernameList, userIdListToUsernameMap } from "@/utils/users/clerk";
import { shuffle } from "@/utils/games/shuffle";
import { TrainTimeGameType } from "@/utils/apiModels/GameLogic";
import {
    ITrainTimeGameDataResponse,
    ITrainTimeSpecificGameStateResponse,
} from "./apiModels";
import {
    ITrainTimePlayerState,
    ITrainTimeSpecificGameState,
    TRAINS_PER_PLAYER,
    buildInitialTrainTimeState,
} from "./board";

// ═══════════════════════════════════════════════════════════════════════════
//  TRAIN TIME
// ═══════════════════════════════════════════════════════════════════════════

// ─── Invitation ─────────────────────────────────────────────────────────────

export interface TrainTimeInvitationRequest extends IInvitationRequest {}

export interface ITrainTimeInvitationData extends IInvitationData {}

export interface ITrainTimeInvitationDataDocument extends ITrainTimeInvitationData, IInvitationDataDocument {}

export interface ITrainTimeInvitationDataModel extends Model<ITrainTimeInvitationDataDocument> {}

// ─── Invitation model ───────────────────────────────────────────────────────

var TrainTimeInvitationSchema = new Schema<ITrainTimeInvitationDataDocument>({}, { discriminatorKey: 'kind' });
TrainTimeInvitationSchema.methods.CreateGame = async function(
    invite: ITrainTimeInvitationData,
    userIdList: string[],
) {
    console.log('CreateGame: Train Time game');

    const gameType = new TrainTimeGameType();

    // "The most experienced traveller goes first" doesn't translate to async
    // play, so the running order is simply drawn at random.
    const turnOrder = shuffle(userIdList);
    const usernameMap = await userIdListToUsernameMap(userIdList);
    const history = [
        `Setup: running order is ${turnOrder.map(u => usernameMap.get(u) ?? u).join(' → ')}`,
    ];

    const gameData: ITrainTimeGameData = {
        gameId: uuidv4() as uuidString,
        gameType,
        userIdList,
        turnTimer: this.turnTimer,
        currentTurn: turnOrder[0],
        lastTurnTimestamp: new Date().toISOString(),
        timerWarningNotificationSent: false,
        missedTurnCounts: new Map(),
        gameState: {
            turnOrder,
            history,
            commandHistory: [],
        },
        complete: false,
        winner: '',
        specificGameState: buildInitialTrainTimeState(turnOrder),
    };
    return gameData;
};
export var TrainTimeInvitationModel =
    models.TrainTimeInvitation ||
    InvitationModel.discriminator<ITrainTimeInvitationDataDocument, ITrainTimeInvitationDataModel>('TrainTimeInvitation', TrainTimeInvitationSchema);

// ─── Game data interfaces ───────────────────────────────────────────────────

export interface ITrainTimeGameData extends IGameData {
    specificGameState: ITrainTimeSpecificGameState;
}

export interface ITrainTimeGameDataDocument extends ITrainTimeGameData, IGameDataDocument {}

export interface ITrainTimeGameDataModel extends Model<ITrainTimeGameDataDocument> {}

// ─── Mongoose schema ────────────────────────────────────────────────────────

var TrainTimeGameDataSchema = new Schema<ITrainTimeGameDataDocument>(
    {
        specificGameState: {
            deck: [String],
            discard: [String],
            market: [String],
            playerStates: {
                type: Schema.Types.Map,
                of: {
                    hand: [String],
                    trains: Number,
                    score: Number,
                    routesClaimed: Number,
                },
            },
            routeOwners: Schema.Types.Mixed,
            drawsThisTurn: Number,
            finalRoundPending: Schema.Types.Mixed,
            gameOver: Boolean,
        },
    },
    { discriminatorKey: 'kind' },
);

TrainTimeGameDataSchema.methods.CreateDataResponse = async function(): Promise<ITrainTimeGameDataResponse> {
    console.log('CreateDataResponse: Train Time game');

    const doc: ITrainTimeGameData = this as ITrainTimeGameData;
    const usernameList = await userIdListToUsernameList(doc.userIdList);
    const userIdNameMap: { [key: string]: string } = {};
    doc.userIdList.forEach((userId, i) => { userIdNameMap[userId] = usernameList[i]; });

    // Hands are secret (design doc §10), so the response has to be built for
    // one viewer rather than being the same for everybody. Both callers of
    // CreateDataResponse are authenticated request handlers, so Clerk's request
    // auth is the viewer — no extra plumbing through the shared engine needed.
    const { userId: viewerId } = await auth();

    return {
        gameType: doc.gameType,
        usernameList,
        turnTimer: doc.turnTimer,
        currentTurn: doc.currentTurn,
        gameState: doc.gameState,
        complete: doc.complete,
        winner: doc.winner,
        endReason: doc.endReason,
        forfeitedBy: doc.forfeitedBy,
        specificGameState: gameStateToModel(doc.specificGameState, userIdNameMap, viewerId),
    };
};

export function gameStateToModel(
    gs: ITrainTimeSpecificGameState,
    userIdNameMap: { [key: string]: string },
    viewerId: string | null,
): ITrainTimeSpecificGameStateResponse {
    const playerStatesSource = gs.playerStates instanceof Map
        ? gs.playerStates
        : new Map(Object.entries(gs.playerStates as unknown as Record<string, ITrainTimePlayerState>));

    const playerStates: ITrainTimeSpecificGameStateResponse['playerStates'] = {};
    for (const [userId, ps] of playerStatesSource) {
        const username = userIdNameMap[userId] ?? userId;
        playerStates[username] = {
            userId,
            username,
            handCount: ps.hand.length,
            trains: ps.trains,
            score: ps.score,
            routesClaimed: ps.routesClaimed,
        };
    }

    const toUsername = (userId: string | null) => (userId ? userIdNameMap[userId] ?? userId : null);

    return {
        market: [...gs.market],
        deckCount: gs.deck.length,
        discardCount: gs.discard.length,
        routeOwners: gs.routeOwners.map(toUsername),
        playerStates,
        drawsThisTurn: gs.drawsThisTurn,
        finalRoundPending: gs.finalRoundPending
            ? gs.finalRoundPending.map(userId => toUsername(userId) as string)
            : null,
        myHand: viewerId ? [...(playerStatesSource.get(viewerId)?.hand ?? [])] : [],
    };
}

export var TrainTimeGameDataModel =
    models.TrainTimeGameData ||
    GameDataModel.discriminator<ITrainTimeGameDataDocument, ITrainTimeGameDataModel>('TrainTimeGameData', TrainTimeGameDataSchema);

// ─── GameResult stats ───────────────────────────────────────────────────────
// Everything interesting about a finished game of Train Time is already on the
// final state (routes are physical and never come back off the board), so —
// unlike Dice Cities' coins — nothing needs tracking live for this.

export interface ITrainTimePlayerResultStats {
    score: number;
    routesClaimed: number;
    trainsUsed: number;
}

export interface ITrainTimeGameResultStats {
    playerStats: Map<string, ITrainTimePlayerResultStats>;
}

export const trainTimeGameResultStatsSchemaDef = {
    playerStats: {
        type: Schema.Types.Map,
        of: {
            score: Number,
            routesClaimed: Number,
            trainsUsed: Number,
        },
    },
};

export function computeTrainTimeResultStats(gameData: ITrainTimeGameData): ITrainTimeGameResultStats {
    const playerStats = new Map<string, ITrainTimePlayerResultStats>();
    for (const [userId, ps] of gameData.specificGameState.playerStates) {
        playerStats.set(userId, {
            score: ps.score,
            routesClaimed: ps.routesClaimed,
            trainsUsed: TRAINS_PER_PLAYER - ps.trains,
        });
    }
    return { playerStats };
}

export function formatTrainTimeResultStats(
    stats: ITrainTimeGameResultStats,
    usernameById: Map<string, string>,
): GameResultStatGroup[] {
    const groups: GameResultStatGroup[] = [];
    for (const [userId, s] of stats.playerStats) {
        groups.push({
            username: usernameById.get(userId) ?? userId,
            lines: [
                `${pluralize(s.score, 'point')} from track`,
                `${pluralize(s.routesClaimed, 'route')} claimed · ${pluralize(s.trainsUsed, 'train')} laid`,
            ],
        });
    }
    return groups;
}
