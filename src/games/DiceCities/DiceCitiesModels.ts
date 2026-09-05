import { GameDataModel, IGameData, IGameDataDocument, publicGameState } from "@/utils/mongodb/GameData";
import { IInvitationData, IInvitationDataDocument, InvitationModel, IInvitationRequest } from "@/utils/mongodb/InvitationData";
import { Model, Schema, models } from "mongoose";
import { BANK_TOTAL_COINS, bankTotalCoins, DiceCitiesCardIds, DOCKS_ESTABLISHMENT_IDS, STARTING_PLAYER_COINS } from "./cards";
import { IDiceCitiesGameDataResponse, IDiceCitiesGameStateResponse, IDiceCitiesPlayerStateResponse } from "./apiModels";
import { uuidString, GameResultStatGroup, GameResultChart, formatPerTurnChart, compactCharts, playerByUserId as findPlayerByUserId } from "@/utils/apiModels/GameDataApi";
import { pluralize } from "@/utils/ui/text";
import { v4 as uuidv4 } from 'uuid';
import { userIdListToNamesAndMap } from "@/utils/users/clerk";
import { DiceCitiesGameType } from "@/utils/apiModels/GameLogic";
import { LANDMARKS } from "./ui";
import { rollOffTurnOrder } from "@/utils/games/rollOff";
import { DEFAULT_DICE_CITIES_THEME, diceCitiesTheme } from "./themes";

export interface DiceCitiesInvitationRequest extends IInvitationRequest {
    enabledDocks: boolean,
    enabledBillionaireRow: boolean,
}

export interface IDiceCitiesInvitationData extends IInvitationData {
    enabledDocks: boolean,
    enabledBillionaireRow: boolean,
}

export interface IDiceCitiesInvitationDataDocument extends IDiceCitiesInvitationData, IInvitationDataDocument {

}

export interface IDiceCitiesInvitationDataModel extends Model<IDiceCitiesInvitationDataDocument> {
// Model methods
}


// Builds the deterministic starting specificGameState for a Dice Cities game.
// Used both at game creation and by the replay engine to reconstruct historical
// / planned states from commandHistory. `enabledDocks` is fixed at creation, so
// replaying it reproduces the market the recorded commands were played against.
export function buildInitialDiceCitiesState(
    userIdList: string[],
    enabledDocks: boolean = false,
    // The supply this game is played with. Passed in only by replay, which has
    // to rebuild a game against the bank it actually had rather than today's.
    bankTotal: number = bankTotalCoins(enabledDocks),
    // Which dressing the game is played in. Presentation only - it renames
    // cards and copy and changes nothing the engine computes - but it is fixed
    // at creation like `enabledDocks`, so it lives beside it and a replay
    // rebuilds a game in the theme it was actually played in.
    theme: string = DEFAULT_DICE_CITIES_THEME.id,
): IDiceCitiesGameState {
    const playerStates = new Map<string, IDiceCitiesPlayerState>();
    for (const userId of userIdList) {
        playerStates.set(userId, {
            cards: [
                { card: DiceCitiesCardIds.WHEAT_FIELD, amount: 1 },
                { card: DiceCitiesCardIds.BAKERY, amount: 1 },
            ],
            money: STARTING_PLAYER_COINS,
            totalCoinsEarned: 0,
            doubleUnlocked: false,
            bonusDiningAndStore: false,
            rerollDoubles: false,
            oneReroll: false,
            harbourUnlocked: false,
            lastDiceSelection: 1,
        });
    }
    return {
        bankCards: [
            { card: DiceCitiesCardIds.WHEAT_FIELD, amount: 6 },
            { card: DiceCitiesCardIds.BAKERY, amount: 6 },
            { card: DiceCitiesCardIds.CAFE, amount: 6 },
            { card: DiceCitiesCardIds.RANCH, amount: 6 },
            { card: DiceCitiesCardIds.FOREST, amount: 6 },
            { card: DiceCitiesCardIds.MINE, amount: 6 },
            { card: DiceCitiesCardIds.APPLE_ORCHARD, amount: 6 },
            { card: DiceCitiesCardIds.CONVENIENCE_STORE, amount: 6 },
            { card: DiceCitiesCardIds.CHEESE_FACTORY, amount: 6 },
            { card: DiceCitiesCardIds.FURNITURE_FACTORY, amount: 6 },
            { card: DiceCitiesCardIds.FRUIT_MARKET, amount: 6 },
            { card: DiceCitiesCardIds.FAMILY_RESTAURANT, amount: 6 },
            { card: DiceCitiesCardIds.STADIUM, amount: userIdList.length },
            { card: DiceCitiesCardIds.TV_STATION, amount: userIdList.length },
            { card: DiceCitiesCardIds.BUSINESS_CENTER, amount: userIdList.length },
            ...(enabledDocks ? DOCKS_ESTABLISHMENT_IDS.map(card => ({ card, amount: 6 })) : []),
        ],
        // The players' starting coins are dealt out of the bank's fixed supply.
        bankMoney: bankTotal - (STARTING_PLAYER_COINS * userIdList.length),
        bankTotal,
        playerStates,
        hasRolled: false,
        awaitingTSSelection: false,
        awaitingBCSelectionOwn: false,
        awaitingBCSelectionOpponent: false,
        bcSelectedOwnCard: null,
        bcSelectedOpponent: null,
        bcSelectedOpponentCard: null,
        awaitingDoubleReroll: false,
        hasReRolled: false,
        awaitingHarbourChoice: false,
        harbourRoll1: null,
        harbourRoll2: null,
        enabledDocks,
        // Laundered here rather than trusted from the caller, so "a stored
        // theme is always one this game has" is true by construction instead of
        // by every caller remembering to normalise first.
        theme: diceCitiesTheme(theme).id,
    };
}

