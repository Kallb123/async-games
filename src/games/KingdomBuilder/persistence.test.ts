import { Types } from "mongoose";
import { afterEach, describe, expect, it, vi } from "vitest";

import { KINGDOM_BUILDER_GRID_SIZE, KINGDOM_BUILDER_TOWN_CENTRE_INDEX, KingdomBuilderSettlementModel } from "./KingdomBuilderSettlementModel";
import { KingdomBuilderWorldModel } from "./KingdomBuilderWorldModel";
import { createWorld, foundSettlement, KingdomBuilderPersistenceError } from "./persistence";
import type { WorldNode } from "./worldgen/landmass";

afterEach(() => vi.restoreAllMocks());

function mockWorldNodes(nodes: WorldNode[]) {
    const lean = vi.fn().mockResolvedValue({ nodes });
    const select = vi.fn().mockReturnValue({ lean });
    vi.spyOn(KingdomBuilderWorldModel, "findById").mockReturnValue({ select } as never);
    vi.spyOn(KingdomBuilderSettlementModel, "exists").mockResolvedValue(null);
}

describe("Kingdom Builder persistence", () => {
    it("persists one generated world with its tick initialized", async () => {
        const create = vi.spyOn(KingdomBuilderWorldModel, "create").mockImplementation(async (value) => value as never);

        await createWorld(" repeatable-world ");

        expect(create).toHaveBeenCalledOnce();
        expect(create.mock.calls[0][0]).toMatchObject({ seed: "repeatable-world", currentTick: 0 });
        expect(create.mock.calls[0][0].nodes.length).toBeGreaterThan(0);
        expect(create.mock.calls[0][0].edges.length).toBeGreaterThan(0);
    });

    it("rejects malformed settlement tile grids", async () => {
        const settlement = new KingdomBuilderSettlementModel({
            worldId: new Types.ObjectId(),
            ownerId: "user-1",
            nodeId: "site-1",
            tiles: [],
            resources: { wood: 0, stone: 0, iron: 0 },
        });

        await expect(settlement.validate()).rejects.toThrow("complete 3x3 grid");
    });

    it("founds a player's level-one town centre on an eligible site", async () => {
        const worldId = new Types.ObjectId().toString();
        mockWorldNodes([{ id: "start-1", x: 10, y: 10, tile: 0, kind: "settlement", siteType: "player-start" }]);
        const create = vi.spyOn(KingdomBuilderSettlementModel, "create").mockImplementation(async (value) => value as never);

        await foundSettlement(worldId, " user-1 ", "start-1");

        const settlement = create.mock.calls[0][0];
        expect(settlement.ownerId).toBe("user-1");
        expect(settlement.settlementNumber).toBe(0);
        expect(settlement.tiles).toHaveLength(KINGDOM_BUILDER_GRID_SIZE);
        expect(settlement.tiles[KINGDOM_BUILDER_TOWN_CENTRE_INDEX]).toEqual({
            position: KINGDOM_BUILDER_TOWN_CENTRE_INDEX,
            building: { type: "town-centre", level: 1 },
        });
        expect(settlement.resources).toEqual({ wood: 0, stone: 0, iron: 0 });
    });

    it("does not found on expansion or terrain nodes", async () => {
        const worldId = new Types.ObjectId().toString();
        mockWorldNodes([{ id: "future-site", x: 10, y: 10, tile: 0, kind: "settlement", siteType: "expansion" }]);

        await expect(foundSettlement(worldId, "user-1", "future-site")).rejects.toEqual(
            expect.objectContaining<Partial<KingdomBuilderPersistenceError>>({ code: "SITE_NOT_AVAILABLE" }),
        );
    });

    it("allows an owner to found more than one settlement at expansion sites", async () => {
        const worldId = new Types.ObjectId().toString();
        mockWorldNodes([{ id: "expansion-1", x: 10, y: 10, tile: 0, kind: "settlement", siteType: "expansion" }]);
        const create = vi.spyOn(KingdomBuilderSettlementModel, "create").mockImplementation(async (value) => value as never);

        await foundSettlement(worldId, "user-1", "expansion-1", undefined, "expansion");

        expect(create.mock.calls[0][0]).toMatchObject({ ownerId: "user-1", nodeId: "expansion-1", settlementNumber: 1 });
    });
});
