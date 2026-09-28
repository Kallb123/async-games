import mongoose, { Types } from "mongoose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KingdomBuilderArmyModel } from "./KingdomBuilderArmyModel";
import { KingdomBuilderSettlementModel } from "./KingdomBuilderSettlementModel";
import { KingdomBuilderWorldModel } from "./KingdomBuilderWorldModel";
import {
    KingdomBuilderPrototypeError,
    buyCaravan,
    cancelBuildingConstruction,
    cancelUnitTraining,
    exchangeAtMarket,
    queuePrototypeBuilding,
    queueUnitTraining,
    removeBuilding,
    settlementView,
} from "./prototype";

const worldId = new Types.ObjectId().toString();
const settlementId = new Types.ObjectId().toString();
const tiles = Array.from({ length: 9 }, (_, position) => ({
    position,
    ...(position === 4 ? { building: { type: "town-centre" as const, level: 1 } } : {}),
}));

/** The world is live, and nobody is besieging anything, unless a test says otherwise. */
function liveWorld() {
    vi.spyOn(KingdomBuilderWorldModel, "exists").mockResolvedValue({ _id: worldId } as never);
    vi.spyOn(KingdomBuilderArmyModel, "find").mockReturnValue({ select: () => ({ lean: async () => [] }) } as never);
}
beforeEach(liveWorld);
afterEach(() => vi.restoreAllMocks());

const plenty = { wood: 500, stone: 500, iron: 500, wheat: 500 };
/** Land that yields everything, so a test about something else never trips the tier check. */
const land = { wood: "good", stone: "good", iron: "good", wheat: "good" } as const;

function existingSettlement(ownerId = "owner") {
    const lean = vi.fn().mockResolvedValue({ ownerId, tiles, resources: plenty, catchment: land });
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
        const initialLean = vi.fn().mockResolvedValue({ ownerId: "owner", tiles, resources: plenty, catchment: land });
        findOne.mockReturnValueOnce({ select: vi.fn().mockReturnValue({ lean: initialLean }) } as never);
        findOne.mockReturnValueOnce({
            lean: vi.fn().mockResolvedValue({ ownerId: "owner", nodeId: "start", tiles, resources: { wood: 0, stone: 0, iron: 0 }, catchment: land,
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
                $inc: { "resources.wood": -20, "resources.stone": -10 },
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
    findOne.mockReturnValueOnce({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ resources: plenty, catchment: land, ...existing }) }) } as never);
    findOne.mockReturnValueOnce({ lean: vi.fn().mockResolvedValue({ nodeId: "start", resources: { wood: 0, stone: 0, iron: 0 }, catchment: land, ...existing }) } as never);
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
                "resources.wood": { $gte: 15 },
            }),
            expect.objectContaining({ $inc: { "resources.wood": -15 } }),
            { new: true },
        );
        // Only what the price asks for is checked — a settlement stored before
        // wheat existed has no wheat field for a `$gte: 0` to find.
        expect(Object.keys(update.mock.calls[0][0] as object)).not.toContain("resources.wheat");
    });

    it("refuses a building on land that yields none of its resource, before writing anything", async () => {
        const update = stubSettlement({ ownerId: "owner", tiles, catchment: { ...land, iron: "none" } });

        await expect(queuePrototypeBuilding(worldId, settlementId, "owner", 0, "mine"))
            .rejects.toEqual(expect.objectContaining({ code: "NO_YIELD" }));
        expect(update).not.toHaveBeenCalled();
    });

    it("works out the land of a settlement from before PR 18 from its world's ground, and saves it once", async () => {
        const update = stubSettlement({ ownerId: "owner", nodeId: "start", tiles, catchment: undefined });
        // The world's ground: one row of grass, the settlement on its first tile — wheat, and nothing else.
        vi.mocked(KingdomBuilderWorldModel.findById).mockReturnValue({
            select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({
                currentTick: 3, nextTickAt: new Date("2030-01-01T00:00:00Z"),
                terrainField: { columns: 12, rows: 1, tileSize: 2, codes: "g".repeat(12) },
                nodes: [{ id: "start", kind: "settlement", siteType: "player-start", x: 1, y: 1, tile: 0 }],
            }) }),
        } as never);
        const save = vi.spyOn(KingdomBuilderSettlementModel, "updateOne").mockResolvedValue({} as never);

        await expect(queuePrototypeBuilding(worldId, settlementId, "owner", 0, "lumber-camp"))
            .rejects.toEqual(expect.objectContaining({ code: "NO_YIELD" }));
        expect(save).toHaveBeenCalledWith(
            expect.objectContaining({ catchment: { $exists: false } }),
            { $set: { catchment: { wood: "none", stone: "none", iron: "none", wheat: "rich" } } },
        );
        expect(update).not.toHaveBeenCalled();
    });

    it("reports a lost race instead of overdrawing", async () => {
        stubSettlement({ ownerId: "owner", tiles, resources: { wood: 15, stone: 0, iron: 0 } }, null);
        await expect(queuePrototypeBuilding(worldId, settlementId, "owner", 0, "lumber-camp"))
            .rejects.toEqual(expect.objectContaining({ code: "QUEUE_BUSY" }));
    });
});

