import { GameDataModel, IGameData, IGameDataDocument } from "@/utils/mongodb/GameData";
import { IInvitationData, IInvitationDataDocument, InvitationModel } from "@/utils/mongodb/InvitationData";
import { Model, Schema, models } from "mongoose";
import { ISolitaireGameDataResponse, ISolitaireGameStateResponse } from "./apiModels";
import { uuidString, GameResultStatGroup } from "@/utils/apiModels/GameDataApi";
import { pluralize } from "@/utils/ui/text";
import { userIdListToUsernameList } from "@/utils/users/clerk";
import { v4 as uuidv4 } from 'uuid';
import { SolitaireGameType } from "@/utils/apiModels/GameLogic";
import { UNLIMITED_TURN_TIMER } from "@/utils/games/TurnTimer";
import { ICard, Suit, buildStandardDeck, shuffleDeck } from "@/utils/games/Cards";
import { computeFinalScore, foundationCardCount, formatDuration } from "./rules";

export type SolitaireDrawMode = 'DRAW_1' | 'DRAW_3';

export interface SolitaireInvitationRequest {
    drawMode: SolitaireDrawMode;
}

export interface ISolitaireInvitationData extends IInvitationData {
    drawMode: SolitaireDrawMode;
}

export interface ISolitaireInvitationDataDocument extends ISolitaireInvitationData, IInvitationDataDocument {
}

export interface ISolitaireInvitationDataModel extends Model<ISolitaireInvitationDataDocument> {
}

var SolitaireInvitationSchema = new Schema<ISolitaireInvitationDataDocument>({
    drawMode: String
}, { discriminatorKey: 'kind' });
SolitaireInvitationSchema.methods.CreateGame = async function(invite: ISolitaireInvitationData, userIdList: string[]) {
    console.log("CreateGame: Solitaire game");

    const gameType = new SolitaireGameType();
    const drawMode = invite.drawMode;
    const initialSpecificGameState = buildInitialSolitaireState(drawMode);

    const gameData: ISolitaireGameData = {
        gameId: uuidv4() as uuidString,
        gameType: gameType,
        userIdList,
        // Solo play: nobody to time out against, so the turn timer never runs.
        turnTimer: UNLIMITED_TURN_TIMER,
        currentTurn: userIdList[0],
        lastTurnTimestamp: (new Date()).toISOString(),
        timerWarningNotificationSent: false,
        gameState: {
            turnOrder: userIdList,
            history: [`Dealt a new ${drawMode === 'DRAW_3' ? 'Draw-3' : 'Draw-1'} game`],
            commandHistory: []
        },
        complete: false,
        winner: "",
        specificGameState: initialSpecificGameState
    };
    return gameData;
};
export var SolitaireInvitationModel = models.SolitaireInvitation || InvitationModel.discriminator<ISolitaireInvitationDataDocument, ISolitaireInvitationDataModel>('SolitaireInvitation', SolitaireInvitationSchema);

// Board-only fields snapshotted before every mutating command so SolitaireUndo
// can restore them. Deliberately excludes drawMode/startedAt (never change)
// and undoCount (a monotonic counter of undo operations, not itself undoable).
export interface ISolitaireUndoSnapshot {
    stock: ICard[];
    waste: ICard[];
    foundations: Record<Suit, ICard[]>;
    tableau: ICard[][];
    score: number;
    moves: number;
    tableauCardsTurned: number;
    stockRecycleCount: number;
    wasteToTableauCount: number;
    cardsToFoundationCount: number;
    foundationToTableauCount: number;
}

export interface ISolitaireGameState {
    drawMode: SolitaireDrawMode;
    stock: ICard[];             // index 0 = bottom, last = next to draw
    waste: ICard[];             // last = top/playable
    foundations: Record<Suit, ICard[]>;
    tableau: ICard[][];         // 7 columns, last = frontmost/playable
    score: number;
    moves: number;
    undoCount: number;
    stockRecycleCount: number;
    tableauCardsTurned: number;
    wasteToTableauCount: number;
    cardsToFoundationCount: number;
    foundationToTableauCount: number;
    startedAt: string;
    undoStack: ISolitaireUndoSnapshot[];
}

export interface ISolitaireGameData extends IGameData {
    specificGameState: ISolitaireGameState
}

export interface ISolitaireGameDataDocument extends ISolitaireGameData, IGameDataDocument {
}

export interface ISolitaireGameDataModel extends Model<ISolitaireGameDataDocument> {
}

var SolitaireGameDataSchema = new Schema<ISolitaireGameDataDocument>({
    specificGameState: {
        drawMode: String,
        stock: Schema.Types.Mixed,
        waste: Schema.Types.Mixed,
        foundations: Schema.Types.Mixed,
        tableau: Schema.Types.Mixed,
        score: Number,
        moves: Number,
        undoCount: Number,
        stockRecycleCount: Number,
        tableauCardsTurned: Number,
        wasteToTableauCount: Number,
        cardsToFoundationCount: Number,
        foundationToTableauCount: Number,
        startedAt: String,
        undoStack: Schema.Types.Mixed
    }
}, { discriminatorKey: 'kind' });

SolitaireGameDataSchema.methods.CreateDataResponse = async function(): Promise<ISolitaireGameDataResponse> {
    console.log("CreateDataResponse: Solitaire game");

    const gameDataDocument: ISolitaireGameData = this as ISolitaireGameData;

    return {
        gameType: gameDataDocument.gameType,
        usernameList: await userIdListToUsernameList(gameDataDocument.userIdList),
        turnTimer: gameDataDocument.turnTimer,
        currentTurn: gameDataDocument.currentTurn,
        gameState: gameDataDocument.gameState,
        complete: gameDataDocument.complete,
        winner: gameDataDocument.winner,
        specificGameState: gameStateToModel(gameDataDocument.specificGameState)
    };
};

