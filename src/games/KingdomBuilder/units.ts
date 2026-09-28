import type { KingdomBuilderResources, KingdomBuilderTile } from "./KingdomBuilderSettlementModel";
import { KINGDOM_BUILDER_UPGRADABLE_BUILDINGS, buildingLevelOf } from "./buildings";
import { KINGDOM_BUILDER_ECONOMY as economy } from "./economy";
import { KINGDOM_BUILDER_RESOURCE_TYPES, resourcesOf, tunedResources } from "./resources";

/**
 * GDD §6.1's roster, in the order the barracks unlocks them — then the settler
 * (§4.4, PR 24), which the town centre trains, and the commander (§6.5, PR 26),
 * which the tavern recruits.
 */
export const KINGDOM_BUILDER_UNIT_TYPES = ["militia", "scout", "spearman", "archer", "infantry", "cavalry", "siege-engine", "settler", "commander"] as const;
export type KingdomBuilderUnitType = typeof KINGDOM_BUILDER_UNIT_TYPES[number];

export type KingdomBuilderGarrison = Record<KingdomBuilderUnitType, number>;

export type KingdomBuilderSpeed = number;

/**
 * Named pace landmarks retained for terrain and movement tests. Unit speeds
 * are numeric path-cost points spent per tick (§6.2).
 */
export const KINGDOM_BUILDER_PACES = { slow: 2, medium: 5, fast: 10 } as const;

export interface KingdomBuilderUnitDefinition {
    name: string;
    icon: string;
    role: string;
    /** §6.2: path-cost points spent per tick; a stack moves at its slowest unit's speed. */
    speed: KingdomBuilderSpeed;
    /** Paid in full when the unit is queued. Priced in economy.ts, beside the buildings. */
    cost: KingdomBuilderResources;
    /** Ticks to train at the level that unlocks it; each level above that takes one off. */
    trainTicks: number;
    /**
     * Where it trains, and the level of that building that unlocks it: the
     * barracks for the army (§4.2), the town centre for the settler (§4.4),
     * the tavern for the commander (§6.5). Whichever, it joins the
     * settlement's one training queue.
     */
    trainedAt: { building: "barracks" | "town-centre" | "tavern"; level: number };
    /**
     * A settler fights no better than a caravan (§4.4): it guards nothing, lays
     * no siege and goes into no barbarian village alone — though it dies like
     * any unit in a battle it is caught in.
     */
    civilian?: true;
    /**
     * A commander leads an army rather than guarding one (§6.5): it fights and
     * dies like a soldier in a battle, but alone it escorts nothing, lays no
     * siege and goes into no barbarian village — and a rival escort on the
     * road kills it.
     */
    leader?: true;
}

export const KINGDOM_BUILDER_UNITS: Record<KingdomBuilderUnitType, KingdomBuilderUnitDefinition> = {
    militia: {
        name: "Militia", icon: "🛡️", role: "Cheap garrison filler", speed: 5,
        cost: tunedResources("unitCosts.militia", economy.unitCosts.militia), trainTicks: 2, trainedAt: { building: "barracks", level: 1 },
    },
    scout: {
        name: "Scout", icon: "🔭", role: "Sees farther, and counts a rival town's garrison", speed: 10,
        cost: tunedResources("unitCosts.scout", economy.unitCosts.scout), trainTicks: 2, trainedAt: { building: "barracks", level: 1 },
    },
    spearman: {
        name: "Spearmen", icon: "🔱", role: "Intercept horsemen before they charge", speed: 5,
        cost: tunedResources("unitCosts.spearman", economy.unitCosts.spearman), trainTicks: 2, trainedAt: { building: "barracks", level: 1 },
    },
    archer: {
        name: "Archers", icon: "🏹", role: "Fire first and target spearmen", speed: 5,
        cost: tunedResources("unitCosts.archer", economy.unitCosts.archer), trainTicks: 3, trainedAt: { building: "barracks", level: 2 },
    },
    infantry: {
        name: "Infantry", icon: "⚔️", role: "The main attacking stack", speed: 3,
        cost: tunedResources("unitCosts.infantry", economy.unitCosts.infantry), trainTicks: 3, trainedAt: { building: "barracks", level: 2 },
    },
    cavalry: {
        name: "Horsemen", icon: "🐎", role: "Charge archers after spearmen intercept", speed: 10,
        cost: tunedResources("unitCosts.cavalry", economy.unitCosts.cavalry), trainTicks: 4, trainedAt: { building: "barracks", level: 3 },
    },
    "siege-engine": {
        name: "Siege engine", icon: "🪓", role: "Breaks walls", speed: 2,
        cost: tunedResources("unitCosts.siege-engine", economy.unitCosts["siege-engine"]), trainTicks: 6, trainedAt: { building: "barracks", level: 3 },
    },
    settler: {
        name: "Settler", icon: "🧺", role: "Founds a new town on an open site", speed: 2,
        cost: tunedResources("unitCosts.settler", economy.unitCosts.settler), trainTicks: 4, trainedAt: { building: "town-centre", level: 2 }, civilian: true,
    },
    commander: {
        name: "Commander", icon: "🎖️", role: "Leads an army out of a settlement", speed: 10,
        cost: tunedResources("unitCosts.commander", economy.unitCosts.commander), trainTicks: 4, trainedAt: { building: "tavern", level: 1 }, leader: true,
    },
};

