import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/utils/mongodb/mongodb", () => ({
    dbConnect: vi.fn().mockResolvedValue({
        connection: { transaction: vi.fn((callback: (session: object) => unknown) => callback({})) },
    }),
}));

import { KingdomBuilderArmyModel, KingdomBuilderBattleModel, KingdomBuilderSettlementModel, KingdomBuilderWorldModel } from "@/games/KingdomBuilder";
import { POST } from "./route";

const originalSecret = process.env.CRON_SECRET;

afterAll(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
});
afterEach(() => vi.restoreAllMocks());

function request(authorization?: string) {
    return new NextRequest("https://example.test/api/cron/kingdombuilder-tick", {
        method: "POST",
        headers: authorization ? { authorization } : undefined,
    });
}

describe("POST /api/cron/kingdombuilder-tick", () => {
    it("refuses a caller without the cron secret", async () => {
        process.env.CRON_SECRET = "cron-secret";
        const response = await POST(request());
        expect(response.status).toBe(401);
    });

    it("accepts the scheduler bearer token", async () => {
        process.env.CRON_SECRET = "cron-secret";
        const lean = vi.fn().mockResolvedValue([]);
        const select = vi.fn().mockReturnValue({ lean });
        const limit = vi.fn().mockReturnValue({ select });
        const sort = vi.fn().mockReturnValue({ limit });
        vi.spyOn(KingdomBuilderWorldModel, "find").mockReturnValue({ sort } as never);

        const response = await POST(request("Bearer cron-secret"));

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ scanned: 0, ticked: 0, skipped: 0, failed: 0, unswept: 0, capped: false, removed: 0, removalFailed: 0 });
    });

    it("backfills the land of a settlement from before PR 18 off its world's ground, and pays by it", async () => {
        process.env.CRON_SECRET = "cron-secret";
        const worldId = "64b000000000000000000001";
        // The due world, then — for the removal sweep — no ended ones.
        const lean = vi.fn().mockResolvedValueOnce([{ _id: worldId }]).mockResolvedValue([]);
        const chain = { sort: () => chain, limit: () => chain, select: () => chain, lean };
        vi.spyOn(KingdomBuilderWorldModel, "find").mockReturnValue(chain as never);
        const world = { currentTick: 5, nextTickAt: new Date(Date.now() - 1000) };
        // One row of grass under the settlement: rich in wheat, nothing else.
        const ground = {
            terrainField: { columns: 12, rows: 1, tileSize: 2, codes: "g".repeat(12) },
            nodes: [{ id: "start", kind: "settlement", siteType: "player-start", x: 1, y: 1, tile: 0 }],
        };
        const findById = vi.spyOn(KingdomBuilderWorldModel, "findById")
            .mockReturnValueOnce({ select: () => ({ session: () => ({ lean: async () => world }) }) } as never)
            .mockReturnValueOnce({ select: () => ({ session: () => ({ lean: async () => ground }) }) } as never);
        vi.spyOn(KingdomBuilderWorldModel, "updateOne").mockResolvedValue({ modifiedCount: 1 } as never);
        vi.spyOn(KingdomBuilderSettlementModel, "find").mockReturnValue({ session: () => ({ lean: async () => [{
            _id: "s1", worldId, ownerId: "owner", nodeId: "start",
            tiles: [{ position: 0, building: { type: "farm", level: 1 } }, { position: 4, building: { type: "town-centre", level: 1 } }],
            resources: { wood: 0, stone: 0, iron: 0 },
        }] }) } as never);
        const bulkWrite = vi.spyOn(KingdomBuilderSettlementModel, "bulkWrite").mockResolvedValue({} as never);
        vi.spyOn(KingdomBuilderArmyModel, "find").mockReturnValue({ sort: () => ({ session: () => ({ lean: async () => [] }) }) } as never);

        const response = await POST(request("Bearer cron-secret"));

        expect(response.status).toBe(200);
        expect(findById).toHaveBeenCalledTimes(2);
        const [{ updateOne }] = bulkWrite.mock.calls[0][0] as unknown as [{ updateOne: { update: { $set: Record<string, unknown> } } }];
        expect(updateOne.update.$set.catchment).toEqual({ wood: "none", stone: "none", iron: "none", wheat: "rich" });
        // A rich farm's 3 and the town centre's 1 — into stores that had no wheat field at all.
        expect(updateOne.update.$set.resources).toEqual({ wood: 1, stone: 0, iron: 0, wheat: 4 });
    });

    it("marches the world's armies, camping one, folding one that reached home back into its garrison, and dating a siege", async () => {
        process.env.CRON_SECRET = "cron-secret";
        const worldId = "64b000000000000000000002";
        const lean = vi.fn().mockResolvedValueOnce([{ _id: worldId }]).mockResolvedValue([]);
        const chain = { sort: () => chain, limit: () => chain, select: () => chain, lean };
        vi.spyOn(KingdomBuilderWorldModel, "find").mockReturnValue(chain as never);
        vi.spyOn(KingdomBuilderWorldModel, "findById")
            .mockReturnValue({ select: () => ({ session: () => ({ lean: async () => ({ currentTick: 5, nextTickAt: new Date(Date.now() - 1000) }) }) }) } as never);
        vi.spyOn(KingdomBuilderWorldModel, "updateOne").mockResolvedValue({ modifiedCount: 1 } as never);
        vi.spyOn(KingdomBuilderSettlementModel, "find").mockReturnValue({ session: () => ({ lean: async () => [{
            _id: "s1", worldId, ownerId: "owner", nodeId: "home",
            tiles: [{ position: 4, building: { type: "town-centre", level: 1 } }],
            resources: { wood: 0, stone: 0, iron: 0, wheat: 0 },
            catchment: { wood: "none", stone: "none", iron: "none", wheat: "none" },
            garrison: { militia: 1 },
        }] }) } as never);
        const settlementWrites = vi.spyOn(KingdomBuilderSettlementModel, "bulkWrite").mockResolvedValue({} as never);
        const army = (id: string, targetNodeId: string, camped: object = {}) => ({
            _id: id, worldId, ownerId: "owner", units: { militia: 2, scout: 0, infantry: 0, cavalry: 0, "siege-engine": 0 },
            path: [0, 1], pathCosts: [0, 2], travelled: 0, fromNodeId: "somewhere", targetNodeId, ...camped,
        });
        const armyFind = vi.spyOn(KingdomBuilderArmyModel, "find").mockReturnValue({ sort: () => ({ session: () => ({ lean: async () => [
            army("a1", "home"), army("a2", "camp"),
            // Camped at the owner's town since before sieges existed, and camped on open ground.
            army("a3", "home", { ownerId: "rival", travelled: 2, arrivedAtTick: 2 }),
            army("a4", "camp", { travelled: 2, arrivedAtTick: 2 }),
            // Besieging a town that has since gone — its owner left the world.
            army("a5", "camp", { travelled: 2, arrivedAtTick: 2, besiegingSince: 3 }),
        ] }) }) } as never);
        const armyWrites = vi.spyOn(KingdomBuilderArmyModel, "bulkWrite").mockResolvedValue({} as never);

        const response = await POST(request("Bearer cron-secret"));

        expect(response.status).toBe(200);
        expect(armyFind).toHaveBeenCalledWith({ worldId });
        const [{ updateOne }] = settlementWrites.mock.calls[0][0] as unknown as [{ updateOne: { update: { $set: Record<string, unknown> } } }];
        expect(updateOne.update.$set.garrison).toMatchObject({ militia: 3 });
        expect(armyWrites.mock.calls[0][0]).toEqual([
            { deleteOne: { filter: { _id: "a1", worldId } } },
            { updateOne: { filter: { _id: "a2", worldId }, update: { $set: { travelled: 2, arrivedAtTick: 6 } } } },
            { updateOne: { filter: { _id: "a3", worldId }, update: { $set: { travelled: 2, arrivedAtTick: 2, besiegingSince: 6 } } } },
            { updateOne: { filter: { _id: "a5", worldId }, update: { $set: { travelled: 2, arrivedAtTick: 2 }, $unset: { besiegingSince: 1 } } } },
        ]);
    });

    it("fights a barbarian village the tick an army reaches it, and turns it into the winner's settlement", async () => {
        process.env.CRON_SECRET = "cron-secret";
        const worldId = "64b000000000000000000003";
        const lean = vi.fn().mockResolvedValueOnce([{ _id: worldId }]).mockResolvedValue([]);
        const chain = { sort: () => chain, limit: () => chain, select: () => chain, lean };
        vi.spyOn(KingdomBuilderWorldModel, "find").mockReturnValue(chain as never);
        const world = {
            currentTick: 5, nextTickAt: new Date(Date.now() - 1000),
            barbarians: [{ nodeId: "village", garrison: { militia: 4 } }, { nodeId: "far", garrison: { militia: 8 } }],
        };
        const ground = {
            terrainField: { columns: 12, rows: 1, tileSize: 2, codes: "g".repeat(12) },
            nodes: [{ id: "village", kind: "settlement", siteType: "barbarian", x: 5, y: 1, tile: 2 }],
        };
        vi.spyOn(KingdomBuilderWorldModel, "findById")
            .mockReturnValueOnce({ select: () => ({ session: () => ({ lean: async () => world }) }) } as never)
            .mockReturnValueOnce({ select: () => ({ session: () => ({ lean: async () => ground }) }) } as never);
        const claim = vi.spyOn(KingdomBuilderWorldModel, "updateOne").mockResolvedValue({ modifiedCount: 1 } as never);
        vi.spyOn(KingdomBuilderSettlementModel, "find").mockReturnValue({ session: () => ({ lean: async () => [{
            _id: "s1", worldId, ownerId: "owner", nodeId: "home", settlementNumber: 0,
            tiles: [{ position: 4, building: { type: "town-centre", level: 1 } }],
            resources: { wood: 0, stone: 0, iron: 0, wheat: 0 },
            catchment: { wood: "none", stone: "none", iron: "none", wheat: "none" },
        }] }) } as never);
        vi.spyOn(KingdomBuilderSettlementModel, "bulkWrite").mockResolvedValue({} as never);
        const created = vi.spyOn(KingdomBuilderSettlementModel, "create").mockResolvedValue([] as never);
        const battles = vi.spyOn(KingdomBuilderBattleModel, "create").mockResolvedValue([] as never);
        vi.spyOn(KingdomBuilderArmyModel, "find").mockReturnValue({ sort: () => ({ session: () => ({ lean: async () => [{
            _id: "a1", worldId, ownerId: "owner", units: { militia: 10, scout: 0, infantry: 0, cavalry: 0, "siege-engine": 0 },
            path: [0, 1, 2], pathCosts: [0, 2, 4], travelled: 2, fromNodeId: "home", targetNodeId: "village",
        }] }) }) } as never);
        const armyWrites = vi.spyOn(KingdomBuilderArmyModel, "bulkWrite").mockResolvedValue({} as never);

        const response = await POST(request("Bearer cron-secret"));

        expect(response.status).toBe(200);
        expect(claim.mock.calls[0][1]).toMatchObject({ $set: { currentTick: 6, barbarians: [{ nodeId: "far", garrison: { militia: 8 } }] } });
        const [[capture]] = created.mock.calls[0] as unknown as [[Record<string, unknown>]];
        expect(capture).toMatchObject({ worldId, ownerId: "owner", nodeId: "village", settlementNumber: 1, catchment: { wheat: "rich" } });
        expect((capture.garrison as { militia: number }).militia).toBeGreaterThan(0);
        const [[battle]] = battles.mock.calls[0] as unknown as [[Record<string, unknown>]];
        expect(battle).toMatchObject({ worldId, tick: 6, kind: "barbarian", nodeId: "village", attackerIds: ["owner"], defenderIds: [] });
        expect(armyWrites.mock.calls[0][0]).toEqual([{ deleteOne: { filter: { _id: "a1", worldId } } }]);
    });
});
