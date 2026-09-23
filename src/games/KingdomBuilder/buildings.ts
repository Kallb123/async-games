// Pure, so the settlement screen can read the same list, timings and prices
// the server checks against without pulling Mongoose into the client bundle.

import type { KingdomBuilderResources } from "./KingdomBuilderSettlementModel";
import economy from "./economy.json";
import { KINGDOM_BUILDER_RESOURCE_TYPES, resourcesOf } from "./resources";

export const KINGDOM_BUILDER_PROTOTYPE_BUILDINGS = ["lumber-camp", "quarry", "mine", "barracks"] as const;
export type KingdomBuilderPrototypeBuilding = typeof KINGDOM_BUILDER_PROTOTYPE_BUILDINGS[number];
export const KINGDOM_BUILDER_PROTOTYPE_BUILD_TICKS = 2;

/** Ticks to raise a building to a level: the first costs the prototype's two, each level after it two more. */
export function buildTicksFor(targetLevel: number): number {
    return KINGDOM_BUILDER_PROTOTYPE_BUILD_TICKS * targetLevel;
}

// The prices (units' too, read by units.ts), the first settlement's stockpile and the town centre's trickle
// (GDD §4.5) live in economy.json so a tuning pass edits numbers, not code.
// A resource left out of an entry costs (or grants) none.
const LEVEL_ONE_COSTS: Record<KingdomBuilderPrototypeBuilding, KingdomBuilderResources> = Object.fromEntries(
    KINGDOM_BUILDER_PROTOTYPE_BUILDINGS.map(type => [type, resourcesOf(economy.buildingCosts[type])]),
) as Record<KingdomBuilderPrototypeBuilding, KingdomBuilderResources>;

/** Resources a player's first settlement is founded with; later ones start empty. */
export const KINGDOM_BUILDER_STARTING_STOCKPILE: KingdomBuilderResources = resourcesOf(economy.startingStockpile);

/** What a town centre produces every tick on its own, so no settlement can be left with no way forward. */
export const KINGDOM_BUILDER_TOWN_CENTRE_TRICKLE: KingdomBuilderResources = resourcesOf(economy.townCentreTrickle);

/**
 * The whole price of raising a building to a level, paid when it is queued:
 * the level-one price × the target level, linear like `buildTicksFor`.
 */
export function buildingCostFor(type: KingdomBuilderPrototypeBuilding, targetLevel: number): KingdomBuilderResources {
    const levelOne = LEVEL_ONE_COSTS[type];
    return resourcesOf(Object.fromEntries(KINGDOM_BUILDER_RESOURCE_TYPES.map(resource => [resource, levelOne[resource] * targetLevel])));
}