var DiceCitiesInvitationSchema = new Schema<IDiceCitiesInvitationDataDocument>({
    enabledDocks: Boolean,
    enabledBillionaireRow: Boolean
}, {discriminatorKey: 'kind'});
DiceCitiesInvitationSchema.methods.CreateGame = async function(invite: IDiceCitiesInvitationData, userIdList: string[]) {
    console.log("CreateGame: Dice Cities game");

    const gameType = new DiceCitiesGameType();

    const { turnOrder, history } = rollOffTurnOrder(userIdList);

    const enabledDocks = this.enabledDocks === true;
    if (enabledDocks) {
        history.push({ text: "Setup: the Docks expansion is in play" });
    }

    // The invitation carries whatever the host picked on the setup screen;
    // `diceCitiesTheme` is what makes it one of this game's own themes, so a
    // withdrawn or malformed id becomes the default here rather than reaching
    // the board. Only worth a log line when it isn't the game as it ships.
    const theme = diceCitiesTheme(this.theme);
    if (theme.id !== DEFAULT_DICE_CITIES_THEME.id) {
        history.push({ text: `Setup: played in the ${theme.name} theme` });
    }

    const gameData: IDiceCitiesGameData = {
        gameId: uuidv4() as uuidString,
        gameType: gameType,
        // friendlyName: "Dice Cities",
        userIdList,
        turnTimer: this.turnTimer,
        currentTurn: turnOrder[0],
        lastTurnTimestamp: (new Date()).toISOString(),
        timerWarningNotificationSent: false,
        missedTurnCounts: new Map(),
        // url: "dicecities",
        gameState: {
            turnOrder,
            history,
            commandHistory: []
        },
        complete: false,
        winner: "",
        specificGameState: buildInitialDiceCitiesState(userIdList, enabledDocks, bankTotalCoins(enabledDocks), theme.id),
        enabledBillionaireRow: this.enabledBillionaireRow
    }
    return gameData;
};
export var DiceCitiesInvitationModel = models.DiceCitiesInvitation || InvitationModel.discriminator<IDiceCitiesInvitationDataDocument, IDiceCitiesInvitationDataModel>('DiceCitiesInvitation', DiceCitiesInvitationSchema);


