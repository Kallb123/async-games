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
    ISACResources,
    ISACDevCards,
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
            history.push(`Setup: ${names.join(' & ')} rolled a ${roll} and are re-rolling`);
            SortUsersByRoll(users, usernameMap, turnOrder, history, dieToRoll);
        } else {
            turnOrder.push(users[0]);
            // The first player settled into turnOrder is the roll-off winner.
            history.push(`Setup: ${usernameMap.get(users[0])} rolled a ${roll}${turnOrder.length === 1 ? ' and goes first' : ''}`);
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

// ─── Initial-state snapshot (turn recap) ───────────────────────────────────────
// SAC's board and dev-card deck are randomised at creation and can't be
// reconstructed from later state (the deck shrinks as cards are drawn), so the
// starting specificGameState is persisted at creation and deep-cloned to seed
// replay. See docs/turn-recap-and-planning.md.

function cloneResources(r: ISACResources): ISACResources {
    return { lumber: r.lumber, wool: r.wool, grain: r.grain, brick: r.brick, ore: r.ore };
}

function cloneDevCards(d: ISACDevCards): ISACDevCards {
    return {
        knight: d.knight,
        victoryPoint: d.victoryPoint,
        roadBuilding: d.roadBuilding,
        yearOfPlenty: d.yearOfPlenty,
        monopoly: d.monopoly,
    };
}

function clonePlayerState(ps: ISACPlayerState): ISACPlayerState {
    return {
        resources: cloneResources(ps.resources),
        devCards: cloneDevCards(ps.devCards),
        newDevCards: cloneDevCards(ps.newDevCards),
        knightsPlayed: ps.knightsPlayed,
        remainingRoads: ps.remainingRoads,
        remainingSettlements: ps.remainingSettlements,
        remainingCities: ps.remainingCities,
    };
}

// Deep-clones a SAC game state into independent plain objects. playerStates is
// rebuilt as a fresh Map in `userIdList` order so replay iteration (e.g. the
// 7-roll discard loop) matches the original creation order. Accepts a state
// whose playerStates is either a Map (in-memory) or a plain object (as read
// back from Mongo after storage).
export function cloneSACState(
    gs: ISACSpecificGameState,
    userIdList: string[],
): ISACSpecificGameState {
    const source: Map<string, ISACPlayerState> = gs.playerStates instanceof Map
        ? gs.playerStates
        : new Map(Object.entries(gs.playerStates as unknown as Record<string, ISACPlayerState>));

    const playerStates = new Map<string, ISACPlayerState>();
    for (const userId of userIdList) {
        const ps = source.get(userId);
        if (ps) playerStates.set(userId, clonePlayerState(ps));
    }

    return {
        hexes: gs.hexes.map((h): ISACHex => ({ terrain: h.terrain, numberToken: h.numberToken })),
        vertices: gs.vertices.map((v): ISACVertex => ({ building: v.building, owner: v.owner })),
        edges: gs.edges.map((e): ISACEdge => ({ hasRoad: e.hasRoad, owner: e.owner })),
        harbors: gs.harbors.map((h): ISACHarbor => ({ type: h.type, vertices: [h.vertices[0], h.vertices[1]] })),
        playerStates,
        robberHexIndex: gs.robberHexIndex,
        phase: gs.phase,
        setupStep: gs.setupStep,
        pendingRoadSetup: gs.pendingRoadSetup,
        lastSetupSettlementVertex: gs.lastSetupSettlementVertex,
        hasRolled: gs.hasRolled,
        lastRoll: gs.lastRoll,
        pendingRobber: gs.pendingRobber,
        longestRoadOwner: gs.longestRoadOwner,
        largestArmyOwner: gs.largestArmyOwner,
        devCardDeck: [...gs.devCardDeck],
        pendingRoadBuilding: gs.pendingRoadBuilding,
        playedDevCard: gs.playedDevCard,
    };
}

// Seeds the replay engine's starting state by deep-cloning the initial snapshot
// stored at creation. Games created before recap support lack the snapshot;
// recap is gated on `recapAvailable` in the response so this path shouldn't be
// hit for those, but it throws clearly if it ever is.
export function buildInitialSettlementsAndCitiesState(
    gameData: ISettlementsAndCitiesGameData,
): ISACSpecificGameState {
    const snapshot = gameData.initialSpecificGameState;
    if (!snapshot) {
        throw new Error("Turn recap is unavailable for this game (created before recap support).");
    }
    return cloneSACState(snapshot, gameData.userIdList);
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
        // Persist an independent copy of the starting state so turn recap can
        // replay from it (the board + dev-card deck aren't reconstructable later).
        initialSpecificGameState: cloneSACState(specificGameState, userIdList),
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
    // Immutable copy of the starting state, persisted at creation so turn recap
    // can replay from it. Absent on games created before recap support.
    initialSpecificGameState?: ISACSpecificGameState;
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

// The specificGameState sub-schema, produced fresh per path so `specificGameState`
// (the live, mutable state) and `initialSpecificGameState` (the immutable recap
// snapshot) don't share a schema definition object.
function makeSACStateSchemaDef() {
    return {
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
    };
}

var SettlementsAndCitiesGameDataSchema = new Schema<ISettlementsAndCitiesGameDataDocument>(
    {
        specificGameState: makeSACStateSchemaDef(),
        initialSpecificGameState: makeSACStateSchemaDef(),
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
        // Turn recap replays from the stored initial snapshot; only games created
        // after recap support carry it, so the UI gates its controls on this.
        recapAvailable: !!doc.initialSpecificGameState,
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

export function gameStateToResponse(
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
