import { Document, Model, Schema, Types, model, models } from "mongoose";

import type { KingdomBuilderBattleRound } from "./combat";
import { KingdomBuilderGarrisonSchema } from "./KingdomBuilderSettlementModel";
import type { KingdomBuilderGarrison } from "./units";

/**
 * A battle fought at a siege (GDD §7.6, §8, §11.3 PR 22), kept so both sides
 * can read how it went — the side that didn't start it included, who would
 * otherwise learn of it only from what was left. Each side is told it from
 * their own point of view (`battleReports.ts`); nobody else is told at all.
 */
export interface IKingdomBuilderBattle {
    worldId: Types.ObjectId;
    /** The tick it was fought on. */
    tick: number;
    kind: "push" | "sally";
    /** The settlement's node it was fought at. */
    nodeId: string;
    /** Who fought on each side: the pusher or the sallying garrison's owner attacks. */
    attackerIds: string[];
    defenderIds: string[];
    /** What went in on each side. */
    attacker: KingdomBuilderGarrison;
    defender: KingdomBuilderGarrison;
    rounds: KingdomBuilderBattleRound[];
    createdAt: Date;
    updatedAt: Date;
}

export interface IKingdomBuilderBattleDocument extends IKingdomBuilderBattle, Document {}
export interface IKingdomBuilderBattleModel extends Model<IKingdomBuilderBattleDocument> {}

const RoundSchema = new Schema<KingdomBuilderBattleRound>({
    attacker: { type: KingdomBuilderGarrisonSchema, required: true },
    defender: { type: KingdomBuilderGarrisonSchema, required: true },
}, { _id: false });

export const KingdomBuilderBattleSchema = new Schema<IKingdomBuilderBattleDocument>({
    worldId: { type: Schema.Types.ObjectId, ref: "KingdomBuilderWorld", required: true },
    tick: { type: Number, required: true, min: 0 },
    kind: { type: String, enum: ["push", "sally"], required: true },
    nodeId: { type: String, required: true },
    attackerIds: { type: [String], required: true },
    defenderIds: { type: [String], required: true },
    attacker: { type: KingdomBuilderGarrisonSchema, required: true },
    defender: { type: KingdomBuilderGarrisonSchema, required: true },
    rounds: { type: [RoundSchema], required: true },
}, { timestamps: true });

// A player's latest battles in a world, from either side.
KingdomBuilderBattleSchema.index({ worldId: 1, attackerIds: 1, createdAt: -1 });
KingdomBuilderBattleSchema.index({ worldId: 1, defenderIds: 1, createdAt: -1 });

export const KingdomBuilderBattleModel = models.KingdomBuilderBattle
    || model<IKingdomBuilderBattleDocument, IKingdomBuilderBattleModel>("KingdomBuilderBattle", KingdomBuilderBattleSchema);
