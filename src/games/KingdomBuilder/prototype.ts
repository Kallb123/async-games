import mongoose, { Types, type ClientSession } from "mongoose";

import {
    KINGDOM_BUILDER_BUILDING_TYPES,
    KINGDOM_BUILDER_TOWN_CENTRE_INDEX,
    KingdomBuilderSettlementModel,
    type KingdomBuilderBuildingType,
    type KingdomBuilderResources,
    type KingdomBuilderTile,
} from "./KingdomBuilderSettlementModel";
import { KingdomBuilderArmyModel } from "./KingdomBuilderArmyModel";
import { KingdomBuilderWorldModel } from "./KingdomBuilderWorldModel";
import {
    KINGDOM_BUILDER_BUILDING_PRODUCES,
    KINGDOM_BUILDER_PROTOTYPE_BUILDINGS,
    KINGDOM_BUILDER_UPGRADABLE_BUILDINGS,
    buildTicksFor,
    buildingCostFor,
    buildingLevelOf,
    tavernLevelCapFor,
    type KingdomBuilderPrototypeBuilding,
    type KingdomBuilderUpgradableBuilding,
} from "./buildings";
import { siegesOn } from "./besiegers";
import { commanderCapacityOf, commandersHeld } from "./commanders";
import { catchmentOfSettlement } from "./land";
import type { KingdomBuilderSiege } from "./siege";
import { KINGDOM_BUILDER_CARAVAN_COST, KINGDOM_BUILDER_MAX_AMOUNT, depositTo, exchangeRateFor, isResourceType, marketLevelOf, spendFrom } from "./market";
import { canAfford, resourcesOf } from "./resources";
import {
    KINGDOM_BUILDER_TRAINING_QUEUE_LIMIT,
    KINGDOM_BUILDER_UNITS,
    garrisonOf,
    isUnitType,
    trainingLevelFor,
    trainingTicksFor,
    type KingdomBuilderGarrison,
    type KingdomBuilderTrainingOrder,
} from "./units";
import type { KingdomBuilderCatchment } from "./worldgen/catchment";
import { completedBuildLevels } from "./worldSummaryTypes";

export interface KingdomBuilderSettlementView {
    worldId: string;
    settlementId: string;
    nodeId: string;
    currentTick: number;
    nextTickAt: string;
    completedBuildLevels: number;
    resources: KingdomBuilderResources;
    /** How well the settlement's land yields each resource (§4.6). Anyone could work it out from the public map; it is here so the screen needn't. */
    catchment: KingdomBuilderCatchment;
    tiles: Array<{
        position: number;
        building?: { type: KingdomBuilderBuildingType; level: number };
        construction?: { buildingType: KingdomBuilderBuildingType; targetLevel: number; ticksRemaining: number };
    }>;
    /** The barracks' queue, head first — the head is the unit in training. */
    trainingQueue: KingdomBuilderTrainingOrder[];
    garrison: KingdomBuilderGarrison;
    /** Caravans standing empty at its market (PR 25). */
    caravans: number;
    /** The siege on it (§8), if another player's army is camped there. */
    siege?: KingdomBuilderSiege;
}

