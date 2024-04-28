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
    gameType: string,
    gameFriendlyName: string
}

export interface IInvitationDataDocument extends IInvitationData, Document {
    // Instance methods
    CreateGame: (invite: IInvitationData, userIdList: string[]) => Promise<IGameData>;
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
    gameType: String,
    gameFriendlyName: String
}, {discriminatorKey: 'kind'});
InvitationSchema.methods.CreateGame = async function(invite: IInvitationData, userIdList: string[]) {
    console.log("CreateGame: Generic game");
};
export var InvitationModel = models.Invitation || model<IInvitationDataDocument, IInvitationDataModel>('Invitation', InvitationSchema);

export interface IInvitationResponse {
    inviteId: `${string}-${string}-${string}-${string}-${string}`,
    sender: string,
    userList: string[],
    timestamp: string,
    gameFriendlyName: string
}

export interface IInvitationRequest {
    userList: string[],
    turnTimer: string
}
