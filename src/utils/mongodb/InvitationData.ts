import { Document, Model, Schema, model, models } from "mongoose";
import { IGameData } from "./GameData";

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
