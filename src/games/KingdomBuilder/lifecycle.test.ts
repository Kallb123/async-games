import { Types } from "mongoose";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./worldInvitation", () => ({ reconcileWorldInvitation: vi.fn().mockResolvedValue(undefined) }));

import { KingdomBuilderArmyModel } from "./KingdomBuilderArmyModel";
import { KingdomBuilderBattleModel } from "./KingdomBuilderBattleModel";
import { KingdomBuilderTradeOfferModel } from "./KingdomBuilderTradeOfferModel";
import { KingdomBuilderInvitationModel } from "./KingdomBuilderInvitation";
import { KingdomBuilderSettlementModel } from "./KingdomBuilderSettlementModel";
import { KingdomBuilderWorldModel } from "./KingdomBuilderWorldModel";
import { reconcileWorldInvitation } from "./worldInvitation";
import { ChatMessageModel } from "@/utils/mongodb/ChatMessageData";
import { ChatReadModel } from "@/utils/mongodb/ChatReadData";
import { adminBoostWorld, adminEndWorld, endWorld, KINGDOM_BUILDER_ENDED_RETENTION_MS, leaveWorld, removeEndedWorlds, removeWorld } from "./lifecycle";

const worldId = new Types.ObjectId().toString();

function seat(userId: string, siteId = `site-${userId}`) {
    return { userId, siteId, joinedAt: new Date() };
}

/** Each call to `findById(…).select(…).lean()` answers the next world in turn. */
function mockWorldReads(...worlds: (object | null)[]) {
    const lean = vi.fn();
    for (const world of worlds) lean.mockResolvedValueOnce(world);
    return vi.spyOn(KingdomBuilderWorldModel, "findById").mockReturnValue({ select: vi.fn().mockReturnValue({ lean }) } as never);
}

function mockWorldWrites(...modifiedCounts: number[]) {
    const updateOne = vi.spyOn(KingdomBuilderWorldModel, "updateOne");
    for (const modifiedCount of modifiedCounts) updateOne.mockResolvedValueOnce({ modifiedCount } as never);
    return updateOne;
}

function mockDeletes() {
    return {
        settlements: vi.spyOn(KingdomBuilderSettlementModel, "deleteMany").mockResolvedValue({} as never),
        armies: vi.spyOn(KingdomBuilderArmyModel, "deleteMany").mockResolvedValue({} as never),
        battles: vi.spyOn(KingdomBuilderBattleModel, "deleteMany").mockResolvedValue({} as never),
        offers: vi.spyOn(KingdomBuilderTradeOfferModel, "deleteMany").mockResolvedValue({} as never),
        armyExists: vi.spyOn(KingdomBuilderArmyModel, "exists").mockResolvedValue(null),
        invitations: vi.spyOn(KingdomBuilderInvitationModel, "deleteMany").mockResolvedValue({} as never),
        chatMessages: vi.spyOn(ChatMessageModel, "deleteMany").mockResolvedValue({} as never),
        chatReads: vi.spyOn(ChatReadModel, "deleteMany").mockResolvedValue({} as never),
        world: vi.spyOn(KingdomBuilderWorldModel, "deleteOne").mockResolvedValue({} as never),
    };
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(reconcileWorldInvitation).mockClear();
});

