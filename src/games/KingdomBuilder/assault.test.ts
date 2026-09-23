import mongoose, { Types } from "mongoose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./worldView", () => ({ worldView: vi.fn(async () => ({ worldId: "view" })) }));

import { KingdomBuilderArmyModel } from "./KingdomBuilderArmyModel";
import { KingdomBuilderSettlementModel } from "./KingdomBuilderSettlementModel";
import { KingdomBuilderWorldModel } from "./KingdomBuilderWorldModel";
import { pushAttack, sallyOut } from "./assault";
import { garrisonOf } from "./units";

const worldId = new Types.ObjectId().toString();
const armyId = new Types.ObjectId();
const otherArmyId = new Types.ObjectId();
const settlementId = new Types.ObjectId();

/** A chain ending in `.lean()`, whatever is called on the way. */
function chain(result: unknown) {
    const link = { select: () => link, session: () => link, lean: async () => result };
    return link as never;
}

let session: object;
beforeEach(() => {
    session = {};
    vi.spyOn(mongoose.connection, "transaction").mockImplementation((async (callback: (session: object) => Promise<unknown>) => callback(session)) as never);
    vi.spyOn(KingdomBuilderWorldModel, "updateOne").mockResolvedValue({ modifiedCount: 1 } as never);
});
afterEach(() => vi.restoreAllMocks());

describe("pushAttack", () => {
    function besieging(garrison: object, attackers: object[]) {
        const findOne = vi.spyOn(KingdomBuilderArmyModel, "findOne").mockReturnValue(chain({ _id: armyId, targetNodeId: "town", besiegingSince: 4 }));
        vi.spyOn(KingdomBuilderSettlementModel, "findOne").mockReturnValue(chain({ _id: settlementId, garrison }));
        const find = vi.spyOn(KingdomBuilderArmyModel, "find").mockReturnValue(chain(attackers));
        return { findOne, find };
    }

    it("sends every army of the attacker's at the settlement in together, and destroys the garrison when it wins", async () => {
        const { find } = besieging({ militia: 3 }, [{ _id: armyId, units: { militia: 2 } }, { _id: otherArmyId, units: { cavalry: 2 } }]);
        const garrison = vi.spyOn(KingdomBuilderSettlementModel, "updateOne").mockResolvedValue({ modifiedCount: 1 } as never);
        const removed = vi.spyOn(KingdomBuilderArmyModel, "deleteMany");

        const view = await pushAttack(worldId, "attacker", armyId.toString());

        expect(view.battle).toEqual({ kind: "push", won: true, sent: garrisonOf({ militia: 2, cavalry: 2 }), faced: garrisonOf({ militia: 3 }) });
        expect(find).toHaveBeenCalledWith({ worldId, ownerId: "attacker", targetNodeId: "town", besiegingSince: { $ne: null } });
        expect(garrison).toHaveBeenCalledWith({ _id: settlementId, worldId }, { $set: { garrison: garrisonOf() } }, { session });
        expect(removed).not.toHaveBeenCalled();
        expect(KingdomBuilderWorldModel.updateOne).toHaveBeenCalledWith({ _id: worldId, endedAt: null }, { $inc: { battlesFought: 1 } }, { session });
    });

    it("loses the attacking armies on a tie", async () => {
        besieging({ militia: 2 }, [{ _id: armyId, units: { militia: 2 } }]);
        const removed = vi.spyOn(KingdomBuilderArmyModel, "deleteMany").mockResolvedValue({} as never);
        const garrison = vi.spyOn(KingdomBuilderSettlementModel, "updateOne");

        const view = await pushAttack(worldId, "attacker", armyId.toString());

        expect(view.battle.won).toBe(false);
        expect(removed).toHaveBeenCalledWith({ _id: { $in: [armyId] }, worldId, ownerId: "attacker" }, { session });
        expect(garrison).not.toHaveBeenCalled();
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

    it("sends the whole garrison against every besieger, and lifts the siege when it wins", async () => {
        const find = besieged({ militia: 4 }, [{ _id: armyId, units: { militia: 1 } }, { _id: otherArmyId, units: { infantry: 2 } }]);
        const removed = vi.spyOn(KingdomBuilderArmyModel, "deleteMany").mockResolvedValue({} as never);

        const view = await sallyOut(worldId, "defender", settlementId.toString());

        expect(view.battle).toEqual({ kind: "sally", won: true, sent: garrisonOf({ militia: 4 }), faced: garrisonOf({ militia: 1, infantry: 2 }) });
        expect(find).toHaveBeenCalledWith({ worldId, targetNodeId: "town", ownerId: { $ne: "defender" }, besiegingSince: { $ne: null } });
        expect(removed).toHaveBeenCalledWith({ _id: { $in: [armyId, otherArmyId] }, worldId }, { session });
    });

    it("loses the garrison when it is outnumbered", async () => {
        besieged({ militia: 1 }, [{ _id: armyId, units: { militia: 3 } }]);
        const garrison = vi.spyOn(KingdomBuilderSettlementModel, "updateOne").mockResolvedValue({ modifiedCount: 1 } as never);

        const view = await sallyOut(worldId, "defender", settlementId.toString());

        expect(view.battle.won).toBe(false);
        expect(garrison).toHaveBeenCalledWith({ _id: settlementId.toString(), worldId, ownerId: "defender" }, { $set: { garrison: garrisonOf() } }, { session });
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
        vi.mocked(KingdomBuilderWorldModel.updateOne).mockResolvedValue({ modifiedCount: 0 } as never);
        await expect(sallyOut(worldId, "defender", settlementId.toString())).rejects.toMatchObject({ code: "WORLD_NOT_FOUND" });
    });
});
