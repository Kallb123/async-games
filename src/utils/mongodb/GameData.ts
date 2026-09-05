import { Document, Model, Schema, model, models } from "mongoose";
import { GameEndDetail, GameEndReason, IGameDataResponse, IGameResponse, uuidString } from "../apiModels/GameDataApi";
import { UserDirectory, userIdListToNamesAndMap } from "../users/clerk";
import { IGameCommand, IGameType } from "../apiModels/GameLogic";
import { actionableTurnFilter } from "../games/TurnTimer";
import { IHistoryEntry, resolveHistory } from "../games/history";

export interface IGameState {
    turnOrder: string[],
    // Newest first. Player mentions are stored as {{userId}} tokens and
    // resolved on the way out — see utils/games/history.ts.
    history: IHistoryEntry[],
    commandHistory: IGameCommand[]
}

// The response-safe view of a game's shared state: turn order and the plain-text
// history log, and deliberately not commandHistory.
//
// commandHistory is the engine's private replay log, and every game hangs its
// own fields off its commands — Smartthink's secret code, Train Time's kept
// ticket ids and deck reshuffles, SAC's robber/discard RNG. Sending it hands
// each player state their game keeps hidden. IGameDataResponse['gameState'] has
// always been declared without it, but TypeScript can't hold the line on its
// own: excess-property checks don't apply to a whole-object assignment or to
// spread properties, so `gameState: doc.gameState` type-checks and ships
// everything. Every CreateDataResponse goes through here instead.
//
// The name map is required rather than optional because history is stored with
// {{userId}} tokens in place of names (utils/games/history.ts): a response built
// without it would ship the raw ids. Every CreateDataResponse already resolves
// its players, so there is nothing extra to fetch.
export function publicGameState(
    gameState: IGameState,
    userIdNameMap: { [key: string]: string }
): IGameDataResponse['gameState'] {
    return { turnOrder: gameState.turnOrder, history: resolveHistory(gameState.history, userIdNameMap) };
}

export interface IGameData {
    gameId: uuidString,
    gameType: IGameType,
    userIdList: string[],
    turnTimer: string,
    currentTurn: string,
    lastTurnTimestamp: string,
    timerWarningNotificationSent: boolean,
    // Consecutive turntimer expiries for each player since they last acted,
    // keyed by userId. Reset to 0 whenever that player takes a turn; once a
    // player's count reaches MAX_CONSECUTIVE_MISSED_TURNS the cron abandons
    // the game instead of rotating past them again — see turntimer/route.ts.
    missedTurnCounts: Map<string, number>,
    gameState: IGameState,
    // The invitation/lobby this game was started from, when it came from one.
    // The invitation is deleted the moment the game exists, so this is the
    // only link back to it — it lets a host still sitting on their lobby
    // screen find the game their lobby became (see /api/lobby/[inviteId]/game).
    inviteId?: uuidString,
    complete: boolean,
    winner: string,
    endReason?: GameEndReason,
    // Which of an endReason's several shapes this was, in the player's own
    // words — see GameEndDetail. Written by the game's own logic on the way
    // through its Execute/CheckGameOver, not by finishGame, because only the
    // rules know which ending happened.
    endDetail?: GameEndDetail,
    forfeitedBy?: string
}

export interface IGameDataDocument extends IGameData, Document {
    // Instance methods
    //
    // Synchronous, and given every name it needs up front: a list of games
    // resolves its players in one Clerk call and hands the result to each game
    // (see UserDirectory), rather than every game fetching its own.
    CreateResponse: (directory: UserDirectory) => IGameResponse;
    // `viewerId` is the signed-in player the response is being built for.
    //
    // A game's response is not the same for everybody: hands, tickets and dev
    // cards belong to one player, and the only way to send a player their own
    // secrets without sending everyone else's is to know who is asking. The
    // parameter is required rather than optional so that a game with hidden
    // information can't quietly inherit the everybody-sees-everything view —
    // adding a game makes the compiler ask the question at every call site.
    //
    // Games whose whole state is public (Snakes & Ladders, Dice Cities) ignore
    // it. Pass null only where nobody in particular is asking.
    CreateDataResponse: (viewerId: string | null) => Promise<IGameDataResponse>;
}

export interface IGameDataModel extends Model<IGameDataDocument> {
    // Static methods
}

