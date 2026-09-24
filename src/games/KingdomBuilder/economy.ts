import type { KingdomBuilderResources } from "./KingdomBuilderSettlementModel";
import type { KingdomBuilderUpgradableBuilding } from "./buildings";
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
    /**
     * Level-one price of each building; level N costs N times this, like its
     * build time. The town centre is never bought at level one — every
     * settlement is founded with it — so its entry prices the levels after.
     */
    buildingCosts: Record<KingdomBuilderUpgradableBuilding, Amounts>;
    /** Training price of one unit, paid in full when it is queued. */
    unitCosts: Record<KingdomBuilderUnitType, Amounts>;
    /**
     * What a player's first settlement is founded with — and one a settler
     * founds (PR 24), which carries it from the town that trained it and costs
     * more than it. A barbarian village taken starts with only what came with
     * its conquerors.
     */
    startingStockpile: Amounts;
    /** What every town centre produces each tick on its own, so a settlement too poor for its cheapest building still earns its way to one. */
    townCentreTrickle: Amounts;
    /** How far round its own tile a settlement's land reaches (§4.6), in tiles. */
    catchmentRadius: number;
    /**
     * The share of that land a resource must come from to reach each tier, and
     * what a production building makes there per level. Below `poor` — none of
     * the land yields it — the building can't be built at all.
     */
    yieldTiers: Record<"poor" | "good" | "rich", { fromShare: number; outputPerLevel: number }>;
    /**
     * What a market asks for one of any other resource, indexed by its level
     * less one — so its length is the market's highest level. Always worse than
     * producing it (§4.3): the market is a release valve, not a way round the land.
     */
    marketRates: readonly number[];
    /** What one caravan costs at the market (PR 25). */
    caravanCost: Amounts;
    /** How much one caravan carries, all resources together. */
    caravanCapacity: number;
    /** Trade offers one player may have open in a world at once. */
    tradeOfferLimit: number;
}

export const KINGDOM_BUILDER_ECONOMY = {
    buildingCosts: {
        "lumber-camp": { wood: 15 },
        quarry: { wood: 15 },
        farm: { wood: 10, stone: 5 },
        mine: { wood: 20, stone: 10 },
        barracks: { wood: 30, stone: 20, iron: 10 },
        market: { wood: 25, stone: 15 },
        // Recruits commanders (§6.5): one per level, up to the town centre's.
        tavern: { wood: 25, stone: 15, wheat: 10 },
        // Level two, the settler's threshold (§4.4), is twice this: 60 wood, 60 stone, 20 iron.
        "town-centre": { wood: 30, stone: 30, iron: 10 },
    },
    // Armies eat (§4.6): every unit's price carries wheat, cavalry most — horses eat.
    unitCosts: {
        militia: { wood: 10, iron: 5, wheat: 5 },
        scout: { wood: 8, iron: 4, wheat: 3 },
        infantry: { wood: 10, iron: 15, wheat: 8 },
        cavalry: { wood: 20, iron: 25, wheat: 15 },
        "siege-engine": { wood: 40, stone: 20, iron: 15, wheat: 10 },
        // Every resource (§4.4), and more than the stockpile it carries to the
        // town it founds — so a settler never prints resources.
        settler: { wood: 60, stone: 40, iron: 10, wheat: 40 },
    },
    // Buys a lumber camp and a quarry with 10 wood and 20 stone over — not yet
    // a mine or a farm, so the first decision is what to wait for.
    startingStockpile: { wood: 40, stone: 20, wheat: 20 },
    townCentreTrickle: { wood: 1, wheat: 1 },
    // A 9 × 9 square with its corners cut: 69 tiles, most of them the settlement's own neighbourhood.
    catchmentRadius: 4,
    // Output moves from 1 to 2 a level for a Good site, so the typical economy
    // runs at about twice PR 13's rate; the prices above are pitched at that.
    yieldTiers: {
        poor: { fromShare: 0, outputPerLevel: 1 },
        good: { fromShare: 0.15, outputPerLevel: 2 },
        rich: { fromShare: 0.35, outputPerLevel: 3 },
    },
    // 4 for 1 at a new market, 2 for 1 at the top — even a rich site's own
    // level-one building out-earns a level-three market's conversion.
    marketRates: [4, 3, 2],
    caravanCost: { wood: 20, wheat: 10 },
    caravanCapacity: 50,
    tradeOfferLimit: 5,
} satisfies Economy;
