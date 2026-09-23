import { Types } from "mongoose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KingdomBuilderSettlementModel } from "./KingdomBuilderSettlementModel";
import { KingdomBuilderWorldModel } from "./KingdomBuilderWorldModel";
import { KingdomBuilderPrototypeError, queuePrototypeBuilding, queueUnitTraining } from "./prototype";

const worldId = new Types.ObjectId().toString();
const settlementId = new Types.ObjectId().toString();
const tiles = Array.from({ length: 9 }, (_, position) => ({
    position,
    ...(position === 4 ? { building: { type: "town-centre" as const, level: 1 } } : {}),
}));

/** The world is live unless a test says otherwise. */
function liveWorld() {
    vi.spyOn(KingdomBuilderWorldModel, "exists").mockResolvedValue({ _id: worldId } as never);
}
beforeEach(liveWorld);
afterEach(() => vi.restoreAllMocks());

const plenty = { wood: 500, stone: 500, iron: 500 };

function existingSettlement(ownerId = "owner") {
    const lean = vi.fn().mockResolvedValue({ ownerId, tiles, resources: plenty });
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

    it("takes no command on an ended world", async () => {
        const exists = vi.spyOn(KingdomBuilderWorldModel, "exists").mockResolvedValue(null);
        const update = vi.spyOn(KingdomBuilderSettlementModel, "findOneAndUpdate");

        await expect(queuePrototypeBuilding(worldId, settlementId, "owner", 0, "mine"))
            .rejects.toEqual(expect.objectContaining({ code: "NOT_FOUND" }));
        await expect(queueUnitTraining(worldId, settlementId, "owner", "militia"))
            .rejects.toEqual(expect.objectContaining({ code: "NOT_FOUND" }));
        expect(exists).toHaveBeenCalledWith({ _id: worldId, endedAt: null });
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
        const initialLean = vi.fn().mockResolvedValue({ ownerId: "owner", tiles, resources: plenty });
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
            {
                $set: { construction: { tilePosition: 0, buildingType: "mine", targetLevel: 1, ticksRemaining: 2 } },
                $inc: { "resources.wood": -20, "resources.stone": -10, "resources.iron": -0 },
            },
            { new: true },
        );
        expect(view.tiles[0].construction).toEqual({ buildingType: "mine", targetLevel: 1, ticksRemaining: 2 });
        expect(view.completedBuildLevels).toBe(1);
    });
});

function withBarracks(level: number) {
    return tiles.map(tile => tile.position === 0 ? { position: 0, building: { type: "barracks" as const, level } } : tile);
}

/** Stubs the pre-check read, the conditional write, and the view read after it. */
function stubSettlement(existing: object, updated: object | null = { _id: settlementId }) {
    liveWorld();
    const findOne = vi.spyOn(KingdomBuilderSettlementModel, "findOne");
    findOne.mockReturnValueOnce({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ resources: plenty, ...existing }) }) } as never);
    findOne.mockReturnValueOnce({ lean: vi.fn().mockResolvedValue({ nodeId: "start", resources: { wood: 0, stone: 0, iron: 0 }, ...existing }) } as never);
    const update = vi.spyOn(KingdomBuilderSettlementModel, "findOneAndUpdate")
        .mockReturnValue({ lean: vi.fn().mockResolvedValue(updated) } as never);
    vi.spyOn(KingdomBuilderWorldModel, "findById").mockReturnValue({
        select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ currentTick: 3, nextTickAt: new Date("2030-01-01T00:00:00Z") }) }),
    } as never);
    vi.spyOn(KingdomBuilderSettlementModel, "find").mockReturnValue({
        select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
    } as never);
    return update;
}

describe("Kingdom Builder building costs", () => {
    it("refuses a building the stores can't pay for, before writing anything", async () => {
        const update = stubSettlement({ ownerId: "owner", tiles, resources: { wood: 14, stone: 0, iron: 0 } });

        await expect(queuePrototypeBuilding(worldId, settlementId, "owner", 0, "lumber-camp"))
            .rejects.toEqual(expect.objectContaining({ code: "CANNOT_AFFORD" }));
        expect(update).not.toHaveBeenCalled();
    });

    it("pays in the same conditional write that queues the building", async () => {
        const update = stubSettlement({ ownerId: "owner", tiles, resources: { wood: 15, stone: 0, iron: 0 } });

        await queuePrototypeBuilding(worldId, settlementId, "owner", 0, "lumber-camp");

        expect(update).toHaveBeenCalledWith(
            expect.objectContaining({
                ownerId: "owner",
                construction: { $exists: false },
                "resources.wood": { $gte: 15 }, "resources.stone": { $gte: 0 }, "resources.iron": { $gte: 0 },
            }),
            expect.objectContaining({ $inc: { "resources.wood": -15, "resources.stone": -0, "resources.iron": -0 } }),
            { new: true },
        );
    });

    it("reports a lost race instead of overdrawing", async () => {
        stubSettlement({ ownerId: "owner", tiles, resources: { wood: 15, stone: 0, iron: 0 } }, null);
        await expect(queuePrototypeBuilding(worldId, settlementId, "owner", 0, "lumber-camp"))
            .rejects.toEqual(expect.objectContaining({ code: "QUEUE_BUSY" }));
    });
});

