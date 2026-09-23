import { Types } from "mongoose";
import { afterEach, describe, expect, it, vi } from "vitest";

import { KINGDOM_BUILDER_GRID_SIZE, KINGDOM_BUILDER_TOWN_CENTRE_INDEX, KingdomBuilderSettlementModel } from "./KingdomBuilderSettlementModel";
import { KingdomBuilderWorldModel } from "./KingdomBuilderWorldModel";
import { KINGDOM_BUILDER_STARTING_STOCKPILE } from "./buildings";
import { createWorld, foundSettlement, KingdomBuilderPersistenceError } from "./persistence";
import type { WorldNode } from "./worldgen/landmass";
import type { TerrainField } from "./worldgen/terrainField";

afterEach(() => vi.restoreAllMocks());

function mockWorldNodes(nodes: WorldNode[], terrainField?: TerrainField, barbarians?: object[]) {
    const lean = vi.fn().mockResolvedValue({ nodes, terrainField, barbarians });
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
        // Every barbarian site starts with a garrison (§3.4).
        const villages = create.mock.calls[0][0].nodes.filter((node: WorldNode) => node.kind === "settlement" && node.siteType === "barbarian");
        expect(villages.length).toBeGreaterThan(0);
        expect(create.mock.calls[0][0].barbarians.map((village: { nodeId: string }) => village.nodeId).sort()).toEqual(villages.map((node: WorldNode) => node.id).sort());
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
        expect(settlement.resources).toEqual(KINGDOM_BUILDER_STARTING_STOCKPILE);
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

        expect(create.mock.calls[0][0]).toMatchObject({
            ownerId: "user-1", nodeId: "expansion-1", settlementNumber: 1, resources: { wood: 0, stone: 0, iron: 0, wheat: 0 },
        });
    });

    it("founds on a barbarian site only once its village has been burnt", async () => {
        const worldId = new Types.ObjectId().toString();
        const site: WorldNode = { id: "village", x: 10, y: 10, tile: 0, kind: "settlement", siteType: "barbarian" };
        mockWorldNodes([site], undefined, [{ nodeId: "village", garrison: { militia: 4 } }]);
        await expect(foundSettlement(worldId, "user-1", "village", undefined, "expansion")).rejects.toEqual(
            expect.objectContaining<Partial<KingdomBuilderPersistenceError>>({ code: "SITE_NOT_AVAILABLE" }),
        );

        vi.restoreAllMocks();
        mockWorldNodes([site], undefined, []);
        const create = vi.spyOn(KingdomBuilderSettlementModel, "create").mockImplementation(async (value) => value as never);
        await foundSettlement(worldId, "user-1", "village", undefined, "expansion");
        expect(create.mock.calls[0][0]).toMatchObject({ ownerId: "user-1", nodeId: "village", settlementNumber: 1 });
    });

    it("stores the land's tiers once, at founding, read off the ground round the site (§4.6)", async () => {
        const worldId = new Types.ObjectId().toString();
        // Woodland under the site, then grass: wood and wheat, no stone or iron.
        mockWorldNodes(
            [{ id: "start-1", x: 1, y: 1, tile: 0, kind: "settlement", siteType: "player-start" }],
            { columns: 12, rows: 1, tileSize: 2, codes: "ww" + "g".repeat(10) },
        );
        const create = vi.spyOn(KingdomBuilderSettlementModel, "create").mockImplementation(async (value) => value as never);

        await foundSettlement(worldId, "user-1", "start-1");

        expect(create.mock.calls[0][0].catchment).toEqual({ wood: "rich", stone: "none", iron: "none", wheat: "rich" });
    });

    it("gives a settlement on a world with no ground Good land, bar iron", async () => {
        const worldId = new Types.ObjectId().toString();
        mockWorldNodes([{ id: "start-1", x: 10, y: 10, tile: 0, kind: "settlement", siteType: "player-start" }]);
        const create = vi.spyOn(KingdomBuilderSettlementModel, "create").mockImplementation(async (value) => value as never);

        await foundSettlement(worldId, "user-1", "start-1");

        expect(create.mock.calls[0][0].catchment).toEqual({ wood: "good", stone: "good", iron: "none", wheat: "good" });
    });
});