describe("Kingdom Builder building changes", () => {
    it("cancels a build and atomically refunds its full price", async () => {
        const construction = { tilePosition: 0, buildingType: "mine" as const, targetLevel: 2, ticksRemaining: 3 };
        const update = stubSettlement({ ownerId: "owner", tiles, construction });

        await cancelBuildingConstruction(worldId, settlementId, "owner");

        expect(update).toHaveBeenCalledWith(
            expect.objectContaining({ ownerId: "owner", construction }),
            { $unset: { construction: 1 }, $inc: { "resources.wood": 40, "resources.stone": 20 } },
            { new: true },
        );
    });

    it("does not refund when the construction changed before cancellation", async () => {
        const construction = { tilePosition: 0, buildingType: "mine" as const, targetLevel: 1, ticksRemaining: 1 };
        stubSettlement({ ownerId: "owner", tiles, construction }, null);

        await expect(cancelBuildingConstruction(worldId, settlementId, "owner"))
            .rejects.toEqual(expect.objectContaining({ code: "QUEUE_BUSY" }));
    });

    it("removes a completed outer building without refunding it", async () => {
        const builtTiles = withBarracks(2);
        const update = stubSettlement({ ownerId: "owner", tiles: builtTiles });

        await removeBuilding(worldId, settlementId, "owner", 0);

        expect(update).toHaveBeenCalledWith(
            expect.objectContaining({
                ownerId: "owner",
                "construction.tilePosition": { $ne: 0 },
                tiles: { $elemMatch: { position: 0, "building.type": "barracks", "building.level": 2 } },
            }),
            { $unset: { "tiles.$.building": 1 } },
            { new: true },
        );
    });

    it("never removes the town centre or a building being upgraded", async () => {
        const update = stubSettlement({ ownerId: "owner", tiles });
        await expect(removeBuilding(worldId, settlementId, "owner", 4))
            .rejects.toEqual(expect.objectContaining({ code: "INVALID_INPUT" }));
        expect(update).not.toHaveBeenCalled();

        vi.restoreAllMocks();
        const builtTiles = withBarracks(1);
        const busyUpdate = stubSettlement({
            ownerId: "owner",
            tiles: builtTiles,
            construction: { tilePosition: 0, buildingType: "barracks", targetLevel: 2, ticksRemaining: 2 },
        });
        await expect(removeBuilding(worldId, settlementId, "owner", 0))
            .rejects.toEqual(expect.objectContaining({ code: "QUEUE_BUSY" }));
        expect(busyUpdate).not.toHaveBeenCalled();
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
    const rich = { wood: 100, stone: 100, iron: 100, wheat: 100 };

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
        stubSettlement({ ownerId: "owner", tiles: withBarracks(1), resources: { wood: 100, stone: 100, iron: 4, wheat: 100 } });
        await expect(queueUnitTraining(worldId, settlementId, "owner", "militia")).rejects.toEqual(expect.objectContaining({ code: "CANNOT_AFFORD" }));

        // Armies eat (§4.6) — and a settlement stored before wheat existed has none.
        vi.restoreAllMocks();
        stubSettlement({ ownerId: "owner", tiles: withBarracks(1), resources: { wood: 100, stone: 100, iron: 100 } });
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
                "resources.wood": { $gte: 10 }, "resources.iron": { $gte: 5 }, "resources.wheat": { $gte: 5 },
            },
            {
                $inc: { "resources.wood": -10, "resources.iron": -5, "resources.wheat": -5 },
                $push: { trainingQueue: { unitType: "militia", ticksRemaining: 1, orderId: expect.any(String) } },
            },
            { new: true },
        );
        expect(view.garrison).toEqual({ militia: 0, scout: 0, spearman: 0, archer: 0, infantry: 0, cavalry: 0, "siege-engine": 0, settler: 0, commander: 0 });
    });

    it("reports a lost race instead of overdrawing", async () => {
        stubSettlement({ ownerId: "owner", tiles: withBarracks(1), resources: rich }, null);
        await expect(queueUnitTraining(worldId, settlementId, "owner", "militia")).rejects.toEqual(expect.objectContaining({ code: "QUEUE_BUSY" }));
    });
});