export class KingdomBuilderPrototypeError extends Error {
    constructor(
        public readonly code: "INVALID_INPUT" | "NOT_FOUND" | "FORBIDDEN" | "QUEUE_BUSY" | "TILE_OCCUPIED" | "NO_BARRACKS" | "NO_MARKET" | "LOCKED" | "CANNOT_AFFORD" | "NO_YIELD",
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

/** No command lands on an ended world (GDD §9.1) — it reads as gone, like a missing one. */
async function assertWorldLive(worldId: string) {
    if (!await KingdomBuilderWorldModel.exists({ _id: worldId, endedAt: null })) {
        throw new KingdomBuilderPrototypeError("NOT_FOUND", "World not found");
    }
}

export async function settlementView(worldId: string, settlementId: string, userId: string): Promise<KingdomBuilderSettlementView> {
    validateIds(worldId, settlementId);
    const settlement = await KingdomBuilderSettlementModel.findOne({ _id: settlementId, worldId }).lean();
    if (!settlement) throw new KingdomBuilderPrototypeError("NOT_FOUND", "Settlement not found");
    if (settlement.ownerId !== userId) throw new KingdomBuilderPrototypeError("FORBIDDEN", "This settlement belongs to another player");

    const world = await KingdomBuilderWorldModel.findById(worldId).select({ currentTick: 1, nextTickAt: 1, endedAt: 1 }).lean();
    if (!world || world.endedAt) throw new KingdomBuilderPrototypeError("NOT_FOUND", "World not found");
    const [ownerSettlements, catchment, sieges] = await Promise.all([
        KingdomBuilderSettlementModel.find({ worldId, ownerId: userId }).select({ tiles: 1 }).lean(),
        catchmentOfSettlement(worldId, settlement),
        siegesOn(worldId, [settlement]),
    ]);
    const siege = sieges.get(settlement.nodeId);

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
        resources: resourcesOf(settlement.resources),
        catchment,
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
        trainingQueue: (settlement.trainingQueue ?? []).map(({ unitType, ticksRemaining, orderId }: KingdomBuilderTrainingOrder) => ({
            unitType, ticksRemaining, ...(orderId ? { orderId } : {}),
        })),
        garrison: garrisonOf(settlement.garrison),
        caravans: settlement.caravans ?? 0,
        ...(siege ? { siege } : {}),
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
    // The town centre is never built, only raised a level where it stands (PR 24).
    const isTownCentre = buildingType === "town-centre" && tilePosition === KINGDOM_BUILDER_TOWN_CENTRE_INDEX;
    if (!isTownCentre && (!Number.isInteger(tilePosition) || tilePosition < 0 || tilePosition > 8 || tilePosition === KINGDOM_BUILDER_TOWN_CENTRE_INDEX
        || !KINGDOM_BUILDER_PROTOTYPE_BUILDINGS.includes(buildingType as KingdomBuilderPrototypeBuilding))) {
        throw new KingdomBuilderPrototypeError("INVALID_INPUT", "Choose an empty outer tile and a production building");
    }
    const type = buildingType as KingdomBuilderUpgradableBuilding;
    await assertWorldLive(worldId);

    const existing = await KingdomBuilderSettlementModel.findOne({ _id: settlementId, worldId })
        .select({ ownerId: 1, nodeId: 1, construction: 1, tiles: 1, resources: 1, catchment: 1 })
        .lean();
    if (!existing) throw new KingdomBuilderPrototypeError("NOT_FOUND", "Settlement not found");
    if (existing.ownerId !== userId) throw new KingdomBuilderPrototypeError("FORBIDDEN", "This settlement belongs to another player");
    if (existing.construction) throw new KingdomBuilderPrototypeError("QUEUE_BUSY", "Finish the current building first");

    // The barracks, the market, the tavern and the town centre are the buildings a player
    // can raise a level (§4.2), and a settlement holds only one of each, so
    // each level has one home and the market one rate.
    const maxLevel = KINGDOM_BUILDER_UPGRADABLE_BUILDINGS[type];
    const current = existing.tiles.find((tile: KingdomBuilderTile) => tile.position === tilePosition)?.building;
    const upgrading = maxLevel !== undefined && current?.type === buildingType;
    if (current && !upgrading) throw new KingdomBuilderPrototypeError("TILE_OCCUPIED", "That tile already has a building");
    if (upgrading && current.level >= maxLevel) {
        throw new KingdomBuilderPrototypeError("TILE_OCCUPIED", `The ${buildingType} is already at its highest level`);
    }
    if (!current && maxLevel !== undefined && buildingLevelOf(existing.tiles, type) > 0) {
        throw new KingdomBuilderPrototypeError("TILE_OCCUPIED", `This settlement already has a ${buildingType}`);
    }

    // Land that yields none of a building's resource can't hold it (§4.6).
    // The tiers never change once stored, so the write below needn't repeat this.
    const produces = KINGDOM_BUILDER_BUILDING_PRODUCES[type];
    if (produces && (await catchmentOfSettlement(worldId, existing))[produces] === "none") {
        throw new KingdomBuilderPrototypeError("NO_YIELD", `There is no ${produces} in this settlement's land`);
    }

    const targetLevel = upgrading ? current.level + 1 : 1;
    // A tavern never stands above its town centre's built level (§6.5).
    if (type === "tavern" && targetLevel > tavernLevelCapFor(existing.tiles)) {
        throw new KingdomBuilderPrototypeError("LOCKED", `Raise the town centre to level ${targetLevel} first`);
    }
    const cost = buildingCostFor(type, targetLevel);
    if (!canAfford(resourcesOf(existing.resources), cost)) {
        throw new KingdomBuilderPrototypeError("CANNOT_AFFORD", "Not enough resources to build that");
    }
    const { filter: canPay, $inc } = spendFrom(cost);
    const onTile = upgrading
        ? { tiles: { $elemMatch: { position: tilePosition, "building.type": buildingType, "building.level": current.level } } }
        : {
            tiles: { $elemMatch: { position: tilePosition, building: { $exists: false } } },
            ...(maxLevel !== undefined ? { "tiles.building.type": { $ne: buildingType } } : {}),
        };
    const updated = await KingdomBuilderSettlementModel.findOneAndUpdate(
        {
            _id: settlementId,
            worldId,
            ownerId: userId,
            construction: { $exists: false },
            // The tavern's cap is repeated here, so a town centre that changed since the read can't be built past.
            ...(type === "tavern"
                ? { $and: [onTile, { tiles: { $elemMatch: { "building.type": "town-centre", "building.level": { $gte: targetLevel } } } }] }
                : onTile),
            ...canPay,
        },
        { $set: { construction: { tilePosition, buildingType, targetLevel, ticksRemaining: buildTicksFor(targetLevel) } }, $inc },
        { new: true },
    ).lean();
    if (!updated) throw new KingdomBuilderPrototypeError("QUEUE_BUSY", "The settlement changed before this building could be queued");

    return settlementView(worldId, settlementId, userId);
}

/**
 * Queues one unit where it trains — a soldier at the barracks, a settler at the
 * town centre (PR 24), a commander at the tavern (PR 26) — paying its whole
 * cost up front (§4.3). All of them join the settlement's one training queue.
 */
export async function queueUnitTraining(
    worldId: string,
    settlementId: string,
    userId: string,
    unitType: unknown,
): Promise<KingdomBuilderSettlementView> {
    validateIds(worldId, settlementId);
    if (!isUnitType(unitType)) throw new KingdomBuilderPrototypeError("INVALID_INPUT", "Choose a unit to train");
    await assertWorldLive(worldId);

    const existing = await KingdomBuilderSettlementModel.findOne({ _id: settlementId, worldId })
        .select({ ownerId: 1, tiles: 1, resources: 1, trainingQueue: 1 })
        .lean();
    if (!existing) throw new KingdomBuilderPrototypeError("NOT_FOUND", "Settlement not found");
    if (existing.ownerId !== userId) throw new KingdomBuilderPrototypeError("FORBIDDEN", "This settlement belongs to another player");
    const unit = KINGDOM_BUILDER_UNITS[unitType];
    const { building } = unit.trainedAt;
    const buildingName = building.replace("-", " ");
    const level = trainingLevelFor(unitType, existing.tiles);
    if (level === 0) throw new KingdomBuilderPrototypeError("NO_BARRACKS", `Build a ${buildingName} first`);
    const ticksRemaining = trainingTicksFor(unitType, level);
    if (ticksRemaining === null) {
        throw new KingdomBuilderPrototypeError("LOCKED", `${unit.name} needs a level ${unit.trainedAt.level} ${buildingName}`);
    }
    if ((existing.trainingQueue?.length ?? 0) >= KINGDOM_BUILDER_TRAINING_QUEUE_LIMIT) {
        throw new KingdomBuilderPrototypeError("QUEUE_BUSY", "The training queue is full");
    }
    if (!canAfford(resourcesOf(existing.resources), unit.cost)) {
        throw new KingdomBuilderPrototypeError("CANNOT_AFFORD", `Not enough resources to train ${unit.name.toLowerCase()}`);
    }

    // Every check above is repeated in the filter, so a tick or a second tab
    // landing in between fails this write rather than overdrawing the stores,
    // overfilling the queue, or pricing the unit at a level it lost.
    const { filter: canPay, $inc } = spendFrom(unit.cost);
    const queue = async (session?: ClientSession) => {
        const updated = await KingdomBuilderSettlementModel.findOneAndUpdate(
            {
                _id: settlementId,
                worldId,
                ownerId: userId,
                tiles: { $elemMatch: { "building.type": building, "building.level": level } },
                [`trainingQueue.${KINGDOM_BUILDER_TRAINING_QUEUE_LIMIT - 1}`]: { $exists: false },
                ...canPay,
            },
            {
                $inc,
                $push: { trainingQueue: { unitType, ticksRemaining, orderId: new Types.ObjectId().toString() } },
            },
            session ? { new: true, session } : { new: true },
        ).lean();
        if (!updated) throw new KingdomBuilderPrototypeError("QUEUE_BUSY", "The settlement changed before this unit could be queued");
    };
    if (unitType === "commander") await mongoose.connection.transaction(async session => recruitCommander(worldId, userId, session, queue));
    else await queue();

    return settlementView(worldId, settlementId, userId);
}

/**
 * Queues a commander only while the player holds fewer than their taverns
 * allow (§6.5) — counted across the whole realm, since a commander marches
 * between towns. The transaction writes the world first, as a dispatch does,
 * so two recruits at once (two tabs, or two towns) conflict and the one
 * retried counts the other's commander; so do a tick and a dispatch, which
 * move commanders between the places counted.
 */
async function recruitCommander(worldId: string, userId: string, session: ClientSession, queue: (session: ClientSession) => Promise<void>) {
    const live = await KingdomBuilderWorldModel.updateOne({ _id: worldId, endedAt: null }, { $inc: { commandersRecruited: 1 } }, { session });
    if (live.modifiedCount !== 1) throw new KingdomBuilderPrototypeError("NOT_FOUND", "World not found");
    // One after the other: a transaction's operations don't run side by side.
    const settlements = await KingdomBuilderSettlementModel.find({ worldId, ownerId: userId })
        .select({ tiles: 1, garrison: 1, trainingQueue: 1 }).session(session).lean();
    const armies = await KingdomBuilderArmyModel.find({ worldId, ownerId: userId }).select({ units: 1 }).session(session).lean();
    const capacity = commanderCapacityOf(settlements);
    if (commandersHeld({ settlements, armies }) >= capacity) {
        throw new KingdomBuilderPrototypeError("LOCKED", `All ${capacity} commanders recruited — raise a tavern to recruit another`);
    }
    await queue(session);
}

/**
 * Takes one unit back out of the training queue — the one in training
 * included — and refunds its whole cost, since it was paid for in full when
 * it was queued. The order is named by its id, so a retried request or a
 * second tab can't take out a second, identical unit queued behind it.
 */
export async function cancelUnitTraining(
    worldId: string,
    settlementId: string,
    userId: string,
    orderId: unknown,
): Promise<KingdomBuilderSettlementView> {
    validateIds(worldId, settlementId);
    if (typeof orderId !== "string" || !Types.ObjectId.isValid(orderId)) {
        throw new KingdomBuilderPrototypeError("INVALID_INPUT", "Choose a unit in the queue to cancel");
    }
    await assertWorldLive(worldId);

    const existing = await KingdomBuilderSettlementModel.findOne({ _id: settlementId, worldId })
        .select({ ownerId: 1, trainingQueue: 1 })
        .lean();
    if (!existing) throw new KingdomBuilderPrototypeError("NOT_FOUND", "Settlement not found");
    if (existing.ownerId !== userId) throw new KingdomBuilderPrototypeError("FORBIDDEN", "This settlement belongs to another player");
    const order: KingdomBuilderTrainingOrder | undefined = existing.trainingQueue?.find((queued: KingdomBuilderTrainingOrder) => queued.orderId === orderId);
    if (!order) throw new KingdomBuilderPrototypeError("QUEUE_BUSY", "That unit is no longer in the queue");

    // The filter repeats the order, so one that finished training in between
    // fails this write rather than being refunded after it joined the garrison.
    const updated = await KingdomBuilderSettlementModel.findOneAndUpdate(
        { _id: settlementId, worldId, ownerId: userId, trainingQueue: { $elemMatch: { orderId, unitType: order.unitType } } },
        { $pull: { trainingQueue: { orderId } }, $inc: depositTo(KINGDOM_BUILDER_UNITS[order.unitType].cost) },
        { new: true },
    ).lean();
    if (!updated) throw new KingdomBuilderPrototypeError("QUEUE_BUSY", "That unit is no longer in the queue");

    return settlementView(worldId, settlementId, userId);
}

/** Reads the caller's own settlement for a market command, refusing anyone else's and a settlement with no market. */
async function ownMarket(worldId: string, settlementId: string, userId: string) {
    await assertWorldLive(worldId);
    const existing = await KingdomBuilderSettlementModel.findOne({ _id: settlementId, worldId })
        .select({ ownerId: 1, tiles: 1, resources: 1 })
        .lean();
    if (!existing) throw new KingdomBuilderPrototypeError("NOT_FOUND", "Settlement not found");
    if (existing.ownerId !== userId) throw new KingdomBuilderPrototypeError("FORBIDDEN", "This settlement belongs to another player");
    const marketLevel = marketLevelOf(existing.tiles);
    if (marketLevel === 0) throw new KingdomBuilderPrototypeError("NO_MARKET", "Build a market first");
    return { resources: resourcesOf(existing.resources), marketLevel };
}

/**
 * Converts one resource into another at the settlement's market (§4.3): `amount`
 * of `get` for the market's rate × `amount` of `give`. The rate is read at the
 * market's level, and the write repeats that level and the stores, so an
 * upgrade finishing or a second tab in between fails it rather than pricing it
 * at the wrong rate or overdrawing.
 */
export async function exchangeAtMarket(
    worldId: string,
    settlementId: string,
    userId: string,
    request: { give: unknown; get: unknown; amount: unknown },
): Promise<KingdomBuilderSettlementView> {
    validateIds(worldId, settlementId);
    const { give, get, amount } = request;
    if (!isResourceType(give) || !isResourceType(get) || give === get) {
        throw new KingdomBuilderPrototypeError("INVALID_INPUT", "Choose two different resources to exchange");
    }
    if (!Number.isSafeInteger(amount) || (amount as number) < 1 || (amount as number) > KINGDOM_BUILDER_MAX_AMOUNT) {
        throw new KingdomBuilderPrototypeError("INVALID_INPUT", "Choose how much to exchange for");
    }
    const { resources, marketLevel } = await ownMarket(worldId, settlementId, userId);
    const cost = exchangeRateFor(marketLevel)! * (amount as number);
    if (resources[give] < cost) throw new KingdomBuilderPrototypeError("CANNOT_AFFORD", `Not enough ${give} to exchange`);

    const updated = await KingdomBuilderSettlementModel.findOneAndUpdate(
        {
            _id: settlementId, worldId, ownerId: userId,
            tiles: { $elemMatch: { "building.type": "market", "building.level": marketLevel } },
            [`resources.${give}`]: { $gte: cost },
        },
        { $inc: { [`resources.${give}`]: -cost, [`resources.${get}`]: amount as number } },
        { new: true },
    ).lean();
    if (!updated) throw new KingdomBuilderPrototypeError("QUEUE_BUSY", "The settlement changed before the exchange went through");
    return settlementView(worldId, settlementId, userId);
}

/** Buys a caravan at the settlement's market (PR 25), paid in full at once; it stands empty there until it is loaded and sent. */
export async function buyCaravan(worldId: string, settlementId: string, userId: string): Promise<KingdomBuilderSettlementView> {
    validateIds(worldId, settlementId);
    const { resources } = await ownMarket(worldId, settlementId, userId);
    if (!canAfford(resources, KINGDOM_BUILDER_CARAVAN_COST)) {
        throw new KingdomBuilderPrototypeError("CANNOT_AFFORD", "Not enough resources for a caravan");
    }
    const { filter: canPay, $inc } = spendFrom(KINGDOM_BUILDER_CARAVAN_COST);
    const updated = await KingdomBuilderSettlementModel.findOneAndUpdate(
        { _id: settlementId, worldId, ownerId: userId, "tiles.building.type": "market", ...canPay },
        { $inc: { ...$inc, caravans: 1 } },
        { new: true },
    ).lean();
    if (!updated) throw new KingdomBuilderPrototypeError("QUEUE_BUSY", "The settlement changed before the caravan could be bought");
    return settlementView(worldId, settlementId, userId);
}