// Deals a fresh shuffled deck per docs/games/solitaire.md §3: column n gets n
// cards (n-1 face-down, 1 face-up), the remaining 24 go face-down to stock.
export function buildInitialSolitaireState(drawMode: SolitaireDrawMode): ISolitaireGameState {
    const deck = shuffleDeck(buildStandardDeck());
    const tableau: ICard[][] = [];
    let cursor = 0;
    for (let column = 0; column < 7; column++) {
        const count = column + 1;
        const cards = deck.slice(cursor, cursor + count).map((card, i) => ({ ...card, faceUp: i === count - 1 }));
        tableau.push(cards);
        cursor += count;
    }
    const stock = deck.slice(cursor).map(card => ({ ...card, faceUp: false }));

    return {
        drawMode,
        stock,
        waste: [],
        foundations: { S: [], H: [], D: [], C: [] },
        tableau,
        score: 0,
        moves: 0,
        undoCount: 0,
        stockRecycleCount: 0,
        tableauCardsTurned: 0,
        wasteToTableauCount: 0,
        cardsToFoundationCount: 0,
        foundationToTableauCount: 0,
        startedAt: (new Date()).toISOString(),
        undoStack: []
    };
}

function redact(card: ICard): ICard {
    return card.faceUp ? card : { faceUp: false };
}

export function gameStateToModel(gameState: ISolitaireGameState): ISolitaireGameStateResponse {
    return {
        drawMode: gameState.drawMode,
        stockCount: gameState.stock.length,
        waste: gameState.waste.map(redact),
        foundations: {
            S: gameState.foundations.S.map(redact),
            H: gameState.foundations.H.map(redact),
            D: gameState.foundations.D.map(redact),
            C: gameState.foundations.C.map(redact),
        },
        tableau: gameState.tableau.map(column => column.map(redact)),
        score: gameState.score,
        moves: gameState.moves,
        undoCount: gameState.undoCount,
        stockRecycleCount: gameState.stockRecycleCount,
        tableauCardsTurned: gameState.tableauCardsTurned,
        wasteToTableauCount: gameState.wasteToTableauCount,
        cardsToFoundationCount: gameState.cardsToFoundationCount,
        foundationToTableauCount: gameState.foundationToTableauCount,
        startedAt: gameState.startedAt,
        canUndo: gameState.undoStack.length > 0
    };
}

export var SolitaireGameDataModel = models.SolitaireGameData || GameDataModel.discriminator<ISolitaireGameDataDocument, ISolitaireGameDataModel>('SolitaireGameData', SolitaireGameDataSchema);

// Number of tableau cards dealt face-down at setup (0+1+...+6), the
// denominator for tableau_clear_rate telemetry (doc §7.1).
const INITIAL_HIDDEN_TABLEAU_CARDS = 21;

export interface ISolitaireGameResultStats {
    drawMode: SolitaireDrawMode;
    finalScore: number;
    timeElapsedSec: number;
    totalMoves: number;
    undoCount: number;
    tableauClearRate: number;
    foundationYield: number;
    stockRecycleCount: number;
    resultState: 'VICTORY' | 'STALEMATE_ABANDON';
}

export const solitaireGameResultStatsSchemaDef = {
    drawMode: String,
    finalScore: Number,
    timeElapsedSec: Number,
    totalMoves: Number,
    undoCount: Number,
    tableauClearRate: Number,
    foundationYield: Number,
    stockRecycleCount: Number,
    resultState: String
};

export function computeSolitaireResultStats(gameData: ISolitaireGameData): ISolitaireGameResultStats {
    const state = gameData.specificGameState;
    const foundationYield = foundationCardCount(state.foundations);
    const timeElapsedSec = Math.max(0, Math.round((Date.now() - new Date(state.startedAt).getTime()) / 1000));

    return {
        drawMode: state.drawMode,
        finalScore: computeFinalScore(state.score, timeElapsedSec),
        timeElapsedSec,
        totalMoves: state.moves,
        undoCount: state.undoCount,
        tableauClearRate: Math.min(1, state.tableauCardsTurned / INITIAL_HIDDEN_TABLEAU_CARDS),
        foundationYield,
        stockRecycleCount: state.stockRecycleCount,
        resultState: gameData.winner ? 'VICTORY' : 'STALEMATE_ABANDON'
    };
}

// Renders ISolitaireGameResultStats as a single game-wide stat group (no
// `username` - it's solo) for the shared GameResultStats UI.
export function formatSolitaireResultStats(stats: ISolitaireGameResultStats): GameResultStatGroup[] {
    const duration = formatDuration(stats.timeElapsedSec);
    const drawLabel = stats.drawMode === 'DRAW_3' ? 'Draw-3' : 'Draw-1';

    return [{
        lines: [
            `${stats.resultState === 'VICTORY' ? 'Won' : 'Ended'} a ${drawLabel} game · ${stats.finalScore} pts`,
            `${stats.foundationYield}/52 cards home in ${pluralize(stats.totalMoves, 'move')} (${pluralize(stats.undoCount, 'undo')})`,
            stats.stockRecycleCount
                ? `Finished in ${duration} · ${pluralize(stats.stockRecycleCount, 'stock recycle')}`
                : `Finished in ${duration}`,
        ],
    }];
}
