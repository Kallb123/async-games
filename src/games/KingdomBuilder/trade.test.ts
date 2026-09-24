import mongoose, { Types } from "mongoose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./worldView", () => ({ worldView: vi.fn(async () => ({ worldId: "view" })) }));

import { KingdomBuilderSettlementModel } from "./KingdomBuilderSettlementModel";
import { KingdomBuilderTradeOfferModel } from "./KingdomBuilderTradeOfferModel";
import { KingdomBuilderWorldModel } from "./KingdomBuilderWorldModel";
import { KINGDOM_BUILDER_TRADE_OFFER_LIMIT } from "./market";
import { acceptTradeOffer, postTradeOffer, withdrawTradeOffer } from "./trade";
import { tradeOffersIn } from "./tradeBoard";

const worldId = new Types.ObjectId().toString();
const settlementId = new Types.ObjectId().toString();
const offerId = new Types.ObjectId().toString();
const theirs = new Types.ObjectId();

const withMarket = [{ position: 4, building: { type: "town-centre", level: 1 } }, { position: 0, building: { type: "market", level: 1 } }];
const none = { wood: 0, stone: 0, iron: 0, wheat: 0 };

function mockSettlement(settlement: object | null) {
    return vi.spyOn(KingdomBuilderSettlementModel, "findOne").mockReturnValue({ select: () => ({ lean: async () => settlement }) } as never);
}

function mockOffer(offer: object | null) {
    return vi.spyOn(KingdomBuilderTradeOfferModel, "findOneAndDelete").mockReturnValue({ lean: async () => offer } as never);
}

beforeEach(() => {
    vi.spyOn(mongoose.connection, "transaction").mockImplementation((async (callback: (session: object) => Promise<unknown>) => callback({})) as never);
    vi.spyOn(KingdomBuilderWorldModel, "updateOne").mockResolvedValue({ modifiedCount: 1 } as never);
    vi.spyOn(KingdomBuilderTradeOfferModel, "countDocuments").mockReturnValue({ session: async () => 0 } as never);
});
afterEach(() => vi.restoreAllMocks());

describe("postTradeOffer", () => {
    it("holds what it gives from the stores in the transaction that lists it", async () => {
        mockSettlement({ tiles: withMarket, resources: { wood: 50, stone: 0, iron: 0, wheat: 0 } });
        const hold = vi.spyOn(KingdomBuilderSettlementModel, "updateOne").mockResolvedValue({ modifiedCount: 1 } as never);
        const create = vi.spyOn(KingdomBuilderTradeOfferModel, "create").mockResolvedValue([] as never);

        await expect(postTradeOffer(worldId, "alice", { settlementId, gives: { wood: 40 }, wants: { iron: 10 } })).resolves.toEqual({ worldId: "view" });

        expect(KingdomBuilderWorldModel.updateOne).toHaveBeenCalledWith({ _id: worldId, endedAt: null }, { $inc: { tradesMade: 1 } }, { session: {} });
        expect(hold).toHaveBeenCalledWith(
            { _id: settlementId, worldId, ownerId: "alice", "tiles.building.type": "market", "resources.wood": { $gte: 40 } },
            { $inc: { "resources.wood": -40 } },
            { session: {} },
        );
        expect(create).toHaveBeenCalledWith([{
            worldId, ownerId: "alice", settlementId, gives: { ...none, wood: 40 }, wants: { ...none, iron: 10 },
        }], { session: {} });
    });

    it.each([
        ["nothing given", { wants: { iron: 1 } }],
        ["nothing asked for", { gives: { wood: 1 } }],
        ["one resource on both sides", { gives: { wood: 5 }, wants: { wood: 1, iron: 1 } }],
        ["an unknown resource", { gives: { gold: 5 }, wants: { iron: 1 } }],
        ["a negative amount", { gives: { wood: -5 }, wants: { iron: 1 } }],
    ])("refuses %s", async (_, sides) => {
        const find = mockSettlement({ tiles: withMarket, resources: { wood: 50, stone: 0, iron: 0, wheat: 0 } });
        await expect(postTradeOffer(worldId, "alice", { settlementId, gives: undefined, wants: undefined, ...sides })).rejects.toMatchObject({ code: "INVALID_INPUT" });
        expect(find).not.toHaveBeenCalled();
    });

    it("refuses a stranger's settlement, one with no market, stores that can't cover it, and one offer past the limit", async () => {
        const hold = vi.spyOn(KingdomBuilderSettlementModel, "updateOne");
        const request = { settlementId, gives: { wood: 40 }, wants: { iron: 10 } };
        const find = mockSettlement(null);
        await expect(postTradeOffer(worldId, "mallory", request)).rejects.toMatchObject({ code: "SITE_NOT_FOUND" });
        expect(find.mock.calls[0][0]).toEqual({ _id: settlementId, worldId, ownerId: "mallory" });

        mockSettlement({ tiles: withMarket.slice(0, 1), resources: { wood: 50 } });
        await expect(postTradeOffer(worldId, "alice", request)).rejects.toMatchObject({ code: "NO_MARKET" });
        mockSettlement({ tiles: withMarket, resources: { wood: 39 } });
        await expect(postTradeOffer(worldId, "alice", request)).rejects.toMatchObject({ code: "CANNOT_AFFORD" });

        mockSettlement({ tiles: withMarket, resources: { wood: 50 } });
        vi.mocked(KingdomBuilderTradeOfferModel.countDocuments).mockReturnValue({ session: async () => KINGDOM_BUILDER_TRADE_OFFER_LIMIT } as never);
        await expect(postTradeOffer(worldId, "alice", request)).rejects.toMatchObject({ code: "TRADE_BUSY" });
        expect(hold).not.toHaveBeenCalled();
    });
});

