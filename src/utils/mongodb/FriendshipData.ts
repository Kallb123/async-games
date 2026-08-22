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

// True if the two users have an accepted friendship, in either direction.
// Used to gate friends-only reads (e.g. a friend's profile) beyond the
// current user's own data.
export async function areFriends(userIdA: string, userIdB: string): Promise<boolean> {
    const friendship = await FriendshipModel.findOne({
        accepted: true,
        $or: [
            { requesterId: userIdA, recipientId: userIdB },
            { requesterId: userIdB, recipientId: userIdA }
        ]
    });
    return !!friendship;
}

export interface IFriendUser {
    userId: string,
    username: string | null,
    firstName: string | null,
    lastName: string | null,
    imageUrl: string | null,
    lastActionTimestamp: string | null
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
