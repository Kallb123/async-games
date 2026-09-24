// Sending armies across the map (GDD §6.2, §11.3 PR 19): out of a garrison
// toward any node, or onward from wherever an army is now. Arrival does
// nothing yet beyond camping — or, at one of the owner's own settlements,
// rejoining its garrison (tick.ts).
//
// Since PR 25 a stack can take caravans too, loaded from the settlement's
// stores: with units, the caravans are escorted; without, they travel alone.
// Where a stack has camped its caravans can be split off into a stack of
// their own, two stacks can be joined into one, and a load can be unloaded
// into the town it has camped at — a gift, or the other half of a trade.

import mongoose, { Types, type ClientSession } from "mongoose";

import { KingdomBuilderArmyModel } from "./KingdomBuilderArmyModel";
import { KingdomBuilderSettlementModel } from "./KingdomBuilderSettlementModel";
import { KingdomBuilderWorldModel } from "./KingdomBuilderWorldModel";
import { KINGDOM_BUILDER_ARMY_LIMIT, addUnits, armyTile, combineCaravans, isCamped, isEscorted, routeBetween, unitCount, type KingdomBuilderRoute } from "./armies";
import { KINGDOM_BUILDER_NEEDS_COMMANDER, isLeaderless } from "./commanders";
import { amountsFrom, caravanCapacityOf, depositTo, resourceTotal, resourcesIn, spendFrom } from "./market";
import { addResources, resourcesOf } from "./resources";
import type { KingdomBuilderBarbarianVillage } from "./barbarians";
import { KingdomBuilderPersistenceError } from "./persistence";
import { KINGDOM_BUILDER_UNIT_TYPES, garrisonOf, isUnitType, type KingdomBuilderGarrison } from "./units";
import { worldView, type KingdomBuilderWorldView } from "./worldView";
import { worldOnTiles } from "./worldTiles";
import { travelGridFor } from "./worldgen/tilePath";

/** What a march order names: where to, and either a garrison to draw from (and caravans to load there) or an army already out. */
export interface KingdomBuilderMarchOrder {
    targetNodeId: unknown;
    settlementId?: unknown;
    units?: unknown;
    caravans?: unknown;
    cargo?: unknown;
    armyId?: unknown;
}

function invalid(message: string): KingdomBuilderPersistenceError {
    return new KingdomBuilderPersistenceError("INVALID_INPUT", message);
}

/** A stack named in a request: known unit types only, whole non-negative counts. */
function unitsFrom(value: unknown): KingdomBuilderGarrison {
    if (value === undefined) return garrisonOf();
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw invalid("Choose the units to send");
    const entries = Object.entries(value);
    if (entries.some(([unitType, count]) => !isUnitType(unitType) || !Number.isSafeInteger(count) || (count as number) < 0)) {
        throw invalid("Choose the units to send");
    }
    return garrisonOf(Object.fromEntries(entries));
}

/** The caravans a dispatch takes and what it loads on them (PR 25): a whole count, and no more than they carry. */
function caravansFrom(caravans: unknown, cargo: unknown) {
    const count = caravans === undefined ? 0 : caravans;
    if (!Number.isSafeInteger(count) || (count as number) < 0) throw invalid("Choose how many caravans to send");
    const load = amountsFrom(cargo);
    if (!load) throw invalid("Choose what the caravans carry");
    if (resourceTotal(load) > caravanCapacityOf(count as number)) throw invalid("The caravans can't carry that much");
    return { caravans: count as number, cargo: load };
}

/**
 * The world's ground and the tile each node stands on — everything a route
 * is worked out from. A world with no ground (before PR 9) has nothing to
 * march over, and an ended one takes no command (§9.1).
 */
