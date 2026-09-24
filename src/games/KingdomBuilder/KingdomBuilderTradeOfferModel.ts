import { Document, Model, Schema, Types, model, models } from "mongoose";

import { KingdomBuilderResourcesSchema, type KingdomBuilderResources } from "./KingdomBuilderSettlementModel";

/**
 * A trade offer posted at a market for any other player in the world to take
 * (GDD §4.2, §11.3 PR 25). What it gives is taken from the settlement's stores
 * when it is posted and held here until it is taken or withdrawn, so an offer
 * can never be accepted and then turn out to be unpaid.
 */
export interface IKingdomBuilderTradeOffer {
    worldId: Types.ObjectId;
    ownerId: string;
    /** The settlement it was posted from, whose stores paid for `gives` and take in `wants`. */
    settlementId: Types.ObjectId;
    gives: KingdomBuilderResources;
    wants: KingdomBuilderResources;
    createdAt: Date;
    updatedAt: Date;
}

export interface IKingdomBuilderTradeOfferDocument extends IKingdomBuilderTradeOffer, Document {}
export interface IKingdomBuilderTradeOfferModel extends Model<IKingdomBuilderTradeOfferDocument> {}

export const KingdomBuilderTradeOfferSchema = new Schema<IKingdomBuilderTradeOfferDocument>({
    worldId: { type: Schema.Types.ObjectId, ref: "KingdomBuilderWorld", required: true },
    ownerId: { type: String, required: true },
    settlementId: { type: Schema.Types.ObjectId, ref: "KingdomBuilderSettlement", required: true },
    gives: { type: KingdomBuilderResourcesSchema, required: true },
    wants: { type: KingdomBuilderResourcesSchema, required: true },
}, { timestamps: true });

// A world's board, oldest first; and one player's offers, counted against the limit.
KingdomBuilderTradeOfferSchema.index({ worldId: 1, createdAt: 1 });
KingdomBuilderTradeOfferSchema.index({ worldId: 1, ownerId: 1 });

export const KingdomBuilderTradeOfferModel = models.KingdomBuilderTradeOffer
    || model<IKingdomBuilderTradeOfferDocument, IKingdomBuilderTradeOfferModel>("KingdomBuilderTradeOffer", KingdomBuilderTradeOfferSchema);
