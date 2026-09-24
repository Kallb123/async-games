// Trade between players (GDD §4.2, §4.3, §11.3 PR 25): an offer posted at one
// settlement's market — this much of what I have for that much of what you
// have — for anyone else in the world to take at a market of theirs. What an
// offer gives is held from the moment it is posted, and the goods change hands
// the moment it is taken, market to market; carrying stores by road is what
// caravans are for.

import mongoose, { Types, type ClientSession } from "mongoose";

import { KingdomBuilderSettlementModel } from "./KingdomBuilderSettlementModel";
import { KingdomBuilderTradeOfferModel } from "./KingdomBuilderTradeOfferModel";
import { KingdomBuilderWorldModel } from "./KingdomBuilderWorldModel";
import { KINGDOM_BUILDER_TRADE_OFFER_LIMIT, amountsFrom, depositTo, marketLevelOf, resourceTotal, resourcesIn, spendFrom } from "./market";
import { KingdomBuilderPersistenceError } from "./persistence";
import { canAfford, resourcesOf } from "./resources";
import { worldView, type KingdomBuilderWorldView } from "./worldView";

function invalid(message: string): KingdomBuilderPersistenceError {
    return new KingdomBuilderPersistenceError("INVALID_INPUT", message);
}

function isId(id: unknown): id is string {
    return typeof id === "string" && Types.ObjectId.isValid(id);
}

/**
 * Every trade writes the world first, like a dispatch or a battle: two posts at
 * once conflict, so the offer limit is counted in a transaction that can't
 * miss the other's offer — and an ended world refuses it.
 */
async function trading(worldId: string, work: (session: ClientSession) => Promise<void>): Promise<void> {
    await mongoose.connection.transaction(async session => {
        const live = await KingdomBuilderWorldModel.updateOne({ _id: worldId, endedAt: null }, { $inc: { tradesMade: 1 } }, { session });
        if (live.modifiedCount !== 1) throw new KingdomBuilderPersistenceError("WORLD_NOT_FOUND", "Kingdom Builder world not found");
        await work(session);
    });
}

/** The caller's own settlement with a market — the only place an offer is posted from or taken at. */
async function ownMarket(worldId: string, userId: string, settlementId: string) {
    const settlement = await KingdomBuilderSettlementModel.findOne({ _id: settlementId, worldId, ownerId: userId }).select({ tiles: 1, resources: 1 }).lean();
    if (!settlement) throw new KingdomBuilderPersistenceError("SITE_NOT_FOUND", "Settlement not found");
    if (marketLevelOf(settlement.tiles) === 0) throw new KingdomBuilderPersistenceError("NO_MARKET", "Build a market there to trade");
    return resourcesOf(settlement.resources);
}

/**
 * Posts an offer from one of the player's markets: its `gives` taken from the
 * stores in the same transaction that lists it, so what is on the board is
 * always paid for. Each side names at least one resource, and no resource is
 * on both.
 */
