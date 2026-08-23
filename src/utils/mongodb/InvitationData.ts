import { Document, Model, Schema, model, models } from "mongoose";
import { IGameData } from "./GameData";

export interface IUserIdAcceptance {
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
    gameFriendlyName: string,
    // Present only on an open, join-by-code lobby. A real Date (unlike the
    // ISO-string timestamps above) because the TTL index below only expires
    // Date-typed fields.
    joinCode?: string,
    expiresAt?: Date
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
    gameFriendlyName: String,
    joinCode: String,
    expiresAt: Date
}, {discriminatorKey: 'kind'});
// Codes are only unique among *live* lobbies, so the index only applies to
// documents that actually have one - a finished/expired invitation can reuse
// a code without tripping the constraint.
InvitationSchema.index({ joinCode: 1 }, { unique: true, partialFilterExpression: { joinCode: { $exists: true } } });
// Reaps abandoned lobbies once their code expires, which also frees the code.
// Documents without expiresAt are left alone.
InvitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
InvitationSchema.methods.CreateGame = async function(invite: IInvitationData, userIdList: string[]) {
    console.log("CreateGame: Generic game");
};
export var InvitationModel = models.Invitation || model<IInvitationDataDocument, IInvitationDataModel>('Invitation', InvitationSchema);

export interface IInvitationResponse {
    inviteId: `${string}-${string}-${string}-${string}-${string}`,
    sender: string,
    senderImageUrl: string | null,
    userList: string[],
    timestamp: string,
    gameFriendlyName: string
}

export interface IInvitationRequest {
    userList: string[],
    turnTimer: string
}
