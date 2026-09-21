import { NextRequest, NextResponse } from "next/server";
import type { ClientSession } from "mongoose";

import { KingdomBuilderSettlementModel, KingdomBuilderWorldModel, applyTick } from "@/games/KingdomBuilder";
import { isAuthorisedCron } from "@/utils/cronAuth";
import { dbConnect } from "@/utils/mongodb/mongodb";

export const maxDuration = 60;
export const KINGDOM_BUILDER_TICK_INTERVAL_MS = 60 * 60 * 1000;
const SWEEP_BUDGET_MS = (maxDuration - 10) * 1000;
const SWEEP_CANDIDATE_LIMIT = 100;

async function tickWorld(worldId: string, now: Date, session: ClientSession): Promise<boolean> {
    const world = await KingdomBuilderWorldModel.findById(worldId).select({ currentTick: 1, nextTickAt: 1 }).session(session).lean();
    if (!world) return false;
    if (world.nextTickAt > now) return false;

    const settlements = await KingdomBuilderSettlementModel.find({ worldId }).session(session).lean();
    const ticked = applyTick({ currentTick: world.currentTick, settlements });

    const scheduledTick = world.nextTickAt;
    const nextTickAt = new Date(scheduledTick.getTime() + KINGDOM_BUILDER_TICK_INTERVAL_MS);
    const claimed = await KingdomBuilderWorldModel.updateOne(
        { _id: worldId, currentTick: world.currentTick, nextTickAt: scheduledTick },
        { $set: { currentTick: ticked.currentTick, nextTickAt } },
        { session },
    );
    if (claimed.modifiedCount !== 1) return false;

    if (ticked.settlements.length) {
        await KingdomBuilderSettlementModel.bulkWrite(ticked.settlements.map(settlement => ({
            updateOne: {
                filter: { _id: settlement._id, worldId },
                update: settlement.construction
                    ? { $set: {
                        tiles: settlement.tiles,
                        resources: settlement.resources,
                        construction: settlement.construction,
                    } }
                    : {
                        $set: { tiles: settlement.tiles, resources: settlement.resources },
                        $unset: { construction: 1 },
                    },
            },
        })), { session });
    }
    return true;
}

export async function POST(request: NextRequest) {
    console.log(`POST ${request.nextUrl.pathname}`);
    if (!isAuthorisedCron(request)) {
        return NextResponse.json({}, { status: 401, statusText: "Unauthorized" });
    }

    const database = await dbConnect();
    const now = new Date();
    const deadline = Date.now() + SWEEP_BUDGET_MS;
    const candidates = await KingdomBuilderWorldModel.find({ nextTickAt: { $lte: now } })
        .sort({ nextTickAt: 1, currentTick: 1 })
        .limit(SWEEP_CANDIDATE_LIMIT + 1)
        .select({ _id: 1 })
        .lean();
    const capped = candidates.length > SWEEP_CANDIDATE_LIMIT;
    const worlds = candidates.slice(0, SWEEP_CANDIDATE_LIMIT);
    let ticked = 0;
    let skipped = 0;
    let failed = 0;

    let unswept = capped ? 1 : 0;
    for (const [index, world] of worlds.entries()) {
        if (Date.now() >= deadline) {
            unswept += worlds.length - index;
            break;
        }
        try {
            const didTick = await database.connection.transaction(
                (session: ClientSession) => tickWorld(world._id.toString(), now, session),
            );
            if (didTick) ticked++;
            else skipped++;
        } catch (error) {
            failed++;
            console.error(`Kingdom Builder tick failed for world ${world._id}`, error);
        }
    }

    return NextResponse.json({ scanned: worlds.length - Math.max(0, unswept - (capped ? 1 : 0)), ticked, skipped, failed, unswept, capped });
}
