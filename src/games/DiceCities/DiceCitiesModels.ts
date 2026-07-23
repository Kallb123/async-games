import { GameDataModel, IGameData, IGameDataDocument } from "@/utils/mongodb/GameData";
import { IInvitationData, IInvitationDataDocument, InvitationModel, IInvitationRequest } from "@/utils/mongodb/InvitationData";
import { Model, Schema, models } from "mongoose";
import { DiceCitiesCardIds } from "./cards";
import { IDiceCitiesGameDataResponse, IDiceCitiesGameStateResponse, IDiceCitiesPlayerStateResponse } from "./apiModels";
import { uuidString, GameResultStatGroup } from "@/utils/apiModels/GameDataApi";
import { pluralize } from "@/utils/ui/text";
import { v4 as uuidv4 } from 'uuid';
import { userIdListToUsernameList, userIdListToUsernameMap } from "@/utils/users/clerk";
import { DiceCitiesGameType } from "@/utils/apiModels/GameLogic";
import { DiceRoll } from "@/utils/games/DiceRoll";
import { LANDMARKS } from "./ui";

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

function SortUsersByRoll(userIdList: string[], usernameMap: Map<string, string>, turnOrder: string[], history: string[], dieToRoll: number) {
    // Get turn order
    // Roll for each user
    let turnRolls = userIdList.map((userId) => {
        return {userId, diceRoll: DiceRoll(dieToRoll)};
    });
    let distinctRolls: Map<number, string[]> = new Map;
    // Make lists of users that rolled each value
    turnRolls.forEach(turnRoll => {
        const lookup = distinctRolls.get(turnRoll.diceRoll);
        if (lookup) {
            lookup.push(turnRoll.userId);
        } else {
            distinctRolls.set(turnRoll.diceRoll, [turnRoll.userId]);
        }
    });
    // Sort in descending order, so highest roll is first
    const sortedRolls = [...distinctRolls.keys()].sort((a, b) => b-a);
    // Consider each list of users
    sortedRolls.forEach(roll => {
        const usersInRoll = distinctRolls.get(roll);
        if (!usersInRoll) {
            return;
        }
        if (usersInRoll.length > 1) {
            // Need to re-roll these users
            const usernamesInRoll = usersInRoll.map(userId => usernameMap.get(userId));
            history.push(`Setup: ${usernamesInRoll.join(" & ")} rolled a ${roll} and are re-rolling`);
            SortUsersByRoll(usersInRoll, usernameMap, turnOrder, history, dieToRoll);
        } else {
            turnOrder.push(usersInRoll[0]);
            // The first player settled into turnOrder is the roll-off winner.
            history.push(`Setup: ${usernameMap.get(usersInRoll[0])} rolled a ${roll}${turnOrder.length === 1 ? " and goes first" : ""}`);
        }
    });
}

// Builds the deterministic starting specificGameState for a Dice Cities game.
// Used both at game creation and by the replay engine to reconstruct historical
// / planned states from commandHistory.
export function buildInitialDiceCitiesState(userIdList: string[]): IDiceCitiesGameState {
    const playerStates = new Map<string, IDiceCitiesPlayerState>();
    for (const userId of userIdList) {
        playerStates.set(userId, {
            cards: [
                { card: DiceCitiesCardIds.WHEAT_FIELD, amount: 1 },
                { card: DiceCitiesCardIds.BAKERY, amount: 1 },
            ],
            money: 3,
            totalCoinsEarned: 0,
            doubleUnlocked: false,
            bonusDiningAndStore: false,
            rerollDoubles: false,
            oneReroll: false,
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
        ],
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
    };
}

var DiceCitiesInvitationSchema = new Schema<IDiceCitiesInvitationDataDocument>({
    enabledDocks: Boolean,
    enabledBillionaireRow: Boolean
}, {discriminatorKey: 'kind'});
DiceCitiesInvitationSchema.methods.CreateGame = async function(invite: IDiceCitiesInvitationData, userIdList: string[]) {
    console.log("CreateGame: Dice Cities game");

    const gameType = new DiceCitiesGameType();

    const turnOrder: string[] = [];
    const history: string[] = [];

    const usernameMap = await userIdListToUsernameMap(userIdList);

    SortUsersByRoll(userIdList, usernameMap, turnOrder, history, 6);

    const gameData: IDiceCitiesGameData = {
        gameId: uuidv4() as uuidString,
        gameType: gameType,
        // friendlyName: "Dice Cities",
        userIdList,
        turnTimer: this.turnTimer,
        currentTurn: turnOrder[0],
        lastTurnTimestamp: (new Date()).toISOString(),
        timerWarningNotificationSent: false,
        // url: "dicecities",
        gameState: {
            turnOrder,
            history,
            commandHistory: []
        },
        complete: false,
        winner: "",
        specificGameState: buildInitialDiceCitiesState(userIdList),
        enabledDocks: this.enabledDocks,
        enabledBillionaireRow: this.enabledBillionaireRow
    }
    return gameData;
};
export var DiceCitiesInvitationModel = models.DiceCitiesInvitation || InvitationModel.discriminator<IDiceCitiesInvitationDataDocument, IDiceCitiesInvitationDataModel>('DiceCitiesInvitation', DiceCitiesInvitationSchema);


export type cardType = "farm" | "pasture" | "store" | "dining" | "production" | "landmark" | "factory" | "market";

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
    oneReroll: boolean
}