describe("Kingdom Builder barracks", () => {
    it("allows one barracks per settlement", async () => {
        const update = stubSettlement({ ownerId: "owner", tiles: withBarracks(1) });

        await expect(queuePrototypeBuilding(worldId, settlementId, "owner", 1, "barracks"))
            .rejects.toEqual(expect.objectContaining({ code: "TILE_OCCUPIED" }));
        expect(update).not.toHaveBeenCalled();
    });

    it("guards a new barracks against one being queued in another tab", async () => {
        const update = stubSettlement({ ownerId: "owner", tiles });

        await queuePrototypeBuilding(worldId, settlementId, "owner", 1, "barracks");

        expect(update).toHaveBeenCalledWith(
            expect.objectContaining({ "tiles.building.type": { $ne: "barracks" } }),
            {
                $set: { construction: { tilePosition: 1, buildingType: "barracks", targetLevel: 1, ticksRemaining: 2 } },
                $inc: { "resources.wood": -30, "resources.stone": -20, "resources.iron": -10 },
            },
            { new: true },
        );
    });

    it("upgrades the barracks a level at a time, up to its cap", async () => {
        const update = stubSettlement({ ownerId: "owner", tiles: withBarracks(2) });

        await queuePrototypeBuilding(worldId, settlementId, "owner", 0, "barracks");

        expect(update).toHaveBeenCalledWith(
            expect.objectContaining({ tiles: { $elemMatch: { position: 0, "building.type": "barracks", "building.level": 2 } } }),
            {
                $set: { construction: { tilePosition: 0, buildingType: "barracks", targetLevel: 3, ticksRemaining: 6 } },
                $inc: { "resources.wood": -90, "resources.stone": -60, "resources.iron": -30 },
            },
            { new: true },
        );

        vi.restoreAllMocks();
        stubSettlement({ ownerId: "owner", tiles: withBarracks(3) });
        await expect(queuePrototypeBuilding(worldId, settlementId, "owner", 0, "barracks"))
            .rejects.toEqual(expect.objectContaining({ code: "TILE_OCCUPIED" }));
    });

    it("never upgrades a production building", async () => {
        stubSettlement({ ownerId: "owner", tiles: withBarracks(1) });
        await expect(queuePrototypeBuilding(worldId, settlementId, "owner", 0, "mine"))
            .rejects.toEqual(expect.objectContaining({ code: "TILE_OCCUPIED" }));
    });
});

describe("Kingdom Builder training", () => {
    const rich = { wood: 100, stone: 100, iron: 100 };

    it("refuses forged units and somebody else's barracks", async () => {
        await expect(queueUnitTraining(worldId, settlementId, "owner", "dragon"))
            .rejects.toEqual(expect.objectContaining({ code: "INVALID_INPUT" }));

        const update = stubSettlement({ ownerId: "actual-owner", tiles: withBarracks(3), resources: rich });
        await expect(queueUnitTraining(worldId, settlementId, "intruder", "militia"))
            .rejects.toEqual(expect.objectContaining({ code: "FORBIDDEN" }));
        expect(update).not.toHaveBeenCalled();
    });

    it("needs a barracks, the level that unlocks the unit, room in the queue and the resources", async () => {
        stubSettlement({ ownerId: "owner", tiles, resources: rich });
        await expect(queueUnitTraining(worldId, settlementId, "owner", "militia")).rejects.toEqual(expect.objectContaining({ code: "NO_BARRACKS" }));

        vi.restoreAllMocks();
        stubSettlement({ ownerId: "owner", tiles: withBarracks(1), resources: rich });
        await expect(queueUnitTraining(worldId, settlementId, "owner", "cavalry")).rejects.toEqual(expect.objectContaining({ code: "LOCKED" }));

        vi.restoreAllMocks();
        stubSettlement({ ownerId: "owner", tiles: withBarracks(1), resources: rich,
            trainingQueue: Array.from({ length: 20 }, () => ({ unitType: "militia", ticksRemaining: 2 })) });
        await expect(queueUnitTraining(worldId, settlementId, "owner", "militia")).rejects.toEqual(expect.objectContaining({ code: "QUEUE_BUSY" }));

        vi.restoreAllMocks();
        stubSettlement({ ownerId: "owner", tiles: withBarracks(1), resources: { wood: 100, stone: 100, iron: 4 } });
        await expect(queueUnitTraining(worldId, settlementId, "owner", "militia")).rejects.toEqual(expect.objectContaining({ code: "CANNOT_AFFORD" }));
    });

    it("pays up front and queues atomically against the same checks", async () => {
        const update = stubSettlement({ ownerId: "owner", tiles: withBarracks(3), resources: rich });

        const view = await queueUnitTraining(worldId, settlementId, "owner", "militia");

        expect(update).toHaveBeenCalledWith(
            {
                _id: settlementId, worldId, ownerId: "owner",
                tiles: { $elemMatch: { "building.type": "barracks", "building.level": 3 } },
                "trainingQueue.19": { $exists: false },
                "resources.wood": { $gte: 10 }, "resources.stone": { $gte: 0 }, "resources.iron": { $gte: 5 },
            },
            {
                $inc: { "resources.wood": -10, "resources.stone": -0, "resources.iron": -5 },
                $push: { trainingQueue: { unitType: "militia", ticksRemaining: 1 } },
            },
            { new: true },
        );
        expect(view.garrison).toEqual({ militia: 0, scout: 0, infantry: 0, cavalry: 0, "siege-engine": 0 });
    });

    it("reports a lost race instead of overdrawing", async () => {
        stubSettlement({ ownerId: "owner", tiles: withBarracks(1), resources: rich }, null);
        await expect(queueUnitTraining(worldId, settlementId, "owner", "militia")).rejects.toEqual(expect.objectContaining({ code: "QUEUE_BUSY" }));
    });
});
