import { Types } from "mongoose";

import { KingdomBuilderSettlementModel } from "./KingdomBuilderSettlementModel";
import { KingdomBuilderWorldModel, type KingdomBuilderSeat } from "./KingdomBuilderWorldModel";
import { foundSettlement, freePlayerStarts, KingdomBuilderPersistenceError } from "./persistence";

/** §1: a world seats ten players at most. */
export const KINGDOM_BUILDER_MAX_SEATS = 10;

/**
 * How many times a join re-reads the world after losing a race for a start
 * site. Each loss means another player's claim landed first, which also means
 * one fewer free site to lose the next race over — ten players arriving in
 * the same second is the worst case, and that is nine losses at most.
 */
const MAX_JOIN_ATTEMPTS = KINGDOM_BUILDER_MAX_SEATS;

function isDuplicateKey(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

/**
 * Founds a seated player's first settlement on the site their seat claimed,
 * unless they already have one. Idempotent, so it is both the second half of
 * `joinWorld` and the repair for a join that claimed its seat but died before
 * founding: running it again finishes the job rather than duplicating it.
 */
export async function ensureFirstSettlement(worldId: string, userId: string, siteId: string): Promise<void> {
    if (await KingdomBuilderSettlementModel.exists({ worldId, ownerId: userId })) return;
    try {
        await foundSettlement(worldId, userId, siteId, undefined, "first");
    } catch (error) {
        // A second request for the same player (a double tap, a second
        // device) founded it between the check above and this write: the
        // unique { worldId, ownerId, settlementNumber } index refused the
        // duplicate, and the settlement this join wanted now exists.
        if (isDuplicateKey(error)) return;
        if (error instanceof KingdomBuilderPersistenceError && error.code === "SITE_NOT_AVAILABLE"
            && await KingdomBuilderSettlementModel.exists({ worldId, ownerId: userId })) return;
        throw error;
    }
}

/**
 * Seats a player in a world (§11.3 PR 8): claims a free player-start site on
 * the roster, then founds their first settlement there.
 *
 * The roster claim is one conditional `$push`, and it is the security
 * boundary: it only lands on a world where this player holds no seat, nobody
 * holds this site, and the roster is still short of the world's own seat
 * count — so neither ten players arriving at once nor one player's two
 * devices can overfill a world, double-seat a player or put two players on one
 * site. Losing that race re-reads the world and tries another free site.
 * `foundSettlement`'s unique `{ worldId, nodeId }` index stands behind the
 * roster as a second line on the site.
 *
 * Idempotent for a player already seated: it finishes their settlement if the
 * join that seated them never got that far, and otherwise does nothing.
 */
export async function joinWorld(worldId: string, userId: string): Promise<void> {
    if (!Types.ObjectId.isValid(worldId) || !userId.trim()) {
        throw new KingdomBuilderPersistenceError("INVALID_INPUT", "A valid world and user are required");
    }

    for (let attempt = 0; attempt < MAX_JOIN_ATTEMPTS; attempt++) {
        const world = await KingdomBuilderWorldModel.findById(worldId).select({ nodes: 1, roster: 1, seatCount: 1 }).lean();
        if (!world) throw new KingdomBuilderPersistenceError("WORLD_NOT_FOUND", "Kingdom Builder world not found");

        const roster: KingdomBuilderSeat[] = world.roster ?? [];
        const seat = roster.find(entry => entry.userId === userId);
        if (seat) {
            await ensureFirstSettlement(worldId, userId, seat.siteId);
            return;
        }

        // A world opened before rosters existed has no seat count and an
        // empty roster — its one member is known only by their settlement —
        // so it counts as full rather than as ten empty seats.
        const seatCount = Math.min(world.seatCount ?? 0, KINGDOM_BUILDER_MAX_SEATS);
        const free = freePlayerStarts(world.nodes, roster);
        if (roster.length >= seatCount || free.length === 0) {
            throw new KingdomBuilderPersistenceError("WORLD_FULL", "Every seat in this world is taken");
        }

        const site = free[Math.floor(Math.random() * free.length)];
        const claimed = await KingdomBuilderWorldModel.updateOne(
            {
                _id: worldId,
                "roster.userId": { $ne: userId },
                "roster.siteId": { $ne: site.id },
                [`roster.${seatCount - 1}`]: { $exists: false },
            },
            { $push: { roster: { userId, siteId: site.id, joinedAt: new Date() } } },
        );
        if (claimed.modifiedCount === 1) {
            await ensureFirstSettlement(worldId, userId, site.id);
            return;
        }
    }
    throw new KingdomBuilderPersistenceError("SITE_NOT_AVAILABLE", "The world was too busy to seat you — try again");
}
