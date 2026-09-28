// Founding a town with a settler (GDD §4.4, §11.3 PR 24). The settler is a
// unit like any other — trained at a level-two town centre, marched in a stack
// (march.ts), and killed in a battle it is caught in — whose one order is this:
// found a town on the open site it has camped at.

import { Types } from "mongoose";

import { KingdomBuilderArmyModel } from "./KingdomBuilderArmyModel";
import { KingdomBuilderSettlementModel, prepareMultipleSettlementsIndex } from "./KingdomBuilderSettlementModel";
import { addUnits, combineCaravans, isCamped, subtractUnits } from "./armies";
import { KINGDOM_BUILDER_STARTING_STOCKPILE } from "./buildings";
import { campedArmy, inCamp } from "./march";
import { foundSettlement, KingdomBuilderPersistenceError } from "./persistence";
import { addResources } from "./resources";
import { garrisonOf } from "./units";
import { worldView, type KingdomBuilderWorldView } from "./worldView";

function isDuplicateKey(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

/**
 * A settler founds a town where its stack has camped (§4.4): an expansion
 * site nobody holds, or a barbarian one whose village has burnt. The settler
 * is spent; it brings a first settlement's stockpile from the town that
 * trained it, which paid more than that for it. Every other stack of the
 * player's camped there joins the town with it — its soldiers the garrison,
 * its caravans in the yard and their loads in the stores — since a player's
 * stack never camps at a town of their own.
 *
 * It claims the world first, as every camp command does, so it can't
 * interleave with a tick moving or fighting those stacks; the unique indexes
 * decide a race for the site, or for the number the new town takes.
 */
export async function foundWithSettler(worldId: string, userId: string, armyId: unknown): Promise<KingdomBuilderWorldView> {
    if (!Types.ObjectId.isValid(worldId)) throw new KingdomBuilderPersistenceError("INVALID_INPUT", "A valid world is required");
    // Outside the transaction, whose own locks the drop would otherwise wait on.
    await prepareMultipleSettlementsIndex();
    try {
        await inCamp(worldId, async session => {
            const army = await campedArmy(worldId, userId, armyId, session);
            if (!army) throw new KingdomBuilderPersistenceError("ARMY_NOT_FOUND", "Army not found");
            if (garrisonOf(army.units).settler < 1) throw new KingdomBuilderPersistenceError("INVALID_INPUT", "This army has no settler to found a town");
            if (!isCamped(army)) throw new KingdomBuilderPersistenceError("INVALID_INPUT", "The settler has to arrive before it can found a town");
            const camped = await KingdomBuilderArmyModel.find({ worldId, ownerId: userId, targetNodeId: army.targetNodeId, arrivedAtTick: { $ne: null } })
                .sort({ createdAt: 1, _id: 1 }).session(session).lean();
            const { caravans, cargo } = combineCaravans(camped);
            await foundSettlement(worldId, userId, army.targetNodeId, session, "expansion", {
                resources: addResources(KINGDOM_BUILDER_STARTING_STOCKPILE, cargo),
                garrison: subtractUnits(camped.reduce((units, stack) => addUnits(units, stack.units), garrisonOf()), { settler: 1 }),
                caravans,
            });
            await KingdomBuilderArmyModel.deleteMany({ worldId, _id: { $in: camped.map(stack => stack._id) } }, { session });
        });
    } catch (error) {
        if (isDuplicateKey(error)) throw new KingdomBuilderPersistenceError("SITE_NOT_AVAILABLE", "That site has been claimed");
        throw error;
    }
    return worldView(worldId, userId);
}
