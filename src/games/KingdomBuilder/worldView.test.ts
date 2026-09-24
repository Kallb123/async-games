import { Types } from "mongoose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/users/clerk", () => ({
    buildUserDirectory: vi.fn(async () => ({ name: (userId: string) => `name:${userId}`, imageUrl: () => null })),
}));
vi.mock("./worldInvitation", () => ({ liveWorldInvitation: vi.fn(), reconcileWorldInvitation: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./roster", () => ({ ensureFirstSettlement: vi.fn() }));
vi.mock("./battleReports", () => ({ recentBattles: vi.fn(async () => []) }));
vi.mock("./tradeBoard", () => ({ tradeOffersIn: vi.fn(async () => []) }));

import { buildUserDirectory } from "@/utils/users/clerk";

import { KingdomBuilderArmyModel } from "./KingdomBuilderArmyModel";
import { KingdomBuilderSettlementModel } from "./KingdomBuilderSettlementModel";
import { KingdomBuilderWorldModel } from "./KingdomBuilderWorldModel";
import { recentBattles } from "./battleReports";
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

/** The viewer's own armies come back sorted; everyone else's through a projection; the camps at the viewer's towns by node. */
function mockArmies(armies: object[], rivals: object[] = [], camps: object[] = []) {
    return vi.spyOn(KingdomBuilderArmyModel, "find").mockImplementation(((filter: { ownerId?: unknown; targetNodeId?: unknown }) => (filter.targetNodeId
        ? { select: () => ({ lean: vi.fn().mockResolvedValue(camps) }) }
        : typeof filter.ownerId === "string"
            ? { sort: () => ({ lean: vi.fn().mockResolvedValue(armies) }) }
            : { select: () => ({ lean: vi.fn().mockResolvedValue(rivals) }) })) as never);
}

beforeEach(() => {
    vi.mocked(liveWorldInvitation).mockResolvedValue({ joinCode: "PLUM", expiresAt: "2026-09-29T00:00:00.000Z", openSeats: 2 });
    mockArmies([]);
});
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

    it("carries the viewer's own battles, asked for by the viewer", async () => {
        const worldId = new Types.ObjectId().toString();
        mockSettlements([{ _id: new Types.ObjectId(), ownerId: "owner", nodeId: "start" }]);
        mockWorld({ hostId: "owner", roster: [{ userId: "owner", siteId: "start", joinedAt: new Date() }] });
        const report = { kind: "sally", tick: 4, nodeId: "start" } as never;
        vi.mocked(recentBattles).mockResolvedValueOnce([report]);

        const view = await worldView(worldId, "owner");

        expect(recentBattles).toHaveBeenCalledWith(worldId, "owner");
        expect(view.battles).toEqual([report]);
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

    it("puts nothing of a rival's settlement on the wire but where it is and whose", async () => {
        const worldId = new Types.ObjectId().toString();
        const rivalSettlementId = new Types.ObjectId();
        mockSettlements([
            { _id: new Types.ObjectId(), ownerId: "owner", nodeId: "start", tiles: [] },
            {
                _id: rivalSettlementId, ownerId: "user_RIVALSECRET", nodeId: "other",
                tiles: [{ position: 0, building: { type: "barracks", level: 97531 } }],
                resources: { wood: 86420, stone: 0, iron: 0 },
                construction: { tilePosition: 1, buildingType: "walls", targetLevel: 1, ticksRemaining: 1357 },
                trainingQueue: [{ unitType: "cavalry", ticksRemaining: 2468 }],
                garrison: { militia: 0, scout: 0, infantry: 0, cavalry: 0, "siege-engine": 13579 },
            },
        ]);
        mockWorld({
            hostId: "owner",
            seatCount: 4,
            roster: [{ userId: "owner", siteId: "start", joinedAt: new Date() }, { userId: "user_RIVALSECRET", siteId: "other", joinedAt: new Date() }],
        });

        vi.mocked(buildUserDirectory).mockResolvedValueOnce({ name: () => "A player", imageUrl: () => null });

        const wire = JSON.stringify(await worldView(worldId, "owner"));

        // Not "cavalry": the viewer's own garrison names every unit type. The rival's queue is "2468".
        for (const secret of ["user_RIVALSECRET", "97531", "86420", "1357", "barracks", "walls", "2468", "13579", rivalSettlementId.toString()]) {
            expect(wire).not.toContain(secret);
        }
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

    it("stands a world from before tile travel on its tiles, and saves that once, guarded on it not being done yet", async () => {
        const worldId = new Types.ObjectId().toString();
        mockSettlements([{ _id: new Types.ObjectId(), ownerId: "owner", nodeId: "start" }]);
        mockWorld({
            terrainField: { columns: 3, rows: 1, tileSize: 2, codes: "ggg" },
            nodes: [{ id: "start", kind: "settlement", siteType: "player-start", x: 1, y: 1 }, { id: "ore", kind: "terrain", terrain: "ore", resourceYield: 4, x: 5, y: 1 }],
            edges: [{ id: "edge-0", from: "start", to: "ore", terrain: "plains", movementCost: 4, chokepoint: false }],
        });
        const save = vi.spyOn(KingdomBuilderWorldModel, "updateOne").mockResolvedValue({} as never);

        const view = await worldView(worldId, "owner");

        expect(view.nodes.map(node => node.tile)).toEqual([0, 2]);
        expect(view.edges[0].path).toEqual([0, 1, 2]);
        expect(save).toHaveBeenCalledTimes(1);
        expect(save).toHaveBeenCalledWith({ _id: worldId, "nodes.tile": { $exists: false } }, { $set: { nodes: view.nodes, edges: view.edges } });
    });

    it("still answers when saving the tiles fails, and never saves a world already on them", async () => {
        const worldId = new Types.ObjectId().toString();
        const oldWorld = {
            terrainField: { columns: 3, rows: 1, tileSize: 2, codes: "ggg" },
            nodes: [{ id: "start", kind: "settlement", siteType: "player-start", x: 1, y: 1 }],
        };
        const save = vi.spyOn(KingdomBuilderWorldModel, "updateOne").mockRejectedValue(new Error("write conflict"));
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        mockSettlements([{ _id: new Types.ObjectId(), ownerId: "owner", nodeId: "start" }]);
        mockWorld(oldWorld);
        expect((await worldView(worldId, "owner")).nodes[0].tile).toBe(0);

        save.mockClear();
        mockSettlements([{ _id: new Types.ObjectId(), ownerId: "owner", nodeId: "start" }]);
        mockWorld({ ...oldWorld, nodes: [{ ...oldWorld.nodes[0], tile: 0 }] });
        await worldView(worldId, "owner");
        expect(save).not.toHaveBeenCalled();
    });

    it("reads the viewer's own armies and nobody else's, with where each stands and how long it has left", async () => {
        const worldId = new Types.ObjectId().toString();
        const armyId = new Types.ObjectId();
        mockSettlements([
            { _id: new Types.ObjectId(), ownerId: "owner", nodeId: "start", garrison: { militia: 2 } },
            { _id: new Types.ObjectId(), ownerId: "rival", nodeId: "other", garrison: { militia: 9 } },
        ]);
        mockWorld({
            hostId: "owner",
            roster: [{ userId: "owner", siteId: "start", joinedAt: new Date() }, { userId: "rival", siteId: "other", joinedAt: new Date() }],
        });
        const find = mockArmies([
            {
                _id: armyId, ownerId: "owner", units: { militia: 3 }, path: [5, 6, 7, 8], pathCosts: [0, 2, 4, 6], travelled: 2,
                fromNodeId: "start", targetNodeId: "camp",
            },
            {
                _id: new Types.ObjectId(), ownerId: "owner", units: { scout: 1 }, path: [1, 2], pathCosts: [0, 2], travelled: 2,
                fromNodeId: "start", targetNodeId: "lookout", arrivedAtTick: 7,
            },
        ]);

        const view = await worldView(worldId, "owner");

        expect(find).toHaveBeenCalledWith({ worldId, ownerId: "owner" });
        expect(view.armies[0]).toEqual({
            armyId: armyId.toString(), units: { militia: 3, scout: 0, infantry: 0, cavalry: 0, "siege-engine": 0, settler: 0, commander: 0 },
            tile: 6, route: [6, 7, 8], fromNodeId: "start", targetNodeId: "camp", ticksToArrive: 2,
            caravans: 0, cargo: { wood: 0, stone: 0, iron: 0, wheat: 0 },
        });
        expect(view.armies[1]).toMatchObject({ tile: 2, route: [2], ticksToArrive: 0, arrivedAtTick: 7 });
        // A garrison is its owner's to see: the rival's settlement carries none.
        expect(view.settlements.find(settlement => settlement.isMine)?.garrison?.militia).toBe(2);
        expect(view.settlements.find(settlement => !settlement.isMine)).not.toHaveProperty("garrison");
        // So are its stores, its caravans and its market (PR 25).
        for (const field of ["resources", "caravans", "marketLevel"]) {
            expect(view.settlements.find(settlement => settlement.isMine)).toHaveProperty(field);
            expect(view.settlements.find(settlement => !settlement.isMine)).not.toHaveProperty(field);
        }
    });

    describe("fog of war", () => {
        // A 20×20 field: tile = row * 20 + col. The viewer's town is at (2, 2), the rival's at (17, 17).
        const at = (col: number, row: number) => row * 20 + col;
        const FIELD = { columns: 20, rows: 20, tileSize: 2, codes: "g".repeat(400) };
        const NODES = [
            { id: "start", kind: "settlement", siteType: "player-start", x: 5, y: 5, tile: at(2, 2) },
            { id: "other", kind: "settlement", siteType: "player-start", x: 35, y: 35, tile: at(17, 17) },
        ];
        const worldId = new Types.ObjectId().toString();

        function setUp(rivalGarrison: object = { militia: 24680 }) {
            mockSettlements([
                { _id: new Types.ObjectId(), ownerId: "owner", nodeId: "start", tiles: [], garrison: { militia: 1 } },
                { _id: new Types.ObjectId(), ownerId: "rival", nodeId: "other", tiles: [], garrison: rivalGarrison },
            ]);
            mockWorld({
                hostId: "owner", terrainField: FIELD, nodes: NODES,
                roster: [{ userId: "owner", siteId: "start", joinedAt: new Date() }, { userId: "rival", siteId: "other", joinedAt: new Date() }],
            });
        }

        function rivalArmy(tile: number, units: object = { cavalry: 2 }) {
            return { ownerId: "rival", units, path: [tile], pathCosts: [0], travelled: 0 };
        }

        function ownArmy(tile: number, units: object) {
            return { _id: new Types.ObjectId(), ownerId: "owner", units, path: [tile], pathCosts: [0], travelled: 0, fromNodeId: "start", targetNodeId: "somewhere" };
        }

        it("sends nothing of a rival army out of sight — not where it is, what it holds or where it is going", async () => {
            setUp();
            const find = mockArmies([], [{ ...rivalArmy(at(10, 10), { cavalry: 97531 }), targetNodeId: "start", fromNodeId: "other" }]);

            const view = await worldView(worldId, "owner");

            expect(view.sightings).toEqual([]);
            expect(JSON.stringify(view)).not.toContain("97531");
            // The rivals' read asks for nothing about their orders.
            expect(find).toHaveBeenCalledWith({ worldId, ownerId: { $ne: "owner" } });
        });

        it("spots a rival army from the viewer's own town, and sends only its seat, tile and units", async () => {
            setUp();
            mockArmies([], [{ ...rivalArmy(at(4, 3)), targetNodeId: "start", fromNodeId: "other", arrivedAtTick: 9, _id: new Types.ObjectId() }]);

            const view = await worldView(worldId, "owner");

            expect(view.sight).toEqual([{ tile: at(2, 2), radius: 3 }]);
            expect(view.sightings).toEqual([{ seat: 1, tile: at(4, 3), units: { militia: 0, scout: 0, infantry: 0, cavalry: 2, "siege-engine": 0, settler: 0, commander: 0 } }]);
        });

        it("says a rival stack in sight has caravans, and never what they carry", async () => {
            setUp();
            mockArmies([], [{ ...rivalArmy(at(4, 3)), caravans: 2, cargo: { iron: 40 }, _id: new Types.ObjectId() }]);

            const view = await worldView(worldId, "owner");

            expect(view.sightings).toEqual([expect.objectContaining({ seat: 1, tile: at(4, 3), caravans: 2 })]);
            expect(JSON.stringify(view.sightings)).not.toContain("cargo");
        });

        it("scouts a rival army with an army of the viewer's own nearby, where the town can't see it", async () => {
            setUp();
            mockArmies([ownArmy(at(10, 10), { militia: 1 })], [rivalArmy(at(13, 12)), rivalArmy(at(16, 10))]);

            const view = await worldView(worldId, "owner");

            expect(view.sightings.map(sighting => sighting.tile)).toEqual([at(13, 12)]);
        });

        it("sees farther with a scout in the army, and reads the garrison of a rival town only then", async () => {
            setUp();
            mockArmies([ownArmy(at(10, 10), { militia: 1 })]);
            const unscouted = await worldView(worldId, "owner");
            expect(unscouted.settlements.find(settlement => !settlement.isMine)).not.toHaveProperty("garrison");

            setUp();
            mockArmies([ownArmy(at(12, 12), { scout: 1 })], [rivalArmy(at(16, 10))]);
            const scouted = await worldView(worldId, "owner");
            expect(scouted.sightings.map(sighting => sighting.tile)).toEqual([at(16, 10)]);
            expect(scouted.settlements.find(settlement => !settlement.isMine)?.garrison?.militia).toBe(24680);
        });

        it("names every standing barbarian village, and counts one's garrison only for a scout in sight of it", async () => {
            const village = { id: "village", kind: "settlement", siteType: "barbarian", x: 33, y: 5, tile: at(16, 2) };
            const withVillages = () => {
                setUp();
                mockWorld({
                    hostId: "owner", terrainField: FIELD, nodes: [...NODES, village],
                    roster: [{ userId: "owner", siteId: "start", joinedAt: new Date() }, { userId: "rival", siteId: "other", joinedAt: new Date() }],
                    barbarians: [{ nodeId: "village", garrison: { militia: 86420 } }, { nodeId: "far", garrison: { militia: 75319 } }],
                });
            };
            withVillages();
            mockArmies([ownArmy(at(14, 2), { militia: 1 })]);
            const unscouted = await worldView(worldId, "owner");
            expect(unscouted.barbarians).toEqual([{ nodeId: "village" }, { nodeId: "far" }]);
            expect(JSON.stringify(unscouted)).not.toMatch(/86420|75319/);

            withVillages();
            mockArmies([ownArmy(at(14, 2), { scout: 1 })]);
            const scouted = await worldView(worldId, "owner");
            expect(scouted.barbarians).toEqual([{ nodeId: "village", garrison: { militia: 86420, scout: 0, infantry: 0, cavalry: 0, "siege-engine": 0, settler: 0, commander: 0 } }, { nodeId: "far" }]);
        });

        it("tells the viewer their own town is besieged, and since when — and tells nobody else of anyone's", async () => {
            setUp();
            const camps = [
                { ownerId: "rival", targetNodeId: "start", besiegingSince: 7 },
                { ownerId: "owner", targetNodeId: "other", besiegingSince: 3 },
            ];
            const find = mockArmies([{ ...ownArmy(at(16, 10), { militia: 1 }), targetNodeId: "other", arrivedAtTick: 3, besiegingSince: 3 }], [], camps);

            const view = await worldView(worldId, "owner");

            expect(view.settlements.find(settlement => settlement.isMine)?.siege).toEqual({ sinceTick: 7, fullFromTick: 12 });
            expect(view.settlements.find(settlement => !settlement.isMine)).not.toHaveProperty("siege");
            expect(view.armies[0].besiegingSince).toBe(3);
            // The camps are read at the viewer's own towns only, and only whose each is and since when.
            expect(find).toHaveBeenCalledWith({ worldId, targetNodeId: { $in: ["start"] }, besiegingSince: { $ne: null } });
        });

        it("widens a town's watch as its barracks grows", async () => {
            mockSettlements([
                { _id: new Types.ObjectId(), ownerId: "owner", nodeId: "start", tiles: [{ position: 0, building: { type: "barracks", level: 3 } }] },
                { _id: new Types.ObjectId(), ownerId: "rival", nodeId: "other", tiles: [] },
            ]);
            mockWorld({
                hostId: "owner", terrainField: FIELD, nodes: NODES,
                roster: [{ userId: "owner", siteId: "start", joinedAt: new Date() }, { userId: "rival", siteId: "other", joinedAt: new Date() }],
            });
            mockArmies([], [rivalArmy(at(8, 2))]);

            const view = await worldView(worldId, "owner");

            expect(view.sight).toEqual([{ tile: at(2, 2), radius: 7 }]);
            expect(view.sightings).toHaveLength(1);
        });

        it("never reads a rival's armies on a world without the ground to see them on", async () => {
            mockSettlements([{ _id: new Types.ObjectId(), ownerId: "owner", nodeId: "start" }]);
            mockWorld({});
            const find = mockArmies([]);

            const view = await worldView(worldId, "owner");

            expect(view.sight).toEqual([]);
            expect(view.sightings).toEqual([]);
            expect(find.mock.calls.filter(([filter]) => (filter as { ownerId?: unknown }).ownerId && typeof (filter as { ownerId?: unknown }).ownerId !== "string")).toEqual([]);
        });
    });
});
