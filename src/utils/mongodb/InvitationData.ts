import { Schema } from "mongoose";

var InvitationSchema = new Schema ({
    inviteId: Schema.Types.UUID,
    senderId: String,
    userIdList: [{
        userId: String,
        inviteAccepted: Boolean
    }],
    turnTimer: String,
    timestamp: String,
    gameType: String
 });

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
