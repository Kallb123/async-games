// Armies in the field (GDD §6.2, §3.8), pure like units.ts: the server marches
// them in the tick and the world map previews a march with the same helpers,
// so the ETA a player is shown is the one the tick will keep.

import type { KingdomBuilderResources } from "./KingdomBuilderSettlementModel";
import { KINGDOM_BUILDER_CARAVAN_SPEED } from "./market";
import { addResources, resourcesOf } from "./resources";
import {
    KINGDOM_BUILDER_MILITARY_UNIT_TYPES,
    KINGDOM_BUILDER_PACES,
    KINGDOM_BUILDER_UNITS,
    KINGDOM_BUILDER_UNIT_TYPES,
    formatUnits,
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
    /**
     * Caravans travelling with it (PR 25), and what they carry between them.
     * Absent on a stack with none. A stack of caravans and no units — or none
     * but settlers — is unescorted: it lays no siege, and walks into no
     * barbarian village.
     */
    caravans?: number;
    cargo?: Partial<KingdomBuilderResources>;
}

/** How many of the stack's units guard it — all of them but its settlers (PR 24) and its commanders (PR 26). */
export function militaryCount(units: Partial<KingdomBuilderGarrison>): number {
    return KINGDOM_BUILDER_MILITARY_UNIT_TYPES.reduce((total, unitType) => total + (units[unitType] ?? 0), 0);
}

/** Whether the stack has any units to guard it — one that is only caravans, settlers and commanders has none. */
export function isEscorted(march: { units: Partial<KingdomBuilderGarrison> }): boolean {
    return militaryCount(march.units) > 0;
}

/** "1 caravan", "3 caravans". */
export function formatCaravans(count: number): string {
    return `${count} caravan${count === 1 ? "" : "s"}`;
}

/** "2 militia · 1 caravan" — a stack as every list names it, caravans and all. */
export function formatStack(stack: { units: Partial<KingdomBuilderGarrison>; caravans?: number }): string {
    const caravans = stack.caravans ?? 0;
    return [formatUnits(stack.units), caravans > 0 ? formatCaravans(caravans) : ""].filter(Boolean).join(" · ");
}

/** Stacks' caravans and loads as one — however stacks come together: joined, taken, brought home or into a town. */
export function combineCaravans(stacks: readonly { caravans?: number; cargo?: Partial<KingdomBuilderResources> }[]): { caravans: number; cargo: KingdomBuilderResources } {
    return {
        caravans: stacks.reduce((total, stack) => total + (stack.caravans ?? 0), 0),
        cargo: stacks.reduce<KingdomBuilderResources>((load, stack) => addResources(load, stack.cargo ?? {}), resourcesOf()),
    };
}

/** Whether the army has reached `targetNodeId` and camped there. A stored army reads a missing tick as null. */
export function isCamped(march: { arrivedAtTick?: number | null }): boolean {
    return march.arrivedAtTick !== undefined && march.arrivedAtTick !== null;
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

/** A stack's pace a tick — its slowest unit's or caravan's (§6.2) — or null for an empty one. */
export function paceOf(units: Partial<KingdomBuilderGarrison>, caravans = 0): number | null {
    const paces = KINGDOM_BUILDER_UNIT_TYPES
        .filter(unitType => (units[unitType] ?? 0) > 0)
        .map(unitType => KINGDOM_BUILDER_PACES[KINGDOM_BUILDER_UNITS[unitType].speed]);
    if (caravans > 0) paces.push(KINGDOM_BUILDER_PACES[KINGDOM_BUILDER_CARAVAN_SPEED]);
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
    const pace = paceOf(march.units, march.caravans) ?? 0;
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

/** Whether two stacks hold the same units, reading a missing count as none. */
export function sameUnits(a: Partial<KingdomBuilderGarrison> | undefined, b: Partial<KingdomBuilderGarrison> | undefined): boolean {
    const left = garrisonOf(a), right = garrisonOf(b);
    return KINGDOM_BUILDER_UNIT_TYPES.every(unitType => left[unitType] === right[unitType]);
}

/** What is left of a stack once another is taken out of it, reading a missing count as none. */
export function subtractUnits(a: Partial<KingdomBuilderGarrison> | undefined, b: Partial<KingdomBuilderGarrison>): KingdomBuilderGarrison {
    const left = garrisonOf(a), right = garrisonOf(b);
    return garrisonOf(Object.fromEntries(KINGDOM_BUILDER_UNIT_TYPES.map(unitType => [unitType, left[unitType] - right[unitType]])));
}

/** Caravans (PR 25) and settlers (PR 24) that changed hands on the road: whose they were, who took them, and where they had been bound. */
export interface KingdomBuilderSeizure {
    tick: number;
    /**
     * The place the taken stack was camped at, which the taker stands at too.
     * One taken on the road names nowhere: where it was bound is its owner's
     * business alone (§6.3), and the taker would learn it from the report.
     */
    nodeId?: string;
    ownerId: string;
    captorId: string;
    /** The escort that took them — its owner is told, and nobody else. */
    captor: KingdomBuilderGarrison;
    caravans: number;
    /** Settlers taken with them, or alone — absent when there were none. */
    settlers?: number;
}

/**
 * Caravans and settlers with nobody to guard them are taken by a rival's
 * escorted stack on the same tile (§4.7): they and their load join the first
 * such stack — the oldest, in the order given — which drives them on wherever
 * it is going, and whose settlers they now are. A stack of their owner's with
 * fighting units on the tile guards them instead.
 */
export function seizeCaravans<T extends KingdomBuilderMarch>(armies: readonly T[], tick: number): { armies: T[]; seized: KingdomBuilderSeizure[] } {
    const guards = new Map<number, T[]>();
    for (const army of armies) {
        if (!isEscorted(army)) continue;
        const tile = armyTile(army);
        guards.set(tile, [...(guards.get(tile) ?? []), army]);
    }
    const taken = new Map<T, T[]>();
    const seized: KingdomBuilderSeizure[] = [];
    for (const army of armies) {
        const settlers = army.units.settler ?? 0;
        if (isEscorted(army) || (!army.caravans && !settlers)) continue;
        const here = guards.get(armyTile(army)) ?? [];
        const captor = here.some(guard => guard.ownerId === army.ownerId) ? undefined : here[0];
        if (!captor) continue;
        taken.set(captor, [...(taken.get(captor) ?? []), army]);
        seized.push({
            tick, ...(isCamped(army) ? { nodeId: army.targetNodeId } : {}), ownerId: army.ownerId, captorId: captor.ownerId,
            captor: garrisonOf(captor.units), caravans: army.caravans ?? 0, ...(settlers ? { settlers } : {}),
        });
    }
    if (seized.length === 0) return { armies: [...armies], seized };
    const gone = new Set([...taken.values()].flat());
    return {
        armies: armies.flatMap(army => {
            if (gone.has(army)) return [];
            const spoils = taken.get(army);
            return spoils ? [{ ...army, units: spoils.reduce((units, spoil) => addUnits(units, spoil.units), army.units), ...combineCaravans([army, ...spoils]) }] : [army];
        }),
        seized,
    };
}