describe("endWorld", () => {
    const rostered = { hostId: "host", roster: [seat("host"), seat("guest")] };

    it("ends the world once, for its host only, and revokes the invitation", async () => {
        mockWorldReads(rostered);
        const updateOne = mockWorldWrites(1);
        const deletes = mockDeletes();

        await endWorld(worldId, "host");

        const [filter, update] = updateOne.mock.calls[0];
        expect(filter).toEqual({ hostId: "host", _id: worldId, endedAt: null });
        expect(update).toEqual({ $set: { endedAt: expect.any(Date), endReason: "host" } });
        expect(deletes.invitations).toHaveBeenCalledWith({ worldId });
        expect(deletes.world).not.toHaveBeenCalled();
    });

    it("tells a member who isn't the host no, and a stranger nothing", async () => {
        mockWorldReads(rostered, rostered, { ...rostered, endedAt: new Date() });
        vi.spyOn(KingdomBuilderSettlementModel, "exists").mockResolvedValue(null);
        const updateOne = vi.spyOn(KingdomBuilderWorldModel, "updateOne");

        await expect(endWorld(worldId, "guest")).rejects.toEqual(expect.objectContaining({ code: "FORBIDDEN" }));
        await expect(endWorld(worldId, "stranger")).rejects.toEqual(expect.objectContaining({ code: "WORLD_NOT_FOUND" }));
        await expect(endWorld(worldId, "host")).rejects.toEqual(expect.objectContaining({ code: "WORLD_NOT_FOUND" }));
        expect(updateOne).not.toHaveBeenCalled();
    });

    it("refuses when the host changed between the read and the write", async () => {
        mockWorldReads(rostered, { hostId: "guest" });
        mockWorldWrites(0);
        const deletes = mockDeletes();

        await expect(endWorld(worldId, "host")).rejects.toEqual(expect.objectContaining({ code: "FORBIDDEN" }));
        expect(deletes.invitations).not.toHaveBeenCalled();
    });

    it("treats the first settlement's owner as host of a world from before rosters", async () => {
        mockWorldReads({});
        vi.spyOn(KingdomBuilderSettlementModel, "exists").mockResolvedValue({ _id: "s" } as never);
        const lean = vi.fn().mockResolvedValue({ ownerId: "founder" });
        vi.spyOn(KingdomBuilderSettlementModel, "findOne").mockReturnValue({ sort: () => ({ select: () => ({ lean }) }) } as never);
        const updateOne = mockWorldWrites(1);
        mockDeletes();

        await endWorld(worldId, "founder");

        expect(updateOne.mock.calls[0][0]).toEqual({ hostId: { $exists: false }, _id: worldId, endedAt: null });
    });

    it("takes a second tab's end, after the first already ended it, as done", async () => {
        mockWorldReads(rostered, { endedAt: new Date(), endReason: "host" });
        mockWorldWrites(0);
        mockDeletes();

        await expect(endWorld(worldId, "host")).resolves.toBeUndefined();
    });

    it("removes the world there and then when asked to", async () => {
        mockWorldReads(rostered, { endedAt: new Date() });
        mockWorldWrites(1);
        const deletes = mockDeletes();

        await endWorld(worldId, "host", { deleteNow: true });

        expect(deletes.settlements).toHaveBeenCalledWith({ worldId });
        expect(deletes.world).toHaveBeenCalledWith({ _id: worldId, endedAt: { $ne: null } });
    });
});

describe("adminEndWorld", () => {
    it("ends any world, and an already-ended one is fine", async () => {
        vi.spyOn(KingdomBuilderWorldModel, "exists").mockResolvedValue({ _id: worldId } as never);
        const updateOne = mockWorldWrites(0);
        mockDeletes();

        await adminEndWorld(worldId);

        expect(updateOne).toHaveBeenCalledWith({ _id: worldId, endedAt: null }, { $set: { endedAt: expect.any(Date), endReason: "admin" } });
    });
});

describe("adminBoostWorld", () => {
    it("adds 100 of each resource to every settlement in a live world, in one write", async () => {
        mockWorldReads({});
        const updateMany = vi.spyOn(KingdomBuilderSettlementModel, "updateMany").mockResolvedValue({ modifiedCount: 3 } as never);

        await expect(adminBoostWorld(worldId)).resolves.toBe(3);

        expect(updateMany).toHaveBeenCalledWith(
            { worldId },
            { $inc: { "resources.wood": 100, "resources.stone": 100, "resources.iron": 100, "resources.wheat": 100 } },
        );
    });

    it("refuses a world that has ended, or doesn't exist, without touching a settlement", async () => {
        const updateMany = vi.spyOn(KingdomBuilderSettlementModel, "updateMany");

        mockWorldReads({ endedAt: new Date() }, null);
        await expect(adminBoostWorld(worldId)).rejects.toMatchObject({ code: "INVALID_INPUT" });
        await expect(adminBoostWorld(worldId)).rejects.toMatchObject({ code: "WORLD_NOT_FOUND" });
        await expect(adminBoostWorld("not-an-id")).rejects.toMatchObject({ code: "INVALID_INPUT" });
        expect(updateMany).not.toHaveBeenCalled();
    });
});