// "boat" arrives with the Docks: a boat is not a Furniture Factory production
// site, so it stays out of the base game's icon combos. The Docks adds no
// other type - its Flower Orchard is a farm like any other, and the Flower
// Shop picks it out by cardId rather than by giving it an icon of its own.
export type cardType = "farm" | "pasture" | "store" | "dining" | "production" | "landmark" | "factory" | "market" | "boat";

export interface IDiceCitiesCardCount {
    card: string,
    amount: number
}

export interface IDiceCitiesPlayerState {
    cards: IDiceCitiesCardCount[],
    money: number,
    // Cumulative coins gained over the match (dice-roll income, stolen
    // coins received), never decremented by spending - a measure of how
    // well a player's strategy earns, independent of what they spend it on.
    totalCoinsEarned: number,
    doubleUnlocked: boolean,
    bonusDiningAndStore: boolean,
    rerollDoubles: boolean,
    oneReroll: boolean,
    // The Docks' fifth landmark: adds +2 to a 10-or-better roll and wakes up
    // the expansion's sea cards. Deliberately absent from CheckGameOver - the
    // game is still won by building the original four.
    harbourUnlocked: boolean,
    lastDiceSelection: 1 | 2
}

export interface IDiceCitiesGameState {
    bankCards: IDiceCitiesCardCount[],
    // Coins left in the bank. The game's coin supply is capped at
    // BANK_TOTAL_COINS, so this is what's available to pay dice-roll income
    // with - bank payouts are paid short once it hits zero, and coins spent on
    // cards flow back in here.
    bankMoney: number,
    /**
     * The supply this game was dealt from, fixed at creation. Stored rather
     * than read off a constant so a replay rebuilds the game against the bank
     * it was actually played with, not whatever the constant says today.
     */
    bankTotal: number,
    playerStates: Map<string, IDiceCitiesPlayerState>,
    hasRolled: boolean,
    awaitingTSSelection: boolean,
    awaitingBCSelectionOwn: boolean,
    awaitingBCSelectionOpponent: boolean,
    bcSelectedOwnCard: uuidString | null,
    bcSelectedOpponent: string | null,
    bcSelectedOpponentCard: uuidString | null,
    awaitingDoubleReroll: boolean,
    hasReRolled: boolean,
    // A Harbour owner's 10-or-better roll waits here, dice and all, while they
    // decide whether to take its +2 - payouts only land once they've chosen.
    awaitingHarbourChoice: boolean,
    harbourRoll1: number | null,
    harbourRoll2: number | null,
    /** Expansion chosen at setup: the Docks is in play. Never changes. */
    enabledDocks: boolean,
    /**
     * Theme chosen at setup (see themes.ts). Never changes, and never affects
     * a number the engine computes - it only decides what the cards, the coins
     * and the landmark track are called. Stored on the game state rather than
     * read from the invitation because the invitation is deleted the moment
     * the game exists, and because a replay has to rebuild the game in the
     * theme its recorded history was written in.
     */
    theme: string
}

export interface IDiceCitiesGameData extends IGameData {
    enabledBillionaireRow: boolean,
    specificGameState: IDiceCitiesGameState
}

export interface IDiceCitiesGameDataDocument extends IDiceCitiesGameData, IGameDataDocument {
    // Instance methods
}

export interface IDiceCitiesGameDataModel extends Model<IDiceCitiesGameDataDocument> {
    // Static methods
}

