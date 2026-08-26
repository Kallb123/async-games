import { GameDataModel, IGameData, IGameDataDocument, publicGameState } from "@/utils/mongodb/GameData";
import { IInvitationData, IInvitationDataDocument, InvitationModel, IInvitationRequest } from "@/utils/mongodb/InvitationData";
import { Model, Schema, models } from "mongoose";
import { v4 as uuidv4 } from 'uuid';
import {
    uuidString,
    GameResultStatGroup,
    GameResultChart,
    compactCharts,
    formatPerTurnChart,
} from "@/utils/apiModels/GameDataApi";
import { pluralize } from "@/utils/ui/text";
import { userIdListToUsernameList, userIdListToUsernameMap } from "@/utils/users/clerk";
import { shuffle } from "@/utils/games/shuffle";
import { clonePlayerStates, mongoMap } from "@/utils/games/mongoMaps";
import { TrainTimeGameType } from "@/utils/apiModels/GameLogic";
import {
    ITrainTimeGameDataResponse,
    ITrainTimeSpecificGameStateResponse,
    ITrainTimeTicketView,
} from "./apiModels";
import {
    ITrainTimePlayerState,
    ITrainTimeSpecificGameState,
    TICKETS,
    TRAINS_PER_PLAYER,
    buildInitialTrainTimeState,
    drawsTakenBy,
    longestRun,
    playerNetwork,
    scoreBreakdown,
    ticketIsComplete,
    ticketsToKeep,
    totalScore,
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

    const specificGameState = buildInitialTrainTimeState(turnOrder);

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
        specificGameState,
        initialSpecificGameState: cloneTrainTimeState(specificGameState, turnOrder),
    };
    return gameData;
};
export var TrainTimeInvitationModel =
    models.TrainTimeInvitation ||
    InvitationModel.discriminator<ITrainTimeInvitationDataDocument, ITrainTimeInvitationDataModel>('TrainTimeInvitation', TrainTimeInvitationSchema);

// ─── Game data interfaces ───────────────────────────────────────────────────

export interface ITrainTimeGameData extends IGameData {
    specificGameState: ITrainTimeSpecificGameState;
    /**
     * Immutable copy of the dealt starting state, persisted at creation so turn
     * recap can replay the command log from it. The shuffled carriage and
     * ticket decks are consumed as the game runs, so there is no reconstructing
     * them afterwards — games dealt before this existed simply have no recap
     * (see `recapAvailable`).
     */
    initialSpecificGameState?: ITrainTimeSpecificGameState;
}

export interface ITrainTimeGameDataDocument extends ITrainTimeGameData, IGameDataDocument {}

export interface ITrainTimeGameDataModel extends Model<ITrainTimeGameDataDocument> {}

// ─── Replay support ─────────────────────────────────────────────────────────

/**
 * One player's state as plain data. Every field is named rather than spread:
 * the snapshot recap replays from comes back from Mongo as a subdocument, whose
 * fields live behind getters and so are missed entirely by `{ ...ps }` — which
 * left every score, train count and route tally `undefined`, and every total on
 * a reviewed turn NaN.
 */
function clonePlayerState(ps: ITrainTimePlayerState): ITrainTimePlayerState {
    return {
        hand: [...ps.hand],
        tickets: [...ps.tickets],
        pendingTickets: [...ps.pendingTickets],
        trains: ps.trains,
        score: ps.score,
        ticketScore: ps.ticketScore,
        ticketsCompleted: ps.ticketsCompleted,
        longHaulBonus: ps.longHaulBonus,
        routesClaimed: ps.routesClaimed,
    };
}

/**
 * Deep copy of a game state, rebuilding the player map in `order` so iteration
 * matches the original deal — final scoring ranks players by that order, so a
 * replay that iterated differently could break a tie the other way.
 */
export function cloneTrainTimeState(
    gs: ITrainTimeSpecificGameState,
    order: string[],
): ITrainTimeSpecificGameState {
    return {
        deck: [...gs.deck],
        discard: [...gs.discard],
        market: [...gs.market],
        ticketDeck: [...gs.ticketDeck],
        playerStates: clonePlayerStates(gs.playerStates, order, clonePlayerState),
        routeOwners: [...gs.routeOwners],
        drawsThisTurn: gs.drawsThisTurn,
        drawTurnOwner: gs.drawTurnOwner,
        finalRoundPending: gs.finalRoundPending ? [...gs.finalRoundPending] : null,
        gameOver: gs.gameOver,
    };
}

/**
 * The starting state the replay engine rewinds to. Train Time deals shuffled
 * decks that are consumed as it runs, so this can only ever be the stored
 * snapshot; a game dealt before that snapshot existed has no recap, which the
 * `recapAvailable` flag tells the client up front.
 */
