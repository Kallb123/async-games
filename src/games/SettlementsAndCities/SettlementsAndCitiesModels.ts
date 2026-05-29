import { GameDataModel, IGameData, IGameDataDocument } from "@/utils/mongodb/GameData";
import { IInvitationData, IInvitationDataDocument, InvitationModel, IInvitationRequest } from "@/utils/mongodb/InvitationData";
import { Model, Schema, models } from "mongoose";
import { ISACGameDataResponse, ISACSpecificGameStateResponse } from "./apiModels";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import { v4 as uuidv4 } from 'uuid';
import { userIdListToUsernameList, userIdListToUsernameMap } from "@/utils/users/clerk";
import { SettlementsAndCitiesGameType } from "@/utils/apiModels/GameLogic";
import { DiceRoll } from "@/utils/games/DiceRoll";
import {
    generateBoard,
    createInitialPlayerState,
    DEV_CARD_DECK,
    calculateVisibleVP,
    BOARD_TOPOLOGY,
    ISACHex,
    ISACVertex,
    ISACEdge,
    ISACHarbor,
    ISACPlayerState,
    ISACSpecificGameState,
} from "./board";

// ─── Invitation ──────────────────────────────────────────────────────────────

export interface SettlementsAndCitiesInvitationRequest extends IInvitationRequest {}

export interface ISettlementsAndCitiesInvitationData extends IInvitationData {}

export interface ISettlementsAndCitiesInvitationDataDocument
    extends ISettlementsAndCitiesInvitationData, IInvitationDataDocument {}

export interface ISettlementsAndCitiesInvitationDataModel
    extends Model<ISettlementsAndCitiesInvitationDataDocument> {}

function SortUsersByRoll(
    userIdList: string[],
    usernameMap: Map<string, string>,
    turnOrder: string[],
    history: string[],
    dieToRoll: number,
) {
    const turnRolls = userIdList.map(userId => ({ userId, diceRoll: DiceRoll(dieToRoll) }));
    const distinctRolls = new Map<number, string[]>();
    turnRolls.forEach(({ userId, diceRoll }) => {
        const bucket = distinctRolls.get(diceRoll);
        if (bucket) bucket.push(userId);
        else distinctRolls.set(diceRoll, [userId]);
    });
    [...distinctRolls.keys()].sort((a, b) => b - a).forEach(roll => {
        const users = distinctRolls.get(roll)!;
        if (users.length > 1) {
            const names = users.map(u => usernameMap.get(u));
            history.push(`${names.join(' & ')} rolled a ${roll} and are re-rolling`);
            SortUsersByRoll(users, usernameMap, turnOrder, history, dieToRoll);
        } else {
            turnOrder.push(users[0]);
            history.push(`${usernameMap.get(users[0])} rolled a ${roll}`);
        }
    });
}

// Shuffle array helper (copy)
function shuffleDeck<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