export interface IDiceCitiesGameState {
    bankCards: IDiceCitiesCardCount[],
    playerStates: Map<string, IDiceCitiesPlayerState>,
    hasRolled: boolean,
    awaitingTSSelection: boolean,
    awaitingBCSelectionOwn: boolean,
    awaitingBCSelectionOpponent: boolean,
    bcSelectedOwnCard: uuidString | null,
    bcSelectedOpponent: string | null,
    bcSelectedOpponentCard: uuidString | null,
    awaitingDoubleReroll: boolean,
    hasReRolled: boolean
}

export interface IDiceCitiesGameData extends IGameData {
    enabledDocks: boolean,
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
    enabledDocks: Boolean,
    enabledBillionaireRow: Boolean,
    specificGameState: {
        bankCards: [{
            card: String,
            amount: Number
        }],
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
                oneReroll: Boolean
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
        hasReRolled: Boolean
    }
}, {discriminatorKey: 'kind'});
DiceCitiesGameDataSchema.methods.CreateDataResponse = async function(): Promise<IDiceCitiesGameDataResponse> {
    console.log("CreateDataResponse: Dice Cities game");

    const gameDataDocument: IDiceCitiesGameData = this as IDiceCitiesGameData;

    const usernameList = await userIdListToUsernameList(gameDataDocument.userIdList);
    const userIdNameMap: { [key: string]: string} = {};
    (gameDataDocument.userIdList as string[]).forEach((userId: string, i: number) => {
        userIdNameMap[userId] = usernameList[i];
    });

    return {
        gameType: gameDataDocument.gameType,
        usernameList,
        turnTimer: gameDataDocument.turnTimer,
        currentTurn: gameDataDocument.currentTurn,
        gameState: gameDataDocument.gameState,
        complete: gameDataDocument.complete,
        winner: gameDataDocument.winner,
        enabledDocks: gameDataDocument.enabledDocks,
        enabledBillionaireRow: gameDataDocument.enabledBillionaireRow,
        specificGameState: gameStateToModel(gameDataDocument.specificGameState, userIdNameMap)
    };
};

export function gameStateToModel(gameState: IDiceCitiesGameState, userIdNameMap: { [key: string]: string}) : IDiceCitiesGameStateResponse {
    const playerStates: { [key: string]: IDiceCitiesPlayerStateResponse; } = {};
    for (const [userId, playerStateModel] of gameState.playerStates) {
        playerStates[userIdNameMap[userId]] = {
            userId,
            username: userIdNameMap[userId],
            cards: playerStateModel.cards.map(cardCount => {
                return {
                    card: cardCount.card.toString() as uuidString,
                    amount: cardCount.amount
                };
            }),
            money: playerStateModel.money,
            doubleUnlocked: playerStateModel.doubleUnlocked,
            rerollDoubles: playerStateModel.rerollDoubles,
            bonusDiningAndStore: playerStateModel.bonusDiningAndStore,
            oneReroll: playerStateModel.oneReroll
        };
    }
    return {
        bankCards: gameState.bankCards.map(cardCount => {
            return {
                card: cardCount.card.toString() as uuidString,
                amount: cardCount.amount
            };
        }),
        playerStates,
        hasRolled: gameState.hasRolled,
        awaitingTSSelection: gameState.awaitingTSSelection,
        awaitingBCSelectionOwn: gameState.awaitingBCSelectionOwn,
        awaitingBCSelectionOpponent: gameState.awaitingBCSelectionOpponent,
        bcSelectedOwnCard: gameState.bcSelectedOwnCard,
        bcSelectedOpponent: gameState.bcSelectedOpponent,
        bcSelectedOpponentCard: gameState.bcSelectedOpponentCard,
        awaitingDoubleReroll: gameState.awaitingDoubleReroll,
        hasReRolled: gameState.hasReRolled
    }
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
}

export const diceCitiesGameResultStatsSchemaDef = {
    coins: { type: Schema.Types.Map, of: Number },
    coinsEarned: { type: Schema.Types.Map, of: Number },
    landmarksUnlocked: { type: Schema.Types.Map, of: [String] }
};

export function computeDiceCitiesResultStats(gameData: IDiceCitiesGameData): IDiceCitiesGameResultStats {
    const coins = new Map<string, number>();
    const coinsEarned = new Map<string, number>();
    const landmarksUnlocked = new Map<string, string[]>();
    for (const [userId, playerState] of gameData.specificGameState.playerStates) {
        coins.set(userId, playerState.money);
        coinsEarned.set(userId, playerState.totalCoinsEarned);
        landmarksUnlocked.set(userId, LANDMARKS.filter(l => playerState[l.flag]).map(l => l.cardId));
    }
    return { coins, coinsEarned, landmarksUnlocked };
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