describe("Kingdom Builder cancelling training", () => {
    const orderId = new Types.ObjectId().toString();
    const queue = [
        { unitType: "militia", ticksRemaining: 1, orderId: new Types.ObjectId().toString() },
        { unitType: "militia", ticksRemaining: 2, orderId },
        { unitType: "militia", ticksRemaining: 2, orderId: new Types.ObjectId().toString() },
    ];

    it("refuses forged orders and somebody else's queue, before writing anything", async () => {
        const update = stubSettlement({ ownerId: "actual-owner", trainingQueue: queue });
        for (const forged of [undefined, 1, "not-an-id", { $ne: null }]) {
            await expect(cancelUnitTraining(worldId, settlementId, "owner", forged)).rejects.toEqual(expect.objectContaining({ code: "INVALID_INPUT" }));
        }
        await expect(cancelUnitTraining(worldId, settlementId, "intruder", orderId)).rejects.toEqual(expect.objectContaining({ code: "FORBIDDEN" }));
        expect(update).not.toHaveBeenCalled();
    });

    it("pulls only the named order, refunding its whole cost in the same write", async () => {
        const update = stubSettlement({ ownerId: "owner", tiles: withBarracks(1), trainingQueue: queue });

        await cancelUnitTraining(worldId, settlementId, "owner", orderId);

        expect(update).toHaveBeenCalledWith(
            { _id: settlementId, worldId, ownerId: "owner", trainingQueue: { $elemMatch: { orderId, unitType: "militia" } } },
            {
                $pull: { trainingQueue: { orderId } },
                $inc: { "resources.wood": 10, "resources.iron": 5, "resources.wheat": 5 },
            },
            { new: true },
        );
    });

    it("refuses an order that has left the queue instead of refunding it", async () => {
        const update = stubSettlement({ ownerId: "owner", tiles: withBarracks(1), trainingQueue: queue.filter(order => order.orderId !== orderId) });
        await expect(cancelUnitTraining(worldId, settlementId, "owner", orderId)).rejects.toEqual(expect.objectContaining({ code: "QUEUE_BUSY" }));
        expect(update).not.toHaveBeenCalled();

        vi.restoreAllMocks();
        stubSettlement({ ownerId: "owner", tiles: withBarracks(1), trainingQueue: queue }, null);
        await expect(cancelUnitTraining(worldId, settlementId, "owner", orderId)).rejects.toEqual(expect.objectContaining({ code: "QUEUE_BUSY" }));
    });
});

