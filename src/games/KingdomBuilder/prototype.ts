import { Types } from "mongoose";

import {
    KINGDOM_BUILDER_BUILDING_TYPES,
    KINGDOM_BUILDER_TOWN_CENTRE_INDEX,
    KingdomBuilderSettlementModel,
    type KingdomBuilderBuildingType,
    type KingdomBuilderTile,
} from "./KingdomBuilderSettlementModel";
import { KingdomBuilderWorldModel } from "./KingdomBuilderWorldModel";
import {
    KINGDOM_BUILDER_BARRACKS_MAX_LEVEL,
    KINGDOM_BUILDER_TRAINING_QUEUE_LIMIT,
    KINGDOM_BUILDER_UNITS,
    barracksLevelOf,
    garrisonOf,
    isUnitType,
    trainingTicksFor,
    type KingdomBuilderGarrison,
    type KingdomBuilderTrainingOrder,
} from "./units";
import { completedBuildLevels } from "./worldSummaryTypes";

export const KINGDOM_BUILDER_PROTOTYPE_BUILDINGS = ["lumber-camp", "quarry", "mine", "barracks"] as const;
export type KingdomBuilderPrototypeBuilding = typeof KINGDOM_BUILDER_PROTOTYPE_BUILDINGS[number];
export const KINGDOM_BUILDER_PROTOTYPE_BUILD_TICKS = 2;

/** Ticks to raise a building to a level: the first costs the prototype's two, each level after it two more. */
export function buildTicksFor(targetLevel: number): number {
    return KINGDOM_BUILDER_PROTOTYPE_BUILD_TICKS * targetLevel;
}

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
        construction?: { buildingType: KingdomBuilderBuildingType; targetLevel: number; ticksRemaining: number };
    }>;
    /** The barracks' queue, head first — the head is the unit in training. */
    trainingQueue: KingdomBuilderTrainingOrder[];
    garrison: KingdomBuilderGarrison;
}

export class KingdomBuilderPrototypeError extends Error {
    constructor(
        public readonly code: "INVALID_INPUT" | "NOT_FOUND" | "FORBIDDEN" | "QUEUE_BUSY" | "TILE_OCCUPIED" | "NO_BARRACKS" | "LOCKED" | "CANNOT_AFFORD",
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
                    targetLevel: settlement.construction.targetLevel,
                    ticksRemaining: settlement.construction.ticksRemaining,
                } }
                : {}),
        })),
        trainingQueue: (settlement.trainingQueue ?? []).map(({ unitType, ticksRemaining }: KingdomBuilderTrainingOrder) => ({ unitType, ticksRemaining })),
        garrison: garrisonOf(settlement.garrison),
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

    // The barracks is the one building a player can raise a level (§4.2), and
    // a settlement holds only one, so its training queue has one home.
    const current = existing.tiles.find((tile: KingdomBuilderTile) => tile.position === tilePosition)?.building;
    const upgrading = current?.type === "barracks" && buildingType === "barracks";
    if (current && !upgrading) throw new KingdomBuilderPrototypeError("TILE_OCCUPIED", "That tile already has a building");
    if (upgrading && current.level >= KINGDOM_BUILDER_BARRACKS_MAX_LEVEL) {
        throw new KingdomBuilderPrototypeError("TILE_OCCUPIED", "The barracks is already at its highest level");
    }
    if (!current && buildingType === "barracks" && barracksLevelOf(existing.tiles) > 0) {
        throw new KingdomBuilderPrototypeError("TILE_OCCUPIED", "This settlement already has a barracks");
    }

    const targetLevel = upgrading ? current.level + 1 : 1;
    const updated = await KingdomBuilderSettlementModel.findOneAndUpdate(
        {
            _id: settlementId,
            worldId,
            ownerId: userId,
            construction: { $exists: false },
            ...(upgrading
                ? { tiles: { $elemMatch: { position: tilePosition, "building.type": "barracks", "building.level": current.level } } }
                : {
                    tiles: { $elemMatch: { position: tilePosition, building: { $exists: false } } },
                    ...(buildingType === "barracks" ? { "tiles.building.type": { $ne: "barracks" } } : {}),
                }),
        },
        { $set: { construction: { tilePosition, buildingType, targetLevel, ticksRemaining: buildTicksFor(targetLevel) } } },
        { new: true },
    ).lean();
    if (!updated) throw new KingdomBuilderPrototypeError("QUEUE_BUSY", "The settlement changed before this building could be queued");

    return settlementView(worldId, settlementId, userId);
}

/** Queues one unit at the settlement's barracks, paying its whole cost up front (§4.3). */
export async function queueUnitTraining(
    worldId: string,
    settlementId: string,
    userId: string,
    unitType: unknown,
): Promise<KingdomBuilderSettlementView> {
    validateIds(worldId, settlementId);
    if (!isUnitType(unitType)) throw new KingdomBuilderPrototypeError("INVALID_INPUT", "Choose a unit to train");

    const existing = await KingdomBuilderSettlementModel.findOne({ _id: settlementId, worldId })
        .select({ ownerId: 1, tiles: 1, resources: 1, trainingQueue: 1 })
        .lean();
    if (!existing) throw new KingdomBuilderPrototypeError("NOT_FOUND", "Settlement not found");
    if (existing.ownerId !== userId) throw new KingdomBuilderPrototypeError("FORBIDDEN", "This settlement belongs to another player");
    const barracksLevel = barracksLevelOf(existing.tiles);
    if (barracksLevel === 0) throw new KingdomBuilderPrototypeError("NO_BARRACKS", "Build a barracks first");
    const unit = KINGDOM_BUILDER_UNITS[unitType];
    const ticksRemaining = trainingTicksFor(unitType, barracksLevel);
    if (ticksRemaining === null) {
        throw new KingdomBuilderPrototypeError("LOCKED", `${unit.name} needs a level ${unit.barracksLevel} barracks`);
    }
    if ((existing.trainingQueue?.length ?? 0) >= KINGDOM_BUILDER_TRAINING_QUEUE_LIMIT) {
        throw new KingdomBuilderPrototypeError("QUEUE_BUSY", "The barracks' queue is full");
    }
    const { cost } = unit;
    if (existing.resources.wood < cost.wood || existing.resources.stone < cost.stone || existing.resources.iron < cost.iron) {
        throw new KingdomBuilderPrototypeError("CANNOT_AFFORD", `Not enough resources to train ${unit.name.toLowerCase()}`);
    }

    // Every check above is repeated in the filter, so a tick or a second tab
    // landing in between fails this write rather than overdrawing the stores,
    // overfilling the queue, or pricing the unit at a barracks level it lost.
    const updated = await KingdomBuilderSettlementModel.findOneAndUpdate(
        {
            _id: settlementId,
            worldId,
            ownerId: userId,
            tiles: { $elemMatch: { "building.type": "barracks", "building.level": barracksLevel } },
            [`trainingQueue.${KINGDOM_BUILDER_TRAINING_QUEUE_LIMIT - 1}`]: { $exists: false },
            "resources.wood": { $gte: cost.wood },
            "resources.stone": { $gte: cost.stone },
            "resources.iron": { $gte: cost.iron },
        },
        {
            $inc: { "resources.wood": -cost.wood, "resources.stone": -cost.stone, "resources.iron": -cost.iron },
            $push: { trainingQueue: { unitType, ticksRemaining } },
        },
        { new: true },
    ).lean();
    if (!updated) throw new KingdomBuilderPrototypeError("QUEUE_BUSY", "The settlement changed before this unit could be queued");

    return settlementView(worldId, settlementId, userId);
}
