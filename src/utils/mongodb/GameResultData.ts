import { Document, Model, Schema, model, models } from "mongoose";
import type { IGameData } from "./GameData";
import type { uuidString, GameResultStatGroup } from "../apiModels/GameDataApi";
import {
    IDiceCitiesGameData,
    IDiceCitiesGameResultStats,
    computeDiceCitiesResultStats,
    diceCitiesGameResultStatsSchemaDef,
    formatDiceCitiesResultStats,
} from "@/games/DiceCities/DiceCitiesModels";
import {
    ISmartthinkGameData,
    ISmartthinkGameResultStats,
    computeSmartthinkResultStats,
    smartthinkGameResultStatsSchemaDef,
    formatSmartthinkResultStats,
} from "@/games/Smartthink/SmartthinkModels";
import {
    ISnakesAndLaddersGameData,
    ISnakesAndLaddersGameResultStats,
    computeSnakesAndLaddersResultStats,
    snakesAndLaddersGameResultStatsSchemaDef,
    formatSnakesAndLaddersResultStats,
} from "@/games/SnakesAndLadders/SnakesAndLaddersModels";

export interface IGameResultData {
    gameId: uuidString,
    gameType: string,
    url: string,
    playerIds: string[],
    winner: string,
    endedAt: string,
    totalTurns: number
}

export interface IGameResultDataDocument extends IGameResultData, Document {
    // Instance methods
}

export interface IGameResultDataModel extends Model<IGameResultDataDocument> {
    // Static methods
}

// Append-only record of a finished game, written once via recordGameResult()
// below - it's a read model for stats, not part of the game engine, and
// survives deletion of the GameData it summarises. Per-game discriminators
// (below) add a `stats` field boiling that game's specificGameState/command
// history down into a handful of interesting numbers, following the same
// discriminatorKey pattern as GameData's specificGameState.
export var GameResultSchema = new Schema<IGameResultDataDocument>({
    gameId: { type: String, unique: true },
    gameType: String,
    url: String,
    playerIds: [String],
    winner: String,
    endedAt: String,
    totalTurns: Number
}, { discriminatorKey: 'kind' });
// Per-player match history / stats, most recent first.
GameResultSchema.index({ playerIds: 1, endedAt: -1 });
// Per-player, per-game stats (and head-to-head via playerIds $all).
GameResultSchema.index({ playerIds: 1, gameType: 1 });

export var GameResultModel = models.GameResult || model<IGameResultDataDocument, IGameResultDataModel>('GameResult', GameResultSchema);

export interface IDiceCitiesGameResultData extends IGameResultData {
    stats: IDiceCitiesGameResultStats;
}
export interface IDiceCitiesGameResultDataDocument extends IDiceCitiesGameResultData, Document {}
export interface IDiceCitiesGameResultDataModel extends Model<IDiceCitiesGameResultDataDocument> {}
var DiceCitiesGameResultSchema = new Schema<IDiceCitiesGameResultDataDocument>({
    stats: diceCitiesGameResultStatsSchemaDef
}, { discriminatorKey: 'kind' });
export var DiceCitiesGameResultModel = models.DiceCitiesGameResult || GameResultModel.discriminator<IDiceCitiesGameResultDataDocument, IDiceCitiesGameResultDataModel>('DiceCitiesGameResult', DiceCitiesGameResultSchema);

export interface ISmartthinkGameResultData extends IGameResultData {
    stats: ISmartthinkGameResultStats;
}
export interface ISmartthinkGameResultDataDocument extends ISmartthinkGameResultData, Document {}
export interface ISmartthinkGameResultDataModel extends Model<ISmartthinkGameResultDataDocument> {}
var SmartthinkGameResultSchema = new Schema<ISmartthinkGameResultDataDocument>({
    stats: smartthinkGameResultStatsSchemaDef
}, { discriminatorKey: 'kind' });
export var SmartthinkGameResultModel = models.SmartthinkGameResult || GameResultModel.discriminator<ISmartthinkGameResultDataDocument, ISmartthinkGameResultDataModel>('SmartthinkGameResult', SmartthinkGameResultSchema);

export interface ISnakesAndLaddersGameResultData extends IGameResultData {
    stats: ISnakesAndLaddersGameResultStats;
}
export interface ISnakesAndLaddersGameResultDataDocument extends ISnakesAndLaddersGameResultData, Document {}
export interface ISnakesAndLaddersGameResultDataModel extends Model<ISnakesAndLaddersGameResultDataDocument> {}
var SnakesAndLaddersGameResultSchema = new Schema<ISnakesAndLaddersGameResultDataDocument>({
    stats: snakesAndLaddersGameResultStatsSchemaDef
}, { discriminatorKey: 'kind' });
export var SnakesAndLaddersGameResultModel = models.SnakesAndLaddersGameResult || GameResultModel.discriminator<ISnakesAndLaddersGameResultDataDocument, ISnakesAndLaddersGameResultDataModel>('SnakesAndLaddersGameResult', SnakesAndLaddersGameResultSchema);

