import { GameDataModel, IGameData, IGameDataDocument, publicGameState } from "@/utils/mongodb/GameData";
import { IInvitationData, IInvitationDataDocument, InvitationModel, IInvitationRequest } from "@/utils/mongodb/InvitationData";
import { Model, Schema, models } from "mongoose";
import { ISACGameDataResponse, ISACSpecificGameStateResponse, ISACPlayerStateResponse } from "./apiModels";
import { uuidString, GameResultStatGroup, GameResultChart, formatPerTurnChart, compactCharts, playerByUserId as findPlayerByUserId } from "@/utils/apiModels/GameDataApi";
import { pluralize } from "@/utils/ui/text";
import { v4 as uuidv4 } from 'uuid';
import { userIdListToUsernameList, userIdListToUsernameMap } from "@/utils/users/clerk";
import { SettlementsAndCitiesGameType } from "@/utils/apiModels/GameLogic";
import { DiceRoll } from "@/utils/games/DiceRoll";
import { shuffle } from "@/utils/games/shuffle";
import { replaceHistoryUserIds } from "@/utils/games/history";
import { clonePlayerStates, mongoMap } from "@/utils/games/mongoMaps";
import {
    generateBoard,
    createInitialPlayerState,
    DEV_CARD_DECK,
    calculateVisibleVP,
    calculateLongestRoad,
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
import {
    SACExpansions,
    normaliseExpansions,
    computeVictoryTarget,
    enabledExpansionNames,
} from "./expansions";

// ─── Invitation ──────────────────────────────────────────────────────────────

export interface SettlementsAndCitiesInvitationRequest extends IInvitationRequest {
    expansions: SACExpansions;
}

export interface ISettlementsAndCitiesInvitationData extends IInvitationData {
    expansions: SACExpansions;
}

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
        devCardsBought: ps.devCardsBought,
        resourcesGathered: ps.resourcesGathered,
        robberUses: ps.robberUses,
    };
}

