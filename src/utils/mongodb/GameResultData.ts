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
