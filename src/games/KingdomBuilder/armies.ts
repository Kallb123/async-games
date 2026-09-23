// Armies in the field (GDD §6.2, §3.8), pure like units.ts: the server marches
// them in the tick and the world map previews a march with the same helpers,
// so the ETA a player is shown is the one the tick will keep.

import {
    KINGDOM_BUILDER_PACES,
    KINGDOM_BUILDER_UNITS,
    KINGDOM_BUILDER_UNIT_TYPES,
    garrisonOf,
    type KingdomBuilderGarrison,
} from "./units";
import { costsAlong, findTilePath, type TravelGrid } from "./worldgen/tilePath";

/** How many armies one player may have in the field in one world at once. */
export const KINGDOM_BUILDER_ARMY_LIMIT = 20;

/** An army as the tick engine sees it — the stored document's movement fields. */
export interface KingdomBuilderMarch {
    ownerId: string;
    units: KingdomBuilderGarrison;
    /** Every tile from where it set out to where it is going, both included. */
    path: number[];
    /** What the path has cost by each of its tiles (`costsAlong`): 0 first, the whole march last. */
    pathCosts: number[];
    /** How much of that cost it has spent so far. */
    travelled: number;
    /** The node at the path's end. */
    targetNodeId: string;
    /** The tick it reached `targetNodeId` on — absent while it is still marching. */
    arrivedAtTick?: number;
    /**
     * The tick it began besieging the settlement it is camped at (§8, PR 21) —
     * absent unless it is camped at another player's. The tick sets and clears
     * it, so a town founded under a camp, or one whose owner left, is noticed
     * a tick later rather than at arrival.
     */
    besiegingSince?: number;
}

/** A route an army could take, and what it would cost it tile by tile. */
export interface KingdomBuilderRoute {
    path: number[];
    pathCosts: number[];
}

/** How many units the stack holds. */
export function unitCount(units: Partial<KingdomBuilderGarrison>): number {
    return KINGDOM_BUILDER_UNIT_TYPES.reduce((total, unitType) => total + (units[unitType] ?? 0), 0);
}

/** A stack's pace a tick — its slowest unit's (§6.2) — or null for an empty one. */
export function paceOf(units: Partial<KingdomBuilderGarrison>): number | null {
    const paces = KINGDOM_BUILDER_UNIT_TYPES
        .filter(unitType => (units[unitType] ?? 0) > 0)
        .map(unitType => KINGDOM_BUILDER_PACES[KINGDOM_BUILDER_UNITS[unitType].speed]);
    return paces.length ? Math.min(...paces) : null;
}

/** The cheapest route between two tiles, or undefined when none joins them (§3.8). */
export function routeBetween(grid: TravelGrid, from: number, to: number): KingdomBuilderRoute | undefined {
    const found = findTilePath(grid, from, to);
    return found && { path: found.tiles, pathCosts: costsAlong(grid, found.tiles) };
}

function totalCost(march: Pick<KingdomBuilderMarch, "pathCosts">): number {
    return march.pathCosts.at(-1) ?? 0;
}

/** Ticks until a stack at this pace has spent the rest of the route — 0 once it is there. */
export function ticksToArrive(march: Pick<KingdomBuilderMarch, "pathCosts" | "travelled">, pace: number): number {
    return Math.max(0, Math.ceil((totalCost(march) - march.travelled) / pace));
}

/** Where along its path the army stands: the last tile it has paid its way onto. */
export function pathIndexOf(march: Pick<KingdomBuilderMarch, "pathCosts" | "travelled">): number {
    let index = 0;
    while (index + 1 < march.pathCosts.length && march.pathCosts[index + 1] <= march.travelled) index++;
    return index;
}

/** The tile the army stands on. */
export function armyTile(march: Pick<KingdomBuilderMarch, "path" | "pathCosts" | "travelled">): number {
    return march.path[pathIndexOf(march)];
}

/**
 * One tick of marching. An army still on the road spends its pace, and on the
 * tick it runs out of road it arrives and camps — except at one of its owner's
 * own settlements, where it rejoins the garrison and stops being an army at
 * all: the returned `joins` names that settlement's node. Whether a camp is a
 * siege is the tick's to decide (tick.ts), since that can change under it.
 */
export function advanceMarch<T extends KingdomBuilderMarch>(march: T, tick: number, homeNodes: ReadonlySet<string>): { march: T; joins?: string } {
    if (march.arrivedAtTick !== undefined) return { march };
    const pace = paceOf(march.units) ?? 0;
    const travelled = Math.min(totalCost(march), march.travelled + pace);
    if (travelled < totalCost(march)) return { march: { ...march, travelled } };
    if (homeNodes.has(march.targetNodeId)) return { march: { ...march, travelled }, joins: march.targetNodeId };
    return { march: { ...march, travelled, arrivedAtTick: tick } };
}

/** Two stacks as one, reading a missing count as none. */
export function addUnits(a: Partial<KingdomBuilderGarrison> | undefined, b: Partial<KingdomBuilderGarrison>): KingdomBuilderGarrison {
    const left = garrisonOf(a), right = garrisonOf(b);
    return garrisonOf(Object.fromEntries(KINGDOM_BUILDER_UNIT_TYPES.map(unitType => [unitType, left[unitType] + right[unitType]])));
}

/** What is left of a stack once another is taken out of it, reading a missing count as none. */
export function subtractUnits(a: Partial<KingdomBuilderGarrison> | undefined, b: Partial<KingdomBuilderGarrison>): KingdomBuilderGarrison {
    const left = garrisonOf(a), right = garrisonOf(b);
    return garrisonOf(Object.fromEntries(KINGDOM_BUILDER_UNIT_TYPES.map(unitType => [unitType, left[unitType] - right[unitType]])));
}