// Deep-clones a SAC game state into independent plain objects. The player map
// is rebuilt in `userIdList` order (see clonePlayerStates) so replay iteration
// — the 7-roll discard loop above all — matches the original creation order.
export function cloneSACState(
    gs: ISACSpecificGameState,
    userIdList: string[],
): ISACSpecificGameState {
    return {
        hexes: gs.hexes.map((h): ISACHex => ({ terrain: h.terrain, numberToken: h.numberToken })),
        vertices: gs.vertices.map((v): ISACVertex => ({ building: v.building, owner: v.owner })),
        edges: gs.edges.map((e): ISACEdge => ({ hasRoad: e.hasRoad, owner: e.owner })),
        harbors: gs.harbors.map((h): ISACHarbor => ({ type: h.type, vertices: [h.vertices[0], h.vertices[1]] })),
        playerStates: clonePlayerStates(gs.playerStates, userIdList, clonePlayerState),
        robberHexIndex: gs.robberHexIndex,
        phase: gs.phase,
        setupStep: gs.setupStep,
        pendingRoadSetup: gs.pendingRoadSetup,
        lastSetupSettlementVertex: gs.lastSetupSettlementVertex,
        hasRolled: gs.hasRolled,
        lastRoll: gs.lastRoll,
        lastRollDie1: gs.lastRollDie1,
        lastRollDie2: gs.lastRollDie2,
        pendingRobber: gs.pendingRobber,
        longestRoadOwner: gs.longestRoadOwner,
        largestArmyOwner: gs.largestArmyOwner,
        devCardDeck: [...gs.devCardDeck],
        pendingRoadBuilding: gs.pendingRoadBuilding,
        playedDevCard: gs.playedDevCard,
        specialBuildActive: gs.specialBuildActive ?? false,
        specialBuildQueue: [...(gs.specialBuildQueue ?? [])],
        specialBuildMainPlayer: gs.specialBuildMainPlayer ?? null,
        expansions: normaliseExpansions(gs.expansions),
        victoryTarget: gs.victoryTarget ?? 10,
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

const expansionsSubSchema = {
    seasAndSailors: Boolean,
    knightsAndCommerce: Boolean,
    tradersAndRaiders: Boolean,
    explorersAndPirates: Boolean,
    fiveSixPlayerExtension: Boolean,
};

var SettlementsAndCitiesInvitationSchema = new Schema<ISettlementsAndCitiesInvitationDataDocument>(
    {
        expansions: expansionsSubSchema,
    },
    { discriminatorKey: 'kind' },
);
SettlementsAndCitiesInvitationSchema.methods.CreateGame = async function(
    invite: ISettlementsAndCitiesInvitationData,
    userIdList: string[],
) {
    console.log('CreateGame: Settlements and Cities game');

    const gameType = new SettlementsAndCitiesGameType();

    const expansions = normaliseExpansions(this.expansions);
    const victoryTarget = computeVictoryTarget(expansions);

    const turnOrder: string[] = [];
    const history: string[] = [];
    const usernameMap = await userIdListToUsernameMap(userIdList);
    SortUsersByRoll(userIdList, usernameMap, turnOrder, history, 6);

    const enabledNames = enabledExpansionNames(expansions);
    if (enabledNames.length > 0) {
        history.push(`Setup: expansions enabled — ${enabledNames.join(', ')}`);
    }
    history.push(`Setup: first to ${victoryTarget} victory points wins`);

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
        lastRollDie1: null,
        lastRollDie2: null,
        pendingRobber: false,
        longestRoadOwner: null,
        largestArmyOwner: null,
        devCardDeck: shuffle(DEV_CARD_DECK),
        pendingRoadBuilding: 0,
        playedDevCard: false,
        specialBuildActive: false,
        specialBuildQueue: [],
        specialBuildMainPlayer: null,
        expansions,
        victoryTarget,
    };

    const gameData: ISettlementsAndCitiesGameData = {
        gameId: uuidv4() as uuidString,
        gameType,
        userIdList,
        turnTimer: this.turnTimer,
        currentTurn: setupCurrentTurn,
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
                devCardsBought: Number,
                resourcesGathered: Number,
                robberUses: Number,
            },
        },
        robberHexIndex: Number,
        phase: String,
        setupStep: Number,
        pendingRoadSetup: Boolean,
        lastSetupSettlementVertex: { type: Number, default: null },
        hasRolled: Boolean,
        lastRoll: { type: Number, default: null },
        lastRollDie1: { type: Number, default: null },
        lastRollDie2: { type: Number, default: null },
        pendingRobber: Boolean,
        longestRoadOwner: { type: String, default: null },
        largestArmyOwner: { type: String, default: null },
        devCardDeck: [String],
        pendingRoadBuilding: Number,
        playedDevCard: Boolean,
        specialBuildActive: Boolean,
        specialBuildQueue: [String],
        specialBuildMainPlayer: { type: String, default: null },
        expansions: expansionsSubSchema,
        victoryTarget: Number,
    };
}

var SettlementsAndCitiesGameDataSchema = new Schema<ISettlementsAndCitiesGameDataDocument>(
    {
        specificGameState: makeSACStateSchemaDef(),
        initialSpecificGameState: makeSACStateSchemaDef(),
    },
    { discriminatorKey: 'kind' },
);

SettlementsAndCitiesGameDataSchema.methods.CreateDataResponse = async function(viewerId: string | null): Promise<ISACGameDataResponse> {
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
        userIdList: doc.userIdList,
        turnTimer: doc.turnTimer,
        currentTurn: doc.currentTurn,
        gameState: publicGameState(
            doc.gameState,
            replaceHistoryUserIds(doc.gameState.history, userIdNameMap),
        ),
        complete: doc.complete,
        winner: doc.winner,
        endReason: doc.endReason,
        forfeitedBy: doc.forfeitedBy,
        specificGameState: gameStateToResponse(doc.specificGameState, userIdNameMap, viewerId),
        // Turn recap replays from the stored initial snapshot; only games created
        // after recap support carry it, so the UI gates its controls on this.
        recapAvailable: !!doc.initialSpecificGameState,
    };
};