export var GameDataSchema = new Schema<IGameDataDocument> ({
    gameId: String,
    gameType: {
        gameId: String,
        gameType: String,
        friendlyName: String,
        icon: String,
        url: String,
        className: String
    },
    userIdList: [String],
    turnTimer: String,
    currentTurn: String,
    lastTurnTimestamp: String,
    timerWarningNotificationSent: { type: Boolean, default: false },
    missedTurnCounts: { type: Schema.Types.Map, of: Number, default: () => new Map() },
    gameState: {
        turnOrder: [String],
        // _id: false — a log line is identified by its position, and giving
        // every one of them an ObjectId only pads the document.
        history: [{ _id: false, text: String, actorId: String }],
        commandHistory: [
            Schema.Types.Mixed
            // {
            //     id: String,
            //     timestamp: String,
            //     gameId: String,
            //     senderId: String,
            //     className: String
            // }
        ]
    },
    inviteId: String,
    complete: Boolean,
    winner: String,
    endReason: String,
    endDetail: String,
    forfeitedBy: String
}, {discriminatorKey: 'kind', optimisticConcurrency: true});

// Heal a game whose history predates the tokenised { text, actorId } shape.
//
// Such a log is on disk as a bare `string[]`. Mongoose can't cast a string to
// the history subdocument, so the getter reads back an empty array — which the
// tokenisation change relied on ("rebuilds its log from the next turn") — but
// the uncast primitives stay behind on the path and make the *next* save throw
// a ValidationError ("Tried to set nested object field ... to primitive value"),
// which surfaced as a 500 on the first command played in any pre-existing game.
//
// Reassigning the path drops those primitives so the document saves cleanly.
// The legacy strings are unrecoverable through the document API by this point
// (the cast already dropped them), so this discards the old log rather than
// migrating it — the deal docs/dynamic-names.md §4d takes deliberately. Only an
// empty resolved history can be poisoned: a converted game's entries are all
// objects and read back intact, so a game mid-log is left untouched.
GameDataSchema.post('init', function(this: IGameDataDocument) {
    const history = this.gameState?.history;
    if (history && history.length === 0) {
        this.gameState.history = [];
    }
});

GameDataSchema.methods.CreateResponse = function(directory: UserDirectory): IGameResponse {
    console.log("CreateResponse: Generic game");

    const gameDataDocument: IGameData = this as IGameData;

    const usernameList = gameDataDocument.userIdList.map(userId => directory.name(userId));
    const currentTurnIndex = gameDataDocument.userIdList.indexOf(gameDataDocument.currentTurn);

    return {
        gameId: gameDataDocument.gameId,
        gameType: gameDataDocument.gameType.gameType,
        friendlyName: gameDataDocument.gameType.friendlyName,
        usernameList,
        userIdList: gameDataDocument.userIdList,
        turnTimer: gameDataDocument.turnTimer,
        currentTurn: gameDataDocument.currentTurn,
        currentTurnUsername: currentTurnIndex >= 0 ? usernameList[currentTurnIndex] : "",
        lastTurnTimestamp: gameDataDocument.lastTurnTimestamp,
        url: gameDataDocument.gameType.url,
        complete: gameDataDocument.complete,
        // Empty until somebody wins, rather than "Unknown player": a game still
        // being played has no winner to name.
        winner: directory.name(gameDataDocument.winner),
        endReason: gameDataDocument.endReason,
        forfeitedBy: gameDataDocument.forfeitedBy
            ? directory.name(gameDataDocument.forfeitedBy)
            : undefined
    }
};
GameDataSchema.methods.CreateDataResponse = async function(_viewerId: string | null): Promise<IGameDataResponse> {
    console.log("CreateDataResponse: Generic game");

    const gameDataDocument: IGameData = this as IGameData;

    const { usernameList, userIdNameMap } = await userIdListToNamesAndMap(gameDataDocument.userIdList);

    return {
        gameType: gameDataDocument.gameType,
        usernameList,
        userIdList: gameDataDocument.userIdList,
        turnTimer: gameDataDocument.turnTimer,
        currentTurn: gameDataDocument.currentTurn,
        gameState: publicGameState(gameDataDocument.gameState, userIdNameMap),
        complete: gameDataDocument.complete,
        winner: gameDataDocument.winner,
        endReason: gameDataDocument.endReason,
        endDetail: gameDataDocument.endDetail,
        forfeitedBy: gameDataDocument.forfeitedBy
    }
};
// GameData carried no indexes at all, while every other collection in the app
// declares its own — so the query on every single turn (findOne by gameId) was
// a collection scan, and so were the dashboard's, the lobby's and the timer
// cron's.
//
// gameId is unique as well as indexed: it is the app's handle on a game
// everywhere — routes, push links, GameResult — and nothing had ever stopped
// two documents sharing one.
GameDataSchema.index({ gameId: 1 }, { unique: true });
// The dashboard's "my live games", and the lobby-join guard's "is this player
// already in a game?". userIdList leads because it is the selective half.
GameDataSchema.index({ userIdList: 1, complete: 1 });
// The turntimer cron's sweep: live games on a given timer, oldest turn first.
// Ordered to match how it queries (see actionableTurnFilter) — equality on
// complete and on turnTimer, then the range and sort on lastTurnTimestamp — so
// one index serves each of the filter's per-timer branches and the sort across
// them together.
GameDataSchema.index({ complete: 1, turnTimer: 1, lastTurnTimestamp: 1 });
// The only link back from a game to the lobby it started from, polled by a
// host still sitting on their lobby screen (GET /api/lobby/[inviteId]/game).
// Sparse: a game started from a direct invite has no inviteId.
GameDataSchema.index({ inviteId: 1 }, { sparse: true });

