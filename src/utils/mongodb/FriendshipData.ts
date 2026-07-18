import { Document, Model, Schema, model, models } from "mongoose";

export interface IFriendshipData {
    friendshipId: `${string}-${string}-${string}-${string}-${string}`,
    requesterId: string,
    recipientId: string,
    accepted: boolean,
    timestamp: string
}

export interface IFriendshipDataDocument extends IFriendshipData, Document {
    // Instance methods
}

export interface IFriendshipDataModel extends Model<IFriendshipDataDocument> {
    // Static methods
}

export var FriendshipSchema = new Schema<IFriendshipDataDocument> ({
    friendshipId: Schema.Types.UUID,
    requesterId: String,
    recipientId: String,
    accepted: Boolean,
    timestamp: String
});
export var FriendshipModel = models.Friendship || model<IFriendshipDataDocument, IFriendshipDataModel>('Friendship', FriendshipSchema);

export interface IFriendUser {
    userId: string,
    username: string | null,
    firstName: string | null,
    lastName: string | null
}

export interface IFriendRequestResponse {
    friendshipId: `${string}-${string}-${string}-${string}-${string}`,
    user: IFriendUser,
    timestamp: string
}

export interface IFriendsResponse {
    friends: IFriendRequestResponse[],
    incomingRequests: IFriendRequestResponse[],
    outgoingRequests: IFriendRequestResponse[]
}