export function gameStateToResponse(
    gs: ISACSpecificGameState,
    userIdNameMap: { [key: string]: string },
    // Their hand and dev cards in full; everyone else counts. Null = nobody's.
    viewerId: string | null,
): ISACSpecificGameStateResponse {
    const total = (cards: ISACResources | ISACDevCards) => Object.values(cards).reduce((sum, n) => sum + n, 0);

    const playerStates: ISACSpecificGameStateResponse['playerStates'] = {};
    const playerDevCards: ISACSpecificGameStateResponse['playerDevCards'] = {};
    const playerNewDevCards: ISACSpecificGameStateResponse['playerNewDevCards'] = {};

    for (const [userId, ps] of mongoMap(gs.playerStates)) {
        const username = userIdNameMap[userId];
        playerStates[userId] = {
            userId,
            username,
            resourceCount: total(ps.resources),
            resources: userId === viewerId ? { ...ps.resources } : undefined,
            devCardCount: total(ps.devCards) + total(ps.newDevCards),
            knightsPlayed: ps.knightsPlayed,
            resourcesGathered: ps.resourcesGathered,
            remainingRoads: ps.remainingRoads,
            remainingSettlements: ps.remainingSettlements,
            remainingCities: ps.remainingCities,
            visibleVP: calculateVisibleVP(userId, gs.vertices, gs.longestRoadOwner, gs.largestArmyOwner),
        };
        if (userId === viewerId) {
            playerDevCards[userId] = { ...ps.devCards };
            playerNewDevCards[userId] = { ...ps.newDevCards };
        }
    }

    // Ownership stays keyed by the stable userId all the way to the client, which
    // resolves a display name from playerStates[userId] when it needs one — so a
    // rename can't shift an owner reference or a per-player key.
    const vertices = gs.vertices.map(v => ({
        building: v.building,
        owner: v.owner ?? null,
    }));
    const edges = gs.edges.map(e => ({
        hasRoad: e.hasRoad,
        owner: e.owner ?? null,
    }));

    const longestRoadOwner = gs.longestRoadOwner ?? null;
    const largestArmyOwner = gs.largestArmyOwner ?? null;

    // Special Build Phase (§8.5) — the queue is userIds (index 0 = active now);
    // the client shows whose special-build turn it is via playerStates.
    const specialBuildQueue = gs.specialBuildQueue ?? [];
    const specialBuildMainPlayer = gs.specialBuildMainPlayer ?? null;

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
        lastRollDie1: gs.lastRollDie1,
        lastRollDie2: gs.lastRollDie2,
        pendingRobber: gs.pendingRobber,
        longestRoadOwner,
        largestArmyOwner,
        devCardDeckSize: gs.devCardDeck.length,
        pendingRoadBuilding: gs.pendingRoadBuilding,
        playedDevCard: gs.playedDevCard,
        playerDevCards,
        playerNewDevCards,
        specialBuildActive: gs.specialBuildActive ?? false,
        specialBuildQueue,
        specialBuildMainPlayer,
        expansions: normaliseExpansions(gs.expansions),
        victoryTarget: gs.victoryTarget ?? 10,
    };
}

export function playerByUserId(
    state: ISACSpecificGameStateResponse | undefined,
    userId: string
): ISACPlayerStateResponse | undefined {
    return findPlayerByUserId(state, userId);
}

export var SettlementsAndCitiesGameDataModel =
    models.SettlementsAndCitiesGameData ||
    GameDataModel.discriminator<
        ISettlementsAndCitiesGameDataDocument,
        ISettlementsAndCitiesGameDataModel
    >('SettlementsAndCitiesGameData', SettlementsAndCitiesGameDataSchema);

// ─── GameResult stats ──────────────────────────────────────────────────────────
// Boiled-down stats for the GameResult read model, computed once at game-end
// (see recordGameResult in GameResultData.ts). Settlements/cities/roads/
// longest-road-length/victory-points are read straight off the final board
// (they're physical state, so there's nothing to lose by computing them once
// at the end); knightsPlayed/devCardsBought/resourcesGathered/robberUses are
// tallied live in SettlementsAndCitiesLogic.ts as the game is played, since
// pieces get spent/consumed and can't be reconstructed from the final state
// alone. `resourcesGathered` counts resources added to hand from any source
// (production, setup, robber steals, Year of Plenty, Monopoly) but not
// maritime trades, which convert existing resources rather than gather new
// ones. `robberUses` counts times a player triggered a robber move, by
// rolling a 7 or by playing a Knight.
export interface ISACPlayerResultStats {
    settlements: number;
    cities: number;
    roads: number;
    longestRoad: number;
    knightsPlayed: number;
    devCardsBought: number;
    resourcesGathered: number;
    robberUses: number;
    victoryPoints: number;
}

