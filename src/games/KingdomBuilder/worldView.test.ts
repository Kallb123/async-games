import { Types } from "mongoose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/users/clerk", () => ({
    buildUserDirectory: vi.fn(async () => ({ name: (userId: string) => `name:${userId}`, imageUrl: () => null })),
}));
vi.mock("./worldInvitation", () => ({ liveWorldInvitation: vi.fn() }));
vi.mock("./roster", () => ({ ensureFirstSettlement: vi.fn() }));

import { KingdomBuilderSettlementModel } from "./KingdomBuilderSettlementModel";
import { KingdomBuilderWorldModel } from "./KingdomBuilderWorldModel";
import { KingdomBuilderPersistenceError } from "./persistence";
import { ensureFirstSettlement } from "./roster";
import { liveWorldInvitation } from "./worldInvitation";
import { worldView } from "./worldView";

const LANDMASS = { width: 200, height: 140, resolution: 1, values: [1], landThreshold: 0.3 };

function mockSettlements(...batches: object[][]) {
    const lean = vi.fn();
    for (const batch of batches) lean.mockResolvedValueOnce(batch);
    vi.spyOn(KingdomBuilderSettlementModel, "find").mockReturnValue({ select: vi.fn().mockReturnValue({ lean }) } as never);
}

function mockWorld(world: object | null) {
    vi.spyOn(KingdomBuilderWorldModel, "findById").mockReturnValue({
        select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(world && { currentTick: 2, landmass: LANDMASS, nodes: [], edges: [], ...world }) }),
    } as never);
}

beforeEach(() => vi.mocked(liveWorldInvitation).mockResolvedValue({ joinCode: "PLUM", expiresAt: "2026-09-29T00:00:00.000Z", openSeats: 2 }));
afterEach(() => vi.restoreAllMocks());

describe("Kingdom Builder world view", () => {
    it("answers a stranger exactly as a world that doesn't exist", async () => {
        const worldId = new Types.ObjectId().toString();
        mockSettlements([{ _id: new Types.ObjectId(), ownerId: "owner", nodeId: "start" }]);
        mockWorld({ hostId: "owner", seatCount: 4, roster: [{ userId: "owner", siteId: "start", joinedAt: new Date() }] });

        await expect(worldView(worldId, "stranger")).rejects.toEqual(
            expect.objectContaining<Partial<KingdomBuilderPersistenceError>>({ code: "WORLD_NOT_FOUND" }),
        );
    });

    it("marks only the viewer's settlements as theirs, and names each settlement's owner by seat", async () => {
        const worldId = new Types.ObjectId().toString();
        mockSettlements([
            { _id: new Types.ObjectId(), ownerId: "owner", nodeId: "start" },
            { _id: new Types.ObjectId(), ownerId: "rival", nodeId: "other" },
        ]);
        mockWorld({
            hostId: "owner",
            seatCount: 4,
            roster: [{ userId: "owner", siteId: "start", joinedAt: new Date() }, { userId: "rival", siteId: "other", joinedAt: new Date() }],
        });

        const view = await worldView(worldId, "rival");

        expect(view.settlements.map(settlement => [settlement.isMine, settlement.seat])).toEqual([[false, 0], [true, 1]]);
        expect(view.players).toEqual([
            { seat: 0, name: "name:owner", imageUrl: null, isMe: false, isHost: true },
            { seat: 1, name: "name:rival", imageUrl: null, isMe: true, isHost: false },
        ]);
        expect(view.seatCount).toBe(4);
    });

    it("shows the join code to the host and nobody else", async () => {
        const worldId = new Types.ObjectId().toString();
        const world = {
            hostId: "owner",
            seatCount: 4,
            roster: [{ userId: "owner", siteId: "start", joinedAt: new Date() }, { userId: "rival", siteId: "other", joinedAt: new Date() }],
        };
        const settlements = [
            { _id: new Types.ObjectId(), ownerId: "owner", nodeId: "start" },
            { _id: new Types.ObjectId(), ownerId: "rival", nodeId: "other" },
        ];

        mockSettlements(settlements);
        mockWorld(world);
        expect((await worldView(worldId, "owner")).invite?.joinCode).toBe("PLUM");

        mockSettlements(settlements);
        mockWorld(world);
        expect((await worldView(worldId, "rival")).invite).toBeUndefined();
    });

    it("finishes the settlement of a player seated by a join that never founded it", async () => {
        const worldId = new Types.ObjectId().toString();
        const hostSettlement = { _id: new Types.ObjectId(), ownerId: "owner", nodeId: "start" };
        mockSettlements([hostSettlement], [hostSettlement, { _id: new Types.ObjectId(), ownerId: "late", nodeId: "other" }]);
        mockWorld({
            hostId: "owner",
            seatCount: 4,
            roster: [{ userId: "owner", siteId: "start", joinedAt: new Date() }, { userId: "late", siteId: "other", joinedAt: new Date() }],
        });

        const view = await worldView(worldId, "late");

        expect(ensureFirstSettlement).toHaveBeenCalledWith(worldId, "late", "other");
        expect(view.settlements.find(settlement => settlement.isMine)?.nodeId).toBe("other");
    });

    it("still opens a pre-roster world to the owner of its settlements", async () => {
        const worldId = new Types.ObjectId().toString();
        mockSettlements([{ _id: new Types.ObjectId(), ownerId: "owner", nodeId: "start" }]);
        mockWorld({});

        const view = await worldView(worldId, "owner");

        expect(view.players.map(player => [player.isMe, player.isHost])).toEqual([[true, true]]);
        expect(view.seatCount).toBe(1);
    });
});