async function marchingGround(worldId: string) {
    const world = await KingdomBuilderWorldModel.findById(worldId)
        .select({ landmass: 1, terrainField: 1, overlays: 1, nodes: 1, edges: 1, endedAt: 1, barbarians: 1 })
        .lean();
    if (!world || world.endedAt) throw new KingdomBuilderPersistenceError("WORLD_NOT_FOUND", "Kingdom Builder world not found");
    if (!world.terrainField) throw invalid("This world is too old for armies to march across");
    const { nodes } = worldOnTiles(world);
    const grid = travelGridFor(world.terrainField, world.overlays);
    const tileOf = new Map(nodes.map(node => [node.id, node.tile]));
    const villages = new Set((world.barbarians ?? []).map((village: KingdomBuilderBarbarianVillage) => village.nodeId));
    return {
        /** Caravans or settlers alone would only be cut down at a barbarian village (§3.4): they don't go. */
        assertCanGo: (escorted: boolean, nodeId: unknown) => {
            if (!escorted && typeof nodeId === "string" && villages.has(nodeId)) {
                throw invalid("Caravans and settlers can't go to a barbarian village without soldiers to guard them");
            }
        },
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
    const { caravans, cargo } = caravansFrom(order.caravans, order.cargo);
    if (unitCount(units) === 0 && caravans === 0) throw invalid("Send at least one unit or caravan");
    // The march rule (§6.5): soldiers leave only behind a commander. Scouts, caravans, settlers and a commander alone go as they are.
    if (isLeaderless({ units })) throw invalid(KINGDOM_BUILDER_NEEDS_COMMANDER);
    // Whose it is comes first, so a stranger learns nothing about the world from what is refused.
    const settlement = await KingdomBuilderSettlementModel.findOne({ _id: order.settlementId, worldId, ownerId: userId })
        .select({ nodeId: 1, garrison: 1, caravans: 1, resources: 1 })
        .lean();
    if (!settlement) throw new KingdomBuilderPersistenceError("SITE_NOT_FOUND", "Settlement not found");
    const ground = await marchingGround(worldId);
    if (order.targetNodeId === settlement.nodeId) throw invalid("Choose somewhere other than the settlement itself");
    const garrison = garrisonOf(settlement.garrison);
    if (KINGDOM_BUILDER_UNIT_TYPES.some(unitType => units[unitType] > garrison[unitType])) {
        throw new KingdomBuilderPersistenceError("ARMY_BUSY", "The garrison doesn't hold that many units");
    }
    if (caravans > (settlement.caravans ?? 0)) throw new KingdomBuilderPersistenceError("ARMY_BUSY", "The market doesn't have that many caravans");
    const stores = resourcesOf(settlement.resources);
    if (resourcesIn(cargo).some(resource => cargo[resource] > stores[resource])) {
        throw new KingdomBuilderPersistenceError("ARMY_BUSY", "The stores don't hold that much to load");
    }
    ground.assertCanGo(isEscorted({ units }), order.targetNodeId);
    const route = ground.route(ground.tileOf(settlement.nodeId), ground.tileOf(order.targetNodeId));

    const sent = KINGDOM_BUILDER_UNIT_TYPES.filter(unitType => units[unitType] > 0);
    const loaded = spendFrom(cargo);
    await mongoose.connection.transaction(async session => {
        // Every dispatch writes the world first, so two at once conflict and
        // the one retried counts the other's army: a count alone, read in two
        // snapshots side by side, would let both through the limit. It also
        // refuses a world that ended since it was read.
        const live = await KingdomBuilderWorldModel.updateOne({ _id: worldId, endedAt: null }, { $inc: { armiesDispatched: 1 } }, { session });
        if (live.modifiedCount !== 1) throw new KingdomBuilderPersistenceError("WORLD_NOT_FOUND", "Kingdom Builder world not found");
        if (await KingdomBuilderArmyModel.countDocuments({ worldId, ownerId: userId }).session(session) >= KINGDOM_BUILDER_ARMY_LIMIT) {
            throw new KingdomBuilderPersistenceError("ARMY_BUSY", `You already have ${KINGDOM_BUILDER_ARMY_LIMIT} armies in the field`);
        }
        const spent = await KingdomBuilderSettlementModel.updateOne(
            {
                _id: order.settlementId, worldId, ownerId: userId,
                ...Object.fromEntries(sent.map(unitType => [`garrison.${unitType}`, { $gte: units[unitType] }])),
                ...(caravans > 0 ? { caravans: { $gte: caravans } } : {}),
                ...loaded.filter,
            },
            {
                $inc: {
                    ...Object.fromEntries(sent.map(unitType => [`garrison.${unitType}`, -units[unitType]])),
                    ...(caravans > 0 ? { caravans: -caravans } : {}),
                    ...loaded.$inc,
                },
            },
            { session },
        );
        if (spent.modifiedCount !== 1) {
            throw new KingdomBuilderPersistenceError("ARMY_BUSY", "The garrison changed before the army could set out");
        }
        await KingdomBuilderArmyModel.create([{
            worldId, ownerId: userId, units, ...route, travelled: 0,
            fromNodeId: settlement.nodeId, targetNodeId: order.targetNodeId,
            ...(caravans > 0 ? { caravans, cargo } : {}),
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
    const camped = isCamped(army);
    if (camped && order.targetNodeId === army.targetNodeId) throw invalid("The army is already there");
    ground.assertCanGo(isEscorted(army), order.targetNodeId);
    // An army that has lost its commander can only come home (§6.5).
    if (isLeaderless(army) && !await KingdomBuilderSettlementModel.exists({ worldId, ownerId: userId, nodeId: order.targetNodeId })) {
        throw invalid("Without a commander this army can only march home");
    }
    const route = ground.route(armyTile(army), ground.tileOf(order.targetNodeId));

    const moved = await KingdomBuilderArmyModel.updateOne(
        { _id: order.armyId, worldId, ownerId: userId, travelled: army.travelled, targetNodeId: army.targetNodeId },
        {
            $set: { ...route, travelled: 0, targetNodeId: order.targetNodeId, fromNodeId: camped ? army.targetNodeId : army.fromNodeId },
            $unset: { arrivedAtTick: 1, besiegingSince: 1 },
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

/**
 * Every change to a stack where it stands claims the world first, as a dispatch
 * does: the tick writes the world too, so a split, a join or an unload can't
 * interleave with one moving or fighting the same stacks — and the stacks it
 * reads inside its transaction are the ones it writes. Refuses an ended world.
 */
export async function inCamp<T>(worldId: string, work: (session: ClientSession) => Promise<T>): Promise<T> {
    return mongoose.connection.transaction(async session => {
        const live = await KingdomBuilderWorldModel.updateOne({ _id: worldId, endedAt: null }, { $inc: { armiesDispatched: 1 } }, { session });
        if (live.modifiedCount !== 1) throw new KingdomBuilderPersistenceError("WORLD_NOT_FOUND", "Kingdom Builder world not found");
        return work(session);
    });
}

/** One of the player's stacks, read inside a camp command's transaction. */
export function campedArmy(worldId: string, userId: string, armyId: unknown, session: ClientSession) {
    if (typeof armyId !== "string" || !Types.ObjectId.isValid(armyId)) throw invalid("Choose an army");
    return KingdomBuilderArmyModel.findOne({ _id: armyId, worldId, ownerId: userId }).session(session).lean();
}

/**
 * Splits an army's caravans off into a stack of their own, camped where it
 * is (PR 25) — to be sent on alone, or to unload at a town the army is
 * besieging and so can't trade with. Not at a barbarian village, where they
 * would stand unguarded in the middle of a fight.
 */
export async function detachCaravans(worldId: string, userId: string, armyId: unknown): Promise<KingdomBuilderWorldView> {
    if (!Types.ObjectId.isValid(worldId)) throw invalid("A valid world is required");
    await inCamp(worldId, async session => {
        const army = await campedArmy(worldId, userId, armyId, session);
        if (!army) throw new KingdomBuilderPersistenceError("ARMY_NOT_FOUND", "Army not found");
        if (!army.caravans) throw invalid("This army has no caravans");
        if (!isEscorted(army)) throw invalid("These caravans are travelling alone already");
        if (!isCamped(army)) throw invalid("Caravans can only leave an army where it has camped");
        const world = await KingdomBuilderWorldModel.findById(worldId).select({ barbarians: 1 }).session(session).lean();
        if (world?.barbarians?.some((village: KingdomBuilderBarbarianVillage) => village.nodeId === army.targetNodeId)) {
            throw invalid("Caravans can't be left unguarded at a barbarian village");
        }
        if (await KingdomBuilderArmyModel.countDocuments({ worldId, ownerId: userId }).session(session) >= KINGDOM_BUILDER_ARMY_LIMIT) {
            throw new KingdomBuilderPersistenceError("ARMY_BUSY", `You already have ${KINGDOM_BUILDER_ARMY_LIMIT} armies in the field`);
        }
        const tile = armyTile(army);
        await KingdomBuilderArmyModel.updateOne({ _id: army._id, worldId }, { $unset: { caravans: 1, cargo: 1 } }, { session });
        await KingdomBuilderArmyModel.create([{
            worldId, ownerId: userId, units: garrisonOf(), caravans: army.caravans, cargo: resourcesOf(army.cargo),
            path: [tile], pathCosts: [0], travelled: 0,
            fromNodeId: army.targetNodeId, targetNodeId: army.targetNodeId, arrivedAtTick: army.arrivedAtTick,
        }], { session });
    });
    return worldView(worldId, userId);
}

/**
 * Joins one of the player's stacks into another camped at the same place
 * (PR 25) — units, caravans and loads together — which is how caravans are
 * attached to an army. A siege either was laying goes on from the earlier of
 * the two, so joining a caravan to a besieger never restarts its grace period.
 */
export async function joinArmies(worldId: string, userId: string, armyId: unknown, intoArmyId: unknown): Promise<KingdomBuilderWorldView> {
    if (!Types.ObjectId.isValid(worldId)) throw invalid("A valid world is required");
    if (armyId === intoArmyId) throw invalid("Choose another army to join");
    await inCamp(worldId, async session => {
        // One after the other: a transaction's operations don't run side by side.
        const army = await campedArmy(worldId, userId, armyId, session);
        const into = await campedArmy(worldId, userId, intoArmyId, session);
        if (!army || !into) throw new KingdomBuilderPersistenceError("ARMY_NOT_FOUND", "Army not found");
        if (!isCamped(army) || !isCamped(into) || army.targetNodeId !== into.targetNodeId) {
            throw invalid("Both have to be camped at the same place to join");
        }
        const since = [army.besiegingSince, into.besiegingSince].filter((tick): tick is number => typeof tick === "number");
        const caravans = combineCaravans([into, army]);
        await KingdomBuilderArmyModel.updateOne({ _id: into._id, worldId }, {
            $set: {
                units: addUnits(into.units, army.units),
                ...(caravans.caravans > 0 ? caravans : {}),
                ...(since.length ? { besiegingSince: Math.min(...since) } : {}),
            },
        }, { session });
        await KingdomBuilderArmyModel.deleteOne({ _id: army._id, worldId }, { session });
    });
    return worldView(worldId, userId);
}

/**
 * Unloads a stack's caravans into the town it has camped at (PR 25) — a
 * player's own stacks never camp at their own towns, since they rejoin them,
 * so this is always another player's: a gift, or the other half of a trade.
 * Not while the stack is besieging it; its caravans can be detached first.
 */
export async function unloadCaravans(worldId: string, userId: string, armyId: unknown): Promise<KingdomBuilderWorldView> {
    if (!Types.ObjectId.isValid(worldId)) throw invalid("A valid world is required");
    await inCamp(worldId, async session => {
        const army = await campedArmy(worldId, userId, armyId, session);
        if (!army) throw new KingdomBuilderPersistenceError("ARMY_NOT_FOUND", "Army not found");
        const cargo = resourcesOf(army.cargo);
        if (resourceTotal(cargo) === 0) throw invalid("The caravans aren't carrying anything");
        if (!isCamped(army)) throw invalid("The caravans have to arrive before they can unload");
        if (army.besiegingSince !== undefined && army.besiegingSince !== null) {
            throw invalid("An army laying siege can't trade — detach its caravans first");
        }
        const delivered = await KingdomBuilderSettlementModel.updateOne(
            { worldId, nodeId: army.targetNodeId }, { $inc: depositTo(cargo) }, { session },
        );
        if (delivered.modifiedCount !== 1) throw invalid("There is no town here to unload into");
        await KingdomBuilderArmyModel.updateOne({ _id: army._id, worldId }, { $unset: { cargo: 1 } }, { session });
    });
    return worldView(worldId, userId);
}
