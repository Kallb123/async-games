// Pure, so the settlement screen can read the same list, timings and prices
// the server checks against without pulling Mongoose into the client bundle.

import type { KingdomBuilderBuildingType, KingdomBuilderResources } from "./KingdomBuilderSettlementModel";
import { KINGDOM_BUILDER_ECONOMY as economy } from "./economy";
import { KINGDOM_BUILDER_RESOURCE_TYPES, resourcesOf, tunedResources, type KingdomBuilderResourceType } from "./resources";
import { outputPerLevelFor, type KingdomBuilderCatchment } from "./worldgen/catchment";

export const KINGDOM_BUILDER_PROTOTYPE_BUILDINGS = ["lumber-camp", "quarry", "farm", "mine", "barracks"] as const;
export type KingdomBuilderPrototypeBuilding = typeof KINGDOM_BUILDER_PROTOTYPE_BUILDINGS[number];

/**
 * What each production building makes. Its output per level is set by how
 * well the settlement's land yields that resource (§4.6), and on land that
 * yields none of it the building can't be built.
 */
export const KINGDOM_BUILDER_BUILDING_PRODUCES: Partial<Record<KingdomBuilderBuildingType, KingdomBuilderResourceType>> = {
    "lumber-camp": "wood",
    quarry: "stone",
    mine: "iron",
    farm: "wheat",
};

/** What a building makes each tick at this level on this land — its level × the tier's output — or nothing for one that isn't a production building. */
export function buildingOutputFor(
    type: KingdomBuilderBuildingType,
    level: number,
    catchment: KingdomBuilderCatchment,
): { resource: KingdomBuilderResourceType; amount: number } | undefined {
    const resource = KINGDOM_BUILDER_BUILDING_PRODUCES[type];
    return resource && { resource, amount: level * outputPerLevelFor(catchment[resource]) };
}
export const KINGDOM_BUILDER_PROTOTYPE_BUILD_TICKS = 2;

/** Ticks to raise a building to a level: the first costs the prototype's two, each level after it two more. */
export function buildTicksFor(targetLevel: number): number {
    return KINGDOM_BUILDER_PROTOTYPE_BUILD_TICKS * targetLevel;
}

// The prices, the first settlement's stockpile and the town centre's trickle
// live in economy.ts, so a tuning pass edits numbers, not logic.
const LEVEL_ONE_COSTS: Record<KingdomBuilderPrototypeBuilding, KingdomBuilderResources> = Object.fromEntries(
    KINGDOM_BUILDER_PROTOTYPE_BUILDINGS.map(type => [type, tunedResources(`buildingCosts.${type}`, economy.buildingCosts[type])]),
) as Record<KingdomBuilderPrototypeBuilding, KingdomBuilderResources>;

/** Resources a player's first settlement is founded with; later ones start empty. */
export const KINGDOM_BUILDER_STARTING_STOCKPILE: KingdomBuilderResources = tunedResources("startingStockpile", economy.startingStockpile);

/** What a town centre produces every tick on its own, so no settlement can be left with no way forward. */
export const KINGDOM_BUILDER_TOWN_CENTRE_TRICKLE: KingdomBuilderResources = tunedResources("townCentreTrickle", economy.townCentreTrickle);

/**
 * The whole price of raising a building to a level, paid when it is queued:
 * the level-one price × the target level, linear like `buildTicksFor`.
 */
export function buildingCostFor(type: KingdomBuilderPrototypeBuilding, targetLevel: number): KingdomBuilderResources {
    const levelOne = LEVEL_ONE_COSTS[type];
    return resourcesOf(Object.fromEntries(KINGDOM_BUILDER_RESOURCE_TYPES.map(resource => [resource, levelOne[resource] * targetLevel])));
}