var SettlementsAndCitiesInvitationSchema = new Schema<ISettlementsAndCitiesInvitationDataDocument>(
    {},
    { discriminatorKey: 'kind' },
);
SettlementsAndCitiesInvitationSchema.methods.CreateGame = async function(
    invite: ISettlementsAndCitiesInvitationData,
    userIdList: string[],
) {
    console.log('CreateGame: Settlements and Cities game');

    const gameType = new SettlementsAndCitiesGameType();

    const turnOrder: string[] = [];
    const history: string[] = [];
    const usernameMap = await userIdListToUsernameMap(userIdList);
    SortUsersByRoll(userIdList, usernameMap, turnOrder, history, 6);

    const { hexes, harbors, desertHexIndex } = generateBoard();

    const playerStates = new Map<string, ISACPlayerState>();
    for (const userId of userIdList) {
        playerStates.set(userId, createInitialPlayerState());
    }

    const numVertices = BOARD_TOPOLOGY.numVertices;
    const numEdges = BOARD_TOPOLOGY.numEdges;

    const vertices: ISACVertex[] = Array.from({ length: numVertices }, () => ({
        building: null,
        owner: null,
    }));
    const edges: ISACEdge[] = Array.from({ length: numEdges }, () => ({
        hasRoad: false,
        owner: null,
    }));

    // First player in turn order goes first in setup
    const N = userIdList.length;
    const setupCurrentTurn = turnOrder[0];

    const specificGameState: ISACSpecificGameState = {
        hexes,
        vertices,
        edges,
        harbors,
        playerStates,
        robberHexIndex: desertHexIndex,
        phase: 'setup',
        setupStep: 0,
        pendingRoadSetup: false,
        lastSetupSettlementVertex: null,
        hasRolled: false,
        lastRoll: null,
        pendingRobber: false,
        longestRoadOwner: null,
        largestArmyOwner: null,
        devCardDeck: shuffleDeck(DEV_CARD_DECK),
        pendingRoadBuilding: 0,
        playedDevCard: false,
    };

    const gameData: ISettlementsAndCitiesGameData = {
        gameId: uuidv4() as uuidString,
        gameType,
        userIdList,
        turnTimer: this.turnTimer,
        currentTurn: setupCurrentTurn,
        lastTurnTimestamp: new Date().toISOString(),
        timerWarningNotificationSent: false,
        gameState: {
            turnOrder,
            history,
            commandHistory: [],
        },
        complete: false,
        winner: '',
        specificGameState,
    };
    return gameData;
};
export var SettlementsAndCitiesInvitationModel =
    models.SettlementsAndCitiesInvitation ||
    InvitationModel.discriminator<
        ISettlementsAndCitiesInvitationDataDocument,
        ISettlementsAndCitiesInvitationDataModel
    >('SettlementsAndCitiesInvitation', SettlementsAndCitiesInvitationSchema);

// ─── Game data interfaces ─────────────────────────────────────────────────────

export interface ISettlementsAndCitiesGameData extends IGameData {
    specificGameState: ISACSpecificGameState;
}

export interface ISettlementsAndCitiesGameDataDocument
    extends ISettlementsAndCitiesGameData, IGameDataDocument {}

export interface ISettlementsAndCitiesGameDataModel
    extends Model<ISettlementsAndCitiesGameDataDocument> {}

// ─── Mongoose schema ──────────────────────────────────────────────────────────

const devCardsSubSchema = {
    knight: Number,
    victoryPoint: Number,
    roadBuilding: Number,
    yearOfPlenty: Number,
    monopoly: Number,
};

const resourcesSubSchema = {
    lumber: Number,
    wool: Number,
    grain: Number,
    brick: Number,
    ore: Number,
};

var SettlementsAndCitiesGameDataSchema = new Schema<ISettlementsAndCitiesGameDataDocument>(
    {
        specificGameState: {
            hexes: [{ terrain: String, numberToken: { type: Number, default: null } }],
            vertices: [{ building: { type: String, default: null }, owner: { type: String, default: null } }],
            edges: [{ hasRoad: Boolean, owner: { type: String, default: null } }],
            harbors: [{ type: { type: String }, vertices: [Number] }],
            playerStates: {
                type: Schema.Types.Map,
                of: {
                    resources: resourcesSubSchema,
                    devCards: devCardsSubSchema,
                    newDevCards: devCardsSubSchema,
                    knightsPlayed: Number,
                    remainingRoads: Number,
                    remainingSettlements: Number,
                    remainingCities: Number,
                },
            },
            robberHexIndex: Number,
            phase: String,
            setupStep: Number,
            pendingRoadSetup: Boolean,
            lastSetupSettlementVertex: { type: Number, default: null },
            hasRolled: Boolean,
            lastRoll: { type: Number, default: null },
            pendingRobber: Boolean,
            longestRoadOwner: { type: String, default: null },
            largestArmyOwner: { type: String, default: null },
            devCardDeck: [String],
            pendingRoadBuilding: Number,
            playedDevCard: Boolean,
        },
    },
    { discriminatorKey: 'kind' },
);

