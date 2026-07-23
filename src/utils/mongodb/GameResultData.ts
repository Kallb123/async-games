import { Document, Model, Schema, model, models } from "mongoose";
import type { IGameData } from "./GameData";
import type { uuidString } from "../apiModels/GameDataApi";

export interface IGameResultData {
    gameId: uuidString,
    gameType: string,
    url: string,
    playerIds: string[],
    winner: string,
    endedAt: string
}

export interface IGameResultDataDocument extends IGameResultData, Document {
    // Instance methods
}

export interface IGameResultDataModel extends Model<IGameResultDataDocument> {
    // Static methods
}

// Append-only record of a finished game, written once via recordGameResult()
// below. Kept flat (no discriminator) since it's a read model for stats, not
// part of the game engine - it survives deletion of the GameData it summarises.
export var GameResultSchema = new Schema<IGameResultDataDocument>({
    gameId: { type: String, unique: true },
    gameType: String,
    url: String,
    playerIds: [String],
    winner: String,
    endedAt: String
});
// Per-player match history / stats, most recent first.
GameResultSchema.index({ playerIds: 1, endedAt: -1 });
// Per-player, per-game stats (and head-to-head via playerIds $all).
GameResultSchema.index({ playerIds: 1, gameType: 1 });

export var GameResultModel = models.GameResult || model<IGameResultDataDocument, IGameResultDataModel>('GameResult', GameResultSchema);

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
    try {
        await GameResultModel.create({
            gameId: gameData.gameId,
            gameType: gameData.gameType.gameType,
            url: gameData.gameType.url,
            playerIds: gameData.userIdList,
            winner: gameData.winner,
            endedAt: new Date().toISOString()
        });
    } catch (err: any) {
        if (err?.code !== 11000) {
            throw err;
        }
    }
}
