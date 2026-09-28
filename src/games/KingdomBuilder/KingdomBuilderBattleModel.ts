import { Document, Model, Schema, Types, model, models } from "mongoose";

import type { KingdomBuilderBattleRound } from "./combat";
import { KingdomBuilderGarrisonSchema } from "./KingdomBuilderSettlementModel";
import type { KingdomBuilderGarrison } from "./units";

/**
 * How a battle came about: a push or a sally at a siege (§8), an army against
 * a barbarian village (§3.4), or a rival's army taking caravans or settlers
 * left with no escort (§4.7) — a raid, which has no rounds, since nobody fights it —
 * or with only scouts to guard them (§6.5), a skirmish, which is fought.
 */
export const KINGDOM_BUILDER_BATTLE_KINDS = ["push", "sally", "barbarian", "raid", "skirmish"] as const;

/** Raids and skirmishes are fought wherever two stacks meet, so one out on the road names no place. */
export const isFieldBattle = (kind: KingdomBuilderBattleKind) => kind === "raid" || kind === "skirmish";
export type KingdomBuilderBattleKind = typeof KINGDOM_BUILDER_BATTLE_KINDS[number];

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
    kind: KingdomBuilderBattleKind;
    /**
     * The settlement's (or village's) node it was fought at — absent only on
     * a raid or skirmish out on the road, which names nowhere (§4.7).
     */
    nodeId?: string;
    /** Who fought on each side: the pusher or the sallying garrison's owner attacks. Barbarians are nobody, so a village's side is empty. */
    attackerIds: string[];
    defenderIds: string[];
    /** What went in on each side, all its owners' together. */
    attacker: KingdomBuilderGarrison;
    defender: KingdomBuilderGarrison;
    /** Each round's losses, side by side. */
    rounds: KingdomBuilderBattleRound[];
    /**
     * What each player who fought brought and kept. A side can be several
     * players — every besieger a sally goes out against — and none of them is
     * told what the others brought (§6.3), so each reads their own from here.
     */
    shares: KingdomBuilderBattleShare[];
    createdAt: Date;
    updatedAt: Date;
}

export interface KingdomBuilderBattleShare {
    ownerId: string;
    sent: KingdomBuilderGarrison;
    left: KingdomBuilderGarrison;
    /** Caravans this player took from the other side, or lost to it (§4.7) — absent when none changed hands. */
    caravansTaken?: number;
    caravansLost?: number;
    /** Settlers taken or lost the same way (PR 24) — absent when none were. */
    settlersTaken?: number;
    settlersLost?: number;
    /** Commanders killed on the road with no escort (PR 26) — on their owner's share only, and absent when none were. */
    commandersLost?: number;
}

export interface IKingdomBuilderBattleDocument extends IKingdomBuilderBattle, Document {}
export interface IKingdomBuilderBattleModel extends Model<IKingdomBuilderBattleDocument> {}

const RoundSchema = new Schema<KingdomBuilderBattleRound>({
    attacker: { type: KingdomBuilderGarrisonSchema, required: true },
    defender: { type: KingdomBuilderGarrisonSchema, required: true },
}, { _id: false });

const ShareSchema = new Schema<KingdomBuilderBattleShare>({
    ownerId: { type: String, required: true },
    sent: { type: KingdomBuilderGarrisonSchema, required: true },
    left: { type: KingdomBuilderGarrisonSchema, required: true },
    caravansTaken: { type: Number, min: 0 },
    caravansLost: { type: Number, min: 0 },
    settlersTaken: { type: Number, min: 0 },
    settlersLost: { type: Number, min: 0 },
    commandersLost: { type: Number, min: 0 },
}, { _id: false });

export const KingdomBuilderBattleSchema = new Schema<IKingdomBuilderBattleDocument>({
    worldId: { type: Schema.Types.ObjectId, ref: "KingdomBuilderWorld", required: true },
    tick: { type: Number, required: true, min: 0 },
    kind: { type: String, enum: KINGDOM_BUILDER_BATTLE_KINDS, required: true },
    nodeId: { type: String, required(this: IKingdomBuilderBattle) { return !isFieldBattle(this.kind); } },
    attackerIds: { type: [String], required: true },
    defenderIds: { type: [String], required: true },
    attacker: { type: KingdomBuilderGarrisonSchema, required: true },
    defender: { type: KingdomBuilderGarrisonSchema, required: true },
    rounds: { type: [RoundSchema], required: true },
    shares: { type: [ShareSchema], required: true },
}, { timestamps: true });

// A player's latest battles in a world, from either side.
KingdomBuilderBattleSchema.index({ worldId: 1, attackerIds: 1, createdAt: -1 });
KingdomBuilderBattleSchema.index({ worldId: 1, defenderIds: 1, createdAt: -1 });

export const KingdomBuilderBattleModel = models.KingdomBuilderBattle
    || model<IKingdomBuilderBattleDocument, IKingdomBuilderBattleModel>("KingdomBuilderBattle", KingdomBuilderBattleSchema);