export interface ISACGameResultStats {
    playerStats: Map<string, ISACPlayerResultStats>;
    // Cumulative resourcesGathered per player at the end of each turn, in turn
    // order - not derivable from playerStats above (that's the game-end total
    // only). Powers a resources/turn chart. Computed by replaying
    // commandHistory via computePerTurnStat (see replay.ts), driven from this
    // game's GAME_RESULT_STATS entry in GameResultData.ts, since it isn't
    // tracked as history on specificGameState.
    resourcesPerTurn: Map<string, number>[];
}

export const sacGameResultStatsSchemaDef = {
    playerStats: {
        type: Schema.Types.Map,
        of: {
            settlements: Number,
            cities: Number,
            roads: Number,
            longestRoad: Number,
            knightsPlayed: Number,
            devCardsBought: Number,
            resourcesGathered: Number,
            robberUses: Number,
            victoryPoints: Number,
        },
    },
    resourcesPerTurn: [{ type: Schema.Types.Map, of: Number }],
};

export function computeSettlementsAndCitiesResultStats(
    gameData: ISettlementsAndCitiesGameData,
    resourcesPerTurn: Map<string, number>[],
): ISACGameResultStats {
    const gs = gameData.specificGameState;
    const playerStats = new Map<string, ISACPlayerResultStats>();
    for (const [userId, ps] of mongoMap(gs.playerStates)) {
        const settlements = gs.vertices.filter(v => v.owner === userId && v.building === 'settlement').length;
        const cities = gs.vertices.filter(v => v.owner === userId && v.building === 'city').length;
        const roads = gs.edges.filter(e => e.owner === userId && e.hasRoad).length;
        // Hidden VP cards are revealed at game-end, so count both playable and
        // freshly-bought-this-turn victory-point cards toward the final total.
        const victoryPoints = calculateVisibleVP(userId, gs.vertices, gs.longestRoadOwner, gs.largestArmyOwner)
            + ps.devCards.victoryPoint + ps.newDevCards.victoryPoint;
        playerStats.set(userId, {
            settlements,
            cities,
            roads,
            longestRoad: calculateLongestRoad(userId, gs.vertices, gs.edges),
            knightsPlayed: ps.knightsPlayed,
            devCardsBought: ps.devCardsBought,
            resourcesGathered: ps.resourcesGathered,
            robberUses: ps.robberUses,
            victoryPoints,
        });
    }
    return { playerStats, resourcesPerTurn };
}

// Renders ISACGameResultStats as one stat group per player, for the shared
// GameResultStats UI (recent-form popup + full result page).
export function formatSettlementsAndCitiesResultStats(stats: ISACGameResultStats, usernameById: Map<string, string>): GameResultStatGroup[] {
    const groups: GameResultStatGroup[] = [];
    for (const [userId, s] of stats.playerStats) {
        groups.push({
            username: usernameById.get(userId) ?? userId,
            lines: [
                `${pluralize(s.victoryPoints, 'victory point')}`,
                `${s.settlements} settlements, ${s.cities} cities, ${s.roads} roads`,
                `Longest road: ${s.longestRoad}`,
                `Played ${pluralize(s.knightsPlayed, 'knight')}`,
                `Bought ${pluralize(s.devCardsBought, 'development card')}`,
                `Gathered ${pluralize(s.resourcesGathered, 'resource')}`,
                `Used the robber ${pluralize(s.robberUses, 'time')}`,
            ],
        });
    }
    return groups;
}

// Renders resourcesPerTurn as GameResult charts: one entry per turn, keyed by
// username, for the result page's resources/turn chart.
export function formatSettlementsAndCitiesCharts(stats: ISACGameResultStats, usernameById: Map<string, string>): GameResultChart[] {
    return compactCharts(formatPerTurnChart(stats.resourcesPerTurn, "Resources gathered per turn", "Resources"));
}
