import { Document, Model, Schema, Types, model, models } from "mongoose";

import type { KingdomBuilderMarch } from "./armies";
import { KINGDOM_BUILDER_UNIT_TYPES, type KingdomBuilderGarrison } from "./units";

/**
 * A stack of units away from its garrison (GDD §6.2, §11.3 PR 19). Its route
 * lives here, not on the world: an army's path is hidden information (§6.3),
 * and one document per army is one field for fog of war (PR 20) to redact.
 */
export interface IKingdomBuilderArmy extends KingdomBuilderMarch {
    worldId: Types.ObjectId;
    /** The node it last set out from — a settlement for a fresh dispatch, or wherever it had camped. */
    fromNodeId: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface IKingdomBuilderArmyDocument extends IKingdomBuilderArmy, Document {}
export interface IKingdomBuilderArmyModel extends Model<IKingdomBuilderArmyDocument> {}

const UnitsSchema = new Schema<KingdomBuilderGarrison>(
    Object.fromEntries(KINGDOM_BUILDER_UNIT_TYPES.map(unitType => [unitType, { type: Number, required: true, min: 0, default: 0 }])),
    { _id: false },
);

export const KingdomBuilderArmySchema = new Schema<IKingdomBuilderArmyDocument>({
    worldId: { type: Schema.Types.ObjectId, ref: "KingdomBuilderWorld", required: true },
    ownerId: { type: String, required: true },
    units: { type: UnitsSchema, required: true },
    path: { type: [Number], required: true },
    pathCosts: { type: [Number], required: true },
    travelled: { type: Number, required: true, min: 0, default: 0 },
    fromNodeId: { type: String, required: true },
    targetNodeId: { type: String, required: true },
    arrivedAtTick: Number,
    besiegingSince: Number,
}, { timestamps: true });

// A world's own armies — the tick reads the ones still marching, a view the viewer's own.
KingdomBuilderArmySchema.index({ worldId: 1, ownerId: 1 });
KingdomBuilderArmySchema.index({ worldId: 1, arrivedAtTick: 1 });
// The armies camped at a settlement — the sieges on it (§8).
KingdomBuilderArmySchema.index({ worldId: 1, targetNodeId: 1 });

export const KingdomBuilderArmyModel = models.KingdomBuilderArmy
    || model<IKingdomBuilderArmyDocument, IKingdomBuilderArmyModel>("KingdomBuilderArmy", KingdomBuilderArmySchema);
