import { Document, Model, Schema, model, models } from "mongoose";
import { IDiceCitiesGameData, IGameData } from "./GameData";
import { randomUUID } from "crypto";
import { DiceCitiesCardIds } from "@/games/DiceCities/cards";
import { UUID } from "mongodb";

interface IUserIdAcceptance {
    userId: string,
    inviteAccepted: boolean
}

export interface IInvitationData {
    inviteId: `${string}-${string}-${string}-${string}-${string}`,
    senderId: string,
    userIdList: IUserIdAcceptance[],
    turnTimer: string,
    timestamp: string,
    gameType: string
}

export interface IInvitationDataDocument extends IInvitationData, Document {
    // Instance methods
    CreateGame: (invite: IInvitationData, userIdList: string[]) => IGameData;
}

export interface IInvitationDataModel extends Model<IInvitationDataDocument> {
    // Static methods
}

export var InvitationSchema = new Schema<IInvitationDataDocument> ({
    inviteId: Schema.Types.UUID,
    senderId: String,
    userIdList: [{
        userId: String,
        inviteAccepted: Boolean
    }],
    turnTimer: String,
    timestamp: String,
    gameType: String
}, {discriminatorKey: 'kind'});
InvitationSchema.methods.CreateGame = function(invite: IInvitationData, userIdList: string[]) {
    console.log("Generic game");
};
export var InvitationModel = models.Invitation || model<IInvitationDataDocument, IInvitationDataModel>('Invitation', InvitationSchema);

export interface InvitationResponse {
    inviteId: `${string}-${string}-${string}-${string}-${string}`,
    sender: string,
    userList: string[],
    timestamp: string
}

export interface InvitationRequest {
    userList: string[],
    turnTimer: string
}



export interface DiceCitiesInvitationRequest extends InvitationRequest {
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
    console.log("Creating dice cities game!!");

    const turnOrder = userIdList;
    const gameData: IDiceCitiesGameData = {
        gameId: randomUUID(),
        gameType: invite.gameType,
        friendlyName: "Dice Cities",
        userIdList,
        turnTimer: invite.turnTimer,
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
            playerStates: {}
        },
        enabledDocks: invite.enabledDocks,
        enabledBillionaireRow: invite.enabledBillionaireRow
    }
    for (const userId of userIdList) {
        gameData.specificGameState.playerStates[userId] = {
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
        };
    }
    return gameData;
};
export var DiceCitiesInvitationModel = models.DiceCitiesInvitation || InvitationModel.discriminator<IDiceCitiesInvitationDataDocument, IDiceCitiesInvitationDataModel>('DiceCitiesInvitation', DiceCitiesInvitationSchema);

