import mongoose, { Types } from "mongoose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./worldView", () => ({ worldView: vi.fn(async () => ({ worldId: "view" })) }));
vi.mock("./KingdomBuilderSettlementModel", async importOriginal => ({
    ...await importOriginal<typeof import("./KingdomBuilderSettlementModel")>(),
    prepareMultipleSettlementsIndex: vi.fn(async () => undefined),
}));
vi.mock("./persistence", async importOriginal => ({
    ...await importOriginal<typeof import("./persistence")>(),
    foundSettlement: vi.fn(async () => ({})),
}));

import { KingdomBuilderArmyModel } from "./KingdomBuilderArmyModel";
import { KingdomBuilderSettlementModel } from "./KingdomBuilderSettlementModel";
import { KingdomBuilderWorldModel } from "./KingdomBuilderWorldModel";
import { foundSettlement } from "./persistence";
import { foundWithSettler } from "./settlers";
import { garrisonOf } from "./units";

const worldId = new Types.ObjectId().toString();
const armyId = new Types.ObjectId();
const escortId = new Types.ObjectId();

const settler = { _id: armyId, ownerId: "owner", units: garrisonOf({ settler: 2 }), targetNodeId: "open", arrivedAtTick: 5, caravans: 1, cargo: { iron: 30 } };
const escort = { _id: escortId, ownerId: "owner", units: garrisonOf({ militia: 3 }), targetNodeId: "open", arrivedAtTick: 4 };

function stub({ army = settler as object | null, owned = 1, camped = [settler, escort] as object[] } = {}) {
    vi.spyOn(KingdomBuilderArmyModel, "findOne").mockReturnValue({ session: () => ({ lean: async () => army }) } as never);
    vi.spyOn(KingdomBuilderSettlementModel, "countDocuments").mockReturnValue({ session: async () => owned } as never);
    const find = vi.spyOn(KingdomBuilderArmyModel, "find").mockReturnValue({ sort: () => ({ session: () => ({ lean: async () => camped }) }) } as never);
    const remove = vi.spyOn(KingdomBuilderArmyModel, "deleteMany").mockResolvedValue({ deletedCount: camped.length } as never);
    return { find, remove };
}

beforeEach(() => {
    vi.spyOn(mongoose.connection, "transaction").mockImplementation((async (callback: (session: object) => Promise<unknown>) => callback({})) as never);
    vi.spyOn(KingdomBuilderWorldModel, "updateOne").mockResolvedValue({ modifiedCount: 1 } as never);
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(foundSettlement).mockClear();
});

describe("foundWithSettler (PR 24)", () => {
    it("spends a settler to found a town where its stack camped, and moves every stack of the owner's camped there in", async () => {
        const { find, remove } = stub();

        await expect(foundWithSettler(worldId, "owner", armyId.toString())).resolves.toEqual({ worldId: "view" });

        expect(find).toHaveBeenCalledWith({ worldId, ownerId: "owner", targetNodeId: "open", arrivedAtTick: { $ne: null } });
        expect(foundSettlement).toHaveBeenCalledWith(worldId, "owner", "open", {}, "expansion", {
            // The stockpile the settler carries (§4.5), and what the caravans brought.
            resources: { wood: 40, stone: 20, iron: 30, wheat: 20 },
            garrison: garrisonOf({ militia: 3, settler: 1 }),
            caravans: 1,
        });
        expect(remove).toHaveBeenCalledWith({ worldId, _id: { $in: [armyId, escortId] } }, { session: {} });
    });

    it("claims the world first, so it can't interleave with a tick", async () => {
        stub();
        await foundWithSettler(worldId, "owner", armyId.toString());
        expect(KingdomBuilderWorldModel.updateOne).toHaveBeenCalledWith({ _id: worldId, endedAt: null }, { $inc: { armiesDispatched: 1 } }, { session: {} });
    });

    it("refuses a stack with no settler, one still marching, a stranger's, and a player at the limit", async () => {
        stub({ army: { ...escort } });
        await expect(foundWithSettler(worldId, "owner", armyId.toString())).rejects.toEqual(expect.objectContaining({ code: "INVALID_INPUT" }));

        stub({ army: { ...settler, arrivedAtTick: null } });
        await expect(foundWithSettler(worldId, "owner", armyId.toString())).rejects.toEqual(expect.objectContaining({ code: "INVALID_INPUT" }));

        stub({ army: null });
        await expect(foundWithSettler(worldId, "stranger", armyId.toString())).rejects.toEqual(expect.objectContaining({ code: "ARMY_NOT_FOUND" }));

        stub({ owned: 2 });
        await expect(foundWithSettler(worldId, "owner", armyId.toString())).rejects.toEqual(expect.objectContaining({ code: "SITE_NOT_AVAILABLE" }));
        expect(foundSettlement).not.toHaveBeenCalled();
    });

    it("answers a site or a slot lost to a race as unavailable", async () => {
        stub();
        vi.mocked(foundSettlement).mockRejectedValueOnce(Object.assign(new Error("E11000"), { code: 11000 }));
        await expect(foundWithSettler(worldId, "owner", armyId.toString())).rejects.toEqual(expect.objectContaining({ code: "SITE_NOT_AVAILABLE" }));
    });
});
