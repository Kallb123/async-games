import { Document, Model, Schema, Types, model, models } from "mongoose";

export const KINGDOM_BUILDER_GRID_SIZE = 9;
export const KINGDOM_BUILDER_TOWN_CENTRE_INDEX = 4;

export const KINGDOM_BUILDER_BUILDING_TYPES = ["town-centre", "lumber-camp", "quarry", "mine", "barracks", "market", "walls"] as const;
export type KingdomBuilderBuildingType = typeof KINGDOM_BUILDER_BUILDING_TYPES[number];

export interface KingdomBuilderTile {
    position: number;
    building?: {
        type: KingdomBuilderBuildingType;
        level: number;
    };
}

export interface KingdomBuilderResources {
    wood: number;
    stone: number;
    iron: number;
}

export interface KingdomBuilderConstruction {
    tilePosition: number;
    buildingType: KingdomBuilderBuildingType;
    targetLevel: number;
    ticksRemaining: number;
}

export interface IKingdomBuilderSettlement {
    worldId: Types.ObjectId;
    ownerId: string;
    nodeId: string;
    /** Absent on Milestone A documents; Mongoose's default reads those as the first slot. */
    settlementNumber?: number;
    tiles: KingdomBuilderTile[];
    resources: KingdomBuilderResources;
    construction?: KingdomBuilderConstruction;
    createdAt: Date;
    updatedAt: Date;
}

export interface IKingdomBuilderSettlementDocument extends IKingdomBuilderSettlement, Document {}
export interface IKingdomBuilderSettlementModel extends Model<IKingdomBuilderSettlementDocument> {}

const BuildingSchema = new Schema({
    type: { type: String, enum: KINGDOM_BUILDER_BUILDING_TYPES, required: true },
    level: { type: Number, required: true, min: 1 },
}, { _id: false });

const TileSchema = new Schema<KingdomBuilderTile>({
    position: { type: Number, required: true, min: 0, max: KINGDOM_BUILDER_GRID_SIZE - 1 },
    building: BuildingSchema,
}, { _id: false });

const ResourcesSchema = new Schema<KingdomBuilderResources>({
    wood: { type: Number, required: true, min: 0, default: 0 },
    stone: { type: Number, required: true, min: 0, default: 0 },
    iron: { type: Number, required: true, min: 0, default: 0 },
}, { _id: false });

const ConstructionSchema = new Schema<KingdomBuilderConstruction>({
    tilePosition: { type: Number, required: true, min: 0, max: KINGDOM_BUILDER_GRID_SIZE - 1 },
    buildingType: { type: String, enum: KINGDOM_BUILDER_BUILDING_TYPES, required: true },
    targetLevel: { type: Number, required: true, min: 1 },
    ticksRemaining: { type: Number, required: true, min: 1 },
}, { _id: false });

function isValidTileGrid(tiles: KingdomBuilderTile[]): boolean {
    if (tiles.length !== KINGDOM_BUILDER_GRID_SIZE) return false;
    if (new Set(tiles.map(({ position }) => position)).size !== KINGDOM_BUILDER_GRID_SIZE) return false;
    const centre = tiles.find(({ position }) => position === KINGDOM_BUILDER_TOWN_CENTRE_INDEX);
    return centre?.building?.type === "town-centre";
}

export const KingdomBuilderSettlementSchema = new Schema<IKingdomBuilderSettlementDocument>({
    worldId: { type: Schema.Types.ObjectId, ref: "KingdomBuilderWorld", required: true },
    ownerId: { type: String, required: true },
    nodeId: { type: String, required: true },
    settlementNumber: { type: Number, required: true, min: 0, max: 1, default: 0 },
    tiles: {
        type: [TileSchema],
        required: true,
        validate: { validator: isValidTileGrid, message: "Settlement tiles must be a complete 3x3 grid with a central town centre" },
    },
    resources: { type: ResourcesSchema, required: true },
    construction: ConstructionSchema,
}, { timestamps: true });

KingdomBuilderSettlementSchema.index({ ownerId: 1, worldId: 1 });
KingdomBuilderSettlementSchema.index({ worldId: 1, nodeId: 1 }, { unique: true });
KingdomBuilderSettlementSchema.index({ worldId: 1, ownerId: 1, settlementNumber: 1 }, { unique: true });

export const KingdomBuilderSettlementModel = models.KingdomBuilderSettlement
    || model<IKingdomBuilderSettlementDocument, IKingdomBuilderSettlementModel>("KingdomBuilderSettlement", KingdomBuilderSettlementSchema);

let multipleSettlementsIndexReady: Promise<void> | undefined;

/** Removes Milestone A's one-settlement-per-owner index once per process. */
export function prepareMultipleSettlementsIndex(): Promise<void> {
    multipleSettlementsIndexReady ??= KingdomBuilderSettlementModel.collection
        .dropIndex("worldId_1_ownerId_1")
        .then(() => undefined)
        .catch((error: unknown) => {
            if (typeof error === "object" && error !== null && "codeName" in error && error.codeName === "IndexNotFound") return;
            multipleSettlementsIndexReady = undefined;
            throw error;
        });
    return multipleSettlementsIndexReady;
}
