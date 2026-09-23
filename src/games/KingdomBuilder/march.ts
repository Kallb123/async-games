// Sending armies across the map (GDD §6.2, §11.3 PR 19): out of a garrison
// toward any node, or onward from wherever an army is now. Arrival does
// nothing yet beyond camping — or, at one of the owner's own settlements,
// rejoining its garrison (tick.ts).

import mongoose, { Types } from "mongoose";

import { KingdomBuilderArmyModel } from "./KingdomBuilderArmyModel";
import { KingdomBuilderSettlementModel } from "./KingdomBuilderSettlementModel";
import { KingdomBuilderWorldModel } from "./KingdomBuilderWorldModel";
import { KINGDOM_BUILDER_ARMY_LIMIT, armyTile, routeBetween, unitCount, type KingdomBuilderRoute } from "./armies";
import { KingdomBuilderPersistenceError } from "./persistence";
import { KINGDOM_BUILDER_UNIT_TYPES, garrisonOf, isUnitType, type KingdomBuilderGarrison } from "./units";
import { worldView, type KingdomBuilderWorldView } from "./worldView";
import { worldOnTiles } from "./worldTiles";
import { travelGridFor } from "./worldgen/tilePath";

/** What a march order names: where to, and either a garrison to draw from or an army already out. */
export interface KingdomBuilderMarchOrder {
    targetNodeId: unknown;
    settlementId?: unknown;
    units?: unknown;
    armyId?: unknown;
}

function invalid(message: string): KingdomBuilderPersistenceError {
    return new KingdomBuilderPersistenceError("INVALID_INPUT", message);
}

/** A stack named in a request: known unit types only, whole non-negative counts, at least one unit. */
function unitsFrom(value: unknown): KingdomBuilderGarrison {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw invalid("Choose the units to send");
    const entries = Object.entries(value);
    if (entries.some(([unitType, count]) => !isUnitType(unitType) || !Number.isSafeInteger(count) || (count as number) < 0)) {
        throw invalid("Choose the units to send");
    }
    const units = garrisonOf(Object.fromEntries(entries));
    if (unitCount(units) === 0) throw invalid("Send at least one unit");
    return units;
}

/**
 * The world's ground and the tile each node stands on — everything a route
 * is worked out from. A world with no ground (before PR 9) has nothing to
 * march over, and an ended one takes no command (§9.1).
 */
async function marchingGround(worldId: string) {
    const world = await KingdomBuilderWorldModel.findById(worldId)
        .select({ landmass: 1, terrainField: 1, overlays: 1, nodes: 1, edges: 1, endedAt: 1 })
        .lean();
    if (!world || world.endedAt) throw new KingdomBuilderPersistenceError("WORLD_NOT_FOUND", "Kingdom Builder world not found");
    if (!world.terrainField) throw invalid("This world is too old for armies to march across");
    const { nodes } = worldOnTiles(world);
    const grid = travelGridFor(world.terrainField, world.overlays);
    const tileOf = new Map(nodes.map(node => [node.id, node.tile]));
    return {
        tileOf: (nodeId: unknown): number => {
            const tile = typeof nodeId === "string" ? tileOf.get(nodeId) : undefined;
            if (tile === undefined) throw invalid("Choose somewhere on the map to march to");
            return tile;
        },
        route: (from: number, to: number): KingdomBuilderRoute => {
            const route = routeBetween(grid, from, to);
            if (!route) throw new KingdomBuilderPersistenceError("NO_ROUTE", "There is no way across the land to there");
            return route;
        },
    };
}

/**
 * Sends units out of one of the player's garrisons (§6.2) — removed from it
 * for as long as they are away. The garrison is spent and the army created in
 * one transaction, conditional on the garrison still holding every unit, so a
 * second tab or a tick in between can't send the same soldier twice.
 */