function withTownCentre(level: number) {
    return tiles.map(tile => tile.position === 4 ? { position: 4, building: { type: "town-centre" as const, level } } : tile);
}

describe("Kingdom Builder town centre and settlers (PR 24)", () => {
    it("raises the town centre where it stands, to its cap, and builds nothing else on its tile", async () => {
        const update = stubSettlement({ ownerId: "owner", tiles });

        await queuePrototypeBuilding(worldId, settlementId, "owner", 4, "town-centre");

        expect(update).toHaveBeenCalledWith(
            expect.objectContaining({ tiles: { $elemMatch: { position: 4, "building.type": "town-centre", "building.level": 1 } } }),
            {
                $set: { construction: { tilePosition: 4, buildingType: "town-centre", targetLevel: 2, ticksRemaining: 4 } },
                $inc: { "resources.wood": -60, "resources.stone": -60, "resources.iron": -20 },
            },
            { new: true },
        );

        vi.restoreAllMocks();
        stubSettlement({ ownerId: "owner", tiles: withTownCentre(2) });
        await expect(queuePrototypeBuilding(worldId, settlementId, "owner", 4, "town-centre"))
            .rejects.toEqual(expect.objectContaining({ code: "TILE_OCCUPIED" }));
        await expect(queuePrototypeBuilding(worldId, settlementId, "owner", 0, "town-centre"))
            .rejects.toEqual(expect.objectContaining({ code: "INVALID_INPUT" }));
    });

    /** The player has trained `trained` settlers before this one; the transaction runs straight through. */
    function settlerWorld(trained?: number) {
        vi.spyOn(mongoose.connection, "transaction").mockImplementation((async (callback: (session: object) => Promise<unknown>) => callback({})) as never);
        return vi.spyOn(KingdomBuilderWorldModel, "findOneAndUpdate").mockReturnValue({
            select: () => ({ lean: async () => ({ _id: worldId, ...(trained === undefined ? {} : { settlersTrained: { owner: trained } }) }) }),
        } as never);
    }

    it("trains a settler only at a level-two town centre, with no barracks needed", async () => {
        stubSettlement({ ownerId: "owner", tiles, resources: plenty });
        await expect(queueUnitTraining(worldId, settlementId, "owner", "settler")).rejects.toEqual(expect.objectContaining({ code: "LOCKED" }));

        vi.restoreAllMocks();
        const update = stubSettlement({ ownerId: "owner", tiles: withTownCentre(2), resources: plenty });
        settlerWorld();
        await queueUnitTraining(worldId, settlementId, "owner", "settler");
        const cost = { wood: 60, stone: 40, iron: 10, wheat: 40 };
        expect(update).toHaveBeenCalledWith(
            expect.objectContaining({ tiles: { $elemMatch: { "building.type": "town-centre", "building.level": 2 } } }),
            expect.objectContaining({ $push: { trainingQueue: { unitType: "settler", ticksRemaining: 4, orderId: expect.any(String), cost } } }),
            { new: true, session: {} },
        );
    });

    it("prices each settler at double the last, counting in the same transaction as the payment", async () => {
        const update = stubSettlement({ ownerId: "owner", tiles: withTownCentre(2), resources: plenty });
        const count = settlerWorld(2);

        await queueUnitTraining(worldId, settlementId, "owner", "settler");

        expect(count).toHaveBeenCalledWith({ _id: worldId, endedAt: null }, { $inc: { "settlersTrained.owner": 1 } }, { session: {}, new: false });
        // Two before it: four times the listed 60 wood, 40 stone, 10 iron and 40 wheat.
        const cost = { wood: 240, stone: 160, iron: 40, wheat: 160 };
        expect(update).toHaveBeenCalledWith(
            expect.objectContaining({ "resources.wood": { $gte: 240 }, "resources.stone": { $gte: 160 }, "resources.iron": { $gte: 40 }, "resources.wheat": { $gte: 160 } }),
            expect.objectContaining({
                $inc: { "resources.wood": -240, "resources.stone": -160, "resources.iron": -40, "resources.wheat": -160 },
                $push: { trainingQueue: expect.objectContaining({ unitType: "settler", cost }) },
            }),
            { new: true, session: {} },
        );
    });

    it("refuses a settler the stores can't pay the doubled price for, before writing to the settlement", async () => {
        const update = stubSettlement({ ownerId: "owner", tiles: withTownCentre(2), resources: plenty });
        // Four before it: 960 wood, more than the 500 held.
        settlerWorld(4);
        await expect(queueUnitTraining(worldId, settlementId, "owner", "settler")).rejects.toEqual(expect.objectContaining({ code: "CANNOT_AFFORD" }));
        expect(update).not.toHaveBeenCalled();
    });

    it("refunds a cancelled settler what it was queued at, and gives back its place in the doubling", async () => {
        const orderId = new Types.ObjectId().toString();
        const cost = { wood: 120, stone: 80, iron: 20, wheat: 80 };
        const update = stubSettlement({ ownerId: "owner", tiles: withTownCentre(2), trainingQueue: [{ unitType: "settler", ticksRemaining: 4, orderId, cost }] });
        vi.spyOn(mongoose.connection, "transaction").mockImplementation((async (callback: (session: object) => Promise<unknown>) => callback({})) as never);
        const uncount = vi.spyOn(KingdomBuilderWorldModel, "updateOne").mockResolvedValue({ modifiedCount: 1 } as never);

        await cancelUnitTraining(worldId, settlementId, "owner", orderId);

        expect(uncount).toHaveBeenCalledWith({ _id: worldId, "settlersTrained.owner": { $gt: 0 } }, { $inc: { "settlersTrained.owner": -1 } }, { session: {} });
        expect(update).toHaveBeenCalledWith(
            expect.objectContaining({ trainingQueue: { $elemMatch: { orderId, unitType: "settler" } } }),
            { $pull: { trainingQueue: { orderId } }, $inc: { "resources.wood": 120, "resources.stone": 80, "resources.iron": 20, "resources.wheat": 80 } },
            { new: true, session: {} },
        );
    });

    it("shows the owner what their next settler costs, reading only their own count", async () => {
        stubSettlement({ ownerId: "owner", tiles: withTownCentre(2) });
        vi.spyOn(KingdomBuilderSettlementModel, "findOne").mockReset().mockReturnValue({
            lean: vi.fn().mockResolvedValue({ ownerId: "owner", nodeId: "start", tiles: withTownCentre(2), resources: plenty, catchment: land }),
        } as never);
        const select = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ currentTick: 3, nextTickAt: new Date("2030-01-01T00:00:00Z"), settlersTrained: { owner: 1 } }) });
        vi.spyOn(KingdomBuilderWorldModel, "findById").mockReturnValue({ select } as never);

        const view = await settlementView(worldId, settlementId, "owner");

        expect(select).toHaveBeenCalledWith({ currentTick: 1, nextTickAt: 1, endedAt: 1, "settlersTrained.owner": 1 });
        expect(view.settlerCost).toEqual({ wood: 120, stone: 80, iron: 20, wheat: 80 });
    });
});