describe("acceptTradeOffer", () => {
    const offer = { _id: offerId, ownerId: "alice", settlementId: theirs, gives: { wood: 40 }, wants: { iron: 10 } };

    it("takes the offer off the board, pays for it from the taker's market, and pays the poster", async () => {
        mockSettlement({ tiles: withMarket, resources: { iron: 10 } });
        const take = mockOffer(offer);
        const pay = vi.spyOn(KingdomBuilderSettlementModel, "updateOne").mockResolvedValue({ modifiedCount: 1 } as never);

        await acceptTradeOffer(worldId, "bob", { offerId, settlementId });

        expect(take).toHaveBeenCalledWith({ _id: offerId, worldId, ownerId: { $ne: "bob" } }, { session: {} });
        expect(pay).toHaveBeenNthCalledWith(1,
            { _id: settlementId, worldId, ownerId: "bob", "tiles.building.type": "market", "resources.iron": { $gte: 10 } },
            { $inc: { "resources.iron": -10, "resources.wood": 40 } },
            { session: {} },
        );
        expect(pay).toHaveBeenNthCalledWith(2, { _id: theirs, worldId, ownerId: "alice" }, { $inc: { "resources.iron": 10 } }, { session: {} });
    });

    it("fails the whole trade when the taker can't pay, the offer is gone, or the poster's settlement is", async () => {
        mockSettlement({ tiles: withMarket, resources: { iron: 10 } });
        const take = mockOffer(offer);
        const pay = vi.spyOn(KingdomBuilderSettlementModel, "updateOne").mockResolvedValueOnce({ modifiedCount: 0 } as never);
        await expect(acceptTradeOffer(worldId, "bob", { offerId, settlementId })).rejects.toMatchObject({ code: "CANNOT_AFFORD" });

        pay.mockResolvedValueOnce({ modifiedCount: 1 } as never).mockResolvedValueOnce({ modifiedCount: 0 } as never);
        await expect(acceptTradeOffer(worldId, "bob", { offerId, settlementId })).rejects.toMatchObject({ code: "OFFER_NOT_FOUND" });

        take.mockReturnValue({ lean: async () => null } as never);
        await expect(acceptTradeOffer(worldId, "alice", { offerId, settlementId })).rejects.toMatchObject({ code: "OFFER_NOT_FOUND" });
    });

    it("takes an offer only at a market of the taker's own", async () => {
        const take = mockOffer(offer);
        mockSettlement({ tiles: withMarket.slice(0, 1), resources: { iron: 10 } });
        await expect(acceptTradeOffer(worldId, "bob", { offerId, settlementId })).rejects.toMatchObject({ code: "NO_MARKET" });
        mockSettlement(null);
        await expect(acceptTradeOffer(worldId, "bob", { offerId, settlementId })).rejects.toMatchObject({ code: "SITE_NOT_FOUND" });
        await expect(acceptTradeOffer(worldId, "bob", { offerId: "nope", settlementId })).rejects.toMatchObject({ code: "INVALID_INPUT" });
        expect(take).not.toHaveBeenCalled();
    });
});

describe("withdrawTradeOffer", () => {
    it("returns what an offer held to the settlement it came from — the poster's offers only", async () => {
        const take = mockOffer({ _id: offerId, ownerId: "alice", settlementId: theirs, gives: { wood: 40, stone: 5 } });
        const refund = vi.spyOn(KingdomBuilderSettlementModel, "updateOne").mockResolvedValue({ modifiedCount: 1 } as never);

        await withdrawTradeOffer(worldId, "alice", offerId);

        expect(take).toHaveBeenCalledWith({ _id: offerId, worldId, ownerId: "alice" }, { session: {} });
        expect(refund).toHaveBeenCalledWith({ _id: theirs, worldId, ownerId: "alice" }, { $inc: { "resources.wood": 40, "resources.stone": 5 } }, { session: {} });

        take.mockReturnValue({ lean: async () => null } as never);
        await expect(withdrawTradeOffer(worldId, "bob", offerId)).rejects.toMatchObject({ code: "OFFER_NOT_FOUND" });
    });

    it("refuses on an ended world", async () => {
        vi.mocked(KingdomBuilderWorldModel.updateOne).mockResolvedValue({ modifiedCount: 0 } as never);
        const take = mockOffer(null);
        await expect(withdrawTradeOffer(worldId, "alice", offerId)).rejects.toMatchObject({ code: "WORLD_NOT_FOUND" });
        expect(take).not.toHaveBeenCalled();
    });
});

describe("tradeOffersIn", () => {
    it("shows every member the board, and which settlement posted an offer to its poster alone", async () => {
        vi.spyOn(KingdomBuilderTradeOfferModel, "find").mockReturnValue({ sort: () => ({ limit: () => ({ lean: async () => [
            { _id: new Types.ObjectId(), ownerId: "alice", settlementId: theirs, gives: { wood: 40 }, wants: { iron: 10 } },
            { _id: new Types.ObjectId(), ownerId: "bob", settlementId: new Types.ObjectId(), gives: { stone: 5 }, wants: { wheat: 5 } },
            { _id: new Types.ObjectId(), ownerId: "gone", settlementId: new Types.ObjectId(), gives: { stone: 5 }, wants: { wheat: 5 } },
        ] }) }) } as never);

        const board = await tradeOffersIn(worldId, "alice", new Map([["alice", 0], ["bob", 1]]));

        expect(board).toHaveLength(2);
        expect(board[0]).toMatchObject({ seat: 0, isMine: true, settlementId: theirs.toString(), gives: { ...none, wood: 40 } });
        expect(board[1]).toMatchObject({ seat: 1, isMine: false });
        expect(board[1]).not.toHaveProperty("settlementId");
    });
});
