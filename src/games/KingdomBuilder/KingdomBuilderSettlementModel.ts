import { Document, Model, Schema, Types, model, models } from "mongoose";

export const KINGDOM_BUILDER_GRID_SIZE = 9;
export const KINGDOM_BUILDER_TOWN_CENTRE_INDEX = 4;

export type KingdomBuilderBuildingType = "town-centre" | "lumber-camp" | "quarry" | "mine" | "barracks" | "market" | "walls";

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

export interface IKingdomBuilderSettlement {
    worldId: Types.ObjectId;
    ownerId: string;
    nodeId: string;
    tiles: KingdomBuilderTile[];
    resources: KingdomBuilderResources;
    createdAt: Date;
    updatedAt: Date;
}

export interface IKingdomBuilderSettlementDocument extends IKingdomBuilderSettlement, Document {}
export interface IKingdomBuilderSettlementModel extends Model<IKingdomBuilderSettlementDocument> {}

const BuildingSchema = new Schema({
    type: { type: String, enum: ["town-centre", "lumber-camp", "quarry", "mine", "barracks", "market", "walls"], required: true },
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
    tiles: {
        type: [TileSchema],
        required: true,
        validate: { validator: isValidTileGrid, message: "Settlement tiles must be a complete 3x3 grid with a central town centre" },
    },
    resources: { type: ResourcesSchema, required: true },
}, { timestamps: true });

KingdomBuilderSettlementSchema.index({ worldId: 1, ownerId: 1 }, { unique: true });
KingdomBuilderSettlementSchema.index({ worldId: 1, nodeId: 1 }, { unique: true });

export const KingdomBuilderSettlementModel = models.KingdomBuilderSettlement
    || model<IKingdomBuilderSettlementDocument, IKingdomBuilderSettlementModel>("KingdomBuilderSettlement", KingdomBuilderSettlementSchema);
