import mongoose, { Types } from "mongoose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./worldView", () => ({ worldView: vi.fn(async () => ({ worldId: "view" })) }));

import { KingdomBuilderArmyModel } from "./KingdomBuilderArmyModel";
import { KingdomBuilderBattleModel } from "./KingdomBuilderBattleModel";
import { KingdomBuilderSettlementModel } from "./KingdomBuilderSettlementModel";
import { KingdomBuilderWorldModel } from "./KingdomBuilderWorldModel";
import { pushAttack, sallyOut } from "./assault";
import { resolveBattle } from "./combat";
import { garrisonOf } from "./units";

const worldId = new Types.ObjectId().toString();
const armyId = new Types.ObjectId();
const otherArmyId = new Types.ObjectId();
const settlementId = new Types.ObjectId();

/** A chain ending in `.lean()`, whatever is called on the way. */
function chain(result: unknown) {
    const link = { select: () => link, sort: () => link, session: () => link, lean: async () => result };
    return link as never;
}

let session: object;
beforeEach(() => {
    session = {};
    vi.spyOn(mongoose.connection, "transaction").mockImplementation((async (callback: (session: object) => Promise<unknown>) => callback(session)) as never);
    vi.spyOn(KingdomBuilderWorldModel, "findOneAndUpdate").mockReturnValue({ lean: async () => ({ currentTick: 12 }) } as never);
    vi.spyOn(KingdomBuilderBattleModel, "create").mockResolvedValue([] as never);
    vi.spyOn(KingdomBuilderArmyModel, "bulkWrite").mockResolvedValue({} as never);
    vi.spyOn(KingdomBuilderSettlementModel, "updateOne").mockResolvedValue({ modifiedCount: 1 } as never);
});

/** The battle the tests expect to have been kept. */
function kept() {
    return vi.mocked(KingdomBuilderBattleModel.create).mock.calls[0][0] as unknown as [Record<string, unknown>];
}
afterEach(() => vi.restoreAllMocks());

