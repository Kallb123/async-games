import type { KingdomBuilderResources, KingdomBuilderTile } from "./KingdomBuilderSettlementModel";
import { KINGDOM_BUILDER_ECONOMY as economy } from "./economy";
import { tunedResources } from "./resources";

/** GDD §6.1's roster, in the order the barracks unlocks them. */
export const KINGDOM_BUILDER_UNIT_TYPES = ["militia", "scout", "infantry", "cavalry", "siege-engine"] as const;
export type KingdomBuilderUnitType = typeof KINGDOM_BUILDER_UNIT_TYPES[number];

export type KingdomBuilderGarrison = Record<KingdomBuilderUnitType, number>;

export interface KingdomBuilderUnitDefinition {
    name: string;
    icon: string;
    role: string;
    /** §6.2: a stack moves at the pace of its slowest unit. PR 19 turns this into a pace over the tiles (§3.8). */
    speed: "slow" | "medium" | "fast";
    /** Paid in full when the unit is queued. Priced in economy.ts, beside the buildings. */
    cost: KingdomBuilderResources;
    /** Ticks to train at the barracks level that unlocks it; each level above that takes one off. */
    trainTicks: number;
    /** The barracks level that unlocks it (§4.2). */
    barracksLevel: number;
}

export const KINGDOM_BUILDER_UNITS: Record<KingdomBuilderUnitType, KingdomBuilderUnitDefinition> = {
    militia: {
        name: "Militia", icon: "🛡️", role: "Cheap garrison filler", speed: "slow",
        cost: tunedResources("unitCosts.militia", economy.unitCosts.militia), trainTicks: 2, barracksLevel: 1,
    },
    scout: {
        name: "Scout", icon: "🔭", role: "Reveals a target before you commit", speed: "fast",
        cost: tunedResources("unitCosts.scout", economy.unitCosts.scout), trainTicks: 2, barracksLevel: 1,
    },
    infantry: {
        name: "Infantry", icon: "⚔️", role: "The main attacking stack", speed: "medium",
        cost: tunedResources("unitCosts.infantry", economy.unitCosts.infantry), trainTicks: 3, barracksLevel: 2,
    },
    cavalry: {
        name: "Cavalry", icon: "🐎", role: "Fast raids and reinforcement", speed: "fast",
        cost: tunedResources("unitCosts.cavalry", economy.unitCosts.cavalry), trainTicks: 4, barracksLevel: 3,
    },
    "siege-engine": {
        name: "Siege engine", icon: "🪓", role: "Breaks walls", speed: "slow",
        cost: tunedResources("unitCosts.siege-engine", economy.unitCosts["siege-engine"]), trainTicks: 6, barracksLevel: 3,
    },
};

export const KINGDOM_BUILDER_BARRACKS_MAX_LEVEL = 3;
/** Units waiting at one barracks, the one in training included. */
export const KINGDOM_BUILDER_TRAINING_QUEUE_LIMIT = 20;

export interface KingdomBuilderTrainingOrder {
    unitType: KingdomBuilderUnitType;
    /** Fixed when queued, so upgrading the barracks speeds up what is queued after it, not before. */
    ticksRemaining: number;
}

export function isUnitType(value: unknown): value is KingdomBuilderUnitType {
    return typeof value === "string" && (KINGDOM_BUILDER_UNIT_TYPES as readonly string[]).includes(value);
}

/** The settlement's barracks level, or 0 without one. A settlement holds at most one. */
export function barracksLevelOf(tiles: readonly KingdomBuilderTile[]): number {
    return tiles.find(tile => tile.building?.type === "barracks")?.building?.level ?? 0;
}

/** Ticks one unit takes at this barracks level, or null while the level has not unlocked it. */
export function trainingTicksFor(unitType: KingdomBuilderUnitType, barracksLevel: number): number | null {
    const unit = KINGDOM_BUILDER_UNITS[unitType];
    if (barracksLevel < unit.barracksLevel) return null;
    return Math.max(1, unit.trainTicks - (barracksLevel - unit.barracksLevel));
}

/** A complete garrison, reading a missing count (a document from before PR 13) as none. */
export function garrisonOf(garrison?: Partial<KingdomBuilderGarrison>): KingdomBuilderGarrison {
    return Object.fromEntries(
        KINGDOM_BUILDER_UNIT_TYPES.map(unitType => [unitType, garrison?.[unitType] ?? 0]),
    ) as KingdomBuilderGarrison;
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
