import { randomUUID } from "node:crypto";
import { Types } from "mongoose";
import type { User } from "@clerk/nextjs/server";

import type { uuidString } from "@/utils/apiModels/GameDataApi";
import type { AcceptSeatResult } from "@/utils/games/startGame";
import { LOBBY_MAX_TTL_MS, OPEN_SEAT_ID, openSeats, seatList } from "@/utils/games/lobby";
import { saveWithFreshJoinCode } from "@/utils/games/joinCodeSave";
import { UNLIMITED_TURN_TIMER } from "@/utils/games/TurnTimer";
import { InvitationModel, type IInvitationData } from "@/utils/mongodb/InvitationData";
import { readableName } from "@/utils/ui/players";

import { KingdomBuilderInvitationModel, type IKingdomBuilderInvitationDocument } from "./KingdomBuilderInvitation";
import { KINGDOM_BUILDER_GAME_TYPE } from "./KingdomBuilderLogic";
import { KingdomBuilderPersistenceError } from "./persistence";
import { joinWorld } from "./roster";
import { meta } from "./meta";

export { worldIdOfInvitation } from "./KingdomBuilderInvitation";

interface OpenWorldInvitationOptions {
    worldId: string;
    host: User;
    /** Named players, already resolved, deduplicated and never the host. */
    invitees: User[];
    /** Seats anyone holding the join code may claim. */
    openSeatCount: number;
}

/**
 * Opens the invitation that seats people in a freshly created world: one row
 * per named player, one open seat per code-holder, and a join code. The code
 * lives the lobby's longest lifetime (LOBBY_MAX_TTL_MS) — a world has no turn
 * timer to size it by, and a world is open for as long as it has seats, so
 * the ceiling is the only bound that applies. Once the code is reaped a
 * world's remaining seats stay empty rather than becoming a permanent
 * "anyone can join" link (docs/account-less-play.md §4).
 */
export function openWorldInvitation({ worldId, host, invitees, openSeatCount }: OpenWorldInvitationOptions): Promise<IKingdomBuilderInvitationDocument> {
    return saveWithFreshJoinCode(joinCode => new KingdomBuilderInvitationModel({
        inviteId: randomUUID(),
        senderId: host.id,
        userIdList: seatList(invitees, openSeatCount),
        turnTimer: UNLIMITED_TURN_TIMER,
        timestamp: new Date().toISOString(),
        gameType: KINGDOM_BUILDER_GAME_TYPE,
        gameFriendlyName: meta.name,
        joinCode,
        expiresAt: new Date(Date.now() + LOBBY_MAX_TTL_MS),
        senderName: readableName(host),
        worldId: new Types.ObjectId(worldId),
    }));
}

/** The host's live join code for a world, while there is one and it still has seats to give. */
export async function liveWorldInvitation(worldId: string): Promise<{ joinCode: string; expiresAt: string; openSeats: number } | undefined> {
    const invite = await KingdomBuilderInvitationModel.findOne({ worldId, expiresAt: { $gt: new Date() } })
        .select({ joinCode: 1, expiresAt: 1, userIdList: 1 })
        .lean();
    if (!invite?.joinCode || !invite.expiresAt) return undefined;
    return { joinCode: invite.joinCode, expiresAt: invite.expiresAt.toISOString(), openSeats: openSeats(invite).length };
}

/**
 * Brings a world's invitation back in line with its roster (GDD §9.1): the
 * world's host is its sender, and a seat marked accepted by anyone no longer
 * seated — a player who left, or the successor who now hosts instead — goes
 * back to the code, so their freed start can be claimed by the next person to
 * join. Accepted is only set after a join lands (see `acceptWorldSeat`), so a
 * pending named invitee is never touched. Idempotent, and a read unless there
 * is something to fix: `leaveWorld` runs it after every leave, and the host's
 * world view runs it too, which repairs a leave that died before getting here.
 */
export async function reconcileWorldInvitation(worldId: string, hostId: string, rosterIds: readonly string[]): Promise<void> {
    const stale = { inviteAccepted: true, userId: { $nin: rosterIds.filter(id => id !== hostId) } };
    await KingdomBuilderInvitationModel.updateOne(
        { worldId, $or: [{ senderId: { $ne: hostId } }, { userIdList: { $elemMatch: stale } }] },
        { $set: { senderId: hostId, "userIdList.$[seat].userId": OPEN_SEAT_ID, "userIdList.$[seat].inviteAccepted": false } },
        { arrayFilters: [{ "seat.inviteAccepted": stale.inviteAccepted, "seat.userId": stale.userId }] },
    );
}

/**
 * `acceptSeat`'s answer for a world invitation. A world was running before
 * anyone was invited to it, so there is no "everyone has accepted, now begin"
 * gate and no `CreateGame`: accepting a seat is joining the world, there and
 * then, and the invitation stays open for the seats still to fill. The answer
 * is the started-game shape every accept path already follows onto the board.
 *
 * Only a seat on the invitation joins — the host is already in, and anybody
 * else who posts this invitation's id holds nothing on it to accept.
 *
 * The seat is marked accepted only after the join lands. Accepted is what
 * every other road reads as "in" (the join route's already-seated answer, the
 * lobby screen's forward to the world, the dashboard's spent ✓), so a join
 * that fails part-way must leave the seat pending: then a retry — the code
 * again, or Accept on the dashboard — runs the (idempotent) join again rather
 * than finding a seat that says "in" over a player who isn't.
 */
export async function acceptWorldSeat(invite: IInvitationData, worldId: string, actorId: string): Promise<AcceptSeatResult> {
    const hasSeat = invite.userIdList.some(seat => seat.userId === actorId);
    if (!hasSeat && invite.senderId !== actorId) return { gameStarted: false };

    if (hasSeat) {
        try {
            await joinWorld(worldId, actorId);
        } catch (error) {
            // No room left in the world after all, or it has gone — both
            // refused before any roster seat was taken: hand the invitation
            // seat back to the code so it isn't held by someone who is not in
            // the world, and say nothing started. Anything else leaves the
            // seat pending, and the request fails for the player to retry.
            if (!(error instanceof KingdomBuilderPersistenceError) || (error.code !== "WORLD_FULL" && error.code !== "WORLD_NOT_FOUND")) throw error;
            await InvitationModel.updateOne(
                { inviteId: invite.inviteId },
                { $set: { "userIdList.$[seat].userId": OPEN_SEAT_ID, "userIdList.$[seat].inviteAccepted": false } },
                { arrayFilters: [{ "seat.userId": actorId }] },
            );
            console.warn(`Kingdom Builder: could not seat ${actorId} in world ${worldId}: ${error.code}`);
            return { gameStarted: false };
        }
        await InvitationModel.updateOne(
            { inviteId: invite.inviteId },
            { $set: { "userIdList.$[seat].inviteAccepted": true } },
            { arrayFilters: [{ "seat.userId": actorId }] },
        );
    }
    return { gameStarted: true, gameId: worldId as uuidString, gameUrl: meta.url };
}
