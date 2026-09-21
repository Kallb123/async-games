import { Types } from "mongoose";
import { afterEach, describe, expect, it, vi } from "vitest";

import { KingdomBuilderSettlementModel } from "./KingdomBuilderSettlementModel";
import { KingdomBuilderWorldModel } from "./KingdomBuilderWorldModel";
import { KingdomBuilderPersistenceError } from "./persistence";
import { worldView } from "./worldView";

afterEach(() => vi.restoreAllMocks());

describe("Kingdom Builder world view", () => {
    it("only opens a world to one of its settlement owners", async () => {
        const worldId = new Types.ObjectId().toString();
        const lean = vi.fn().mockResolvedValue([{ _id: new Types.ObjectId(), ownerId: "owner", nodeId: "start" }]);
        vi.spyOn(KingdomBuilderSettlementModel, "find").mockReturnValue({
            select: vi.fn().mockReturnValue({ lean }),
        } as never);
        const findWorld = vi.spyOn(KingdomBuilderWorldModel, "findById");

        await expect(worldView(worldId, "stranger")).rejects.toEqual(
            expect.objectContaining<Partial<KingdomBuilderPersistenceError>>({ code: "WORLD_NOT_FOUND" }),
        );
        expect(findWorld).not.toHaveBeenCalled();
    });

    it("marks only the viewer's settlements as theirs", async () => {
        const worldId = new Types.ObjectId().toString();
        const settlements = [
            { _id: new Types.ObjectId(), ownerId: "owner", nodeId: "start" },
            { _id: new Types.ObjectId(), ownerId: "rival", nodeId: "other" },
        ];
        vi.spyOn(KingdomBuilderSettlementModel, "find").mockReturnValue({
            select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(settlements) }),
        } as never);
        vi.spyOn(KingdomBuilderWorldModel, "findById").mockReturnValue({
            select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({
                currentTick: 2,
                landmass: { width: 100, height: 70, resolution: 1, values: [1], landThreshold: 0.3 },
                nodes: [],
                edges: [],
            }) }),
        } as never);

        const view = await worldView(worldId, "owner");

        expect(view.settlements.map(settlement => settlement.isMine)).toEqual([true, false]);
    });
});
