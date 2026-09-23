import { Document, Model, Schema, model, models } from "mongoose";

import type { FairnessReport } from "./worldgen/settlementSites";
import type { Landmass, WorldEdge, WorldNode } from "./worldgen/landmass";
import type { OverlayPlacement } from "./worldgen/overlays";
import type { TerrainField } from "./worldgen/terrainField";

/** One player's place in a world (§11.3 PR 8): who, the start site they claimed, and when. */
export interface KingdomBuilderSeat {
    userId: string;
    siteId: string;
    joinedAt: Date;
}

/**
 * Why a world ended (GDD §9.1): its host ended it, its last player left, or an
 * admin cleared it out. A season ending on schedule (PR 26) adds its own.
 */
export const KINGDOM_BUILDER_END_REASONS = ["host", "abandoned", "admin"] as const;
export type KingdomBuilderEndReason = typeof KINGDOM_BUILDER_END_REASONS[number];

export interface IKingdomBuilderWorld {
    seed: string;
    generationAttempt: number;
    landmass: Landmass;
    /**
     * The generated ground (§3.5.2), written once at generation and never
     * updated afterwards — a world generated before this landed simply has
     * none, and is deliberately not backfilled (§3.5.6).
     */
    terrainField?: TerrainField;
    /** The derived, load-bearing overlays (bridges, fords) the connectivity pass wrote (§3.5.3). */
    overlays?: OverlayPlacement[];
    nodes: WorldNode[];
    edges: WorldEdge[];
    fairness: FairnessReport;
    currentTick: number;
    nextTickAt: Date;
    /**
     * Who opened the world, how many seats it holds (§1's ten at most), and
     * who holds them. Absent on a world opened before PR 8 — a world of one,
     * whose only member is the owner of its settlements, and which nobody
     * else can join because no invitation points at it.
     */
    hostId?: string;
    seatCount?: number;
    roster?: KingdomBuilderSeat[];
    /**
     * When the world ended, and why (§9.1). Set once, by one conditional
     * write; from then on the world never ticks, takes no command, lists on
     * no dashboard, and is removed once the retention window has passed.
     */
    endedAt?: Date;
    endReason?: KingdomBuilderEndReason;
    createdAt: Date;
    updatedAt: Date;
}

export interface IKingdomBuilderWorldDocument extends IKingdomBuilderWorld, Document {}
export interface IKingdomBuilderWorldModel extends Model<IKingdomBuilderWorldDocument> {}

const LandmassSchema = new Schema<Landmass>({
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    resolution: { type: Number, required: true },
    values: { type: [Number], required: true },
    landThreshold: { type: Number, required: true },
}, { _id: false });

const WorldNodeSchema = new Schema({
    id: { type: String, required: true },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    // Absent on a world generated before PR 16, which is snapped on read (§3.8).
    tile: Number,
    kind: { type: String, enum: ["terrain", "settlement"], required: true },
    terrain: { type: String, enum: ["forest", "quarry", "ore"] },
    resourceYield: Number,
    siteType: { type: String, enum: ["player-start", "expansion", "barbarian"] },
}, { _id: false });

const WorldEdgeSchema = new Schema<WorldEdge>({
    id: { type: String, required: true },
    from: { type: String, required: true },
    to: { type: String, required: true },
    terrain: { type: String, enum: ["plains", "forest", "hill", "mountain-pass", "river-crossing"], required: true },
    movementCost: { type: Number, required: true, min: 0 },
    chokepoint: { type: Boolean, required: true },
}, { _id: false });

const FairnessSchema = new Schema<FairnessReport>({
    valid: { type: Boolean, required: true },
    scores: { type: Map, of: Number, required: true },
    reasons: { type: [String], required: true },
}, { _id: false });

const TerrainFieldSchema = new Schema<TerrainField>({
    columns: { type: Number, required: true },
    rows: { type: Number, required: true },
    tileSize: { type: Number, required: true },
    codes: { type: String, required: true },
}, { _id: false });

const SeatSchema = new Schema<KingdomBuilderSeat>({
    userId: { type: String, required: true },
    siteId: { type: String, required: true },
    joinedAt: { type: Date, required: true },
}, { _id: false });

const OverlayPlacementSchema = new Schema<OverlayPlacement>({
    tile: { type: Number, required: true },
    code: { type: String, required: true },
    orientation: String,
}, { _id: false });

export const KingdomBuilderWorldSchema = new Schema<IKingdomBuilderWorldDocument>({
    seed: { type: String, required: true },
    generationAttempt: { type: Number, required: true, min: 0 },
    landmass: { type: LandmassSchema, required: true },
    terrainField: { type: TerrainFieldSchema, required: false },
    overlays: { type: [OverlayPlacementSchema], required: false, default: undefined },
    nodes: { type: [WorldNodeSchema], required: true },
    edges: { type: [WorldEdgeSchema], required: true },
    fairness: { type: FairnessSchema, required: true },
    currentTick: { type: Number, required: true, min: 0, default: 0 },
    nextTickAt: { type: Date, required: true, default: Date.now },
    hostId: String,
    seatCount: { type: Number, min: 1, max: 10 },
    roster: { type: [SeatSchema], required: false, default: undefined },
    endedAt: Date,
    endReason: { type: String, enum: KINGDOM_BUILDER_END_REASONS },
}, { timestamps: true });

KingdomBuilderWorldSchema.index({ seed: 1 });
KingdomBuilderWorldSchema.index({ nextTickAt: 1, currentTick: 1 });
// The admin list, newest first (docs/admin-tools.md).
KingdomBuilderWorldSchema.index({ createdAt: -1 });
// The removal sweep's query: only ended worlds carry the field, so only they are indexed.
KingdomBuilderWorldSchema.index({ endedAt: 1 }, { partialFilterExpression: { endedAt: { $exists: true } } });

export const KingdomBuilderWorldModel = models.KingdomBuilderWorld
    || model<IKingdomBuilderWorldDocument, IKingdomBuilderWorldModel>("KingdomBuilderWorld", KingdomBuilderWorldSchema);