describe("leaveWorld", () => {
    it("pulls a player's seat, settlements and armies, and brings the invitation in line", async () => {
        mockWorldReads({ hostId: "host", roster: [seat("host"), seat("guest")] });
        const updateOne = mockWorldWrites(1);
        const deletes = mockDeletes();

        await leaveWorld(worldId, "guest");

        expect(updateOne).toHaveBeenCalledWith(
            { "roster.userId": "guest", hostId: { $ne: "guest" }, _id: worldId, endedAt: null },
            { $pull: { roster: { userId: "guest" } } },
        );
        expect(deletes.settlements).toHaveBeenCalledWith({ worldId, ownerId: "guest" });
        // Their armies in the field disband where they stand (§9.1).
        expect(deletes.armies).toHaveBeenCalledWith({ worldId, ownerId: "guest" });
        // So do their trade offers, with the stores they were held from (PR 25).
        expect(deletes.offers).toHaveBeenCalledWith({ worldId, ownerId: "guest" });
        expect(reconcileWorldInvitation).toHaveBeenCalledWith(worldId, "host", ["host"]);
    });

    it("hands the host on to the longest-seated player, guarded on them still being there", async () => {
        mockWorldReads({ hostId: "host", roster: [seat("host"), seat("second"), seat("third")] });
        const updateOne = mockWorldWrites(1);
        mockDeletes();

        await leaveWorld(worldId, "host");

        expect(updateOne).toHaveBeenCalledWith(
            { hostId: "host", "roster.userId": { $all: ["host", "second"] }, _id: worldId, endedAt: null },
            { $pull: { roster: { userId: "host" } }, $set: { hostId: "second" } },
        );
        expect(reconcileWorldInvitation).toHaveBeenCalledWith(worldId, "second", ["second", "third"]);
    });

    it("re-reads and decides again when another leave lands first", async () => {
        mockWorldReads(
            { hostId: "host", roster: [seat("host"), seat("second"), seat("third")] },
            { hostId: "host", roster: [seat("host"), seat("third")] },
        );
        const updateOne = mockWorldWrites(0, 1);
        mockDeletes();

        await leaveWorld(worldId, "host");

        expect(updateOne.mock.calls[1][1]).toEqual({ $pull: { roster: { userId: "host" } }, $set: { hostId: "third" } });
    });

    it("ends the world when the last player leaves", async () => {
        mockWorldReads({ hostId: "host", roster: [seat("host")] });
        const updateOne = mockWorldWrites(1);
        const deletes = mockDeletes();

        await leaveWorld(worldId, "host");

        expect(updateOne).toHaveBeenCalledWith(
            { "roster.userId": "host", "roster.1": { $exists: false }, _id: worldId, endedAt: null },
            { $pull: { roster: { userId: "host" } }, $set: { endedAt: expect.any(Date), endReason: "abandoned" } },
        );
        expect(deletes.invitations).toHaveBeenCalledWith({ worldId });
    });

    it("tells a stranger nothing, and leaves an ended world alone", async () => {
        mockWorldReads({ hostId: "host", roster: [seat("host")] }, { hostId: "host", roster: [seat("host")], endedAt: new Date() });
        vi.spyOn(KingdomBuilderSettlementModel, "exists").mockResolvedValue(null);
        const deletes = mockDeletes();

        await expect(leaveWorld(worldId, "stranger")).rejects.toEqual(expect.objectContaining({ code: "WORLD_NOT_FOUND" }));
        await expect(leaveWorld(worldId, "host")).rejects.toEqual(expect.objectContaining({ code: "WORLD_NOT_FOUND" }));
        expect(deletes.settlements).not.toHaveBeenCalled();
        expect(deletes.armies).not.toHaveBeenCalled();
    });

    it("finishes a leave that died after pulling the seat but before disbanding the armies", async () => {
        mockWorldReads({ hostId: "host", roster: [seat("host")] });
        vi.spyOn(KingdomBuilderSettlementModel, "exists").mockResolvedValue(null);
        const deletes = mockDeletes();
        deletes.armyExists.mockResolvedValue({ _id: "a" } as never);

        await leaveWorld(worldId, "leaver");

        expect(deletes.armies).toHaveBeenCalledWith({ worldId, ownerId: "leaver" });
    });

    it("ends a world from before rosters, whose one member is its settlements' owner", async () => {
        mockWorldReads({});
        vi.spyOn(KingdomBuilderSettlementModel, "exists").mockResolvedValue({ _id: "s" } as never);
        const updateOne = mockWorldWrites(1);
        const deletes = mockDeletes();

        await leaveWorld(worldId, "founder");

        expect(updateOne.mock.calls[0][1]).toEqual({ $set: { endedAt: expect.any(Date), endReason: "abandoned" } });
        expect(deletes.settlements).toHaveBeenCalledWith({ worldId, ownerId: "founder" });
    });
});

