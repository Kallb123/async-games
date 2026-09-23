import mongoose, { Types } from "mongoose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./worldView", () => ({ worldView: vi.fn(async () => ({ worldId: "view" })) }));

import { KingdomBuilderArmyModel } from "./KingdomBuilderArmyModel";
import { KingdomBuilderSettlementModel } from "./KingdomBuilderSettlementModel";
import { KingdomBuilderWorldModel } from "./KingdomBuilderWorldModel";
import { KINGDOM_BUILDER_ARMY_LIMIT } from "./armies";
import { marchArmy } from "./march";
import { garrisonOf } from "./units";

const worldId = new Types.ObjectId().toString();
const settlementId = new Types.ObjectId().toString();
const armyId = new Types.ObjectId().toString();

// Five tiles of grass, the sea, and an island nobody can walk to.
const WORLD = {
    landmass: { width: 14, height: 2, resolution: 1, values: [1], landThreshold: 0.3 },
    terrainField: { columns: 7, rows: 1, tileSize: 2, codes: "gggggog" },
    nodes: [
        { id: "start", kind: "settlement", siteType: "player-start", x: 1, y: 1, tile: 0 },
        { id: "camp", kind: "settlement", siteType: "expansion", x: 9, y: 1, tile: 4 },
        { id: "isle", kind: "terrain", terrain: "forest", resourceYield: 1, x: 13, y: 1, tile: 6 },
    ],
    edges: [],
};

function mockWorld(world: object | null = WORLD) {
    return vi.spyOn(KingdomBuilderWorldModel, "findById").mockReturnValue({ select: () => ({ lean: async () => world }) } as never);
}

function mockSettlement(settlement: object | null) {
    return vi.spyOn(KingdomBuilderSettlementModel, "findOne").mockReturnValue({ select: () => ({ lean: async () => settlement }) } as never);
}

const home = { _id: settlementId, nodeId: "start", garrison: garrisonOf({ militia: 3, cavalry: 1 }) };

beforeEach(() => {
    vi.spyOn(mongoose.connection, "transaction").mockImplementation((async (callback: (session: object) => Promise<unknown>) => callback({})) as never);
    vi.spyOn(KingdomBuilderArmyModel, "countDocuments").mockReturnValue({ session: async () => 0 } as never);
    vi.spyOn(KingdomBuilderWorldModel, "updateOne").mockResolvedValue({ modifiedCount: 1 } as never);
});
afterEach(() => vi.restoreAllMocks());

