import type { KingdomBuilderResources, KingdomBuilderTile } from "./KingdomBuilderSettlementModel";
import { KINGDOM_BUILDER_UPGRADABLE_BUILDINGS, buildingLevelOf } from "./buildings";
import { KINGDOM_BUILDER_ECONOMY as economy } from "./economy";
import { tunedResources } from "./resources";

/** GDD §6.1's roster, in the order the barracks unlocks them — and the settler (§4.4, PR 24), which the town centre trains. */
export const KINGDOM_BUILDER_UNIT_TYPES = ["militia", "scout", "infantry", "cavalry", "siege-engine", "settler"] as const;
export type KingdomBuilderUnitType = typeof KINGDOM_BUILDER_UNIT_TYPES[number];

export type KingdomBuilderGarrison = Record<KingdomBuilderUnitType, number>;

export type KingdomBuilderSpeed = "slow" | "medium" | "fast";

/**
 * How much path cost (tilePath.ts) an army spends a tick at each speed (§6.2).
 * A straight step over grass costs 2 — a tile is 2 world units across — so a
 * slow stack walks open ground at a tile a tick, 15 minutes a tile, and a road
 * or a mountain pass scales that the way its weight says. First-pass numbers (§12).
 */
export const KINGDOM_BUILDER_PACES: Record<KingdomBuilderSpeed, number> = { slow: 2, medium: 3, fast: 4 };

export interface KingdomBuilderUnitDefinition {
    name: string;
    icon: string;
    role: string;
    /** §6.2: a stack moves at the pace of its slowest unit — `KINGDOM_BUILDER_PACES` over the tiles (§3.8). */
    speed: KingdomBuilderSpeed;
    /** Paid in full when the unit is queued. Priced in economy.ts, beside the buildings. */
    cost: KingdomBuilderResources;
    /** Ticks to train at the level that unlocks it; each level above that takes one off. */
    trainTicks: number;
    /**
     * Where it trains, and the level of that building that unlocks it: the
     * barracks for the army (§4.2), the town centre for the settler (§4.4).
     * Either way it joins the settlement's one training queue.
     */
    trainedAt: { building: "barracks" | "town-centre"; level: number };
    /**
     * A settler fights no better than a caravan (§4.4): it guards nothing, lays
     * no siege and goes into no barbarian village alone — though it dies like
     * any unit in a battle it is caught in.
     */
    civilian?: true;
}

export const KINGDOM_BUILDER_UNITS: Record<KingdomBuilderUnitType, KingdomBuilderUnitDefinition> = {
    militia: {
        name: "Militia", icon: "🛡️", role: "Cheap garrison filler", speed: "slow",
        cost: tunedResources("unitCosts.militia", economy.unitCosts.militia), trainTicks: 2, trainedAt: { building: "barracks", level: 1 },
    },
    scout: {
        name: "Scout", icon: "🔭", role: "Sees farther, and counts a rival town's garrison", speed: "fast",
        cost: tunedResources("unitCosts.scout", economy.unitCosts.scout), trainTicks: 2, trainedAt: { building: "barracks", level: 1 },
    },
    infantry: {
        name: "Infantry", icon: "⚔️", role: "The main attacking stack", speed: "medium",
        cost: tunedResources("unitCosts.infantry", economy.unitCosts.infantry), trainTicks: 3, trainedAt: { building: "barracks", level: 2 },
    },
    cavalry: {
        name: "Cavalry", icon: "🐎", role: "Fast raids and reinforcement", speed: "fast",
        cost: tunedResources("unitCosts.cavalry", economy.unitCosts.cavalry), trainTicks: 4, trainedAt: { building: "barracks", level: 3 },
    },
    "siege-engine": {
        name: "Siege engine", icon: "🪓", role: "Breaks walls", speed: "slow",
        cost: tunedResources("unitCosts.siege-engine", economy.unitCosts["siege-engine"]), trainTicks: 6, trainedAt: { building: "barracks", level: 3 },
    },
    settler: {
        name: "Settler", icon: "🧺", role: "Founds a new town on an open site", speed: "slow",
        cost: tunedResources("unitCosts.settler", economy.unitCosts.settler), trainTicks: 4, trainedAt: { building: "town-centre", level: 2 }, civilian: true,
    },
};

/** The units that fight for a stack — every one but the settler. */
export const KINGDOM_BUILDER_MILITARY_UNIT_TYPES = KINGDOM_BUILDER_UNIT_TYPES.filter(unitType => !KINGDOM_BUILDER_UNITS[unitType].civilian);

export const KINGDOM_BUILDER_BARRACKS_MAX_LEVEL = KINGDOM_BUILDER_UPGRADABLE_BUILDINGS.barracks!;
/** Units waiting in one settlement's training queue, the one in training included. */
export const KINGDOM_BUILDER_TRAINING_QUEUE_LIMIT = 20;

export interface KingdomBuilderTrainingOrder {
    unitType: KingdomBuilderUnitType;
    /** Fixed when queued, so upgrading the barracks speeds up what is queued after it, not before. */
    ticksRemaining: number;
    /**
     * Names this order when the player cancels it — two militia queued back to
     * back are otherwise identical. Missing on an order queued before cancelling
     * existed, which can't be cancelled and simply trains out.
     */
    orderId?: string;
}

export function isUnitType(value: unknown): value is KingdomBuilderUnitType {
    return typeof value === "string" && (KINGDOM_BUILDER_UNIT_TYPES as readonly string[]).includes(value);
}

/** The settlement's barracks level, or 0 without one. A settlement holds at most one. */
export function barracksLevelOf(tiles: readonly KingdomBuilderTile[]): number {
    return buildingLevelOf(tiles, "barracks");
}

/** The level of the building a unit trains at in this settlement — its barracks, or its town centre — or 0 without one. */
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
