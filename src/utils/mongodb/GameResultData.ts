import { Document, Model, Schema, model, models } from "mongoose";
import type { IGameData } from "./GameData";
import type { uuidString, GameEndReason, GameResultStatGroup, GameResultChart } from "../apiModels/GameDataApi";
// The shared, generic player lookup. The older games each wrap it in a typed
// alias of their own; a new one doesn't need to — the state type infers the
// player type.
import { playerByUserId } from "../apiModels/GameDataApi";
import { isDuplicateKeyError } from "./duplicateKey";
import {
    IDiceCitiesGameData,
    IDiceCitiesGameResultStats,
    computeDiceCitiesResultStats,
    diceCitiesGameResultStatsSchemaDef,
    formatDiceCitiesResultStats,
    formatDiceCitiesCharts,
    playerByUserId as diceCitiesPlayerByUserId,
} from "@/games/DiceCities/DiceCitiesModels";
import type { IDiceCitiesGameStateResponse } from "@/games/DiceCities/apiModels";
import { computePerTurnStat } from "@/utils/games/replay";
import { gameLength } from "@/utils/games/turnCount";
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
import {
    ISettlementsAndCitiesGameData,
    ISACGameResultStats,
    computeSettlementsAndCitiesResultStats,
    sacGameResultStatsSchemaDef,
    formatSettlementsAndCitiesResultStats,
    formatSettlementsAndCitiesCharts,
    playerByUserId as sacPlayerByUserId,
} from "@/games/SettlementsAndCities/SettlementsAndCitiesModels";
import type { ISACSpecificGameStateResponse } from "@/games/SettlementsAndCities/apiModels";
import {
    IWorldDominationGameData,
    IWorldDominationGameResultStats,
    computeWorldDominationResultStats,
    worldDominationGameResultStatsSchemaDef,
    formatWorldDominationResultStats,
    formatWorldDominationCharts,
    playerByUserId as worldDominationPlayerByUserId,
} from "@/games/WorldDomination/WorldDominationModels";
import type { IWorldDominationSpecificGameStateResponse } from "@/games/WorldDomination/apiModels";
import {
    ISolitaireGameData,
    ISolitaireGameResultStats,
    computeSolitaireResultStats,
    solitaireGameResultStatsSchemaDef,
    formatSolitaireResultStats,
} from "@/games/Solitaire/SolitaireModels";
import {
    ITrainTimeGameData,
    ITrainTimeGameResultStats,
    computeTrainTimeResultStats,
    trainTimeGameResultStatsSchemaDef,
    formatTrainTimeResultStats,
    formatTrainTimeCharts,
} from "@/games/TrainTime/TrainTimeModels";
import type { ITrainTimeSpecificGameStateResponse } from "@/games/TrainTime/apiModels";
import {
    IOutbreakGameData,
    IOutbreakGameResultStats,
    computeOutbreakResultStats,
    outbreakGameResultStatsSchemaDef,
    formatOutbreakResultStats,
    formatOutbreakCharts,
} from "@/games/Outbreak/OutbreakModels";
import type { IOutbreakSpecificGameStateResponse } from "@/games/Outbreak/apiModels";
import { DISEASE_COLORS, OutbreakDiseaseColor } from "@/games/Outbreak/board";
import {
    IFiresOutGameData,
    IFiresOutGameResultStats,
    computeFiresOutResultStats,
    firesOutGameResultStatsSchemaDef,
    formatFiresOutResultStats,
} from "@/games/FiresOut/FiresOutModels";

export interface IGameResultData {
    gameId: uuidString,
    gameType: string,
    url: string,
    playerIds: string[],
    winner: string,
    endReason?: GameEndReason,
    // Which of the endReason's shapes it was, in the player's own words — see
    // IGameData.endDetail. Copied off the finished game so the result page can
    // say "the team lost — the player deck ran out of cards" long after the
    // game document it came from is gone.
    endDetail?: string,
    forfeitedBy?: string,
    endedAt: string,
    // How long the game ran: turns for a game with opponents, moves for a solo
    // game (Solitaire) that has no turns. Read it back with the matching unit
    // via lengthUnit(playerIds.length) — see utils/games/turnCount.ts.
    totalTurns: number,
    // A guest still in this game's roster (docs/account-less-play.md §8): a
    // non-empty list means the game is an exhibition match that doesn't count
    // toward anyone's stats yet. Emptied by $pull when a guest claims their
    // account (step 16).
    unclaimedPlayerIds: string[],
    // Each unclaimed guest's display name, keyed by id — copied here because
    // the sweeper (step 17) deletes the Clerk user behind that id, which would
    // otherwise leave every other player's finished game with an
    // unresolvable name.
    guestNames: Map<string, string>,
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
    endReason: String,
    endDetail: String,
    forfeitedBy: String,
    endedAt: String,
    totalTurns: Number,
    unclaimedPlayerIds: { type: [String], default: () => [] },
    guestNames: { type: Schema.Types.Map, of: String, default: () => new Map() },
}, { discriminatorKey: 'kind' });
// Per-player match history / stats, most recent first.
GameResultSchema.index({ playerIds: 1, endedAt: -1 });
// Per-player, per-game stats (and head-to-head via playerIds $all).
GameResultSchema.index({ playerIds: 1, gameType: 1 });

