import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

import {
    buyCaravan,
    cancelUnitTraining,
    exchangeAtMarket,
    KingdomBuilderPrototypeError,
    queuePrototypeBuilding,
    queueUnitTraining,
    settlementView,
} from "@/games/KingdomBuilder";
import { readJsonBody } from "@/utils/api/requestBody";
import { dbConnect } from "@/utils/mongodb/mongodb";

interface RouteParams {
    params: Promise<{ worldId: string; settlementId: string }>;
}

function errorResponse(error: unknown) {
    if (!(error instanceof KingdomBuilderPrototypeError)) throw error;
    const status = error.code === "FORBIDDEN" ? 403
        : error.code === "NOT_FOUND" ? 404
            : error.code === "INVALID_INPUT" ? 400 : 409;
    return NextResponse.json({ error: error.message }, { status });
}

async function requestContext(params: RouteParams["params"]) {
    const { userId } = await auth();
    if (!userId) return null;
    const ids = await params;
    await dbConnect();
    return { userId, ...ids };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
    console.log(`GET ${request.nextUrl.pathname}`);
    const context = await requestContext(params);
    if (!context) return NextResponse.json({}, { status: 401, statusText: "Not signed in" });

    try {
        return NextResponse.json(await settlementView(context.worldId, context.settlementId, context.userId));
    } catch (error) {
        return errorResponse(error);
    }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
    console.log(`POST ${request.nextUrl.pathname}`);
    const context = await requestContext(params);
    if (!context) return NextResponse.json({}, { status: 401, statusText: "Not signed in" });
    const { tilePosition, buildingType, unitType, action, give, get, amount, orderId } = await readJsonBody<{
        tilePosition: number; buildingType: string; unitType: string; action: string; give: unknown; get: unknown; amount: unknown;
        orderId: unknown;
    }>(request);

    try {
        // GDD §4.3, PR 25: the market converts one resource into another, and sells caravans.
        if (action === "exchange") {
            return NextResponse.json(await exchangeAtMarket(context.worldId, context.settlementId, context.userId, { give, get, amount }));
        }
        if (action === "caravan") return NextResponse.json(await buyCaravan(context.worldId, context.settlementId, context.userId));
        if (action === "cancel-training") {
            return NextResponse.json(await cancelUnitTraining(context.worldId, context.settlementId, context.userId, orderId));
        }
        if (action !== undefined) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
        // A body naming a unit trains it at the barracks; anything else queues a building.
        if (unitType !== undefined) {
            return NextResponse.json(await queueUnitTraining(context.worldId, context.settlementId, context.userId, unitType));
        }
        return NextResponse.json(await queuePrototypeBuilding(
            context.worldId,
            context.settlementId,
            context.userId,
            tilePosition as number,
            buildingType as string,
        ));
    } catch (error) {
        return errorResponse(error);
    }
}
