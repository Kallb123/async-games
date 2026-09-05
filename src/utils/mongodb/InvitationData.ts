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
    // Which of the game's themes the host chose on the setup screen (see
    // utils/ui/gameThemes.ts). A cross-game setting like the turn timer, and
    // stored here rather than in each game's own invitation discriminator so
    // the lobby route can carry it through for every game without a branch.
    // Absent for a game with no themes, and for an invitation created before
    // that game had any — both read back as the game's default.
    theme?: string,
    // Present only on an open, join-by-code lobby. A real Date (unlike the
    // ISO-string timestamps above) because the TTL index below only expires
    // Date-typed fields.
    joinCode?: string,
    expiresAt?: Date,
    // The host's display name as it read when they opened the lobby, stored
    // the way gameFriendlyName is rather than resolved from Clerk on demand:
    // the link preview a shared code unfurls to needs it, and an external
    // round trip is the slowest thing on that path. It can only go stale
    // within the lifetime of the lobby, and only if the host renames
    // themselves meanwhile. Absent on a lobby opened before this existed —
    // `findLobbyPreview` still falls back to asking Clerk.
    senderName?: string
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
    theme: String,
    joinCode: String,
    expiresAt: Date,
    senderName: String
}, {discriminatorKey: 'kind'});
// Codes are only unique among *live* lobbies, so the index only applies to
// documents that actually have one - a finished/expired invitation can reuse
// a code without tripping the constraint.
InvitationSchema.index({ joinCode: 1 }, { unique: true, partialFilterExpression: { joinCode: { $exists: true } } });
// Reaps abandoned lobbies once their code expires, which also frees the code.
// Documents without expiresAt are left alone.
InvitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// The invitation's own id: how the lobby screen, the accept/cancel routes and
// startGameFromInvitation's consuming delete all reach one. Unique because
// it is a v4 UUID minted per invitation and everything downstream treats it
// as identifying exactly one.
InvitationSchema.index({ inviteId: 1 }, { unique: true });
// The dashboard's incoming and outgoing invite lists, which read both halves
// in one $or — so both halves get an index.
InvitationSchema.index({ senderId: 1 });
InvitationSchema.index({ "userIdList.userId": 1 });
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
    gameFriendlyName: string,
    // Present only on an open, join-by-code lobby (see IInvitationData.joinCode).
    joinCode?: string,
    // When that lobby's code stops working, as an ISO string — the lobby screen
    // tells whoever is waiting there how long they have left (see lobbyTtlMs).
    expiresAt?: string
}

export interface IInvitationRequest {
    userList: string[],
    turnTimer: string,
    /** The game theme the host picked, if the game offers any. Normalised
     *  through `themeIdFor` before it is stored — never trusted as sent. */
    theme?: string
}