export function buildInitialTrainTimeStateFromGameData(
    gameData: ITrainTimeGameData,
): ITrainTimeSpecificGameState {
    const snapshot = gameData.initialSpecificGameState;
    if (!snapshot) {
        throw new Error("Turn recap is unavailable for this game (created before recap support).");
    }
    return cloneTrainTimeState(snapshot, gameData.gameState.turnOrder);
}

// ─── Mongoose schema ────────────────────────────────────────────────────────

// Shared by the live state and the immutable starting snapshot recap replays
// from, so the two paths can never drift apart.
function makeTrainTimeStateSchemaDef() {
    return {
        deck: [String],
        discard: [String],
        market: [String],
        ticketDeck: [Number],
        playerStates: {
            type: Schema.Types.Map,
            of: {
                hand: [String],
                tickets: [Number],
                pendingTickets: [Number],
                trains: Number,
                score: Number,
                ticketScore: Number,
                ticketsCompleted: Number,
                longHaulBonus: Number,
                routesClaimed: Number,
            },
        },
        routeOwners: Schema.Types.Mixed,
        drawsThisTurn: Number,
        drawTurnOwner: String,
        finalRoundPending: Schema.Types.Mixed,
        gameOver: Boolean,
    };
}

var TrainTimeGameDataSchema = new Schema<ITrainTimeGameDataDocument>(
    {
        specificGameState: makeTrainTimeStateSchemaDef(),
        initialSpecificGameState: makeTrainTimeStateSchemaDef(),
    },
    { discriminatorKey: 'kind' },
);

TrainTimeGameDataSchema.methods.CreateDataResponse = async function(viewerId: string | null): Promise<ITrainTimeGameDataResponse> {
    console.log('CreateDataResponse: Train Time game');

    const doc: ITrainTimeGameData = this as ITrainTimeGameData;
    const usernameList = await userIdListToUsernameList(doc.userIdList);
    const userIdNameMap: { [key: string]: string } = {};
    doc.userIdList.forEach((userId, i) => { userIdNameMap[userId] = usernameList[i]; });

    return {
        gameType: doc.gameType,
        usernameList,
        turnTimer: doc.turnTimer,
        currentTurn: doc.currentTurn,
        gameState: publicGameState(doc.gameState),
        complete: doc.complete,
        winner: doc.winner,
        endReason: doc.endReason,
        forfeitedBy: doc.forfeitedBy,
        specificGameState: gameStateToModel(doc.specificGameState, userIdNameMap, viewerId),
        recapAvailable: !!doc.initialSpecificGameState,
    };
};

export function gameStateToModel(
    gs: ITrainTimeSpecificGameState,
    userIdNameMap: { [key: string]: string },
    viewerId: string | null,
): ITrainTimeSpecificGameStateResponse {
    const playerStatesSource = mongoMap(gs.playerStates);

    const playerStates: ITrainTimeSpecificGameStateResponse['playerStates'] = {};
    for (const [userId, ps] of playerStatesSource) {
        const username = userIdNameMap[userId] ?? userId;
        playerStates[username] = {
            userId,
            username,
            handCount: ps.hand.length,
            ticketCount: ps.tickets.length,
            trains: ps.trains,
            score: ps.score,
            ticketScore: ps.ticketScore,
            ticketsCompleted: ps.ticketsCompleted,
            longHaulBonus: ps.longHaulBonus ?? 0,
            longestRun: longestRun(gs.routeOwners, userId),
            routesClaimed: ps.routesClaimed,
            // Tickets stay secret until the game is scored, then the whole
            // table sees everybody's (design doc §10).
            tickets: gs.gameOver ? ticketViews(ps.tickets, gs, userId) : undefined,
        };
    }

    const viewer = viewerId ? playerStatesSource.get(viewerId) : undefined;

    const toUsername = (userId: string | null) => (userId ? userIdNameMap[userId] ?? userId : null);

    return {
        market: [...gs.market],
        deckCount: gs.deck.length,
        discardCount: gs.discard.length,
        routeOwners: gs.routeOwners.map(toUsername),
        playerStates,
        myDrawsThisTurn: viewerId ? drawsTakenBy(gs, viewerId) : 0,
        ticketDeckCount: gs.ticketDeck.length,
        myTickets: viewer ? ticketViews(viewer.tickets, gs, viewerId as string) : [],
        myPendingTickets: viewer ? ticketViews(viewer.pendingTickets, gs, viewerId as string) : [],
        myTicketsToKeep: viewer && viewer.pendingTickets.length > 0
            ? Math.min(ticketsToKeep(viewer), viewer.pendingTickets.length)
            : 0,
        finalRoundPending: gs.finalRoundPending
            ? gs.finalRoundPending.map(userId => toUsername(userId) as string)
            : null,
        scored: gs.gameOver,
        myHand: viewer ? [...viewer.hand] : [],
    };
}