// Maps a GameData's gameType to the discriminator model + stats calculator
// that boil its final specificGameState down to the interesting numbers, plus
// a formatter that turns those numbers into display-ready stat groups. Games
// with no entry here (e.g. SettlementsAndCities) still get the base
// GameResult fields (including totalTurns) via recordGameResult below.
const GAME_RESULT_STATS: Record<string, {
    model: Model<any>,
    compute: (gameData: IGameData) => unknown,
    format: (stats: any, usernameById: Map<string, string>) => GameResultStatGroup[],
}> = {
    DiceCities: {
        model: DiceCitiesGameResultModel,
        compute: (gameData) => computeDiceCitiesResultStats(gameData as IDiceCitiesGameData),
        format: formatDiceCitiesResultStats,
    },
    Smartthink: {
        model: SmartthinkGameResultModel,
        compute: (gameData) => computeSmartthinkResultStats(gameData as ISmartthinkGameData),
        format: formatSmartthinkResultStats,
    },
    SnakesAndLadders: {
        model: SnakesAndLaddersGameResultModel,
        compute: (gameData) => computeSnakesAndLaddersResultStats(gameData as ISnakesAndLaddersGameData),
        format: formatSnakesAndLaddersResultStats,
    },
};

// Renders a GameResult document's discriminated `stats` field into display-
// ready stat groups, for the recent-form popup and the full result page.
// Returns [] for games with no formatter registered (or no stats present).
export function formatGameResultStats(gameType: string, stats: unknown, usernameById: Map<string, string>): GameResultStatGroup[] {
    const specific = GAME_RESULT_STATS[gameType];
    if (!specific || !stats) return [];
    return specific.format(stats, usernameById);
}

export type MatchOutcome = "win" | "loss" | "draw";

export interface IRecentMatch {
    gameId: string;
    url: string;
    endedAt: string;
    outcome: MatchOutcome;
}

export interface IGameStats {
    url: string;
    wins: number;
    losses: number;
    draws: number;
    total: number;
}

export interface IPlayerStats {
    recent: IRecentMatch[];
    byGame: IGameStats[];
}

function outcomeFor(winner: string, userId: string): MatchOutcome {
    if (winner === userId) return "win";
    if (winner === "") return "draw";
    return "loss";
}

// Recent match history + per-game W/L/D for one player, read from the
// GameResult store. Shared by the current user's own stats endpoint and by
// the friends-only profile endpoint - same data, different viewer.
export async function getPlayerStats(userId: string): Promise<IPlayerStats> {
    const recentResults = await GameResultModel
        .find({ playerIds: userId })
        .sort({ endedAt: -1 })
        .limit(10)
        .exec();

    const recent: IRecentMatch[] = recentResults.map(result => ({
        gameId: result.gameId,
        url: result.url,
        endedAt: result.endedAt,
        outcome: outcomeFor(result.winner, userId),
    }));

    const byGameAgg: { _id: string, wins: number, losses: number, draws: number, total: number }[] = await GameResultModel.aggregate([
        { $match: { playerIds: userId } },
        { $group: {
            _id: '$url',
            total: { $sum: 1 },
            wins: { $sum: { $cond: [{ $eq: ['$winner', userId] }, 1, 0] } },
            draws: { $sum: { $cond: [{ $eq: ['$winner', ''] }, 1, 0] } },
            losses: { $sum: { $cond: [{ $and: [{ $ne: ['$winner', userId] }, { $ne: ['$winner', ''] }] }, 1, 0] } },
        } },
        { $sort: { total: -1 } },
    ]);

    const byGame: IGameStats[] = byGameAgg.map(({ _id, wins, losses, draws, total }) => ({
        url: _id, wins, losses, draws, total,
    }));

    return { recent, byGame };
}

// Writes the one, permanent result record for a finished game. Call this
// once gameData.complete/winner are set (win via CheckGameOver, or a forced
// end). Idempotent on gameId in case it's ever invoked twice for the same game.
export async function recordGameResult(gameData: IGameData): Promise<void> {
    const base = {
        gameId: gameData.gameId,
        gameType: gameData.gameType.gameType,
        url: gameData.gameType.url,
        playerIds: gameData.userIdList,
        winner: gameData.winner,
        endedAt: new Date().toISOString(),
        totalTurns: gameData.gameState.commandHistory.length
    };
    const specific = GAME_RESULT_STATS[gameData.gameType.gameType];
    try {
        if (specific) {
            await specific.model.create({ ...base, stats: specific.compute(gameData) });
        } else {
            await GameResultModel.create(base);
        }
    } catch (err: any) {
        if (err?.code !== 11000) {
            throw err;
        }
    }
}
