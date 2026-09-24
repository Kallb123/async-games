// The market and the caravan (GDD §4.2, §4.3, §11.3 PR 25), pure like
// buildings.ts: the settlement screen prices an exchange and a caravan's load
// with the same helpers the server checks them against.

import type { KingdomBuilderResources, KingdomBuilderTile } from "./KingdomBuilderSettlementModel";
import { KINGDOM_BUILDER_UPGRADABLE_BUILDINGS, buildingLevelOf } from "./buildings";
import { KINGDOM_BUILDER_ECONOMY as economy } from "./economy";
import { KINGDOM_BUILDER_RESOURCE_TYPES, resourcesOf, tunedResources, type KingdomBuilderResourceType } from "./resources";

function tunedCount(name: string, value: number): number {
    if (!Number.isInteger(value) || value < 1) throw new Error(`economy.ts: ${name} must be a whole number above zero (${value})`);
    return value;
}

/** What one of any resource costs in another at each market level, from level one. */
const MARKET_RATES = economy.marketRates.map((rate, index) => tunedCount(`marketRates[${index}]`, rate));

export const KINGDOM_BUILDER_MARKET_MAX_LEVEL = KINGDOM_BUILDER_UPGRADABLE_BUILDINGS.market!;
export const KINGDOM_BUILDER_CARAVAN_COST: KingdomBuilderResources = tunedResources("caravanCost", economy.caravanCost);
/** How much one caravan carries, every resource together. */
export const KINGDOM_BUILDER_CARAVAN_CAPACITY = tunedCount("caravanCapacity", economy.caravanCapacity);
export const KINGDOM_BUILDER_TRADE_OFFER_LIMIT = tunedCount("tradeOfferLimit", economy.tradeOfferLimit);
/** The most of one resource a request may name — far past any store, so it only turns away nonsense. */
export const KINGDOM_BUILDER_MAX_AMOUNT = 100_000;

/** The settlement's market level, or 0 without one. A settlement holds at most one. */
export function marketLevelOf(tiles: readonly KingdomBuilderTile[]): number {
    return buildingLevelOf(tiles, "market");
}

/** How many of one resource the market asks for one of another, or null with no market. */
export function exchangeRateFor(marketLevel: number): number | null {
    if (marketLevel < 1) return null;
    return MARKET_RATES[Math.min(marketLevel, MARKET_RATES.length) - 1];
}

/** "4 for 1" — a market level's rate as the settlement screen says it. */
export function formatRate(marketLevel: number): string {
    const rate = exchangeRateFor(marketLevel);
    return rate === null ? "no market" : `${rate} for 1`;
}

export function isResourceType(value: unknown): value is KingdomBuilderResourceType {
    return typeof value === "string" && (KINGDOM_BUILDER_RESOURCE_TYPES as readonly string[]).includes(value);
}

/** Every resource in a set, added up — what a caravan's load is measured in. */
export function resourceTotal(amounts: Partial<KingdomBuilderResources> | undefined): number {
    const whole = resourcesOf(amounts);
    return KINGDOM_BUILDER_RESOURCE_TYPES.reduce((total, resource) => total + whole[resource], 0);
}

/** How much this many caravans can carry between them. */
export function caravanCapacityOf(caravans: number): number {
    return caravans * KINGDOM_BUILDER_CARAVAN_CAPACITY;
}

/**
 * A set of resources named in a request: known resources only, whole
 * non-negative amounts, none past `KINGDOM_BUILDER_MAX_AMOUNT`. Null for
 * anything else — the caller says what was wrong in its own words.
 */
export function amountsFrom(value: unknown): KingdomBuilderResources | null {
    if (value === undefined) return resourcesOf();
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const entries = Object.entries(value);
    const valid = entries.every(([resource, amount]) => isResourceType(resource)
        && Number.isSafeInteger(amount) && (amount as number) >= 0 && (amount as number) <= KINGDOM_BUILDER_MAX_AMOUNT);
    return valid ? resourcesOf(Object.fromEntries(entries)) : null;
}

/** The resources a set holds any of. */
export function resourcesIn(amounts: KingdomBuilderResources): KingdomBuilderResourceType[] {
    return KINGDOM_BUILDER_RESOURCE_TYPES.filter(resource => amounts[resource] > 0);
}

/**
 * The filter clauses and `$inc` that take a set of resources out of the
 * stores in the same conditional write as whatever pays for it (§4.5), so a
 * tick or a second tab landing after the pre-check fails the write rather than
 * overdrawing. `field` is where the stores live on the document. Only what the
 * cost asks for is filtered: a settlement stored before wheat existed has no
 * wheat field, which `$gte: 0` would refuse — though it holds none.
 */
export function spendFrom(cost: KingdomBuilderResources, field = "resources") {
    const priced = resourcesIn(cost);
    return {
        filter: Object.fromEntries(priced.map(resource => [`${field}.${resource}`, { $gte: cost[resource] }])),
        $inc: Object.fromEntries(priced.map(resource => [`${field}.${resource}`, -cost[resource]])),
    };
}

/** The `$inc` that adds a set of resources to the stores at `field`. */
export function depositTo(amounts: KingdomBuilderResources, field = "resources"): Record<string, number> {
    return Object.fromEntries(resourcesIn(amounts).map(resource => [`${field}.${resource}`, amounts[resource]]));
}
