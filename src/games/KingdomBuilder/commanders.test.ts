import mongoose, { Types } from "mongoose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KingdomBuilderArmyModel } from "./KingdomBuilderArmyModel";
import { KingdomBuilderSettlementModel, type KingdomBuilderTile } from "./KingdomBuilderSettlementModel";
import { KingdomBuilderWorldModel } from "./KingdomBuilderWorldModel";
import { commanderCapacityOf, commandersHeld, isLeaderless, needsCommander } from "./commanders";
import { cancelUnitTraining, queueUnitTraining } from "./prototype";
import { garrisonOf, type KingdomBuilderGarrison, type KingdomBuilderTrainingOrder } from "./units";

function town(tavern: number): KingdomBuilderTile[] {
    return Array.from({ length: 9 }, (_, position) => ({
        position,
        ...(position === 4 ? { building: { type: "town-centre" as const, level: 2 } } : {}),
        ...(position === 1 && tavern > 0 ? { building: { type: "tavern" as const, level: tavern } } : {}),
    }));
}

describe("commanderCapacityOf", () => {
    it("adds up the tavern levels across the realm, reading a town with no tavern as none", () => {
        expect(commanderCapacityOf([{ tiles: town(2) }, { tiles: town(1) }])).toBe(3);
        expect(commanderCapacityOf([{ tiles: town(0) }, {}])).toBe(0);
    });
});

describe("commandersHeld", () => {
    it("counts a commander in a garrison, in a training queue and in the field", () => {
        expect(commandersHeld({ settlements: [{ garrison: garrisonOf({ commander: 1, militia: 4 }) }], armies: [] })).toBe(1);
        expect(commandersHeld({
            settlements: [{ trainingQueue: [{ unitType: "commander", ticksRemaining: 2 }, { unitType: "militia", ticksRemaining: 2 }] }],
            armies: [],
        })).toBe(1);
        expect(commandersHeld({ settlements: [], armies: [{ units: garrisonOf({ commander: 2, infantry: 3 }) }] })).toBe(2);
    });

    it("reads a garrison or an army from before commanders existed as holding none", () => {
        expect(commandersHeld({ settlements: [{}, { garrison: { militia: 3 } as Partial<KingdomBuilderGarrison> }], armies: [{}] })).toBe(0);
    });
});

describe("the march rule", () => {
    it.each<[string, Partial<KingdomBuilderGarrison>, boolean]>([
        ["militia", { militia: 1 }, true],
        ["a siege train", { "siege-engine": 2 }, true],
        ["scouts alone", { scout: 3 }, false],
        ["settlers alone", { settler: 1 }, false],
        ["a commander alone", { commander: 1 }, false],
        ["nothing — a caravan's stack", {}, false],
    ])("%s", (_, units, needs) => {
        expect(needsCommander(units)).toBe(needs);
    });

    it("finds a stack leaderless only when it needs a commander and has none", () => {
        expect(isLeaderless({ units: { infantry: 4 } })).toBe(true);
        expect(isLeaderless({ units: { infantry: 4, commander: 1 } })).toBe(false);
        expect(isLeaderless({ units: { scout: 4 } })).toBe(false);
        // A party of scouts joined by militia with no commander between them.
        expect(isLeaderless({ units: { scout: 4, militia: 2 } })).toBe(true);
    });
});

// The recruit, against an in-memory player: one town, its stores and queue,
// and whatever armies of theirs are in the field. Transactions run one after
// the other — as two that conflict do, once the loser is retried.
const worldId = new Types.ObjectId().toString();
const settlementId = new Types.ObjectId().toString();
const land = { wood: "good", stone: "good", iron: "good", wheat: "good" } as const;

interface Player {
    tiles: KingdomBuilderTile[];
    garrison: KingdomBuilderGarrison;
    trainingQueue: KingdomBuilderTrainingOrder[];
    armies: { units: KingdomBuilderGarrison }[];
}
let player: Player;

function settlement() {
    return {
        _id: settlementId, ownerId: "owner", nodeId: "home", tiles: player.tiles, garrison: player.garrison, trainingQueue: player.trainingQueue,
        resources: { wood: 500, stone: 500, iron: 500, wheat: 500 }, catchment: land,
    };
}

function query<T>(read: () => T) {
    const lean = async () => read();
    return { lean, session: () => ({ lean }), select: () => ({ lean, session: () => ({ lean }) }) };
}