async function dispatchFromSettlement(worldId: string, userId: string, order: KingdomBuilderMarchOrder): Promise<void> {
    if (typeof order.settlementId !== "string" || !Types.ObjectId.isValid(order.settlementId)) throw invalid("Choose a settlement to send from");
    const units = unitsFrom(order.units);
    // Whose it is comes first, so a stranger learns nothing about the world from what is refused.
    const settlement = await KingdomBuilderSettlementModel.findOne({ _id: order.settlementId, worldId, ownerId: userId })
        .select({ nodeId: 1, garrison: 1 })
        .lean();
    if (!settlement) throw new KingdomBuilderPersistenceError("SITE_NOT_FOUND", "Settlement not found");
    const ground = await marchingGround(worldId);
    if (order.targetNodeId === settlement.nodeId) throw invalid("Choose somewhere other than the settlement itself");
    const garrison = garrisonOf(settlement.garrison);
    if (KINGDOM_BUILDER_UNIT_TYPES.some(unitType => units[unitType] > garrison[unitType])) {
        throw new KingdomBuilderPersistenceError("ARMY_BUSY", "The garrison doesn't hold that many units");
    }
    const route = ground.route(ground.tileOf(settlement.nodeId), ground.tileOf(order.targetNodeId));
    if (await KingdomBuilderArmyModel.countDocuments({ worldId, ownerId: userId }) >= KINGDOM_BUILDER_ARMY_LIMIT) {
        throw new KingdomBuilderPersistenceError("ARMY_BUSY", `You already have ${KINGDOM_BUILDER_ARMY_LIMIT} armies in the field`);
    }

    const sent = KINGDOM_BUILDER_UNIT_TYPES.filter(unitType => units[unitType] > 0);
    await mongoose.connection.transaction(async session => {
        const spent = await KingdomBuilderSettlementModel.updateOne(
            {
                _id: order.settlementId, worldId, ownerId: userId,
                ...Object.fromEntries(sent.map(unitType => [`garrison.${unitType}`, { $gte: units[unitType] }])),
            },
            { $inc: Object.fromEntries(sent.map(unitType => [`garrison.${unitType}`, -units[unitType]])) },
            { session },
        );
        if (spent.modifiedCount !== 1) {
            throw new KingdomBuilderPersistenceError("ARMY_BUSY", "The garrison changed before the army could set out");
        }
        await KingdomBuilderArmyModel.create([{
            worldId, ownerId: userId, units, ...route, travelled: 0,
            fromNodeId: settlement.nodeId, targetNodeId: order.targetNodeId,
        }], { session });
    });
}

/**
 * Sends an army already in the field somewhere new — onward from a camp, or
 * turned round mid-march from the tile it stands on (any part-spent step is
 * dropped). Conditional on the army being where it was read, so a tick moving
 * it in between fails the order rather than teleporting it back.
 */
async function orderArmy(worldId: string, userId: string, order: KingdomBuilderMarchOrder): Promise<void> {
    if (typeof order.armyId !== "string" || !Types.ObjectId.isValid(order.armyId)) throw invalid("Choose an army");
    const army = await KingdomBuilderArmyModel.findOne({ _id: order.armyId, worldId, ownerId: userId }).lean();
    if (!army) throw new KingdomBuilderPersistenceError("ARMY_NOT_FOUND", "Army not found");
    const ground = await marchingGround(worldId);
    const camped = army.arrivedAtTick !== undefined && army.arrivedAtTick !== null;
    if (camped && order.targetNodeId === army.targetNodeId) throw invalid("The army is already there");
    const route = ground.route(armyTile(army), ground.tileOf(order.targetNodeId));

    const moved = await KingdomBuilderArmyModel.updateOne(
        { _id: order.armyId, worldId, ownerId: userId, travelled: army.travelled, targetNodeId: army.targetNodeId },
        {
            $set: { ...route, travelled: 0, targetNodeId: order.targetNodeId, fromNodeId: camped ? army.targetNodeId : army.fromNodeId },
            $unset: { arrivedAtTick: 1 },
        },
    );
    if (moved.modifiedCount !== 1) throw new KingdomBuilderPersistenceError("ARMY_BUSY", "The army moved before the order reached it");
}

/** A march order from the world map: a fresh army out of a garrison, or new orders for one already out. */
export async function marchArmy(worldId: string, userId: string, order: KingdomBuilderMarchOrder): Promise<KingdomBuilderWorldView> {
    if (!Types.ObjectId.isValid(worldId)) throw invalid("A valid world is required");
    if (typeof order.targetNodeId !== "string" || !order.targetNodeId) throw invalid("Choose somewhere on the map to march to");
    if (order.armyId !== undefined) await orderArmy(worldId, userId, order);
    else await dispatchFromSettlement(worldId, userId, order);
    return worldView(worldId, userId);
}