describe("marchArmy — out of a garrison", () => {
    it("spends the garrison and sets the army out along the cheapest route, in one transaction", async () => {
        mockWorld();
        mockSettlement(home);
        const spend = vi.spyOn(KingdomBuilderSettlementModel, "updateOne").mockResolvedValue({ modifiedCount: 1 } as never);
        const create = vi.spyOn(KingdomBuilderArmyModel, "create").mockResolvedValue([] as never);

        await expect(marchArmy(worldId, "owner", { settlementId, units: { militia: 2 }, targetNodeId: "camp" })).resolves.toEqual({ worldId: "view" });

        expect(spend).toHaveBeenCalledWith(
            { _id: settlementId, worldId, ownerId: "owner", "garrison.militia": { $gte: 2 } },
            { $inc: { "garrison.militia": -2 } },
            { session: {} },
        );
        expect(create).toHaveBeenCalledWith([{
            worldId, ownerId: "owner", units: garrisonOf({ militia: 2 }),
            path: [0, 1, 2, 3, 4], pathCosts: [0, 2, 4, 6, 8], travelled: 0,
            fromNodeId: "start", targetNodeId: "camp",
        }], { session: {} });
    });

    it("tells a stranger nothing about the world — their settlement isn't found before anything else is read", async () => {
        const world = mockWorld();
        mockSettlement(null);

        await expect(marchArmy(worldId, "stranger", { settlementId, units: { militia: 1 }, targetNodeId: "camp" }))
            .rejects.toMatchObject({ code: "SITE_NOT_FOUND" });
        expect(world).not.toHaveBeenCalled();
    });

    it.each([
        ["no units", {}],
        ["an unknown unit", { dragon: 1 }],
        ["a fractional count", { militia: 1.5 }],
        ["a negative count", { militia: -1, cavalry: 1 }],
        ["a list", [1]],
    ])("refuses %s", async (_, units) => {
        await expect(marchArmy(worldId, "owner", { settlementId, units, targetNodeId: "camp" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    });

    it("refuses more units than the garrison holds, the settlement's own site, and somewhere that isn't on the map", async () => {
        mockWorld();
        mockSettlement(home);
        const spend = vi.spyOn(KingdomBuilderSettlementModel, "updateOne");

        await expect(marchArmy(worldId, "owner", { settlementId, units: { cavalry: 2 }, targetNodeId: "camp" })).rejects.toMatchObject({ code: "ARMY_BUSY" });
        await expect(marchArmy(worldId, "owner", { settlementId, units: { militia: 1 }, targetNodeId: "start" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
        await expect(marchArmy(worldId, "owner", { settlementId, units: { militia: 1 }, targetNodeId: "nowhere" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
        expect(spend).not.toHaveBeenCalled();
    });

    it("refuses a march with no way across the land, one past the army limit, and a world that has ended or has no ground", async () => {
        mockSettlement(home);
        const world = mockWorld();
        await expect(marchArmy(worldId, "owner", { settlementId, units: { militia: 1 }, targetNodeId: "isle" })).rejects.toMatchObject({ code: "NO_ROUTE" });

        const spend = vi.spyOn(KingdomBuilderSettlementModel, "updateOne");
        vi.mocked(KingdomBuilderArmyModel.countDocuments).mockReturnValue({ session: async () => KINGDOM_BUILDER_ARMY_LIMIT } as never);
        await expect(marchArmy(worldId, "owner", { settlementId, units: { militia: 1 }, targetNodeId: "camp" })).rejects.toMatchObject({ code: "ARMY_BUSY" });
        // Counted inside the transaction, behind a write to the world that makes two dispatches at once conflict.
        expect(KingdomBuilderWorldModel.updateOne).toHaveBeenCalledWith({ _id: worldId, endedAt: null }, { $inc: { armiesDispatched: 1 } }, { session: {} });
        expect(spend).not.toHaveBeenCalled();

        vi.mocked(KingdomBuilderWorldModel.updateOne).mockResolvedValue({ modifiedCount: 0 } as never);
        await expect(marchArmy(worldId, "owner", { settlementId, units: { militia: 1 }, targetNodeId: "camp" })).rejects.toMatchObject({ code: "WORLD_NOT_FOUND" });
        vi.mocked(KingdomBuilderWorldModel.updateOne).mockResolvedValue({ modifiedCount: 1 } as never);

        world.mockReturnValue({ select: () => ({ lean: async () => ({ ...WORLD, endedAt: new Date() }) }) } as never);
        await expect(marchArmy(worldId, "owner", { settlementId, units: { militia: 1 }, targetNodeId: "camp" })).rejects.toMatchObject({ code: "WORLD_NOT_FOUND" });
        world.mockReturnValue({ select: () => ({ lean: async () => ({ ...WORLD, terrainField: undefined }) }) } as never);
        await expect(marchArmy(worldId, "owner", { settlementId, units: { militia: 1 }, targetNodeId: "camp" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    });

    it("creates no army when the garrison changed under the order", async () => {
        mockWorld();
        mockSettlement(home);
        vi.spyOn(KingdomBuilderSettlementModel, "updateOne").mockResolvedValue({ modifiedCount: 0 } as never);
        const create = vi.spyOn(KingdomBuilderArmyModel, "create");

        await expect(marchArmy(worldId, "owner", { settlementId, units: { militia: 3 }, targetNodeId: "camp" })).rejects.toMatchObject({ code: "ARMY_BUSY" });
        expect(create).not.toHaveBeenCalled();
    });
});

describe("marchArmy — an army already out", () => {
    const army = {
        _id: armyId, ownerId: "owner", units: garrisonOf({ militia: 2 }),
        path: [0, 1, 2, 3, 4], pathCosts: [0, 2, 4, 6, 8], travelled: 4, fromNodeId: "start", targetNodeId: "camp",
    };

    function mockArmy(found: object | null) {
        return vi.spyOn(KingdomBuilderArmyModel, "findOne").mockReturnValue({ lean: async () => found } as never);
    }

    it("turns a marching army round from the tile it stands on, guarded on it not having moved", async () => {
        mockWorld();
        mockArmy(army);
        const move = vi.spyOn(KingdomBuilderArmyModel, "updateOne").mockResolvedValue({ modifiedCount: 1 } as never);

        await marchArmy(worldId, "owner", { armyId, targetNodeId: "start" });

        expect(move).toHaveBeenCalledWith(
            { _id: armyId, worldId, ownerId: "owner", travelled: 4, targetNodeId: "camp" },
            {
                $set: { path: [2, 1, 0], pathCosts: [0, 2, 4], travelled: 0, targetNodeId: "start", fromNodeId: "start" },
                $unset: { arrivedAtTick: 1, besiegingSince: 1 },
            },
        );
    });

    it("sends a camped army onward from its camp, and refuses to send it where it already is", async () => {
        mockWorld();
        mockArmy({ ...army, travelled: 8, arrivedAtTick: 3 });
        const move = vi.spyOn(KingdomBuilderArmyModel, "updateOne").mockResolvedValue({ modifiedCount: 1 } as never);

        await expect(marchArmy(worldId, "owner", { armyId, targetNodeId: "camp" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
        await marchArmy(worldId, "owner", { armyId, targetNodeId: "start" });

        expect(move.mock.calls[0][1]).toMatchObject({ $set: { path: [4, 3, 2, 1, 0], fromNodeId: "camp" } });
    });

    it("answers someone else's army as a missing one, and a lost race as busy", async () => {
        mockWorld();
        const found = mockArmy(null);
        await expect(marchArmy(worldId, "rival", { armyId, targetNodeId: "start" })).rejects.toMatchObject({ code: "ARMY_NOT_FOUND" });
        expect(vi.mocked(KingdomBuilderArmyModel.findOne).mock.calls[0][0]).toEqual({ _id: armyId, worldId, ownerId: "rival" });

        found.mockReturnValue({ lean: async () => army } as never);
        vi.spyOn(KingdomBuilderArmyModel, "updateOne").mockResolvedValue({ modifiedCount: 0 } as never);
        await expect(marchArmy(worldId, "owner", { armyId, targetNodeId: "start" })).rejects.toMatchObject({ code: "ARMY_BUSY" });
    });
});