SettlementsAndCitiesGameDataSchema.methods.CreateDataResponse = async function(): Promise<ISACGameDataResponse> {
    console.log('CreateDataResponse: Settlements and Cities game');

    const doc: ISettlementsAndCitiesGameData = this as ISettlementsAndCitiesGameData;
    const usernameList = await userIdListToUsernameList(doc.userIdList);
    const userIdNameMap: { [key: string]: string } = {};
    (doc.userIdList as string[]).forEach((userId, i) => {
        userIdNameMap[userId] = usernameList[i];
    });

    return {
        gameType: doc.gameType,
        usernameList,
        turnTimer: doc.turnTimer,
        currentTurn: doc.currentTurn,
        gameState: {
            ...doc.gameState,
            history: replaceHistoryUserIds(doc.gameState.history, userIdNameMap),
        },
        complete: doc.complete,
        winner: doc.winner,
        specificGameState: gameStateToResponse(doc.specificGameState, userIdNameMap),
    };
};

function replaceHistoryUserIds(history: string[], userIdNameMap: { [key: string]: string }): string[] {
    return history.map(entry => {
        let updated = entry;
        for (const [userId, username] of Object.entries(userIdNameMap)) {
            if (!userId) continue;
            updated = updated.split(userId).join(username);
        }
        return updated;
    });
}

function gameStateToResponse(
    gs: ISACSpecificGameState,
    userIdNameMap: { [key: string]: string },
): ISACSpecificGameStateResponse {
    const playerStates: ISACSpecificGameStateResponse['playerStates'] = {};
    const playerDevCards: ISACSpecificGameStateResponse['playerDevCards'] = {};

    for (const [userId, ps] of gs.playerStates) {
        const username = userIdNameMap[userId];
        playerStates[username] = {
            userId,
            username,
            resources: { ...ps.resources },
            devCardCount: Object.values(ps.devCards).reduce((s, n) => s + n, 0),
            knightsPlayed: ps.knightsPlayed,
            remainingRoads: ps.remainingRoads,
            remainingSettlements: ps.remainingSettlements,
            remainingCities: ps.remainingCities,
            visibleVP: calculateVisibleVP(userId, gs.vertices, gs.longestRoadOwner, gs.largestArmyOwner),
        };
        playerDevCards[username] = { ...ps.devCards };
    }

    // Convert owner userId → username in vertices and edges
    const vertices = gs.vertices.map(v => ({
        building: v.building,
        owner: v.owner ? (userIdNameMap[v.owner] ?? v.owner) : null,
    }));
    const edges = gs.edges.map(e => ({
        hasRoad: e.hasRoad,
        owner: e.owner ? (userIdNameMap[e.owner] ?? e.owner) : null,
    }));

    const longestRoadOwner = gs.longestRoadOwner ? (userIdNameMap[gs.longestRoadOwner] ?? gs.longestRoadOwner) : null;
    const largestArmyOwner = gs.largestArmyOwner ? (userIdNameMap[gs.largestArmyOwner] ?? gs.largestArmyOwner) : null;

    return {
        hexes: gs.hexes.map(h => ({ terrain: h.terrain, numberToken: h.numberToken })),
        vertices,
        edges,
        harbors: gs.harbors.map(h => ({ type: h.type, vertices: h.vertices })),
        playerStates,
        robberHexIndex: gs.robberHexIndex,
        phase: gs.phase,
        setupStep: gs.setupStep,
        pendingRoadSetup: gs.pendingRoadSetup,
        lastSetupSettlementVertex: gs.lastSetupSettlementVertex,
        hasRolled: gs.hasRolled,
        lastRoll: gs.lastRoll,
        pendingRobber: gs.pendingRobber,
        longestRoadOwner,
        largestArmyOwner,
        devCardDeckSize: gs.devCardDeck.length,
        pendingRoadBuilding: gs.pendingRoadBuilding,
        playedDevCard: gs.playedDevCard,
        playerDevCards,
    };
}

export var SettlementsAndCitiesGameDataModel =
    models.SettlementsAndCitiesGameData ||
    GameDataModel.discriminator<
        ISettlementsAndCitiesGameDataDocument,
        ISettlementsAndCitiesGameDataModel
    >('SettlementsAndCitiesGameData', SettlementsAndCitiesGameDataSchema);
