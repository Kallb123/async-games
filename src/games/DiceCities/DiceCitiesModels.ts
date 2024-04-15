import { GameDataModel, IGameData, IGameDataDocument, userIdListToUsernameList } from "@/utils/mongodb/GameData";
import { IInvitationData, IInvitationDataDocument, InvitationModel, IInvitationRequest } from "@/utils/mongodb/InvitationData";
import { randomUUID } from "crypto";
import { Model, Schema, Types, models } from "mongoose";
import { DiceCitiesCardIds } from "./cards";
import { UUID } from "mongodb";
import { IDiceCitiesGameDataResponse, IDiceCitiesGameStateResponse, IDiceCitiesPlayerStateResponse } from "./apiModels";
import { uuidString } from "@/utils/apiModels/GameDataApi";

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

var DiceCitiesInvitationSchema = new Schema<IDiceCitiesInvitationDataDocument>({
    enabledDocks: Boolean,
    enabledBillionaireRow: Boolean
}, {discriminatorKey: 'kind'});
DiceCitiesInvitationSchema.methods.CreateGame = function(invite: IDiceCitiesInvitationData, userIdList: string[]) {
    console.log("CreateGame: Dice Cities game");

    const turnOrder = userIdList;
    const gameData: IDiceCitiesGameData = {
        gameId: new UUID(randomUUID()),
        gameType: this.gameType,
        friendlyName: "Dice Cities",
        userIdList,
        turnTimer: this.turnTimer,
        currentTurn: turnOrder[0],
        lastTurnTimestamp: (new Date()).toISOString(),
        url: "dicecities",
        gameState: {
            turnOrder,
            history: []
        },
        specificGameState: {
            bankCards: [{
            card: new UUID(DiceCitiesCardIds.WHEAT_FIELD),
            amount: 5
        }],
            playerStates: new Map<string, IDiceCitiesPlayerState>()
        },
        enabledDocks: this.enabledDocks,
        enabledBillionaireRow: this.enabledBillionaireRow
    }
    for (const userId of userIdList) {
        gameData.specificGameState.playerStates.set(userId, {
        cards: [{
            card: new UUID(DiceCitiesCardIds.WHEAT_FIELD),
            amount: 1
        }, {
            card: new UUID(DiceCitiesCardIds.BAKERY),
            amount: 1
        }],
        money: 3,
        doubleUnlocked: false,
        bonusDiningAndStore: false,
        rerollDoubles: false,
        oneReroll: false
        });
    }
    return gameData;
};
export var DiceCitiesInvitationModel = models.DiceCitiesInvitation || InvitationModel.discriminator<IDiceCitiesInvitationDataDocument, IDiceCitiesInvitationDataModel>('DiceCitiesInvitation', DiceCitiesInvitationSchema);


export type cardType = "farm" | "pasture" | "store" | "dining" | "production" | "landmark" | "factory" | "market";

export interface IDiceCitiesCardCount {
    card: Types.UUID,
    amount: number
}

export interface IDiceCitiesPlayerState {
    cards: IDiceCitiesCardCount[],
    money: number,
    doubleUnlocked: boolean,
    bonusDiningAndStore: boolean,
    rerollDoubles: boolean,
    oneReroll: boolean
}

export interface IDiceCitiesGameState {
    bankCards: IDiceCitiesCardCount[],
    playerStates: Map<string, IDiceCitiesPlayerState>
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
            card: Schema.Types.UUID,
            amount: Number
        }],
        playerStates: {
            type: Schema.Types.Map,
            of: {
                cards: [{
                    card: Schema.Types.UUID,
                    amount: Number
                }],
                money: Number,
                doubleUnlocked: Boolean,
                bonusDiningAndStore: Boolean,
                rerollDoubles: Boolean,
                oneReroll: Boolean
            }
        }
    }
}, {discriminatorKey: 'kind'});
DiceCitiesGameDataSchema.methods.CreateDataResponse = async function(): Promise<IDiceCitiesGameDataResponse> {
    console.log("CreateDataResponse: Dice Cities game");

    const usernameList = await userIdListToUsernameList(this.userIdList);
    const userIdNameMap: { [key: string]: string} = {};
    (this.userIdList as string[]).forEach((userId: string, i: number) => {
        userIdNameMap[userId] = usernameList[i];
    });

    return {
        gameId: this.gameId,
        gameType: this.gameType,
        friendlyName: this.friendlyName,
        usernameList,
        turnTimer: this.turnTimer,
        currentTurn: this.currentTurn,
        url: this.url,
        gameState: this.gameState,
        enabledDocks: this.enabledDocks,
        enabledBillionaireRow: this.enabledBillionaireRow,
        specificGameState: gameStateToModel(this.specificGameState, userIdNameMap)
    };
};

function gameStateToModel(gameState: IDiceCitiesGameState, userIdNameMap: { [key: string]: string}) : IDiceCitiesGameStateResponse {
    const playerStates: { [key: string]: IDiceCitiesPlayerStateResponse; } = {};
    for (const [userId, playerStateModel] of gameState.playerStates) {
        playerStates[userIdNameMap[userId]] = {
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
        playerStates
    }
}

export var DiceCitiesGameDataModel = models.DiceCitiesGameData || GameDataModel.discriminator<IDiceCitiesGameDataDocument, IDiceCitiesGameDataModel>('DiceCitiesGameData', DiceCitiesGameDataSchema);