// A game counts once every player is a registered account
// (docs/account-less-play.md §8). Matches both an explicitly empty array and
// a pre-guest record that predates this field entirely — `$size` alone would
// exclude every result recorded before this field existed, since it has no
// array there to measure.
export const RESULT_COUNTS_FILTER = {
    $or: [
        { unclaimedPlayerIds: { $exists: false } },
        { unclaimedPlayerIds: { $size: 0 } },
    ],
};

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

export interface ISettlementsAndCitiesGameResultData extends IGameResultData {
    stats: ISACGameResultStats;
}
export interface ISettlementsAndCitiesGameResultDataDocument extends ISettlementsAndCitiesGameResultData, Document {}
export interface ISettlementsAndCitiesGameResultDataModel extends Model<ISettlementsAndCitiesGameResultDataDocument> {}
var SettlementsAndCitiesGameResultSchema = new Schema<ISettlementsAndCitiesGameResultDataDocument>({
    stats: sacGameResultStatsSchemaDef
}, { discriminatorKey: 'kind' });
export var SettlementsAndCitiesGameResultModel = models.SettlementsAndCitiesGameResult || GameResultModel.discriminator<ISettlementsAndCitiesGameResultDataDocument, ISettlementsAndCitiesGameResultDataModel>('SettlementsAndCitiesGameResult', SettlementsAndCitiesGameResultSchema);

export interface IWorldDominationGameResultData extends IGameResultData {
    stats: IWorldDominationGameResultStats;
}
export interface IWorldDominationGameResultDataDocument extends IWorldDominationGameResultData, Document {}
export interface IWorldDominationGameResultDataModel extends Model<IWorldDominationGameResultDataDocument> {}
var WorldDominationGameResultSchema = new Schema<IWorldDominationGameResultDataDocument>({
    stats: worldDominationGameResultStatsSchemaDef
}, { discriminatorKey: 'kind' });
export var WorldDominationGameResultModel = models.WorldDominationGameResult || GameResultModel.discriminator<IWorldDominationGameResultDataDocument, IWorldDominationGameResultDataModel>('WorldDominationGameResult', WorldDominationGameResultSchema);

export interface ISolitaireGameResultData extends IGameResultData {
    stats: ISolitaireGameResultStats;
}
export interface ISolitaireGameResultDataDocument extends ISolitaireGameResultData, Document {}
export interface ISolitaireGameResultDataModel extends Model<ISolitaireGameResultDataDocument> {}
var SolitaireGameResultSchema = new Schema<ISolitaireGameResultDataDocument>({
    stats: solitaireGameResultStatsSchemaDef
}, { discriminatorKey: 'kind' });
export var SolitaireGameResultModel = models.SolitaireGameResult || GameResultModel.discriminator<ISolitaireGameResultDataDocument, ISolitaireGameResultDataModel>('SolitaireGameResult', SolitaireGameResultSchema);

export interface ITrainTimeGameResultData extends IGameResultData {
    stats: ITrainTimeGameResultStats;
}
export interface ITrainTimeGameResultDataDocument extends ITrainTimeGameResultData, Document {}
export interface ITrainTimeGameResultDataModel extends Model<ITrainTimeGameResultDataDocument> {}
var TrainTimeGameResultSchema = new Schema<ITrainTimeGameResultDataDocument>({
    stats: trainTimeGameResultStatsSchemaDef
}, { discriminatorKey: 'kind' });
export var TrainTimeGameResultModel = models.TrainTimeGameResult || GameResultModel.discriminator<ITrainTimeGameResultDataDocument, ITrainTimeGameResultDataModel>('TrainTimeGameResult', TrainTimeGameResultSchema);

