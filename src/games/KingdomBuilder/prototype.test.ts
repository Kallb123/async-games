import { Types } from "mongoose";
import { afterEach, describe, expect, it, vi } from "vitest";

import { KingdomBuilderSettlementModel } from "./KingdomBuilderSettlementModel";
import { KingdomBuilderWorldModel } from "./KingdomBuilderWorldModel";
import { KingdomBuilderPrototypeError, queuePrototypeBuilding } from "./prototype";

const worldId = new Types.ObjectId().toString();
const settlementId = new Types.ObjectId().toString();
const tiles = Array.from({ length: 9 }, (_, position) => ({
    position,
    ...(position === 4 ? { building: { type: "town-centre" as const, level: 1 } } : {}),
}));

afterEach(() => vi.restoreAllMocks());

function existingSettlement(ownerId = "owner") {
    const lean = vi.fn().mockResolvedValue({ ownerId, tiles });
    const select = vi.fn().mockReturnValue({ lean });
    vi.spyOn(KingdomBuilderSettlementModel, "findOne").mockReturnValue({ select } as never);
}

describe("Kingdom Builder prototype construction", () => {
    it("refuses to queue a building for somebody else's settlement", async () => {
        existingSettlement("actual-owner");
        const update = vi.spyOn(KingdomBuilderSettlementModel, "findOneAndUpdate");

        await expect(queuePrototypeBuilding(worldId, settlementId, "intruder", 0, "mine")).rejects.toEqual(
            expect.objectContaining<Partial<KingdomBuilderPrototypeError>>({ code: "FORBIDDEN" }),
        );
        expect(update).not.toHaveBeenCalled();
    });

    it("rejects forged building types and the fixed town-centre tile", async () => {
        await expect(queuePrototypeBuilding(worldId, settlementId, "owner", 0, "castle"))
            .rejects.toEqual(expect.objectContaining({ code: "INVALID_INPUT" }));
        await expect(queuePrototypeBuilding(worldId, settlementId, "owner", 4, "mine"))
            .rejects.toEqual(expect.objectContaining({ code: "INVALID_INPUT" }));
    });

    it("atomically limits a settlement to one queued building", async () => {
        const findOne = vi.spyOn(KingdomBuilderSettlementModel, "findOne");
        const initialLean = vi.fn().mockResolvedValue({ ownerId: "owner", tiles });
        findOne.mockReturnValueOnce({ select: vi.fn().mockReturnValue({ lean: initialLean }) } as never);
        findOne.mockReturnValueOnce({
            lean: vi.fn().mockResolvedValue({ ownerId: "owner", nodeId: "start", tiles, resources: { wood: 0, stone: 0, iron: 0 },
                construction: { tilePosition: 0, buildingType: "mine", targetLevel: 1, ticksRemaining: 2 } }),
        } as never);
        const updateLean = vi.fn().mockResolvedValue({ _id: settlementId });
        const update = vi.spyOn(KingdomBuilderSettlementModel, "findOneAndUpdate").mockReturnValue({ lean: updateLean } as never);
        const worldLean = vi.fn().mockResolvedValue({ currentTick: 3, nextTickAt: new Date("2030-01-01T00:00:00Z") });
        vi.spyOn(KingdomBuilderWorldModel, "findById").mockReturnValue({
            select: vi.fn().mockReturnValue({ lean: worldLean }),
        } as never);
        vi.spyOn(KingdomBuilderSettlementModel, "find").mockReturnValue({
            select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([{ tiles }]) }),
        } as never);

        const view = await queuePrototypeBuilding(worldId, settlementId, "owner", 0, "mine");

        expect(update).toHaveBeenCalledWith(
            expect.objectContaining({ ownerId: "owner", construction: { $exists: false } }),
            { $set: { construction: { tilePosition: 0, buildingType: "mine", targetLevel: 1, ticksRemaining: 2 } } },
            { new: true },
        );
        expect(view.tiles[0].construction).toEqual({ buildingType: "mine", ticksRemaining: 2 });
        expect(view.completedBuildLevels).toBe(1);
    });
});
