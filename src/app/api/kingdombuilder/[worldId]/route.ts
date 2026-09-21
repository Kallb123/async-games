import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

import { foundExpansion, KingdomBuilderPersistenceError, worldView } from "@/games/KingdomBuilder";
import { readJsonBody } from "@/utils/api/requestBody";
import { dbConnect } from "@/utils/mongodb/mongodb";

interface RouteParams {
    params: Promise<{ worldId: string }>;
}

function errorResponse(error: unknown) {
    if (!(error instanceof KingdomBuilderPersistenceError)) throw error;
    const status = error.code === "WORLD_NOT_FOUND" || error.code === "SITE_NOT_FOUND" ? 404
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
    const { siteId } = await readJsonBody<{ siteId: string }>(request);
    try {
        return NextResponse.json(await foundExpansion(context.worldId, context.userId, siteId));
    } catch (error) {
        return errorResponse(error);
    }
}