export interface IOutbreakGameResultData extends IGameResultData {
    stats: IOutbreakGameResultStats;
}
export interface IOutbreakGameResultDataDocument extends IOutbreakGameResultData, Document {}
export interface IOutbreakGameResultDataModel extends Model<IOutbreakGameResultDataDocument> {}
var OutbreakGameResultSchema = new Schema<IOutbreakGameResultDataDocument>({
    stats: outbreakGameResultStatsSchemaDef
}, { discriminatorKey: 'kind' });
export var OutbreakGameResultModel = models.OutbreakGameResult || GameResultModel.discriminator<IOutbreakGameResultDataDocument, IOutbreakGameResultDataModel>('OutbreakGameResult', OutbreakGameResultSchema);

export interface IFiresOutGameResultData extends IGameResultData {
    stats: IFiresOutGameResultStats;
}
export interface IFiresOutGameResultDataDocument extends IFiresOutGameResultData, Document {}
export interface IFiresOutGameResultDataModel extends Model<IFiresOutGameResultDataDocument> {}
var FiresOutGameResultSchema = new Schema<IFiresOutGameResultDataDocument>({
    stats: firesOutGameResultStatsSchemaDef
}, { discriminatorKey: 'kind' });
export var FiresOutGameResultModel = models.FiresOutGameResult || GameResultModel.discriminator<IFiresOutGameResultDataDocument, IFiresOutGameResultDataModel>('FiresOutGameResult', FiresOutGameResultSchema);