function withTavern(level: number, townCentre = 1) {
    return withTownCentre(townCentre).map(tile => tile.position === 2 ? { position: 2, building: { type: "tavern" as const, level } } : tile);
}

describe("Kingdom Builder tavern (PR 26)", () => {
    it("builds a first tavern at town-centre level 1, guarded on the town centre in the same write", async () => {
        const update = stubSettlement({ ownerId: "owner", tiles });

        await queuePrototypeBuilding(worldId, settlementId, "owner", 2, "tavern");

        expect(update).toHaveBeenCalledWith(
            expect.objectContaining({
                $and: [
                    { tiles: { $elemMatch: { position: 2, building: { $exists: false } } }, "tiles.building.type": { $ne: "tavern" } },
                    { tiles: { $elemMatch: { "building.type": "town-centre", "building.level": { $gte: 1 } } } },
                ],
            }),
            {
                $set: { construction: { tilePosition: 2, buildingType: "tavern", targetLevel: 1, ticksRemaining: 2 } },
                $inc: { "resources.wood": -25, "resources.stone": -15, "resources.wheat": -10 },
            },
            { new: true },
        );
    });

    it("refuses level 2 while the town centre stands at level 1, before writing anything", async () => {
        const update = stubSettlement({ ownerId: "owner", tiles: withTavern(1) });

        await expect(queuePrototypeBuilding(worldId, settlementId, "owner", 2, "tavern"))
            .rejects.toEqual(expect.objectContaining({ code: "LOCKED", message: "Raise the town centre to level 2 first" }));
        expect(update).not.toHaveBeenCalled();
    });

    it("refuses level 2 while the town centre's own level 2 is still being built", async () => {
        // Only the built level counts — and the one building project a settlement runs at a time is busy with it anyway.
        const update = stubSettlement({
            ownerId: "owner", tiles: withTavern(1),
            construction: { tilePosition: 4, buildingType: "town-centre", targetLevel: 2, ticksRemaining: 3 },
        });

        await expect(queuePrototypeBuilding(worldId, settlementId, "owner", 2, "tavern")).rejects.toBeDefined();
        expect(update).not.toHaveBeenCalled();
    });

    it("accepts level 2 once the town centre has reached level 2, and goes no higher", async () => {
        const update = stubSettlement({ ownerId: "owner", tiles: withTavern(1, 2) });

        await queuePrototypeBuilding(worldId, settlementId, "owner", 2, "tavern");
        expect(update).toHaveBeenCalledWith(
            expect.objectContaining({
                $and: [
                    { tiles: { $elemMatch: { position: 2, "building.type": "tavern", "building.level": 1 } } },
                    { tiles: { $elemMatch: { "building.type": "town-centre", "building.level": { $gte: 2 } } } },
                ],
            }),
            expect.objectContaining({ $set: { construction: { tilePosition: 2, buildingType: "tavern", targetLevel: 2, ticksRemaining: 4 } } }),
            { new: true },
        );

        vi.restoreAllMocks();
        stubSettlement({ ownerId: "owner", tiles: withTavern(2, 2) });
        await expect(queuePrototypeBuilding(worldId, settlementId, "owner", 2, "tavern"))
            .rejects.toEqual(expect.objectContaining({ code: "TILE_OCCUPIED" }));
    });

    it("allows one tavern per settlement", async () => {
        stubSettlement({ ownerId: "owner", tiles: withTavern(1) });
        await expect(queuePrototypeBuilding(worldId, settlementId, "owner", 3, "tavern"))
            .rejects.toEqual(expect.objectContaining({ code: "TILE_OCCUPIED" }));
    });
});