/** The units that guard a stack — every one but the settler and the commander. */
export const KINGDOM_BUILDER_MILITARY_UNIT_TYPES = KINGDOM_BUILDER_UNIT_TYPES.filter(unitType => !KINGDOM_BUILDER_UNITS[unitType].civilian && !KINGDOM_BUILDER_UNITS[unitType].leader);

export const KINGDOM_BUILDER_BARRACKS_MAX_LEVEL = KINGDOM_BUILDER_UPGRADABLE_BUILDINGS.barracks!;
/** Units waiting in one settlement's training queue, the one in training included. */
export const KINGDOM_BUILDER_TRAINING_QUEUE_LIMIT = 20;

export interface KingdomBuilderTrainingOrder {
    unitType: KingdomBuilderUnitType;
    /**
     * What was paid for it, when that isn't the unit's listed cost — a settler,
     * whose price doubles with each one trained — so cancelling refunds exactly
     * that. Absent on every other order, and on a settler queued before the
     * price doubled, both of which paid the listed cost.
     */
    cost?: KingdomBuilderResources;
    /** Fixed when queued, so upgrading the barracks speeds up what is queued after it, not before. */
    ticksRemaining: number;
    /**
     * Names this order when the player cancels it — two militia queued back to
     * back are otherwise identical. Missing on an order queued before cancelling
     * existed, which can't be cancelled and simply trains out.
     */
    orderId?: string;
}

/**
 * Doublings past which the settler's price stops climbing — far beyond any
 * store a town can hold, and short of where the amounts stop being exact.
 */
const KINGDOM_BUILDER_SETTLER_MAX_DOUBLINGS = 30;

/**
 * What a player's next settler costs, given how many they have trained in the
 * world already: the listed cost, doubled for each one before it (§4.4). There
 * is no cap on how many settlements a player holds — this is what slows the
 * spread.
 */
export function settlerCostFor(trained: number): KingdomBuilderResources {
    const factor = 2 ** Math.min(Math.max(0, Math.floor(trained)), KINGDOM_BUILDER_SETTLER_MAX_DOUBLINGS);
    const { cost } = KINGDOM_BUILDER_UNITS.settler;
    return resourcesOf(Object.fromEntries(KINGDOM_BUILDER_RESOURCE_TYPES.map(resource => [resource, cost[resource] * factor])));
}

export function isUnitType(value: unknown): value is KingdomBuilderUnitType {
    return typeof value === "string" && (KINGDOM_BUILDER_UNIT_TYPES as readonly string[]).includes(value);
}

/** The settlement's barracks level, or 0 without one. A settlement holds at most one. */
export function barracksLevelOf(tiles: readonly KingdomBuilderTile[]): number {
    return buildingLevelOf(tiles, "barracks");
}

/** The level of the building a unit trains at in this settlement — its barracks, its town centre or its tavern — or 0 without one. */
export function trainingLevelFor(unitType: KingdomBuilderUnitType, tiles: readonly KingdomBuilderTile[]): number {
    return buildingLevelOf(tiles, KINGDOM_BUILDER_UNITS[unitType].trainedAt.building);
}

/** Ticks one unit takes at this level of the building it trains at, or null while the level has not unlocked it. */
export function trainingTicksFor(unitType: KingdomBuilderUnitType, level: number): number | null {
    const { trainTicks, trainedAt } = KINGDOM_BUILDER_UNITS[unitType];
    if (level < trainedAt.level) return null;
    return Math.max(1, trainTicks - (level - trainedAt.level));
}

/** A complete garrison, reading a missing count (a document from before PR 13) as none. */
export function garrisonOf(garrison?: Partial<KingdomBuilderGarrison>): KingdomBuilderGarrison {
    return Object.fromEntries(
        KINGDOM_BUILDER_UNIT_TYPES.map(unitType => [unitType, garrison?.[unitType] ?? 0]),
    ) as KingdomBuilderGarrison;
}

/** "2 militia · 1 cavalry", skipping what the stack has none of. */
export function formatUnits(units: Partial<KingdomBuilderGarrison>): string {
    return KINGDOM_BUILDER_UNIT_TYPES.filter(unitType => (units[unitType] ?? 0) > 0)
        .map(unitType => `${units[unitType]} ${KINGDOM_BUILDER_UNITS[unitType].name.toLowerCase()}`)
        .join(" · ");
}

/**
 * One tick of training: only the unit at the head of the queue advances, and
 * it joins the garrison on the tick its count reaches zero, so a barracks
 * finishes at most one unit per tick.
 */
export function advanceTraining(
    queue: readonly KingdomBuilderTrainingOrder[] | undefined,
    garrison: Partial<KingdomBuilderGarrison> | undefined,
): { trainingQueue: KingdomBuilderTrainingOrder[]; garrison: KingdomBuilderGarrison } {
    const next = garrisonOf(garrison);
    const [head, ...rest] = queue ?? [];
    if (!head) return { trainingQueue: [], garrison: next };
    if (head.ticksRemaining > 1) {
        return { trainingQueue: [{ ...head, ticksRemaining: head.ticksRemaining - 1 }, ...rest.map(order => ({ ...order }))], garrison: next };
    }
    next[head.unitType] += 1;
    return { trainingQueue: rest.map(order => ({ ...order })), garrison: next };
}
