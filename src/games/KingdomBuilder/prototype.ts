import { Types } from "mongoose";

import {
    KINGDOM_BUILDER_BUILDING_TYPES,
    KINGDOM_BUILDER_TOWN_CENTRE_INDEX,
    KingdomBuilderSettlementModel,
    type KingdomBuilderBuildingType,
    type KingdomBuilderTile,
} from "./KingdomBuilderSettlementModel";
import { KingdomBuilderWorldModel } from "./KingdomBuilderWorldModel";
import { completedBuildLevels } from "./worldSummaryTypes";

export const KINGDOM_BUILDER_PROTOTYPE_BUILDINGS = ["lumber-camp", "quarry", "mine"] as const;
export type KingdomBuilderPrototypeBuilding = typeof KINGDOM_BUILDER_PROTOTYPE_BUILDINGS[number];
export const KINGDOM_BUILDER_PROTOTYPE_BUILD_TICKS = 2;

export interface KingdomBuilderSettlementView {
    worldId: string;
    settlementId: string;
    nodeId: string;
    currentTick: number;
    nextTickAt: string;
    completedBuildLevels: number;
    resources: { wood: number; stone: number; iron: number };
    tiles: Array<{
        position: number;
        building?: { type: KingdomBuilderBuildingType; level: number };
        construction?: { buildingType: KingdomBuilderBuildingType; ticksRemaining: number };
    }>;
}

export class KingdomBuilderPrototypeError extends Error {
    constructor(
        public readonly code: "INVALID_INPUT" | "NOT_FOUND" | "FORBIDDEN" | "QUEUE_BUSY" | "TILE_OCCUPIED",
        message: string,
    ) {
        super(message);
        this.name = "KingdomBuilderPrototypeError";
    }
}

function validateIds(worldId: string, settlementId: string) {
    if (!Types.ObjectId.isValid(worldId) || !Types.ObjectId.isValid(settlementId)) {
        throw new KingdomBuilderPrototypeError("INVALID_INPUT", "A valid world and settlement are required");
    }
}

export async function settlementView(worldId: string, settlementId: string, userId: string): Promise<KingdomBuilderSettlementView> {
    validateIds(worldId, settlementId);
    const settlement = await KingdomBuilderSettlementModel.findOne({ _id: settlementId, worldId }).lean();
    if (!settlement) throw new KingdomBuilderPrototypeError("NOT_FOUND", "Settlement not found");
    if (settlement.ownerId !== userId) throw new KingdomBuilderPrototypeError("FORBIDDEN", "This settlement belongs to another player");

    const world = await KingdomBuilderWorldModel.findById(worldId).select({ currentTick: 1, nextTickAt: 1 }).lean();
    if (!world) throw new KingdomBuilderPrototypeError("NOT_FOUND", "World not found");
    const ownerSettlements = await KingdomBuilderSettlementModel.find({ worldId, ownerId: userId })
        .select({ tiles: 1 })
        .lean();

    return {
        worldId,
        settlementId,
        nodeId: settlement.nodeId,
        currentTick: world.currentTick,
        nextTickAt: world.nextTickAt.toISOString(),
        completedBuildLevels: ownerSettlements.reduce(
            (total, ownerSettlement) => total + completedBuildLevels(ownerSettlement.tiles ?? []),
            0,
        ),
        resources: settlement.resources,
        tiles: settlement.tiles.map((tile: KingdomBuilderTile) => ({
            position: tile.position,
            ...(tile.building ? { building: tile.building } : {}),
            ...(settlement.construction?.tilePosition === tile.position
                ? { construction: {
                    buildingType: settlement.construction.buildingType,
                    ticksRemaining: settlement.construction.ticksRemaining,
                } }
                : {}),
        })),
    };
}

export async function queuePrototypeBuilding(
    worldId: string,
    settlementId: string,
    userId: string,
    tilePosition: number,
    buildingType: string,
): Promise<KingdomBuilderSettlementView> {
    validateIds(worldId, settlementId);
    if (!Number.isInteger(tilePosition) || tilePosition < 0 || tilePosition > 8 || tilePosition === KINGDOM_BUILDER_TOWN_CENTRE_INDEX
        || !KINGDOM_BUILDER_PROTOTYPE_BUILDINGS.includes(buildingType as KingdomBuilderPrototypeBuilding)) {
        throw new KingdomBuilderPrototypeError("INVALID_INPUT", "Choose an empty outer tile and a production building");
    }

    const existing = await KingdomBuilderSettlementModel.findOne({ _id: settlementId, worldId })
        .select({ ownerId: 1, construction: 1, tiles: 1 })
        .lean();
    if (!existing) throw new KingdomBuilderPrototypeError("NOT_FOUND", "Settlement not found");
    if (existing.ownerId !== userId) throw new KingdomBuilderPrototypeError("FORBIDDEN", "This settlement belongs to another player");
    if (existing.construction) throw new KingdomBuilderPrototypeError("QUEUE_BUSY", "Finish the current building first");
    if (existing.tiles.find((tile: KingdomBuilderTile) => tile.position === tilePosition)?.building) {
        throw new KingdomBuilderPrototypeError("TILE_OCCUPIED", "That tile already has a building");
    }

    const updated = await KingdomBuilderSettlementModel.findOneAndUpdate(
        {
            _id: settlementId,
            worldId,
            ownerId: userId,
            construction: { $exists: false },
            tiles: { $elemMatch: { position: tilePosition, building: { $exists: false } } },
        },
        { $set: { construction: { tilePosition, buildingType, targetLevel: 1, ticksRemaining: KINGDOM_BUILDER_PROTOTYPE_BUILD_TICKS } } },
        { new: true },
    ).lean();
    if (!updated) throw new KingdomBuilderPrototypeError("QUEUE_BUSY", "The settlement changed before this building could be queued");

    return settlementView(worldId, settlementId, userId);
}
