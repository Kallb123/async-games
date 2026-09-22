import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { ClientSession } from "mongoose";

import { createWorld, foundSettlement } from "@/games/KingdomBuilder";
import { meta } from "@/games/KingdomBuilder/meta";
import { openWorldInvitation } from "@/games/KingdomBuilder/worldInvitation";
import { readGameSetupRequest } from "@/utils/api/gameSetupRequest";
import { sendGameInvitePush } from "@/utils/firebase/invitePush";
import type { IInvitationRequest } from "@/utils/mongodb/InvitationData";
import { dbConnect } from "@/utils/mongodb/mongodb";
import { partySizeErrorMessage } from "@/utils/ui/games";

// World generation retries under its own wall-clock budget (see
// generateWorld's DEFAULT_GENERATION_BUDGET_MS) before it ever gives up, so
// this route needs more than the platform's unconfigured default to let that
// budget actually run rather than being killed mid-transaction.
export const maxDuration = 60;

/**
 * The setup screen's request: the players named in `UserInviteList`, plus how
 * many seats to leave open for anyone holding the join code. The host plus
 * both is the world's size — how many seats it will ever hold (§11.3 PR 8).
 * A world has no turn timer; the screen sends `unlimited` so the shared setup
 * prologue's own check passes.
 */
export interface KingdomBuilderWorldRequest extends IInvitationRequest {
    openSeats: number;
}

export interface KingdomBuilderWorldResponse {
    worldId: string;
    settlementId: string;
    /** Present when the world was opened with seats for others to fill. */
    joinCode?: string;
}

export async function POST(request: NextRequest) {
    console.log(`POST ${request.nextUrl.pathname}`);
    const setup = await readGameSetupRequest<KingdomBuilderWorldRequest>(request);
    if ("error" in setup) return setup.error;

    const openSeats = setup.body.openSeats ?? 0;
    if (typeof openSeats !== "number" || !Number.isInteger(openSeats) || openSeats < 0) {
        return NextResponse.json({}, { status: 400, statusText: "Invalid seat count" });
    }
    const seatCount = 1 + setup.invitees.length + openSeats;
    const partySizeError = partySizeErrorMessage(meta, seatCount);
    if (partySizeError) return NextResponse.json({}, { status: 400, statusText: partySizeError });

    const database = await dbConnect();
    const created = await database.connection.transaction(async (session: ClientSession) => {
        const world = await createWorld(randomUUID(), session, { userId: setup.userId, seatCount });
        const settlement = await foundSettlement(world._id.toString(), setup.userId, world.roster![0].siteId, session);
        return { worldId: world._id.toString(), settlementId: settlement._id.toString() };
    });

    const response: KingdomBuilderWorldResponse = { ...created };
    if (seatCount > 1) {
        // After the world's own transaction rather than inside it: a join-code
        // collision retries by saving again, which an aborted transaction
        // can't. The world stands either way — a failure here costs the host
        // their invitations (the world is still theirs, on the dashboard),
        // never the world itself.
        try {
            const invite = await openWorldInvitation({ worldId: created.worldId, host: setup.host, invitees: setup.invitees, openSeatCount: openSeats });
            response.joinCode = invite.joinCode;
            if (setup.invitees.length > 0) await sendGameInvitePush(setup.invitees, setup.host, invite);
        } catch (error) {
            console.error(`Failed to open the invitation for Kingdom Builder world ${created.worldId}`, error);
        }
    }
    return NextResponse.json(response);
}