// Maps a GameData's gameType to the discriminator model + stats calculator
// that boil its final specificGameState down to the interesting numbers, plus
// a formatter that turns those numbers into display-ready stat groups. Games
// with no entry here still get the base GameResult fields (including
// totalTurns) via recordGameResult below.
const GAME_RESULT_STATS: Record<string, {
    model: Model<any>,
    compute: (gameData: IGameData) => unknown | Promise<unknown>,
    format: (stats: any, usernameById: Map<string, string>) => GameResultStatGroup[],
    charts?: (stats: any, usernameById: Map<string, string>) => GameResultChart[],
}> = {
    DiceCities: {
        model: DiceCitiesGameResultModel,
        compute: async (gameData) => {
            const dcGameData = gameData as IDiceCitiesGameData;
            const coinsPerTurn = await computePerTurnStat<IDiceCitiesGameStateResponse>(
                dcGameData,
                (state, userId) => diceCitiesPlayerByUserId(state, userId)?.totalCoinsEarned,
            );
            return computeDiceCitiesResultStats(dcGameData, coinsPerTurn);
        },
        format: formatDiceCitiesResultStats,
        charts: formatDiceCitiesCharts,
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
    SettlementsAndCities: {
        model: SettlementsAndCitiesGameResultModel,
        compute: async (gameData) => {
            const sacGameData = gameData as ISettlementsAndCitiesGameData;
            const resourcesPerTurn = await computePerTurnStat<ISACSpecificGameStateResponse>(
                sacGameData,
                (state, userId) => sacPlayerByUserId(state, userId)?.resourcesGathered,
            );
            return computeSettlementsAndCitiesResultStats(sacGameData, resourcesPerTurn);
        },
        format: formatSettlementsAndCitiesResultStats,
        charts: formatSettlementsAndCitiesCharts,
    },
    WorldDomination: {
        model: WorldDominationGameResultModel,
        compute: async (gameData) => {
            const wdGameData = gameData as IWorldDominationGameData;
            const armiesDeployedPerTurn = await computePerTurnStat<IWorldDominationSpecificGameStateResponse>(
                wdGameData,
                (state, userId) => worldDominationPlayerByUserId(state, userId)?.armies,
            );
            const totalArmiesDeployedPerTurn = await computePerTurnStat<IWorldDominationSpecificGameStateResponse>(
                wdGameData,
                (state, userId) => worldDominationPlayerByUserId(state, userId)?.totalArmiesDeployed,
            );
            return computeWorldDominationResultStats(wdGameData, armiesDeployedPerTurn, totalArmiesDeployedPerTurn);
        },
        format: formatWorldDominationResultStats,
        charts: formatWorldDominationCharts,
    },
    TrainTime: {
        model: TrainTimeGameResultModel,
        compute: async (gameData) => {
            const trainGameData = gameData as ITrainTimeGameData;
            const pointsPerTurn = await computePerTurnStat<ITrainTimeSpecificGameStateResponse>(
                trainGameData,
                (state, userId) => playerByUserId(state, userId)?.score,
            );
            const longestRunPerTurn = await computePerTurnStat<ITrainTimeSpecificGameStateResponse>(
                trainGameData,
                (state, userId) => playerByUserId(state, userId)?.longestRun,
            );
            return computeTrainTimeResultStats(trainGameData, pointsPerTurn, longestRunPerTurn);
        },
        format: formatTrainTimeResultStats,
        charts: formatTrainTimeCharts,
    },
    Solitaire: {
        model: SolitaireGameResultModel,
        compute: (gameData) => computeSolitaireResultStats(gameData as ISolitaireGameData),
        format: formatSolitaireResultStats,
    },
    Outbreak: {
        model: OutbreakGameResultModel,
        compute: async (gameData) => {
            const outbreakGameData = gameData as IOutbreakGameData;
            const cubesTreatedPerTurn = await computePerTurnStat<IOutbreakSpecificGameStateResponse>(
                outbreakGameData,
                (state, userId) => playerByUserId(state, userId)?.cubesTreated,
            );
            const timesTravelledPerTurn = await computePerTurnStat<IOutbreakSpecificGameStateResponse>(
                outbreakGameData,
                (state, userId) => playerByUserId(state, userId)?.timesTravelled,
            );
            // Keyed by disease colour rather than by userId — the supply
            // belongs to the board, not to a player.
            const cubesLeftPerTurn = await computePerTurnStat<IOutbreakSpecificGameStateResponse>(
                outbreakGameData,
                (state, color) => state.cubesLeft?.[color as OutbreakDiseaseColor],
                DISEASE_COLORS,
            );
            return computeOutbreakResultStats(outbreakGameData, cubesTreatedPerTurn, timesTravelledPerTurn, cubesLeftPerTurn);
        },
        format: formatOutbreakResultStats,
        charts: formatOutbreakCharts,
    },
    FiresOut: {
        model: FiresOutGameResultModel,
        compute: (gameData) => computeFiresOutResultStats(gameData as IFiresOutGameData),
        format: formatFiresOutResultStats,
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

// Renders a GameResult document's discriminated `stats` field into zero or
// more turn-by-turn charts, for games that register any. Returns [] for
// games with no charts registered (or no stats present).
export function formatGameResultCharts(gameType: string, stats: unknown, usernameById: Map<string, string>): GameResultChart[] {
    const specific = GAME_RESULT_STATS[gameType];
    if (!specific?.charts || !stats) return [];
    return specific.charts(stats, usernameById);
}

export type MatchOutcome = "win" | "loss" | "draw";

export interface IRecentMatch {
    gameId: string;
    url: string;
    endedAt: string;
    outcome: MatchOutcome;
    sharedWithViewer: boolean;
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

/** The fields of a finished game that decide what it was worth to a player. */
export interface IMatchResult {
    // Optional because a record written before this field had a default may
    // carry no winner at all, which means the same as "" — nobody won it.
    winner?: string;
    endReason?: GameEndReason;
    forfeitedBy?: string;
}

// What one finished game was, for one player.
//
// A co-op table shares its result: 'teamwin' and 'teamloss' say the whole
// roster won or lost, so they answer for every player before `winner` — which
// is empty for a co-op game — gets a look in, and a team defeat would otherwise
// read as a draw.
//
// `forfeitedBy` singles out the player whose inactivity abandoned the game
// (see GameEndReason 'abandoned') — they take a loss rather than the draw
// everyone else in that game gets, since we don't know who'd have won among
// the players who were still there.
//
// This is the *only* place the rule lives. getPlayerStats below counts wins,
// losses and draws by folding through this function rather than re-encoding it
// as Mongo `$cond` branches, which is what it used to do: two copies of the
// rule, so a co-op table would have had the right chip in "recent form" and a
// silently wrong W/L/D on every profile.
export function outcomeFor(result: IMatchResult, userId: string): MatchOutcome {
    if (result.endReason === 'teamwin') return "win";
    if (result.endReason === 'teamloss') return "loss";
    if (result.winner === userId) return "win";
    if (result.forfeitedBy === userId) return "loss";
    if (!result.winner) return "draw";
    return "loss";
}

// Stands in for "a player who isn't the one we're counting for" in the
// grouping key below. Any non-empty string that can't be a Clerk user id does
// — outcomeFor only ever asks whether the winner is this player, and whether
// there was one at all.
const SOMEBODY_ELSE = 'somebody else';

// Recent match history + per-game W/L/D for one player, read from the
// GameResult store. Shared by the current user's own stats endpoint and by
// the friends-only profile endpoint - same data, different viewer. `viewerId`
// is whoever is looking at the profile (equal to `userId` on your own
// profile); each match reports whether the viewer also played in it.
export async function getPlayerStats(userId: string, viewerId: string): Promise<IPlayerStats> {
    const recentResults = await GameResultModel
        .find({ playerIds: userId, ...RESULT_COUNTS_FILTER })
        .sort({ endedAt: -1 })
        .limit(10)
        .exec();

    const recent: IRecentMatch[] = recentResults.map(result => ({
        gameId: result.gameId,
        url: result.url,
        endedAt: result.endedAt,
        outcome: outcomeFor(result, userId),
        sharedWithViewer: result.playerIds.includes(viewerId),
    }));

    // Mongo counts how many of this player's games ended each distinct way; the
    // rule for what each of those endings was *worth to them* is applied here,
    // by the one outcomeFor above.
    //
    // The key is reduced to the *answers* outcomeFor needs rather than the raw
    // fields, because `winner` and `forfeitedBy` are user ids: keyed on those,
    // a player who mostly meets new opponents gets a group per match and the
    // pipeline degenerates into shipping their whole history. Each is collapsed
    // to "me", "nobody" or "somebody else" first, which leaves the key bounded
    // by games × endings however long they have been playing — and means no
    // other player's id leaves the database for a tally that never shows one.
    const byEndingAgg: { _id: IMatchResult & { url: string }, total: number }[] = await GameResultModel.aggregate([
        { $match: { playerIds: userId, ...RESULT_COUNTS_FILTER } },
        { $group: {
            _id: {
                url: '$url',
                winner: { $switch: { branches: [
                    { case: { $eq: ['$winner', userId] }, then: userId },
                    // Missing as well as empty: `$eq` against null matches a
                    // field that isn't there, which is a record from before
                    // `winner` was always written.
                    { case: { $eq: ['$winner', null] }, then: '' },
                    { case: { $eq: ['$winner', ''] }, then: '' },
                ], default: SOMEBODY_ELSE } },
                endReason: '$endReason',
                forfeitedBy: { $cond: [{ $eq: ['$forfeitedBy', userId] }, userId, null] },
            },
            total: { $sum: 1 },
        } },
    ]);

    const statsByUrl = new Map<string, IGameStats>();
    for (const { _id, total } of byEndingAgg) {
        const stats = statsByUrl.get(_id.url)
            ?? { url: _id.url, wins: 0, losses: 0, draws: 0, total: 0 };
        const outcome = outcomeFor(_id, userId);
        if (outcome === "win") stats.wins += total;
        else if (outcome === "loss") stats.losses += total;
        else stats.draws += total;
        stats.total += total;
        statsByUrl.set(_id.url, stats);
    }

    // Most-played game first, as the pipeline's own $sort used to leave it.
    const byGame: IGameStats[] = [...statsByUrl.values()].sort((a, b) => b.total - a.total);

    return { recent, byGame };
}

// Writes the one, permanent result record for a finished game. Call this
// once gameData.complete/winner are set (win via CheckGameOver, or a forced
// end). Idempotent on gameId in case it's ever invoked twice for the same game.
//
// unclaimedPlayerIds/guestNames (docs/account-less-play.md §13, see
// unclaimedGuestsOf) are passed in rather than looked up here: this stays the
// one place on the per-command path with no Clerk round trip, and every
// caller already resolves the roster for its own push notifications.
export async function recordGameResult(
    gameData: IGameData,
    unclaimedPlayerIds: string[],
    guestNames: Map<string, string>,
): Promise<void> {
    const base = {
        gameId: gameData.gameId,
        gameType: gameData.gameType.gameType,
        url: gameData.gameType.url,
        playerIds: gameData.userIdList,
        winner: gameData.winner,
        endReason: gameData.endReason,
        endDetail: gameData.endDetail,
        forfeitedBy: gameData.forfeitedBy,
        endedAt: new Date().toISOString(),
        // Turns for a game with opponents; moves for a solo game (Solitaire),
        // which has no turns to count — read back with the matching unit via
        // lengthUnit(playerIds.length). See utils/games/turnCount.ts.
        totalTurns: gameLength(gameData.gameState.commandHistory, gameData.userIdList.length).count,
        unclaimedPlayerIds,
        guestNames,
    };
    const specific = GAME_RESULT_STATS[gameData.gameType.gameType];
    try {
        if (specific) {
            await specific.model.create({ ...base, stats: await specific.compute(gameData) });
        } else {
            await GameResultModel.create(base);
        }
    } catch (err: any) {
        if (!isDuplicateKeyError(err)) {
            throw err;
        }
    }
}