describe("pushAttack", () => {
    function besieging(garrison: object, attackers: object[]) {
        const findOne = vi.spyOn(KingdomBuilderArmyModel, "findOne").mockReturnValue(chain({ _id: armyId, targetNodeId: "town", besiegingSince: 4 }));
        vi.spyOn(KingdomBuilderSettlementModel, "findOne").mockReturnValue(chain({ _id: settlementId, ownerId: "defender", garrison }));
        const find = vi.spyOn(KingdomBuilderArmyModel, "find").mockReturnValue(chain(attackers));
        return { findOne, find };
    }

    it("sends every army of the attacker's at the settlement in together against the fortified garrison, and keeps the battle for both sides", async () => {
        const { find } = besieging({ militia: 3 }, [{ _id: armyId, ownerId: "attacker", units: { militia: 2 } }, { _id: otherArmyId, ownerId: "attacker", units: { cavalry: 2 } }]);
        const sent = garrisonOf({ militia: 2, cavalry: 2 });
        const battle = resolveBattle(sent, { militia: 3 }, { fortified: true });
        expect(battle.attackerWon).toBe(true);

        await pushAttack(worldId, "attacker", armyId.toString());

        expect(find).toHaveBeenCalledWith({ worldId, ownerId: "attacker", targetNodeId: "town", besiegingSince: { $ne: null } });
        expect(KingdomBuilderSettlementModel.updateOne).toHaveBeenCalledWith({ _id: settlementId, worldId }, { $set: { garrison: garrisonOf() } }, { session });
        expect(kept()).toEqual([{
            worldId, tick: 12, kind: "push", nodeId: "town", attackerIds: ["attacker"], defenderIds: ["defender"],
            attacker: sent, defender: garrisonOf({ militia: 3 }), rounds: battle.rounds,
            shares: [
                { ownerId: "attacker", sent, left: battle.attacker },
                { ownerId: "defender", sent: garrisonOf({ militia: 3 }), left: battle.defender },
            ],
        }]);
        expect(KingdomBuilderWorldModel.findOneAndUpdate).toHaveBeenCalledWith(
            { _id: worldId, endedAt: null }, { $inc: { battlesFought: 1 } }, { session, projection: { currentTick: 1 } },
        );
    });

    it("hands each attacking army back its share of the survivors, and disbands one left with none", async () => {
        besieging({ militia: 4 }, [{ _id: armyId, ownerId: "attacker", units: { infantry: 3 } }, { _id: otherArmyId, ownerId: "attacker", units: { scout: 1 } }]);
        const battle = resolveBattle({ infantry: 3, scout: 1 }, { militia: 4 }, { fortified: true });
        // The infantry win without a loss, but the scout soaks its share of the blows and falls.
        expect(battle.attacker).toEqual(garrisonOf({ infantry: 3 }));

        await pushAttack(worldId, "attacker", armyId.toString());

        expect(KingdomBuilderArmyModel.bulkWrite).toHaveBeenCalledWith([
            { updateOne: { filter: { _id: armyId, worldId }, update: { $set: { units: garrisonOf({ infantry: 3 }) } } } },
            { deleteOne: { filter: { _id: otherArmyId, worldId } } },
        ], { session });
    });

    it("loses the attacking armies against a garrison they can't break, and leaves what is left of it at home", async () => {
        besieging({ militia: 5 }, [{ _id: armyId, ownerId: "attacker", units: { militia: 5 } }]);
        const battle = resolveBattle({ militia: 5 }, { militia: 5 }, { fortified: true });
        expect(battle.attackerWon).toBe(false);

        await pushAttack(worldId, "attacker", armyId.toString());

        expect(KingdomBuilderSettlementModel.updateOne).toHaveBeenCalledWith({ _id: settlementId, worldId }, { $set: { garrison: battle.defender } }, { session });
        expect(KingdomBuilderArmyModel.bulkWrite).toHaveBeenCalledWith([{ deleteOne: { filter: { _id: armyId, worldId } } }], { session });
    });

    it("leaves the caravans of an army that falls, and their load, to the town that beat it (§4.7)", async () => {
        besieging({ militia: 5 }, [{ _id: armyId, ownerId: "attacker", units: { militia: 5 }, caravans: 2, cargo: { iron: 40, wheat: 10 } }]);

        await pushAttack(worldId, "attacker", armyId.toString());

        expect(KingdomBuilderSettlementModel.updateOne).toHaveBeenCalledWith({ _id: settlementId, worldId }, {
            $set: { garrison: expect.anything() }, $inc: { caravans: 2, "resources.iron": 40, "resources.wheat": 10 },
        }, { session });
        expect(kept()[0].shares).toEqual([
            expect.objectContaining({ ownerId: "attacker", caravansLost: 2 }),
            expect.objectContaining({ ownerId: "defender", caravansTaken: 2 }),
        ]);
    });

    it("tells a stranger only that the army isn't found, before anything else is read", async () => {
        vi.spyOn(KingdomBuilderArmyModel, "findOne").mockReturnValue(chain(null));
        const settlement = vi.spyOn(KingdomBuilderSettlementModel, "findOne");

        await expect(pushAttack(worldId, "stranger", armyId.toString())).rejects.toMatchObject({ code: "ARMY_NOT_FOUND" });
        expect(settlement).not.toHaveBeenCalled();
        expect(mongoose.connection.transaction).not.toHaveBeenCalled();
    });

    it("refuses an army that is only camped", async () => {
        vi.spyOn(KingdomBuilderArmyModel, "findOne").mockReturnValue(chain({ _id: armyId, targetNodeId: "open-site", arrivedAtTick: 3 }));
        await expect(pushAttack(worldId, "attacker", armyId.toString())).rejects.toMatchObject({ code: "NO_SIEGE" });
    });

    it("refuses once the army has left the siege since it was read", async () => {
        besieging({ militia: 1 }, [{ _id: otherArmyId, units: { militia: 5 } }]);
        await expect(pushAttack(worldId, "attacker", armyId.toString())).rejects.toMatchObject({ code: "NO_SIEGE" });
    });

    it.each([["a missing id", undefined], ["a malformed id", "nope"]])("refuses %s", async (_, id) => {
        await expect(pushAttack(worldId, "attacker", id)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    });
});

describe("sallyOut", () => {
    function besieged(garrison: object, besiegers: object[]) {
        vi.spyOn(KingdomBuilderSettlementModel, "exists").mockResolvedValue({ _id: settlementId } as never);
        vi.spyOn(KingdomBuilderSettlementModel, "findOne").mockReturnValue(chain({ _id: settlementId, nodeId: "town", garrison }));
        return vi.spyOn(KingdomBuilderArmyModel, "find").mockReturnValue(chain(besiegers));
    }

    it("sends the whole garrison into the open against every besieger, whoever owns them, and lifts the siege when it wins", async () => {
        const find = besieged({ infantry: 6 }, [{ _id: armyId, ownerId: "one", units: { militia: 1 } }, { _id: otherArmyId, ownerId: "two", units: { militia: 2 } }]);
        const battle = resolveBattle({ infantry: 6 }, { militia: 3 }, { fortified: false });
        expect(battle.attackerWon).toBe(true);

        await sallyOut(worldId, "defender", settlementId.toString());

        expect(find).toHaveBeenCalledWith({ worldId, targetNodeId: "town", ownerId: { $ne: "defender" }, besiegingSince: { $ne: null } });
        expect(KingdomBuilderArmyModel.bulkWrite).toHaveBeenCalledWith([
            { deleteOne: { filter: { _id: armyId, worldId } } },
            { deleteOne: { filter: { _id: otherArmyId, worldId } } },
        ], { session });
        expect(KingdomBuilderSettlementModel.updateOne).toHaveBeenCalledWith(
            { _id: settlementId.toString(), worldId, ownerId: "defender" }, { $set: { garrison: battle.attacker } }, { session },
        );
        expect(kept()[0]).toMatchObject({
            kind: "sally", attackerIds: ["defender"], defenderIds: ["one", "two"], rounds: battle.rounds,
            shares: [
                { ownerId: "defender", sent: garrisonOf({ infantry: 6 }), left: battle.attacker },
                { ownerId: "one", sent: garrisonOf({ militia: 1 }), left: garrisonOf() },
                { ownerId: "two", sent: garrisonOf({ militia: 2 }), left: garrisonOf() },
            ],
        });
    });

    it("leaves the settlers at home — a sally is the soldiers' fight (PR 24)", async () => {
        besieged({ infantry: 6, settler: 2 }, [{ _id: armyId, ownerId: "one", units: { militia: 1 } }]);
        const battle = resolveBattle({ infantry: 6 }, { militia: 1 }, { fortified: false });

        await sallyOut(worldId, "defender", settlementId.toString());

        expect(KingdomBuilderSettlementModel.updateOne).toHaveBeenCalledWith(
            { _id: settlementId.toString(), worldId, ownerId: "defender" }, { $set: { garrison: { ...battle.attacker, settler: 2 } } }, { session },
        );
        expect(kept()[0]).toMatchObject({ shares: [{ ownerId: "defender", sent: garrisonOf({ infantry: 6 }) }, expect.anything()] });
    });

    it("has no one to sally out with when only settlers are home", async () => {
        besieged({ settler: 3 }, [{ _id: armyId, ownerId: "one", units: { militia: 1 } }]);
        await expect(sallyOut(worldId, "defender", settlementId.toString())).rejects.toMatchObject({ code: "ARMY_BUSY" });
    });

    it("brings in the caravans of the besiegers it destroys, and keeps a survivor's with it", async () => {
        besieged({ infantry: 6 }, [
            { _id: armyId, ownerId: "one", units: { militia: 1 }, caravans: 1, cargo: { wood: 30 } },
            { _id: otherArmyId, ownerId: "two", units: { militia: 1 }, caravans: 3, cargo: { stone: 50 } },
        ]);

        await sallyOut(worldId, "defender", settlementId.toString());

        expect(KingdomBuilderSettlementModel.updateOne).toHaveBeenCalledWith({ _id: settlementId.toString(), worldId, ownerId: "defender" }, {
            $set: { garrison: expect.anything() }, $inc: { caravans: 4, "resources.wood": 30, "resources.stone": 50 },
        }, { session });
        // Each besieger is told only what they lost themselves.
        expect(kept()[0].shares).toEqual([
            expect.objectContaining({ ownerId: "defender", caravansTaken: 4 }),
            expect.objectContaining({ ownerId: "one", caravansLost: 1 }),
            expect.objectContaining({ ownerId: "two", caravansLost: 3 }),
        ]);
    });

    it("loses the garrison when it is outfought", async () => {
        besieged({ militia: 1 }, [{ _id: armyId, ownerId: "attacker", units: { militia: 3 } }]);

        await sallyOut(worldId, "defender", settlementId.toString());

        expect(KingdomBuilderSettlementModel.updateOne).toHaveBeenCalledWith(
            { _id: settlementId.toString(), worldId, ownerId: "defender" }, { $set: { garrison: garrisonOf() } }, { session },
        );
    });

    it("refuses a settlement that isn't under siege, or has no garrison to send", async () => {
        besieged({ militia: 1 }, []);
        await expect(sallyOut(worldId, "defender", settlementId.toString())).rejects.toMatchObject({ code: "NO_SIEGE" });
        besieged({}, [{ _id: armyId, units: { militia: 3 } }]);
        await expect(sallyOut(worldId, "defender", settlementId.toString())).rejects.toMatchObject({ code: "ARMY_BUSY" });
    });

    it("tells a stranger only that the settlement isn't found", async () => {
        vi.spyOn(KingdomBuilderSettlementModel, "exists").mockResolvedValue(null);
        await expect(sallyOut(worldId, "stranger", settlementId.toString())).rejects.toMatchObject({ code: "SITE_NOT_FOUND" });
        expect(mongoose.connection.transaction).not.toHaveBeenCalled();
    });

    it("refuses an ended world", async () => {
        besieged({ militia: 4 }, [{ _id: armyId, units: { militia: 1 } }]);
        vi.mocked(KingdomBuilderWorldModel.findOneAndUpdate).mockReturnValue({ lean: async () => null } as never);
        await expect(sallyOut(worldId, "defender", settlementId.toString())).rejects.toMatchObject({ code: "WORLD_NOT_FOUND" });
    });
});
