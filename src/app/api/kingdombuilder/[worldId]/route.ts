import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

import {
    acceptTradeOffer, detachCaravans, endWorld, foundWithSettler, joinArmies, KingdomBuilderPersistenceError, leaveWorld, marchArmy, postTradeOffer,
    pushAttack, sallyOut, unloadCaravans, withdrawTradeOffer, worldView,
} from "@/games/KingdomBuilder";
import { readJsonBody } from "@/utils/api/requestBody";
import { dbConnect } from "@/utils/mongodb/mongodb";

interface RouteParams {
    params: Promise<{ worldId: string }>;
}

function errorResponse(error: unknown) {
    if (!(error instanceof KingdomBuilderPersistenceError)) throw error;
    const status = error.code === "WORLD_NOT_FOUND" || error.code === "SITE_NOT_FOUND" || error.code === "ARMY_NOT_FOUND" || error.code === "OFFER_NOT_FOUND" ? 404
        : error.code === "FORBIDDEN" ? 403
            : error.code === "INVALID_INPUT" ? 400 : 409;
    return NextResponse.json({ error: error.message }, { status });
}

async function requestContext(params: RouteParams["params"]) {
    const { userId } = await auth();
    if (!userId) return null;
    await dbConnect();
    return { userId, ...(await params) };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
    console.log(`GET ${request.nextUrl.pathname}`);
    const context = await requestContext(params);
    if (!context) return NextResponse.json({}, { status: 401, statusText: "Not signed in" });
    try {
        return NextResponse.json(await worldView(context.worldId, context.userId));
    } catch (error) {
        return errorResponse(error);
    }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
    console.log(`POST ${request.nextUrl.pathname}`);
    const context = await requestContext(params);
    if (!context) return NextResponse.json({}, { status: 401, statusText: "Not signed in" });
    const { action, deleteNow, targetNodeId, settlementId, units, caravans, cargo, armyId, intoArmyId, offerId, gives, wants } = await readJsonBody<{
        action: string; deleteNow: boolean; targetNodeId: unknown; settlementId: unknown; units: unknown;
        caravans: unknown; cargo: unknown; armyId: unknown; intoArmyId: unknown; offerId: unknown; gives: unknown; wants: unknown;
    }>(request);
    try {
        // GDD §9.1: the host ends the world (and may remove it outright);
        // anyone leaves it.
        if (action === "end") {
            await endWorld(context.worldId, context.userId, { deleteNow: deleteNow === true });
            return NextResponse.json({ ended: true });
        }
        if (action === "leave") {
            await leaveWorld(context.worldId, context.userId);
            return NextResponse.json({ left: true });
        }
        // GDD §6.2: an army out of a garrison, or new orders for one already in the field.
        if (action === "march") {
            return NextResponse.json(await marchArmy(context.worldId, context.userId, { targetNodeId, settlementId, units, caravans, cargo, armyId }));
        }
        // PR 25: caravans split off an army, stacks joined where they camp, and a load unloaded into the town there.
        if (action === "detach") return NextResponse.json(await detachCaravans(context.worldId, context.userId, armyId));
        if (action === "join") return NextResponse.json(await joinArmies(context.worldId, context.userId, armyId, intoArmyId));
        if (action === "unload") return NextResponse.json(await unloadCaravans(context.worldId, context.userId, armyId));
        // PR 24: a settler founds a town on the open site its stack has camped at.
        if (action === "settle") return NextResponse.json(await foundWithSettler(context.worldId, context.userId, armyId));
        // PR 25: trade offers posted, taken and withdrawn at the players' markets.
        if (action === "offer") return NextResponse.json(await postTradeOffer(context.worldId, context.userId, { settlementId, gives, wants }));
        if (action === "accept") return NextResponse.json(await acceptTradeOffer(context.worldId, context.userId, { offerId, settlementId }));
        if (action === "withdraw") return NextResponse.json(await withdrawTradeOffer(context.worldId, context.userId, offerId));
        // GDD §8: a siege comes to blows — the besieger pushes, or the defender sallies out.
        if (action === "push") return NextResponse.json(await pushAttack(context.worldId, context.userId, armyId));
        if (action === "sally") return NextResponse.json(await sallyOut(context.worldId, context.userId, settlementId));
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    } catch (error) {
        return errorResponse(error);
    }
}
