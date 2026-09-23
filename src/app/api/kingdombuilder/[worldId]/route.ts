import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

import { endWorld, foundExpansion, KingdomBuilderPersistenceError, leaveWorld, worldView } from "@/games/KingdomBuilder";
import { readJsonBody } from "@/utils/api/requestBody";
import { dbConnect } from "@/utils/mongodb/mongodb";

interface RouteParams {
    params: Promise<{ worldId: string }>;
}

function errorResponse(error: unknown) {
    if (!(error instanceof KingdomBuilderPersistenceError)) throw error;
    const status = error.code === "WORLD_NOT_FOUND" || error.code === "SITE_NOT_FOUND" ? 404
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
    const { siteId, action, deleteNow } = await readJsonBody<{ siteId: string; action: string; deleteNow: boolean }>(request);
    try {
        // GDD §9.1: the host ends the world (and may remove it outright);
        // anyone leaves it. A body with neither founds an expansion.
        if (action === "end") {
            await endWorld(context.worldId, context.userId, { deleteNow: deleteNow === true });
            return NextResponse.json({ ended: true });
        }
        if (action === "leave") {
            await leaveWorld(context.worldId, context.userId);
            return NextResponse.json({ left: true });
        }
        if (action !== undefined) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
        return NextResponse.json(await foundExpansion(context.worldId, context.userId, siteId));
    } catch (error) {
        return errorResponse(error);
    }
}