export var GameDataModel = models.GameData || model<IGameDataDocument, IGameDataModel>('GameData', GameDataSchema);

/**
 * The fields the turn-timer sweep's decision reads (`needsSweeping`) plus the id
 * to load the game by if it turns out there is something to do.
 *
 * One list, in one place: the projection is built from it and the type is
 * derived from it. Written twice, dropping a name from the projection would
 * still type-check, and `needsSweeping` would read `undefined` and quietly
 * decide every game was fine.
 */
const SWEEP_CANDIDATE_FIELDS = [
    'gameId', 'turnTimer', 'lastTurnTimestamp', 'timerWarningNotificationSent',
] as const;

/** A live game as the turn-timer sweep first sees it. */
export type ISweepCandidate = Pick<IGameData, typeof SWEEP_CANDIDATE_FIELDS[number]>;

/**
 * How many candidates one run will read.
 *
 * A cron run has a request deadline, so reading more games than it could ever
 * get through is time spent not sweeping. Nothing is lost by stopping: the read
 * is oldest-turn-first and every game the sweep acts on stops being a candidate
 * (an expired turn moves `lastTurnTimestamp`, a warning sets
 * `timerWarningNotificationSent`, an abandoned game sets `complete`), so the
 * next run's own query resumes where this one stopped with no cursor to keep.
 */
export const SWEEP_CANDIDATE_LIMIT = 500;

/**
 * The turn-timer sweep's candidate read: the live games a run could act on,
 * oldest turn first, projected down to the fields above.
 *
 * The sweep used to read whole documents — `commandHistory`, every game's own
 * state and all — for every live game, to put nearly all of them straight back:
 * on any given tick most games have nothing due. The full document is now
 * fetched by `gameId` (the unique index above) only for the games that turn out
 * to need acting on.
 *
 * `lean()` skips schema defaults, so `timerWarningNotificationSent` reads as
 * undefined on a game written before that field existed rather than as false.
 * `needsSweeping` only asks whether it is falsy, so those are the same answer —
 * but anything added to the projection has to want the raw value.
 */
export function findSweepCandidates(): Promise<ISweepCandidate[]> {
    return GameDataModel.find({ complete: false, ...actionableTurnFilter() })
        .select(`${SWEEP_CANDIDATE_FIELDS.join(' ')} -_id`)
        .sort({ lastTurnTimestamp: 1 })
        .limit(SWEEP_CANDIDATE_LIMIT)
        .lean<ISweepCandidate[]>()
        .exec();
}

// Saves the document, reporting false (instead of throwing) on a VersionError.
// Two requests against the same game can race past a currentTurn/state check
// and execute concurrently against separately-fetched copies of the document —
// optimistic concurrency (enabled above) makes the loser's save fail instead
// of silently overwriting the winner's changes. Every route that calls
// gameData.save() on a document from this model should go through this.
export async function trySave(gameData: IGameDataDocument): Promise<boolean> {
  try {
    await gameData.save();
    return true;
  } catch (err) {
    if ((err as { name?: string })?.name === 'VersionError') return false;
    throw err;
  }
}