var DiceCitiesGameDataSchema = new Schema<IDiceCitiesGameDataDocument>({
    enabledBillionaireRow: Boolean,
    specificGameState: {
        bankCards: [{
            card: String,
            amount: Number
        }],
        // Games already in progress when bank tracking was added have no stored
        // balance; they hydrate with a full bank rather than an undefined one.
        bankMoney: { type: Number, default: BANK_TOTAL_COINS },
        bankTotal: Number,
        playerStates: {
            type: Schema.Types.Map,
            of: {
                cards: [{
                    card: String,
                    amount: Number
                }],
                money: Number,
                totalCoinsEarned: Number,
                doubleUnlocked: Boolean,
                bonusDiningAndStore: Boolean,
                rerollDoubles: Boolean,
                oneReroll: Boolean,
                harbourUnlocked: Boolean,
                lastDiceSelection: Number
            }
        },
        hasRolled: Boolean,
        awaitingTSSelection: Boolean,
        awaitingBCSelectionOwn: Boolean,
        awaitingBCSelectionOpponent: Boolean,
        bcSelectedOwnCard: String,
        bcSelectedOpponent: String,
        bcSelectedOpponentCard: String,
        awaitingDoubleReroll: Boolean,
        hasReRolled: Boolean,
        awaitingHarbourChoice: Boolean,
        harbourRoll1: Number,
        harbourRoll2: Number,
        enabledDocks: Boolean,
        theme: String
    }
}, {discriminatorKey: 'kind'});
DiceCitiesGameDataSchema.methods.CreateDataResponse = async function(_viewerId: string | null): Promise<IDiceCitiesGameDataResponse> {
    console.log("CreateDataResponse: Dice Cities game");

    const gameDataDocument: IDiceCitiesGameData = this as IDiceCitiesGameData;

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
        forfeitedBy: gameDataDocument.forfeitedBy,
        enabledBillionaireRow: gameDataDocument.enabledBillionaireRow,
        specificGameState: gameStateToModel(gameDataDocument.specificGameState, userIdNameMap)
    };
};

export function gameStateToModel(gameState: IDiceCitiesGameState, userIdNameMap: { [key: string]: string}) : IDiceCitiesGameStateResponse {
    const playerStates: { [key: string]: IDiceCitiesPlayerStateResponse; } = {};
    for (const [userId, playerStateModel] of gameState.playerStates) {
        playerStates[userId] = {
            userId,
            username: userIdNameMap[userId],
            cards: playerStateModel.cards.map(cardCount => {
                return {
                    card: cardCount.card.toString() as uuidString,
                    amount: cardCount.amount
                };
            }),
            money: playerStateModel.money,
            totalCoinsEarned: playerStateModel.totalCoinsEarned,
            doubleUnlocked: playerStateModel.doubleUnlocked,
            rerollDoubles: playerStateModel.rerollDoubles,
            bonusDiningAndStore: playerStateModel.bonusDiningAndStore,
            oneReroll: playerStateModel.oneReroll,
            // Games that started before the Docks shipped have no stored flag.
            harbourUnlocked: playerStateModel.harbourUnlocked === true,
            lastDiceSelection: playerStateModel.lastDiceSelection
        };
    }
    return {
        bankCards: gameState.bankCards.map(cardCount => {
            return {
                card: cardCount.card.toString() as uuidString,
                amount: cardCount.amount
            };
        }),
        bankMoney: gameState.bankMoney,
        playerStates,
        hasRolled: gameState.hasRolled,
        awaitingTSSelection: gameState.awaitingTSSelection,
        awaitingBCSelectionOwn: gameState.awaitingBCSelectionOwn,
        awaitingBCSelectionOpponent: gameState.awaitingBCSelectionOpponent,
        bcSelectedOwnCard: gameState.bcSelectedOwnCard,
        bcSelectedOpponent: gameState.bcSelectedOpponent,
        bcSelectedOpponentCard: gameState.bcSelectedOpponentCard,
        awaitingDoubleReroll: gameState.awaitingDoubleReroll,
        hasReRolled: gameState.hasReRolled,
        awaitingHarbourChoice: gameState.awaitingHarbourChoice === true,
        harbourRoll1: gameState.harbourRoll1 ?? null,
        harbourRoll2: gameState.harbourRoll2 ?? null,
        // Games that started before the Docks shipped have no stored flag.
        enabledDocks: gameState.enabledDocks === true,
        // Likewise for themes: a game that predates them is the game as it
        // shipped, which is exactly what the default theme names.
        theme: diceCitiesTheme(gameState.theme).id
    }
}

