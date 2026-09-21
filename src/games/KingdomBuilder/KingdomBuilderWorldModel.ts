import { Document, Model, Schema, model, models } from "mongoose";

import type { FairnessReport } from "./worldgen/settlementSites";
import type { Landmass, WorldEdge, WorldNode } from "./worldgen/landmass";

export interface IKingdomBuilderWorld {
    seed: string;
    generationAttempt: number;
    landmass: Landmass;
    nodes: WorldNode[];
    edges: WorldEdge[];
    fairness: FairnessReport;
    currentTick: number;
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

export const KingdomBuilderWorldSchema = new Schema<IKingdomBuilderWorldDocument>({
    seed: { type: String, required: true },
    generationAttempt: { type: Number, required: true, min: 0 },
    landmass: { type: LandmassSchema, required: true },
    nodes: { type: [WorldNodeSchema], required: true },
    edges: { type: [WorldEdgeSchema], required: true },
    fairness: { type: FairnessSchema, required: true },
    currentTick: { type: Number, required: true, min: 0, default: 0 },
}, { timestamps: true });

KingdomBuilderWorldSchema.index({ seed: 1 });
KingdomBuilderWorldSchema.index({ currentTick: 1, updatedAt: 1 });

export const KingdomBuilderWorldModel = models.KingdomBuilderWorld
    || model<IKingdomBuilderWorldDocument, IKingdomBuilderWorldModel>("KingdomBuilderWorld", KingdomBuilderWorldSchema);
