import { Types } from "mongoose";

import { LOBBY_MAX_TTL_MS, OPEN_SEAT_ID } from "@/utils/games/lobby";

import { KingdomBuilderInvitationModel } from "./KingdomBuilderInvitation";
import { KingdomBuilderSettlementModel } from "./KingdomBuilderSettlementModel";
import { KingdomBuilderWorldModel, type KingdomBuilderEndReason, type KingdomBuilderSeat } from "./KingdomBuilderWorldModel";
import { KingdomBuilderPersistenceError } from "./persistence";
import { KINGDOM_BUILDER_MAX_SEATS } from "./roster";

/**
 * How long an ended world is kept before the tick cron removes it (GDD §9.1):
 * the lobby's longest code lifetime, so nothing about a world outlives the
 * longest-lived thing that could still point at it.
 */
export const KINGDOM_BUILDER_ENDED_RETENTION_MS = LOBBY_MAX_TTL_MS;

/**
 * How many times a leave re-reads the world after its conditional write
 * loses a race — to another player leaving, a join, or a tick. Each loss is
 * somebody else's write landing, so a full roster bounds it.
 */
const MAX_LEAVE_ATTEMPTS = KINGDOM_BUILDER_MAX_SEATS;

function notFound(): KingdomBuilderPersistenceError {
    return new KingdomBuilderPersistenceError("WORLD_NOT_FOUND", "Kingdom Builder world not found");
}

function validateWorldId(worldId: string) {
    if (!Types.ObjectId.isValid(worldId)) throw new KingdomBuilderPersistenceError("INVALID_INPUT", "A valid world is required");
}

/**
 * The world's host: `hostId`, or — for a world opened before PR 8, which has
 * none — the owner of its first settlement.
 */
async function hostIdOf(worldId: string, world: { hostId?: string }): Promise<string | undefined> {
    if (world.hostId) return world.hostId;
    const first = await KingdomBuilderSettlementModel.findOne({ worldId })
        .sort({ createdAt: 1, _id: 1 })
        .select({ ownerId: 1 })
        .lean();
    return first?.ownerId;
}

/**
 * Best-effort, after the write that decides things has landed. Every reader
 * already refuses an ended world (`joinWorld` won't seat anyone in one), so a
 * failure here leaves a stale row the removal sweep deletes, never a way in.
 */
async function afterwards(what: string, worldId: string, step: () => Promise<unknown>) {
    try {
        await step();
    } catch (error) {
        console.error(`Kingdom Builder: could not ${what} for world ${worldId}`, error);
    }
}

/** Revokes a world's join code and invite rows, so nobody can be seated in a world that has ended. */
function revokeInvitation(worldId: string) {
    return afterwards("revoke the invitation", worldId, () => KingdomBuilderInvitationModel.deleteMany({ worldId }));
}

/**
 * Sets `endedAt` once, by one conditional write on top of `filter`. True only
 * for the call that ended it, which then revokes the invitation.
 */
async function markEnded(worldId: string, filter: Record<string, unknown>, reason: KingdomBuilderEndReason): Promise<boolean> {
    const ended = await KingdomBuilderWorldModel.updateOne(
        { ...filter, _id: worldId, endedAt: null },
        { $set: { endedAt: new Date(), endReason: reason } },
    );
    if (ended.modifiedCount !== 1) return false;
    await revokeInvitation(worldId);
    return true;
}

/**
 * The host ends their world (§9.1). A stranger gets the same not-found a
 * missing world gets; a member who isn't the host is told so. `deleteNow`
 * removes it there and then rather than after the retention window.
 */
export async function endWorld(worldId: string, userId: string, { deleteNow = false } = {}): Promise<void> {
    validateWorldId(worldId);
    const world = await KingdomBuilderWorldModel.findById(worldId).select({ hostId: 1, roster: 1, endedAt: 1 }).lean();
    if (!world || world.endedAt) throw notFound();
    const roster: KingdomBuilderSeat[] = world.roster ?? [];
    const isMember = roster.some(seat => seat.userId === userId)
        || (roster.length === 0 && await KingdomBuilderSettlementModel.exists({ worldId, ownerId: userId }));
    if (!isMember) throw notFound();
    if (await hostIdOf(worldId, world) !== userId) {
        throw new KingdomBuilderPersistenceError("FORBIDDEN", "Only the host can end this world");
    }

    // Conditional on the host being who it was when read: a leave from the
    // host's other tab that handed the world on in between fails this.
    const ended = await markEnded(worldId, world.hostId ? { hostId: userId } : { hostId: { $exists: false } }, "host");
    if (!ended) throw new KingdomBuilderPersistenceError("FORBIDDEN", "Only the host can end this world");
    if (deleteNow) await removeWorld(worldId);
}

/** An admin ends any world (docs/admin-tools.md) — already ended is fine — and can remove it outright. */
export async function adminEndWorld(worldId: string, { deleteNow = false } = {}): Promise<void> {
    validateWorldId(worldId);
    if (!await KingdomBuilderWorldModel.exists({ _id: worldId })) throw notFound();
    await markEnded(worldId, {}, "admin");
    if (deleteNow) await removeWorld(worldId);
}

/**
 * Removes an ended world: its settlements first, its invitation, and the
 * world last — so one that dies partway leaves a world that still has
 * `endedAt` set, which the next sweep finishes, and never a settlement
 * pointing at a world that has gone. Refuses a world that hasn't ended.
 */
