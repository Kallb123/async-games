// The world's trade board as each member reads it (PR 25) — apart from
// trade.ts, which takes and posts offers and replies with the world view.

import type { KingdomBuilderResources } from "./KingdomBuilderSettlementModel";
import { KingdomBuilderTradeOfferModel } from "./KingdomBuilderTradeOfferModel";
import { KINGDOM_BUILDER_TRADE_OFFER_LIMIT } from "./market";
import { resourcesOf } from "./resources";

/** An offer on a world's board, as every member sees it. */
export interface KingdomBuilderTradeOfferView {
    offerId: string;
    /** The index in `players` of whoever posted it. */
    seat: number;
    isMine: boolean;
    /** Yours only: the settlement it was posted from. */
    settlementId?: string;
    gives: KingdomBuilderResources;
    wants: KingdomBuilderResources;
}

/** The most offers a world's board shows — the limit per player times the ten seats. */
const BOARD_LIMIT = KINGDOM_BUILDER_TRADE_OFFER_LIMIT * 10;

/**
 * The world's board, oldest first — every offer, whoever posted it, since the
 * board is the point. Which settlement posted one is its poster's to know.
 */
export async function tradeOffersIn(worldId: string, userId: string, seatOf: ReadonlyMap<string, number>): Promise<KingdomBuilderTradeOfferView[]> {
    const offers = await KingdomBuilderTradeOfferModel.find({ worldId }).sort({ createdAt: 1, _id: 1 }).limit(BOARD_LIMIT).lean();
    return offers.flatMap(offer => {
        const seat = seatOf.get(offer.ownerId);
        const isMine = offer.ownerId === userId;
        return seat === undefined ? [] : [{
            offerId: offer._id.toString(), seat, isMine,
            ...(isMine ? { settlementId: offer.settlementId.toString() } : {}),
            gives: resourcesOf(offer.gives), wants: resourcesOf(offer.wants),
        }];
    });
}
