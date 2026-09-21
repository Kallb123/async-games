import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { ClientSession } from "mongoose";

import { createWorld, foundSettlement } from "@/games/KingdomBuilder";
import type { WorldNode } from "@/games/KingdomBuilder/worldgen/landmass";
import { requireGameHost } from "@/utils/api/gameSetupRequest";
import { dbConnect } from "@/utils/mongodb/mongodb";

// World generation retries under its own wall-clock budget (see
// generateWorld's DEFAULT_GENERATION_BUDGET_MS) before it ever gives up, so
// this route needs more than the platform's unconfigured default to let that
// budget actually run rather than being killed mid-transaction.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
    console.log(`POST ${request.nextUrl.pathname}`);
    const host = await requireGameHost();
    if ("error" in host) return host.error;

    const database = await dbConnect();
    const created = await database.connection.transaction(async (session: ClientSession) => {
        const world = await createWorld(randomUUID(), session);
        const startingSite = world.nodes.find((node: WorldNode) => node.kind === "settlement" && node.siteType === "player-start");
        if (!startingSite) throw new Error("Generated Kingdom Builder world has no starting settlement");
        const settlement = await foundSettlement(world._id.toString(), host.userId, startingSite.id, session);
        return { worldId: world._id.toString(), settlementId: settlement._id.toString() };
    });
    return NextResponse.json(created);
}
