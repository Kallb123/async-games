import { Document, Model, Schema, model, models } from "mongoose";
import { UserDto } from '@/utils/users/clerk';

export interface IFriendshipData {
    friendshipId: `${string}-${string}-${string}-${string}-${string}`,
    requesterId: string,
    recipientId: string,
    accepted: boolean,
    timestamp: string,
    // The two ids in a fixed order, so "these two users" is one value the
    // unique index below can hold — see friendshipPairKey. Written by the
    // pre-validate hook, never by callers.
    pairKey?: string
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
    timestamp: String,
    pairKey: String
});
// A friendship is one relationship between two people, whichever of them
// asked, so the pair is what has to be unique — a plain
// { requesterId, recipientId } index would let A→B and B→A both exist. The
// invite route still looks for an existing friendship first (it has a much
// better answer than a duplicate-key error), but two people friending each
// other at the same instant both pass that check, and this is what stops the
// second insert.
//
// Partial, the same way InvitationSchema's joinCode index is: friendships
// written before pairKey existed don't have one, and without the filter they
// would all index as the same null and fail the build. They are already
// distinct pairs — the check in the invite route is what kept them that way —
// so the constraint only needs to cover what is written from here on.
FriendshipSchema.index({ pairKey: 1 }, { unique: true, partialFilterExpression: { pairKey: { $exists: true } } });
// Set here rather than at the call site so it cannot be forgotten by a second
// place that creates a friendship: the index above is only a constraint on
// documents that actually carry the key.
FriendshipSchema.pre('validate', function() {
    this.pairKey = friendshipPairKey(this.requesterId, this.recipientId);
});
export var FriendshipModel = models.Friendship || model<IFriendshipDataDocument, IFriendshipDataModel>('Friendship', FriendshipSchema);

// The two user ids as one order-independent value, so that A inviting B and B
// inviting A produce the same key and collide on the unique index above.
export function friendshipPairKey(userIdA: string, userIdB: string): string {
    return [userIdA, userIdB].sort().join('|');
}

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

export interface IFriendUser extends UserDto {
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
