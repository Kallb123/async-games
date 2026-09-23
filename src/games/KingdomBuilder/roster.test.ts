import { Types } from "mongoose";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./persistence", async (importOriginal) => ({
    ...(await importOriginal<typeof import("./persistence")>()),
    foundSettlement: vi.fn(),
}));

import { KingdomBuilderSettlementModel } from "./KingdomBuilderSettlementModel";
import { KingdomBuilderWorldModel } from "./KingdomBuilderWorldModel";
import { foundSettlement, KingdomBuilderPersistenceError } from "./persistence";
import { joinWorld } from "./roster";
import type { WorldNode } from "./worldgen";

const NODES: WorldNode[] = [
    { id: "start-a", x: 10, y: 10, tile: 0, kind: "settlement", siteType: "player-start" },
    { id: "start-b", x: 40, y: 10, tile: 1, kind: "settlement", siteType: "player-start" },
    { id: "open-1", x: 70, y: 10, tile: 2, kind: "settlement", siteType: "expansion" },
];

function seat(userId: string, siteId: string) {
    return { userId, siteId, joinedAt: new Date() };
}

function mockWorldReads(...worlds: object[]) {
    const lean = vi.fn();
    for (const world of worlds) lean.mockResolvedValueOnce({ nodes: NODES, ...world });
    vi.spyOn(KingdomBuilderWorldModel, "findById").mockReturnValue({ select: vi.fn().mockReturnValue({ lean }) } as never);
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(foundSettlement).mockReset();
});

describe("joinWorld", () => {
    it("claims a free player start with one capped, conditional push, then founds there", async () => {
        const worldId = new Types.ObjectId().toString();
        mockWorldReads({ seatCount: 3, roster: [seat("host", "start-a")] });
        const updateOne = vi.spyOn(KingdomBuilderWorldModel, "updateOne").mockResolvedValue({ modifiedCount: 1 } as never);
        vi.spyOn(KingdomBuilderSettlementModel, "exists").mockResolvedValue(null);

        await joinWorld(worldId, "guest");

        const [filter, update] = updateOne.mock.calls[0];
        expect(filter).toEqual({
            _id: worldId,
            endedAt: null,
            "roster.userId": { $ne: "guest" },
            "roster.siteId": { $ne: "start-b" },
            "roster.2": { $exists: false },
        });
        expect(update).toMatchObject({ $push: { roster: { userId: "guest", siteId: "start-b" } } });
        expect(foundSettlement).toHaveBeenCalledWith(worldId, "guest", "start-b", undefined, "first");
    });

    it("refuses a full world without writing anything", async () => {
        mockWorldReads({ seatCount: 2, roster: [seat("host", "start-a"), seat("friend", "start-b")] });
        const updateOne = vi.spyOn(KingdomBuilderWorldModel, "updateOne");

        await expect(joinWorld(new Types.ObjectId().toString(), "late")).rejects.toEqual(
            expect.objectContaining<Partial<KingdomBuilderPersistenceError>>({ code: "WORLD_FULL" }),
        );
        expect(updateOne).not.toHaveBeenCalled();
    });

    it("never seats anyone in a world opened before rosters existed", async () => {
        mockWorldReads({});

        await expect(joinWorld(new Types.ObjectId().toString(), "late")).rejects.toEqual(
            expect.objectContaining<Partial<KingdomBuilderPersistenceError>>({ code: "WORLD_FULL" }),
        );
    });

    it("is a no-op for a player already seated with a settlement", async () => {
        mockWorldReads({ seatCount: 3, roster: [seat("host", "start-a")] });
        const updateOne = vi.spyOn(KingdomBuilderWorldModel, "updateOne");
        vi.spyOn(KingdomBuilderSettlementModel, "exists").mockResolvedValue({ _id: new Types.ObjectId() } as never);

        await joinWorld(new Types.ObjectId().toString(), "host");

        expect(updateOne).not.toHaveBeenCalled();
        expect(foundSettlement).not.toHaveBeenCalled();
    });

    it("finishes the settlement of a seat whose founding never happened", async () => {
        const worldId = new Types.ObjectId().toString();
        mockWorldReads({ seatCount: 3, roster: [seat("host", "start-a"), seat("guest", "start-b")] });
        vi.spyOn(KingdomBuilderSettlementModel, "exists").mockResolvedValue(null);

        await joinWorld(worldId, "guest");

        expect(foundSettlement).toHaveBeenCalledWith(worldId, "guest", "start-b", undefined, "first");
    });

    it("re-reads the world and takes what is left after losing the race for a site", async () => {
        const worldId = new Types.ObjectId().toString();
        mockWorldReads(
            { seatCount: 3, roster: [] },
            { seatCount: 3, roster: [seat("racer", "start-a")] },
        );
        const updateOne = vi.spyOn(KingdomBuilderWorldModel, "updateOne")
            .mockResolvedValueOnce({ modifiedCount: 0 } as never)
            .mockResolvedValueOnce({ modifiedCount: 1 } as never);
        vi.spyOn(KingdomBuilderSettlementModel, "exists").mockResolvedValue(null);

        await joinWorld(worldId, "guest");

        expect(updateOne).toHaveBeenCalledTimes(2);
        expect(updateOne.mock.calls[1][0]).toMatchObject({ "roster.siteId": { $ne: "start-b" } });
        expect(foundSettlement).toHaveBeenCalledWith(worldId, "guest", "start-b", undefined, "first");
    });

    it("treats a duplicate founding by the same player's other request as done", async () => {
        mockWorldReads({ seatCount: 3, roster: [seat("guest", "start-b")] });
        vi.spyOn(KingdomBuilderSettlementModel, "exists").mockResolvedValue(null);
        vi.mocked(foundSettlement).mockRejectedValue(Object.assign(new Error("dup"), { code: 11000 }));

        await expect(joinWorld(new Types.ObjectId().toString(), "guest")).resolves.toBeUndefined();
    });
});
