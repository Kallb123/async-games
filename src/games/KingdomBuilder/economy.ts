import type { KingdomBuilderResources } from "./KingdomBuilderSettlementModel";
import type { KingdomBuilderPrototypeBuilding } from "./buildings";
import type { KingdomBuilderUnitType } from "./units";

// The economy's numbers (GDD §4.5), in one place so a tuning pass edits this
// file and nothing else. First-pass values, not a contract — §12 retunes them.
//
// A resource left out of an entry costs (or grants) none. The types make every
// building and unit need a price and refuse an unknown resource; whole,
// non-negative amounts are checked when the module loads (`tunedResources`),
// since a negative price would pay the player to build.

type Amounts = Partial<KingdomBuilderResources>;

interface Economy {
    /** Level-one price of each building; level N costs N times this, like its build time. */
    buildingCosts: Record<KingdomBuilderPrototypeBuilding, Amounts>;
    /** Training price of one unit, paid in full when it is queued. */
    unitCosts: Record<KingdomBuilderUnitType, Amounts>;
    /** What a player's first settlement is founded with. Later ones start empty — a free second settlement with its own stock would print resources. */
    startingStockpile: Amounts;
    /** What every town centre produces each tick on its own, so a settlement too poor for its cheapest building still earns its way to one. */
    townCentreTrickle: Amounts;
}

export const KINGDOM_BUILDER_ECONOMY = {
    buildingCosts: {
        "lumber-camp": { wood: 15 },
        quarry: { wood: 15 },
        mine: { wood: 20, stone: 10 },
        barracks: { wood: 30, stone: 20, iron: 10 },
    },
    unitCosts: {
        militia: { wood: 10, iron: 5 },
        scout: { wood: 8, iron: 4 },
        infantry: { wood: 10, iron: 15 },
        cavalry: { wood: 20, iron: 25 },
        "siege-engine": { wood: 40, stone: 20, iron: 15 },
    },
    // Buys a lumber camp and a quarry with 10 wood and 20 stone over — not yet
    // a mine, so the first decision is what to wait for.
    startingStockpile: { wood: 40, stone: 20 },
    townCentreTrickle: { wood: 1 },
} satisfies Economy;
