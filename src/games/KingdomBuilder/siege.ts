// Sieges (GDD §6.4, §8, §11.3 PR 21), pure like armies.ts. An army that camps
// at another player's settlement lays siege to it: no choice at dispatch, no
// losses on arrival. The siege bites on the settlement's own work each tick —
// lightly through a short grace period, then in full — until the besieger
// leaves, is beaten, or pushes the attack.

import type { KingdomBuilderResources } from "./KingdomBuilderSettlementModel";
import { addUnits, unitCount, type KingdomBuilderMarch } from "./armies";
import { KINGDOM_BUILDER_RESOURCE_TYPES, resourcesOf } from "./resources";
import { garrisonOf, type KingdomBuilderGarrison } from "./units";

/**
 * Ticks a siege runs at half strength before it bites in full (§8) — an hour
 * at the 15-minute tick, so a player who happens to be offline when an army
 * arrives doesn't come back to a settlement that has been shut down all along.
 * First-pass number (§12).
 */
export const KINGDOM_BUILDER_SIEGE_GRACE_TICKS = 4;

/** How long a settlement has been besieged, and when the grace period gives out. */
export interface KingdomBuilderSiege {
    /** The tick the first army still there began it. */
    sinceTick: number;
    /** The first tick its debuffs apply in full. */
    fullFromTick: number;
}

/**
 * - `grace`: production halved; building and training carry on.
 * - `full`: production halved, and building and training stop where they are.
 */
export type KingdomBuilderSiegeStage = "grace" | "full";

type Besieger = Pick<KingdomBuilderMarch, "ownerId" | "targetNodeId" | "besiegingSince">;

/** Whether this army is besieging a settlement — camped at it, and not its owner's. */
export function isBesieging(army: Besieger, settlement: { ownerId: string; nodeId: string }): boolean {
    return army.besiegingSince !== undefined && army.besiegingSince !== null
        && army.targetNodeId === settlement.nodeId && army.ownerId !== settlement.ownerId;
}

/** The siege on a settlement, dated from the earliest army still besieging it — or none. */
export function siegeOf(settlement: { ownerId: string; nodeId: string }, armies: readonly Besieger[]): KingdomBuilderSiege | undefined {
    const since = armies.filter(army => isBesieging(army, settlement)).map(army => army.besiegingSince!);
    if (since.length === 0) return undefined;
    const sinceTick = Math.min(...since);
    return { sinceTick, fullFromTick: sinceTick + KINGDOM_BUILDER_SIEGE_GRACE_TICKS + 1 };
}

export function siegeStage(siege: KingdomBuilderSiege, tick: number): KingdomBuilderSiegeStage {
    return tick >= siege.fullFromTick ? "full" : "grace";
}

/** What a besieged settlement's buildings still bring in: half, rounded down, at either stage. */
export function besiegedProduction(production: KingdomBuilderResources): KingdomBuilderResources {
    return resourcesOf(Object.fromEntries(KINGDOM_BUILDER_RESOURCE_TYPES.map(resource => [resource, Math.floor(production[resource] / 2)])));
}

/** What a fight leaves standing on each side. */
export interface KingdomBuilderBattle {
    attackerWon: boolean;
    attacker: KingdomBuilderGarrison;
    defender: KingdomBuilderGarrison;
}

/**
 * The stand-in for combat until §7's engine lands (PR 22): the side with more
 * units wins outright and loses nothing, and the other is destroyed. The
 * attacker needs strictly more — a tie holds for the defender.
 */
export function placeholderBattle(attacker: Partial<KingdomBuilderGarrison>, defender: Partial<KingdomBuilderGarrison>): KingdomBuilderBattle {
    const attackerWon = unitCount(attacker) > unitCount(defender);
    return {
        attackerWon,
        attacker: attackerWon ? garrisonOf(attacker) : garrisonOf(),
        defender: attackerWon ? garrisonOf() : garrisonOf(defender),
    };
}

/** Several stacks fighting as one. */
export function combinedUnits(stacks: readonly Partial<KingdomBuilderGarrison>[]): KingdomBuilderGarrison {
    return stacks.reduce<KingdomBuilderGarrison>(addUnits, garrisonOf());
}

/** What a siege is doing to the settlement now, as its owner reads it. */
export function describeSiege(siege: KingdomBuilderSiege, tick: number): string {
    return siegeStage(siege, tick) === "full"
        ? `Besieged since tick ${siege.sinceTick}: production is halved, and building and training have stopped.`
        : `Besieged since tick ${siege.sinceTick}: production is halved, and from tick ${siege.fullFromTick} building and training stop too.`;
}