export async function postTradeOffer(
    worldId: string,
    userId: string,
    request: { settlementId: unknown; gives: unknown; wants: unknown },
): Promise<KingdomBuilderWorldView> {
    const { settlementId } = request;
    if (!isId(worldId) || !isId(settlementId)) throw invalid("Choose a settlement to trade from");
    const gives = amountsFrom(request.gives);
    const wants = amountsFrom(request.wants);
    if (!gives || !wants || resourceTotal(gives) === 0 || resourceTotal(wants) === 0) throw invalid("Choose what to give and what to ask for");
    if (resourcesIn(gives).some(resource => wants[resource] > 0)) throw invalid("Ask for something other than what you give");
    // Whose it is comes first, so a stranger learns nothing about the world from what is refused.
    const stores = await ownMarket(worldId, userId, settlementId);
    if (!canAfford(stores, gives)) throw new KingdomBuilderPersistenceError("CANNOT_AFFORD", "The stores don't hold that much to offer");

    const escrow = spendFrom(gives);
    await trading(worldId, async session => {
        if (await KingdomBuilderTradeOfferModel.countDocuments({ worldId, ownerId: userId }).session(session) >= KINGDOM_BUILDER_TRADE_OFFER_LIMIT) {
            throw new KingdomBuilderPersistenceError("TRADE_BUSY", `You already have ${KINGDOM_BUILDER_TRADE_OFFER_LIMIT} offers open`);
        }
        const held = await KingdomBuilderSettlementModel.updateOne(
            { _id: settlementId, worldId, ownerId: userId, "tiles.building.type": "market", ...escrow.filter },
            { $inc: escrow.$inc },
            { session },
        );
        if (held.modifiedCount !== 1) throw new KingdomBuilderPersistenceError("TRADE_BUSY", "The settlement changed before the offer could be posted");
        await KingdomBuilderTradeOfferModel.create([{ worldId, ownerId: userId, settlementId, gives, wants }], { session });
    });
    return worldView(worldId, userId);
}

/**
 * Takes someone else's offer at one of the player's markets: the offer comes
 * off the board, the taker's stores pay what it wants and take in what it
 * gives, and the poster's settlement takes in what it wanted — all in one
 * transaction, so a second taker, a withdrawal or a tick in between fails it
 * rather than paying twice or into nowhere.
 */
export async function acceptTradeOffer(
    worldId: string,
    userId: string,
    request: { offerId: unknown; settlementId: unknown },
): Promise<KingdomBuilderWorldView> {
    const { offerId, settlementId } = request;
    if (!isId(worldId) || !isId(offerId) || !isId(settlementId)) throw invalid("Choose an offer and a settlement to take it at");
    await ownMarket(worldId, userId, settlementId);

    await trading(worldId, async session => {
        const offer = await KingdomBuilderTradeOfferModel.findOneAndDelete({ _id: offerId, worldId, ownerId: { $ne: userId } }, { session }).lean();
        if (!offer) throw new KingdomBuilderPersistenceError("OFFER_NOT_FOUND", "That offer has been taken or withdrawn");
        const wants = resourcesOf(offer.wants);
        const payment = spendFrom(wants);
        const paid = await KingdomBuilderSettlementModel.updateOne(
            { _id: settlementId, worldId, ownerId: userId, "tiles.building.type": "market", ...payment.filter },
            { $inc: { ...payment.$inc, ...depositTo(resourcesOf(offer.gives)) } },
            { session },
        );
        if (paid.modifiedCount !== 1) throw new KingdomBuilderPersistenceError("CANNOT_AFFORD", "Not enough in store to pay for that");
        const delivered = await KingdomBuilderSettlementModel.updateOne(
            { _id: offer.settlementId, worldId, ownerId: offer.ownerId }, { $inc: depositTo(wants) }, { session },
        );
        if (delivered.modifiedCount !== 1) throw new KingdomBuilderPersistenceError("OFFER_NOT_FOUND", "The trader's settlement is gone");
    });
    return worldView(worldId, userId);
}

/** Takes one of the player's own offers off the board, returning what it held to the settlement it came from. */
export async function withdrawTradeOffer(worldId: string, userId: string, offerId: unknown): Promise<KingdomBuilderWorldView> {
    if (!isId(worldId) || !isId(offerId)) throw invalid("Choose an offer");
    await trading(worldId, async session => {
        const offer = await KingdomBuilderTradeOfferModel.findOneAndDelete({ _id: offerId, worldId, ownerId: userId }, { session }).lean();
        if (!offer) throw new KingdomBuilderPersistenceError("OFFER_NOT_FOUND", "That offer has been taken or withdrawn");
        await KingdomBuilderSettlementModel.updateOne(
            { _id: offer.settlementId, worldId, ownerId: userId }, { $inc: depositTo(resourcesOf(offer.gives)) }, { session },
        );
    });
    return worldView(worldId, userId);
}
