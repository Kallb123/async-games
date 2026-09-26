// Pure, so the settlement screen can read the same list, timings and prices
// the server checks against without pulling Mongoose into the client bundle.

import type { KingdomBuilderBuildingType, KingdomBuilderResources, KingdomBuilderTile } from "./KingdomBuilderSettlementModel";
import { KINGDOM_BUILDER_ECONOMY as economy } from "./economy";
import { KINGDOM_BUILDER_RESOURCE_TYPES, resourcesOf, tunedResources, type KingdomBuilderResourceType } from "./resources";
import { outputPerLevelFor, type KingdomBuilderCatchment } from "./worldgen/catchment";

export const KINGDOM_BUILDER_PROTOTYPE_BUILDINGS = ["lumber-camp", "quarry", "farm", "mine", "barracks", "market", "tavern", "walls"] as const;
export type KingdomBuilderPrototypeBuilding = typeof KINGDOM_BUILDER_PROTOTYPE_BUILDINGS[number];
/** Everything with a price: what can be built, and the town centre, which is only ever raised a level (PR 24). */
export type KingdomBuilderUpgradableBuilding = KingdomBuilderPrototypeBuilding | "town-centre";

/** The town centre's highest level — and so the tavern's, which can never stand above it (§6.5). */
const TOWN_CENTRE_MAX_LEVEL = 2;

/**
 * The buildings a settlement holds at most one of and raises a level at a time
 * (§4.2), and the highest level of each: the barracks, whose levels unlock
 * units, the market (PR 25), whose levels better its rate, the town centre,
 * whose second level trains settlers (§4.4, PR 24), and the tavern (PR 26),
 * whose levels each recruit one more commander, and walls, whose three levels
 * each delay a full attack. Everything else is built once, at level one.
 */
export const KINGDOM_BUILDER_UPGRADABLE_BUILDINGS: Partial<Record<KingdomBuilderUpgradableBuilding, number>> = {
    barracks: 3,
    market: economy.marketRates.length,
    "town-centre": TOWN_CENTRE_MAX_LEVEL,
    tavern: TOWN_CENTRE_MAX_LEVEL,
    walls: economy.wallCosts.length,
};

/** The level of a settlement's one building of this type, or 0 without one. */
export function buildingLevelOf(tiles: readonly KingdomBuilderTile[], type: KingdomBuilderBuildingType): number {
    return tiles.find(tile => tile.building?.type === type)?.building?.level ?? 0;
}

/**
 * The highest level this settlement's tavern may reach now (§6.5): the level
 * its town centre has been built to — one still under construction doesn't
 * count — and never past the tavern's own highest.
 */
export function tavernLevelCapFor(tiles: readonly KingdomBuilderTile[]): number {
    return Math.min(buildingLevelOf(tiles, "town-centre"), KINGDOM_BUILDER_UPGRADABLE_BUILDINGS.tavern!);
}

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
type RegularBuilding = Exclude<KingdomBuilderUpgradableBuilding, "walls">;
const REGULAR_BUILDINGS = [...KINGDOM_BUILDER_PROTOTYPE_BUILDINGS.filter(type => type !== "walls"), "town-centre" as const] as RegularBuilding[];
const LEVEL_ONE_COSTS: Record<RegularBuilding, KingdomBuilderResources> = Object.fromEntries(
    REGULAR_BUILDINGS.map(type => [type, tunedResources(`buildingCosts.${type}`, economy.buildingCosts[type])]),
) as Record<RegularBuilding, KingdomBuilderResources>;

/** Resources a player's first settlement is founded with; later ones start empty. */
export const KINGDOM_BUILDER_STARTING_STOCKPILE: KingdomBuilderResources = tunedResources("startingStockpile", economy.startingStockpile);

/** What a town centre produces every tick on its own, so no settlement can be left with no way forward. */
export const KINGDOM_BUILDER_TOWN_CENTRE_TRICKLE: KingdomBuilderResources = tunedResources("townCentreTrickle", economy.townCentreTrickle);

/**
 * The whole price of raising a building to a level, paid when it is queued.
 * Most use the level-one price × the target level; walls instead have a
 * material-specific price for each level.
 */
export function buildingCostFor(type: KingdomBuilderUpgradableBuilding, targetLevel: number): KingdomBuilderResources {
    if (type === "walls") {
        const cost = economy.wallCosts[targetLevel - 1];
        if (!cost) throw new RangeError(`Walls have no level ${targetLevel}`);
        return tunedResources(`wallCosts.${targetLevel}`, cost);
    }
    const levelOne = LEVEL_ONE_COSTS[type];
    return resourcesOf(Object.fromEntries(KINGDOM_BUILDER_RESOURCE_TYPES.map(resource => [resource, levelOne[resource] * targetLevel])));
}