function withMarket(level: number) {
    return tiles.map(tile => tile.position === 1 ? { position: 1, building: { type: "market" as const, level } } : tile);
}

describe("Kingdom Builder market", () => {
    it("builds one market, and raises it a level at a time up to its cap", async () => {
        let update = stubSettlement({ ownerId: "owner", tiles: withMarket(1) });
        await expect(queuePrototypeBuilding(worldId, settlementId, "owner", 2, "market"))
            .rejects.toEqual(expect.objectContaining({ code: "TILE_OCCUPIED" }));
        expect(update).not.toHaveBeenCalled();

        vi.restoreAllMocks();
        update = stubSettlement({ ownerId: "owner", tiles: withMarket(1) });
        await queuePrototypeBuilding(worldId, settlementId, "owner", 1, "market");
        expect(update).toHaveBeenCalledWith(
            expect.objectContaining({ tiles: { $elemMatch: { position: 1, "building.type": "market", "building.level": 1 } } }),
            {
                $set: { construction: { tilePosition: 1, buildingType: "market", targetLevel: 2, ticksRemaining: 4 } },
                $inc: { "resources.wood": -50, "resources.stone": -30 },
            },
            { new: true },
        );

        vi.restoreAllMocks();
        update = stubSettlement({ ownerId: "owner", tiles: withMarket(3) });
        await expect(queuePrototypeBuilding(worldId, settlementId, "owner", 1, "market"))
            .rejects.toEqual(expect.objectContaining({ code: "TILE_OCCUPIED" }));
        expect(update).not.toHaveBeenCalled();
    });

    it("exchanges at the market's rate, repeating its level and the stores in the write", async () => {
        const update = stubSettlement({ ownerId: "owner", tiles: withMarket(2), resources: { ...plenty, wood: 9 } });

        await exchangeAtMarket(worldId, settlementId, "owner", { give: "wood", get: "iron", amount: 3 });

        expect(update).toHaveBeenCalledWith(
            {
                _id: settlementId, worldId, ownerId: "owner",
                tiles: { $elemMatch: { "building.type": "market", "building.level": 2 } },
                "resources.wood": { $gte: 9 },
            },
            { $inc: { "resources.wood": -9, "resources.iron": 3 } },
            { new: true },
        );
    });

    it("refuses an exchange with no market, one the stores can't cover, or a forged one", async () => {
        let update = stubSettlement({ ownerId: "owner", tiles });
        await expect(exchangeAtMarket(worldId, settlementId, "owner", { give: "wood", get: "iron", amount: 1 }))
            .rejects.toEqual(expect.objectContaining({ code: "NO_MARKET" }));

        vi.restoreAllMocks();
        update = stubSettlement({ ownerId: "owner", tiles: withMarket(1), resources: { ...plenty, wood: 7 } });
        await expect(exchangeAtMarket(worldId, settlementId, "owner", { give: "wood", get: "iron", amount: 2 }))
            .rejects.toEqual(expect.objectContaining({ code: "CANNOT_AFFORD" }));

        for (const forged of [
            { give: "wood", get: "wood", amount: 1 },
            { give: "gold", get: "iron", amount: 1 },
            { give: "wood", get: "iron", amount: 0 },
            { give: "wood", get: "iron", amount: 1.5 },
            { give: "wood", get: "iron", amount: "1" },
        ]) {
            await expect(exchangeAtMarket(worldId, settlementId, "owner", forged)).rejects.toEqual(expect.objectContaining({ code: "INVALID_INPUT" }));
        }
        expect(update).not.toHaveBeenCalled();
    });

    it("refuses somebody else's market", async () => {
        let update = stubSettlement({ ownerId: "actual-owner", tiles: withMarket(1) });
        await expect(exchangeAtMarket(worldId, settlementId, "intruder", { give: "wood", get: "iron", amount: 1 }))
            .rejects.toEqual(expect.objectContaining({ code: "FORBIDDEN" }));
        expect(update).not.toHaveBeenCalled();

        vi.restoreAllMocks();
        update = stubSettlement({ ownerId: "actual-owner", tiles: withMarket(1) });
        await expect(buyCaravan(worldId, settlementId, "intruder")).rejects.toEqual(expect.objectContaining({ code: "FORBIDDEN" }));
        expect(update).not.toHaveBeenCalled();
    });

    it("sells a caravan at the market, paid for in the same write that adds it", async () => {
        const update = stubSettlement({ ownerId: "owner", tiles: withMarket(1) });

        await buyCaravan(worldId, settlementId, "owner");

        expect(update).toHaveBeenCalledWith(
            { _id: settlementId, worldId, ownerId: "owner", "tiles.building.type": "market", "resources.wood": { $gte: 20 }, "resources.wheat": { $gte: 10 } },
            { $inc: { "resources.wood": -20, "resources.wheat": -10, caravans: 1 } },
            { new: true },
        );
    });
});
