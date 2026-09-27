import { Document, Model, Schema, model, models } from "mongoose";

import type { KingdomBuilderBarbarianVillage } from "./barbarians";
import { KingdomBuilderGarrisonSchema } from "./KingdomBuilderSettlementModel";
import type { FairnessReport } from "./worldgen/settlementSites";
import type { Landmass, WorldEdge, WorldNode } from "./worldgen/landmass";
import type { OverlayPlacement } from "./worldgen/overlays";
import type { TerrainField } from "./worldgen/terrainField";

/**
 * A node as stored. A world generated before PR 16 has no `tile` on its
 * nodes until worldView stands them on one and saves it (§3.8, worldTiles.ts).
 */
export type StoredWorldNode = {
    [Kind in WorldNode["kind"]]: Omit<Extract<WorldNode, { kind: Kind }>, "tile"> & { tile?: number };
}[WorldNode["kind"]];

/** One player's place in a world (§11.3 PR 8): who, the start site they claimed, and when. */
export interface KingdomBuilderSeat {
    userId: string;
    siteId: string;
    joinedAt: Date;
}

/**
 * Why a world ended (GDD §9.1): its host ended it, its last player left, or an
 * admin cleared it out. A season ending on schedule (PR 27) adds its own.
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
    nodes: StoredWorldNode[];
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
    /**
     * How many armies have ever set out (PR 19). Nothing reads it: bumping it is
     * the write that makes two dispatches at once conflict, so the army limit
     * is counted in a transaction that can't miss the other's army. A caravan
     * split off, two stacks joined or a load unloaded (PR 25) bumps it too, so
     * each conflicts with the tick rather than rewriting a stack it has moved.
     */
    armiesDispatched?: number;
    /**
     * How many battles a siege has seen (PR 21), for the same reason: bumping
     * it makes a push or a sally conflict with the tick, a dispatch, or another
     * battle over the same world, rather than fight a garrison that has moved.
     */
    battlesFought?: number;
    /**
     * How many trade offers have been posted, taken or withdrawn (PR 25), for
     * the same reason again: each bumps it, so two posts at once can't both
     * slip under the offer limit, and a trade conflicts with the tick rather
     * than paying into stores the tick is rewriting.
     */
    tradesMade?: number;
    /**
     * How many commanders have been queued at a tavern (PR 26), for the same
     * reason again: each recruit bumps it, so two at once — two tabs, or two
     * towns — can't both slip under the player's commander cap (§6.5).
     */
    commandersRecruited?: number;
    /**
     * The barbarian villages still standing (§3.4, PR 23), each with what is
     * left of its garrison; a village taken or burnt drops out. Absent on a
     * world generated before them, which has no barbarian sites either.
     */
    barbarians?: KingdomBuilderBarbarianVillage[];
    createdAt: Date;
    updatedAt: Date;
}

export interface IKingdomBuilderWorldDocument extends IKingdomBuilderWorld, Document {}
export interface IKingdomBuilderWorldModel extends Model<IKingdomBuilderWorldDocument> {}

/** The canonical member order for current and pre-roster worlds. */
export function kingdomBuilderMemberIds(world: Pick<IKingdomBuilderWorld, "roster" | "hostId">, legacyOwnerIds: string[] = []): string[] {
    const members = world.roster?.map(seat => seat.userId) ?? [];
    if (members.length > 0) return members;
    const legacy = [...new Set(legacyOwnerIds)];
    return legacy.length > 0 ? legacy : world.hostId ? [world.hostId] : [];
}

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
    // Absent on a world generated before PR 16 until worldView re-draws it (§3.8).
    path: { type: [Number], default: undefined },
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

const BarbarianVillageSchema = new Schema<KingdomBuilderBarbarianVillage>({
    nodeId: { type: String, required: true },
    garrison: { type: KingdomBuilderGarrisonSchema, required: true },
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
    armiesDispatched: { type: Number, min: 0 },
    battlesFought: { type: Number, min: 0 },
    tradesMade: { type: Number, min: 0 },
    commandersRecruited: { type: Number, min: 0 },
    barbarians: { type: [BarbarianVillageSchema], required: false, default: undefined },
}, { timestamps: true });

KingdomBuilderWorldSchema.index({ seed: 1 });
KingdomBuilderWorldSchema.index({ nextTickAt: 1, currentTick: 1 });
// The admin list, newest first (docs/admin-tools.md).
KingdomBuilderWorldSchema.index({ createdAt: -1 });
// The removal sweep's query: only ended worlds carry the field, so only they are indexed.
KingdomBuilderWorldSchema.index({ endedAt: 1 }, { partialFilterExpression: { endedAt: { $exists: true } } });

export const KingdomBuilderWorldModel = models.KingdomBuilderWorld
    || model<IKingdomBuilderWorldDocument, IKingdomBuilderWorldModel>("KingdomBuilderWorld", KingdomBuilderWorldSchema);