export async function removeWorld(worldId: string): Promise<void> {
    const world = await KingdomBuilderWorldModel.findById(worldId).select({ endedAt: 1 }).lean();
    if (!world) return;
    if (!world.endedAt) throw new KingdomBuilderPersistenceError("INVALID_INPUT", "Only an ended world can be removed");
    await KingdomBuilderSettlementModel.deleteMany({ worldId });
    await KingdomBuilderInvitationModel.deleteMany({ worldId });
    await KingdomBuilderWorldModel.deleteOne({ _id: worldId, endedAt: { $ne: null } });
}

/**
 * The tick cron's last step: removes worlds that ended more than the
 * retention window before `now`, oldest first, at most `limit` a run and
 * none once `deadline` (a `Date.now()` reading) has passed. Each world is its
 * own try, so one that fails is logged and retried next run without stopping
 * the rest.
 */
export async function removeEndedWorlds(now: Date, limit: number, deadline: number): Promise<{ removed: number; failed: number }> {
    const cutoff = new Date(now.getTime() - KINGDOM_BUILDER_ENDED_RETENTION_MS);
    const worlds = await KingdomBuilderWorldModel.find({ endedAt: { $lte: cutoff } })
        .sort({ endedAt: 1 })
        .limit(limit)
        .select({ _id: 1 })
        .lean();
    let removed = 0;
    let failed = 0;
    for (const world of worlds) {
        if (Date.now() >= deadline) break;
        try {
            await removeWorld(world._id.toString());
            removed++;
        } catch (error) {
            failed++;
            console.error(`Kingdom Builder: removing ended world ${world._id} failed`, error);
        }
    }
    return { removed, failed };
}

/**
 * A player leaves a world (§9.1): their settlements go, their roster seat
 * and start site are freed, the host passes to the longest-seated player if
 * it was theirs, and the world ends if nobody is left.
 *
 * The roster write is conditional on what the decision was made from — who
 * hosts, and that the chosen successor is still seated (or, for the last
 * player, that nobody has joined) — so two players leaving at once can never
 * hand the world to someone who has gone; the loser re-reads and decides
 * again. Settlements are deleted both before that write and after it: before,
 * so a leave that dies partway leaves a player still seated (who can simply
 * leave again) rather than a settlement squatting on a site the roster says
 * is free; after, in case a world view refounded one in between.
 */
export async function leaveWorld(worldId: string, userId: string): Promise<void> {
    validateWorldId(worldId);
    for (let attempt = 0; attempt < MAX_LEAVE_ATTEMPTS; attempt++) {
        const world = await KingdomBuilderWorldModel.findById(worldId).select({ hostId: 1, roster: 1, endedAt: 1 }).lean();
        if (!world || world.endedAt) throw notFound();
        const roster: KingdomBuilderSeat[] = world.roster ?? [];

        if (!roster.some(seat => seat.userId === userId)) {
            // A world opened before rosters existed is a world of one, known
            // only by its settlements, so leaving it ends it. A player with
            // settlements but no seat in a rostered world is a leave that died
            // before its last delete: finish it.
            if (!await KingdomBuilderSettlementModel.exists({ worldId, ownerId: userId })) throw notFound();
            if (roster.length === 0) await markEnded(worldId, {}, "abandoned");
            await KingdomBuilderSettlementModel.deleteMany({ worldId, ownerId: userId });
            return;
        }

        await KingdomBuilderSettlementModel.deleteMany({ worldId, ownerId: userId });
        const successor = roster.find(seat => seat.userId !== userId)?.userId;
        const pull = { $pull: { roster: { userId } } };
        const [filter, update] = !successor
            ? [{ "roster.userId": userId, "roster.1": { $exists: false } }, { ...pull, $set: { endedAt: new Date(), endReason: "abandoned" } }]
            : world.hostId === userId
                ? [{ hostId: userId, "roster.userId": { $all: [userId, successor] } }, { ...pull, $set: { hostId: successor } }]
                : [{ "roster.userId": userId, hostId: { $ne: userId } }, pull];
        const left = await KingdomBuilderWorldModel.updateOne({ ...filter, _id: worldId, endedAt: null }, update);
        if (left.modifiedCount !== 1) continue;

        await KingdomBuilderSettlementModel.deleteMany({ worldId, ownerId: userId });
        if (!successor) {
            await revokeInvitation(worldId);
        } else {
            // The invitation follows the roster. The seat on it that was the
            // leaver's — or, when the host leaves, the successor's, who now
            // hosts it instead of holding a seat — goes back to the code, so
            // the freed site can be claimed by the next person to join.
            const handingOn = world.hostId === userId;
            const reopened = handingOn ? successor : userId;
            await afterwards("hand on the invitation", worldId, () => KingdomBuilderInvitationModel.updateOne(
                { worldId },
                { $set: {
                    "userIdList.$[seat].userId": OPEN_SEAT_ID,
                    "userIdList.$[seat].inviteAccepted": false,
                    ...(handingOn ? { senderId: successor } : {}),
                } },
                { arrayFilters: [{ "seat.userId": reopened }] },
            ));
        }
        return;
    }
    throw new KingdomBuilderPersistenceError("SITE_NOT_AVAILABLE", "The world was too busy to leave — try again");
}
