// Trading between players (docs/games/settlements-and-cities.md §10): the rules
// both the commands and the board screen read, so the screen only offers what
// the server will accept. Pure and Mongoose-free, like board.ts.

import type { ISACResources, ISACSpecificGameState, ISACTradeOffer, SAC_Resource } from "./board";
import { NO_RESOURCES, SAC_RESOURCES } from "./board";

/** How many offers one player may have open at once. */
export const SAC_MAX_OPEN_OFFERS = 3;

/**
 * How many offers one player may post while one main turn lasts, withdrawn ones
 * included. Offers are free to post on anyone's turn, so without this a player
 * could post and withdraw in a loop and flood the table's log.
 */
export const SAC_MAX_OFFERS_POSTED_PER_TURN = 6;

/** The most of one resource either side of an offer may name — the bank holds 19 of each. */
export const SAC_MAX_TRADE_AMOUNT = 19;

/**
 * Whether anyone may trade right now. Not during setup, and not while the
 * robber is moving: a hand about to be stolen from can't be traded out of the
 * way first.
 */
export function sacTradingOpen(gs: Pick<ISACSpecificGameState, "phase" | "pendingRobber">): boolean {
    return gs.phase === "main" && !gs.pendingRobber;
}

/**
 * The player whose main turn it is. During a Special Build Phase `currentTurn`
 * walks round the other seats, but the main turn is still the one that opened
 * it — it hasn't ended until the phase closes.
 */
export function sacMainTurnPlayer(
    gs: Pick<ISACSpecificGameState, "specialBuildActive" | "specialBuildMainPlayer">,
    currentTurn: string,
): string {
    return gs.specialBuildActive ? (gs.specialBuildMainPlayer ?? currentTurn) : currentTurn;
}

/**
 * One side of an offer as a client sent it, as a clean resource record — or
 * null if it isn't one: every resource a whole number from 0 to
 * SAC_MAX_TRADE_AMOUNT, and nothing else carried over.
 */
export function sacTradeSide(raw: unknown): ISACResources | null {
    if (typeof raw !== "object" || raw === null) return null;
    const side: ISACResources = { ...NO_RESOURCES };
    for (const resource of SAC_RESOURCES) {
        const amount = (raw as Record<string, unknown>)[resource] ?? 0;
        if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 0 || amount > SAC_MAX_TRADE_AMOUNT) return null;
        side[resource] = amount;
    }
    return side;
}

function total(side: Partial<Record<SAC_Resource, number>>): number {
    return SAC_RESOURCES.reduce((sum, resource) => sum + (side[resource] ?? 0), 0);
}

/**
 * Whether an offer's two sides make a trade: something each way (no gifts),
 * and no resource on both sides.
 */
export function sacValidTradeTerms(give: ISACResources, want: ISACResources): boolean {
    if (total(give) === 0 || total(want) === 0) return false;
    return SAC_RESOURCES.every(resource => give[resource] === 0 || want[resource] === 0);
}

/** Whether `hand` holds at least `side` of every resource. */
export function sacCanCover(hand: Record<SAC_Resource, number>, side: Partial<Record<SAC_Resource, number>>): boolean {
    return SAC_RESOURCES.every(resource => (hand[resource] ?? 0) >= (side[resource] ?? 0));
}

/**
 * Whether `offer` lapses when the current main turn ends: its proposer's turn,
 * posted before that turn began. Everything else lasts at least one more of
 * its proposer's turns.
 */
export function sacOfferEndsThisTurn(offer: Pick<ISACTradeOffer, "proposerId" | "postedOnOwnTurn">, mainTurnPlayer: string): boolean {
    return offer.proposerId === mainTurnPlayer && !offer.postedOnOwnTurn;
}