describe("removeWorld", () => {
    it("never removes a live world", async () => {
        mockWorldReads({});
        const deletes = mockDeletes();

        await expect(removeWorld(worldId)).rejects.toEqual(expect.objectContaining({ code: "INVALID_INPUT" }));
        expect(deletes.settlements).not.toHaveBeenCalled();
    });

    it("removes settlements, armies, battles and trade offers, then the invitation, then the world", async () => {
        mockWorldReads({ endedAt: new Date() });
        const deletes = mockDeletes();

        await removeWorld(worldId);

        expect(deletes.armies).toHaveBeenCalledWith({ worldId });
        expect(deletes.battles).toHaveBeenCalledWith({ worldId });
        expect(deletes.offers).toHaveBeenCalledWith({ worldId });
        expect(deletes.chatMessages).toHaveBeenCalledWith({ gameId: worldId });
        expect(deletes.chatReads).toHaveBeenCalledWith({ gameId: worldId });
        const order = [deletes.settlements, deletes.armies, deletes.battles, deletes.offers, deletes.invitations, deletes.chatMessages, deletes.chatReads, deletes.world].map(spy => spy.mock.invocationCallOrder[0]);
        expect(order).toEqual([...order].sort((a, b) => a - b));
    });
});

describe("removeEndedWorlds", () => {
    it("removes worlds past the retention window, and one failure doesn't stop the rest", async () => {
        const now = new Date("2026-09-23T12:00:00Z");
        const ids = [new Types.ObjectId(), new Types.ObjectId()];
        const lean = vi.fn().mockResolvedValue(ids.map(_id => ({ _id })));
        const find = vi.spyOn(KingdomBuilderWorldModel, "find").mockReturnValue({ sort: () => ({ limit: () => ({ select: () => ({ lean }) }) }) } as never);
        mockWorldReads({ endedAt: now }, { endedAt: now });
        const deletes = mockDeletes();
        deletes.settlements.mockRejectedValueOnce(new Error("down"));
        vi.spyOn(console, "error").mockImplementation(() => {});

        await expect(removeEndedWorlds(now, 20, Date.now() + 60_000)).resolves.toEqual({ removed: 1, failed: 1 });
        expect(find).toHaveBeenCalledWith({ endedAt: { $lte: new Date(now.getTime() - KINGDOM_BUILDER_ENDED_RETENTION_MS) } });
    });
});