beforeEach(() => {
    player = { tiles: town(1), garrison: garrisonOf(), trainingQueue: [], armies: [] };
    let running: Promise<unknown> = Promise.resolve();
    vi.spyOn(mongoose.connection, "transaction").mockImplementation(((callback: (session: object) => Promise<unknown>) => {
        const run = running.then(() => callback({}));
        running = run.catch(() => undefined);
        return run;
    }) as never);
    vi.spyOn(KingdomBuilderWorldModel, "exists").mockResolvedValue({ _id: worldId } as never);
    vi.spyOn(KingdomBuilderWorldModel, "updateOne").mockResolvedValue({ modifiedCount: 1 } as never);
    vi.spyOn(KingdomBuilderWorldModel, "findById").mockReturnValue(query(() => ({ currentTick: 3, nextTickAt: new Date("2030-01-01T00:00:00Z") })) as never);
    vi.spyOn(KingdomBuilderSettlementModel, "findOne").mockImplementation((() => query(settlement)) as never);
    vi.spyOn(KingdomBuilderSettlementModel, "find").mockImplementation((() => query(() => [settlement()])) as never);
    vi.spyOn(KingdomBuilderArmyModel, "find").mockImplementation(((filter: { besiegingSince?: unknown }) =>
        query(() => filter.besiegingSince ? [] : player.armies)) as never);
    vi.spyOn(KingdomBuilderSettlementModel, "findOneAndUpdate").mockImplementation(((filter: Record<string, unknown>, update: {
        $push?: { trainingQueue: KingdomBuilderTrainingOrder }; $pull?: { trainingQueue: { orderId: string } };
    }) => query(() => {
        if (update.$push) player.trainingQueue = [...player.trainingQueue, update.$push.trainingQueue];
        if (update.$pull) player.trainingQueue = player.trainingQueue.filter(order => order.orderId !== update.$pull!.trainingQueue.orderId);
        return { _id: filter._id };
    })) as never);
});
afterEach(() => vi.restoreAllMocks());

describe("recruiting a commander", () => {
    it("counts inside a transaction that bumps the world's recruit counter first", async () => {
        const view = await queueUnitTraining(worldId, settlementId, "owner", "commander");

        expect(view.commanders).toEqual({ held: 1, capacity: 1 });
        expect(KingdomBuilderWorldModel.updateOne).toHaveBeenCalledWith({ _id: worldId, endedAt: null }, { $inc: { commandersRecruited: 1 } }, { session: {} });
        expect(player.trainingQueue).toEqual([expect.objectContaining({ unitType: "commander", ticksRemaining: 4 })]);
    });

    it("refuses a recruit at the cap, wherever the commanders are", async () => {
        player.armies = [{ units: garrisonOf({ commander: 1, militia: 3 }) }];

        await expect(queueUnitTraining(worldId, settlementId, "owner", "commander"))
            .rejects.toMatchObject({ code: "LOCKED", message: "All 1 commanders recruited — raise a tavern to recruit another" });
        expect(KingdomBuilderSettlementModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it("recruits again once a commander dies", async () => {
        player.garrison = garrisonOf({ commander: 1 });
        await expect(queueUnitTraining(worldId, settlementId, "owner", "commander")).rejects.toMatchObject({ code: "LOCKED" });

        player.garrison = garrisonOf();
        await queueUnitTraining(worldId, settlementId, "owner", "commander");
        expect(player.trainingQueue).toHaveLength(1);
    });

    it("recruits again once a queued commander is cancelled", async () => {
        await queueUnitTraining(worldId, settlementId, "owner", "commander");
        await expect(queueUnitTraining(worldId, settlementId, "owner", "commander")).rejects.toMatchObject({ code: "LOCKED" });

        await cancelUnitTraining(worldId, settlementId, "owner", player.trainingQueue[0].orderId);
        expect(player.trainingQueue).toEqual([]);
        await queueUnitTraining(worldId, settlementId, "owner", "commander");
        expect(player.trainingQueue).toHaveLength(1);
    });

    it("lets a player over the cap after losing a town keep their commanders, but recruit none", async () => {
        player.garrison = garrisonOf({ commander: 2 });
        player.armies = [{ units: garrisonOf({ commander: 1, cavalry: 2 }) }];

        await expect(queueUnitTraining(worldId, settlementId, "owner", "commander")).rejects.toMatchObject({ code: "LOCKED" });
        expect(player.garrison.commander).toBe(2);
        expect(player.armies[0].units.commander).toBe(1);
    });

    it("lets exactly one of two recruits at cap − 1 through", async () => {
        player.tiles = town(2);
        player.garrison = garrisonOf({ commander: 1 });

        const results = await Promise.allSettled([
            queueUnitTraining(worldId, settlementId, "owner", "commander"),
            queueUnitTraining(worldId, settlementId, "owner", "commander"),
        ]);

        expect(results.map(result => result.status).toSorted()).toEqual(["fulfilled", "rejected"]);
        expect(player.trainingQueue).toHaveLength(1);
    });

    it("keeps every other unit to its one conditional write, with no transaction", async () => {
        player.tiles = town(1).map(tile => tile.position === 0 ? { position: 0, building: { type: "barracks" as const, level: 1 } } : tile);

        await queueUnitTraining(worldId, settlementId, "owner", "militia");

        expect(mongoose.connection.transaction).not.toHaveBeenCalled();
        expect(player.trainingQueue).toEqual([expect.objectContaining({ unitType: "militia" })]);
    });
});
