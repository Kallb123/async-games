import { Types } from "mongoose";
import { afterEach, describe, expect, it, vi } from "vitest";

import { KingdomBuilderSettlementModel } from "./KingdomBuilderSettlementModel";
import { KingdomBuilderWorldModel } from "./KingdomBuilderWorldModel";
import { worldSummaries } from "./worldSummaries";

afterEach(() => vi.restoreAllMocks());

describe("Kingdom Builder world summaries", () => {
    it("collapses a player's settlements to one summary per world", async () => {
        const firstWorld = new Types.ObjectId();
        const secondWorld = new Types.ObjectId();
        const settlementLean = vi.fn().mockResolvedValue([
            { worldId: firstWorld, tiles: [{ building: { level: 1 } }, { building: { level: 2 } }] },
            { worldId: firstWorld, tiles: [{ building: { level: 1 } }] },
            { worldId: secondWorld, tiles: [{ building: { level: 1 } }] },
        ]);
        const settlementSelect = vi.fn().mockReturnValue({ lean: settlementLean });
        vi.spyOn(KingdomBuilderSettlementModel, "find").mockReturnValue({ select: settlementSelect } as never);

        const worldLean = vi.fn().mockResolvedValue([
            { _id: firstWorld, currentTick: 12, nextTickAt: new Date("2026-09-21T13:00:00Z"), seatCount: 4, roster: [{ userId: "player-1" }, { userId: "a" }, { userId: "b" }] },
            { _id: secondWorld, currentTick: 3, nextTickAt: new Date("2026-09-21T14:00:00Z") },
        ]);
        const sort = vi.fn().mockReturnValue({ lean: worldLean });
        const select = vi.fn().mockReturnValue({ sort });
        const findWorlds = vi.spyOn(KingdomBuilderWorldModel, "find").mockReturnValue({ select } as never);

        await expect(worldSummaries("player-1")).resolves.toEqual([
            { worldId: firstWorld.toString(), currentTick: 12, nextTickAt: "2026-09-21T13:00:00.000Z", settlementCount: 2, completedBuildLevels: 4, playerCount: 3, seatCount: 4 },
            { worldId: secondWorld.toString(), currentTick: 3, nextTickAt: "2026-09-21T14:00:00.000Z", settlementCount: 1, completedBuildLevels: 1, playerCount: 1, seatCount: 1 },
        ]);
        expect(KingdomBuilderSettlementModel.find).toHaveBeenCalledWith({ ownerId: "player-1" });
        expect(findWorlds).toHaveBeenCalledWith({ _id: { $in: [firstWorld.toString(), secondWorld.toString()] } });
    });

    it("does not read worlds when the player has no settlements", async () => {
        const lean = vi.fn().mockResolvedValue([]);
        vi.spyOn(KingdomBuilderSettlementModel, "find").mockReturnValue({ select: () => ({ lean }) } as never);
        const findWorlds = vi.spyOn(KingdomBuilderWorldModel, "find");

        await expect(worldSummaries("player-1")).resolves.toEqual([]);
        expect(findWorlds).not.toHaveBeenCalled();
    });
});
