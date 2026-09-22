import { Schema, models, type Model, type Types } from "mongoose";

import { InvitationModel, type IInvitationData, type IInvitationDataDocument } from "@/utils/mongodb/InvitationData";

/**
 * The invitation to a Kingdom Builder world (§11.3 PR 8). It is the app's
 * ordinary lobby invitation — the join code, its `expiresAt` reaping, the
 * named invite rows and the share link all work exactly as for any other game
 * — with one extra field: the world it seats people in. A world already
 * exists by the time anyone is invited to it, so accepting a seat joins that
 * world (`joinWorld`) rather than waiting for everyone and minting a game:
 * see `acceptSeat`'s branch for this kind.
 *
 * Deliberately not in `mongodb.ts`'s `INVITATION_MODELS`: that registry is
 * what the generic `POST /api/lobby` creates invitations from, and a world
 * invitation must only ever be created alongside its world, by
 * `/api/newgame/kingdombuilder`.
 */
export const KINGDOM_BUILDER_INVITATION_KIND = "KingdomBuilderInvitation";

export interface IKingdomBuilderInvitationData extends IInvitationData {
    worldId: Types.ObjectId;
}

export interface IKingdomBuilderInvitationDocument extends IKingdomBuilderInvitationData, Omit<IInvitationDataDocument, keyof IInvitationData> {}

const KingdomBuilderInvitationSchema = new Schema<IKingdomBuilderInvitationDocument>({
    worldId: { type: Schema.Types.ObjectId, ref: "KingdomBuilderWorld", required: true },
});
KingdomBuilderInvitationSchema.index({ worldId: 1 });

export const KingdomBuilderInvitationModel: Model<IKingdomBuilderInvitationDocument> =
    models[KINGDOM_BUILDER_INVITATION_KIND]
    || InvitationModel.discriminator<IKingdomBuilderInvitationDocument>(KINGDOM_BUILDER_INVITATION_KIND, KingdomBuilderInvitationSchema);

/**
 * The world an invitation seats people in, or undefined for every other
 * game's invitation. Importing this (from this module) is also what registers
 * the discriminator, so an invitation read through the base `InvitationModel`
 * hydrates with its `worldId` rather than having it stripped as unknown.
 */
export function worldIdOfInvitation(invite: IInvitationData): string | undefined {
    const worldId = (invite as Partial<IKingdomBuilderInvitationData>).worldId;
    return worldId ? worldId.toString() : undefined;
}