export function playerByUserId(
    state: IDiceCitiesGameStateResponse | undefined,
    userId: string
): IDiceCitiesPlayerStateResponse | undefined {
    return findPlayerByUserId(state, userId);
}

export var DiceCitiesGameDataModel = models.DiceCitiesGameData || GameDataModel.discriminator<IDiceCitiesGameDataDocument, IDiceCitiesGameDataModel>('DiceCitiesGameData', DiceCitiesGameDataSchema);

// Boiled-down stats for the GameResult read model, computed once at game-end
// (see recordGameResult in GameResultData.ts). `coins` is each player's final
// balance (spending is part of the strategy, so this alone tends toward
// zero); `coinsEarned` is their cumulative earnings regardless of spend, a
// better read on how well a strategy performs. `landmarksUnlocked` lists
// which of the four landmark cards (the game's win condition) each player
// had bought by game-end.
export interface IDiceCitiesGameResultStats {
    coins: Map<string, number>;
    coinsEarned: Map<string, number>;
    landmarksUnlocked: Map<string, string[]>;
    // Cumulative totalCoinsEarned per player at the end of each turn, in turn
    // order - not derivable from the other fields above (those are game-end
    // totals only). Powers a coins/turn chart. Computed by replaying
    // commandHistory via computePerTurnStat (see replay.ts), driven from this
    // game's GAME_RESULT_STATS entry in GameResultData.ts, since it isn't
    // tracked incrementally on specificGameState.
    coinsPerTurn: Map<string, number>[];
}

export const diceCitiesGameResultStatsSchemaDef = {
    coins: { type: Schema.Types.Map, of: Number },
    coinsEarned: { type: Schema.Types.Map, of: Number },
    landmarksUnlocked: { type: Schema.Types.Map, of: [String] },
    coinsPerTurn: [{ type: Schema.Types.Map, of: Number }]
};

export function computeDiceCitiesResultStats(gameData: IDiceCitiesGameData, coinsPerTurn: Map<string, number>[]): IDiceCitiesGameResultStats {
    const coins = new Map<string, number>();
    const coinsEarned = new Map<string, number>();
    const landmarksUnlocked = new Map<string, string[]>();
    for (const [userId, playerState] of gameData.specificGameState.playerStates) {
        coins.set(userId, playerState.money);
        coinsEarned.set(userId, playerState.totalCoinsEarned);
        landmarksUnlocked.set(userId, LANDMARKS.filter(l => playerState[l.flag]).map(l => l.cardId));
    }
    return { coins, coinsEarned, landmarksUnlocked, coinsPerTurn };
}

// Renders IDiceCitiesGameResultStats as one stat group per player, for the
// shared GameResultStats UI (recent-form popup + full result page).
export function formatDiceCitiesResultStats(stats: IDiceCitiesGameResultStats, usernameById: Map<string, string>): GameResultStatGroup[] {
    const groups: GameResultStatGroup[] = [];
    for (const [userId, coinsEarned] of stats.coinsEarned) {
        const landmarks = stats.landmarksUnlocked.get(userId) ?? [];
        groups.push({
            username: usernameById.get(userId) ?? userId,
            lines: [
                `Earned ${pluralize(coinsEarned, 'coin')}`,
                `Unlocked ${pluralize(landmarks.length, 'landmark')}`,
            ],
        });
    }
    return groups;
}

// Renders coinsPerTurn as GameResult charts: one entry per turn, keyed by
// username, for the result page's coins/turn chart.
export function formatDiceCitiesCharts(stats: IDiceCitiesGameResultStats, usernameById: Map<string, string>): GameResultChart[] {
    return compactCharts(formatPerTurnChart(stats.coinsPerTurn, "Coins per turn", "Coins"));
}