/**
 * Ticket ids as the client wants them: the two cities, the value, and whether
 * this player's network already joins them. The completion flag is computed
 * here rather than stored, so it stays right as routes are claimed.
 */
function ticketViews(
    ticketIds: number[],
    gs: ITrainTimeSpecificGameState,
    ownerId: string,
): ITrainTimeTicketView[] {
    const network = playerNetwork(gs.routeOwners, ownerId);
    return ticketIds.map(id => TICKETS[id]).filter(Boolean).map(ticket => ({
        id: ticket.id,
        cityA: ticket.cityA,
        cityB: ticket.cityB,
        points: ticket.points,
        complete: ticketIsComplete(ticket, network),
    }));
}

export var TrainTimeGameDataModel =
    models.TrainTimeGameData ||
    GameDataModel.discriminator<ITrainTimeGameDataDocument, ITrainTimeGameDataModel>('TrainTimeGameData', TrainTimeGameDataSchema);

// ─── GameResult stats ───────────────────────────────────────────────────────
// Everything interesting about a finished game of Train Time is already on the
// final state (routes are physical and never come back off the board), so —
// unlike Dice Cities' coins — nothing needs tracking live for this.

export interface ITrainTimePlayerResultStats {
    /** Route points only — the ticket swing and the bonus are their own lines. */
    score: number;
    ticketScore: number;
    ticketsCompleted: number;
    ticketsHeld: number;
    /** LONG_HAUL_BONUS if they laid the longest run of track, else 0 (§7). */
    longHaulBonus: number;
    /** How long that run was, in train spaces. */
    longestRun: number;
    routesClaimed: number;
    trainsUsed: number;
}

export interface ITrainTimeGameResultStats {
    playerStats: Map<string, ITrainTimePlayerResultStats>;
    // Route points per player at the end of each turn, in turn order — the
    // race as it actually ran, which the game-end totals above can't show.
    // Not tracked on specificGameState, so it's computed by replaying
    // commandHistory via computePerTurnStat (see replay.ts), driven from this
    // game's GAME_RESULT_STATS entry in GameResultData.ts.
    pointsPerTurn: Map<string, number>[];
    // The Long Haul race over the same turns: each player's longest continuous
    // run of track. Worth +10 at scoring and often the tie-break, and it moves
    // in jumps as separate stretches of network finally join up — a different
    // shape from the points line, not a rescaling of it.
    longestRunPerTurn: Map<string, number>[];
}

export const trainTimeGameResultStatsSchemaDef = {
    playerStats: {
        type: Schema.Types.Map,
        of: {
            score: Number,
            ticketScore: Number,
            ticketsCompleted: Number,
            ticketsHeld: Number,
            longHaulBonus: Number,
            longestRun: Number,
            routesClaimed: Number,
            trainsUsed: Number,
        },
    },
    pointsPerTurn: [{ type: Schema.Types.Map, of: Number }],
    longestRunPerTurn: [{ type: Schema.Types.Map, of: Number }],
};

export function computeTrainTimeResultStats(
    gameData: ITrainTimeGameData,
    pointsPerTurn: Map<string, number>[],
    longestRunPerTurn: Map<string, number>[],
): ITrainTimeGameResultStats {
    const playerStats = new Map<string, ITrainTimePlayerResultStats>();
    for (const [userId, ps] of gameData.specificGameState.playerStates) {
        playerStats.set(userId, {
            score: ps.score,
            ticketScore: ps.ticketScore,
            ticketsCompleted: ps.ticketsCompleted,
            ticketsHeld: ps.tickets.length,
            // A game dealt before the bonus existed has no field to read.
            longHaulBonus: ps.longHaulBonus ?? 0,
            longestRun: longestRun(gameData.specificGameState.routeOwners, userId),
            routesClaimed: ps.routesClaimed,
            trainsUsed: TRAINS_PER_PLAYER - ps.trains,
        });
    }
    return { playerStats, pointsPerTurn, longestRunPerTurn };
}

// Renders the per-turn series as GameResult charts: the points race, and the
// Long Haul race beside it.
export function formatTrainTimeCharts(
    stats: ITrainTimeGameResultStats,
    usernameById: Map<string, string>,
): GameResultChart[] {
    return compactCharts(
        formatPerTurnChart(stats.pointsPerTurn, usernameById, "Route points per turn", "Points"),
        formatPerTurnChart(stats.longestRunPerTurn, usernameById, "Longest run per turn", "Track"),
    );
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
                `${totalScore(s)} points — ${scoreBreakdown(s).join(', ')}`,
                `${s.ticketsCompleted} of ${pluralize(s.ticketsHeld, 'ticket')} connected`,
                `${pluralize(s.routesClaimed, 'route')} claimed · ${pluralize(s.trainsUsed, 'train')} laid`,
            ],
        });
    }
    return groups;
}
