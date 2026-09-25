// Commanders and the tavern (GDD §6.5, §11.3 PR 26), pure like units.ts: the
// server holds the cap and the march rule with these, and both screens read
// the same helpers, so what a button says is what the server will do.

import type { KingdomBuilderTile } from "./KingdomBuilderSettlementModel";
import { buildingLevelOf } from "./buildings";
import { KINGDOM_BUILDER_MILITARY_UNIT_TYPES, type KingdomBuilderGarrison, type KingdomBuilderTrainingOrder } from "./units";

/** How many commanders a player may hold: one per level of every tavern they own, added up across the realm. */
export function commanderCapacityOf(settlements: readonly { tiles?: readonly KingdomBuilderTile[] }[]): number {
    return settlements.reduce((total, settlement) => total + buildingLevelOf(settlement.tiles ?? [], "tavern"), 0);
}

/** How many commanders a player holds: in their garrisons, in their training queues and in the field. */
export function commandersHeld({ settlements, armies }: {
    settlements: readonly { garrison?: Partial<KingdomBuilderGarrison>; trainingQueue?: readonly KingdomBuilderTrainingOrder[] }[];
    armies: readonly { units?: Partial<KingdomBuilderGarrison> }[];
}): number {
    const stationed = settlements.reduce((total, settlement) => total + (settlement.garrison?.commander ?? 0)
        + (settlement.trainingQueue ?? []).filter(order => order.unitType === "commander").length, 0);
    return stationed + armies.reduce((total, army) => total + (army.units?.commander ?? 0), 0);
}

/** Where a leaderless army may go — the server's refusal, and the map's hint while one is given orders. */
export const KINGDOM_BUILDER_HOME_ONLY = "Without a commander this army can only march home";

/** Why a stack of soldiers with no commander can't leave a settlement — the server's refusal, and the muster's disabled Send. */
export const KINGDOM_BUILDER_NEEDS_COMMANDER = "An army needs a commander to lead it out — recruit one at a tavern";

/**
 * The march rule (§6.5): a stack with any soldier in it other than a scout
 * can't leave a settlement without a commander. Scouts, caravans, settlers and
 * a commander travelling alone don't need one.
 */
export function needsCommander(units: Partial<KingdomBuilderGarrison>): boolean {
    return KINGDOM_BUILDER_MILITARY_UNIT_TYPES.some(unitType => unitType !== "scout" && (units[unitType] ?? 0) > 0);
}

/**
 * A stack that needs a commander and has none — its last one killed, or
 * soldiers joined into a party of scouts. It isn't stored anywhere: it is read
 * off the stack, so a stack a commander joins is led again at once.
 */
export function isLeaderless(stack: { units: Partial<KingdomBuilderGarrison> }): boolean {
    return needsCommander(stack.units) && (stack.units.commander ?? 0) === 0;
}

/** Why a push can't go in: none of the caller's besieging armies has a commander to lead it (§6.5). */
export const KINGDOM_BUILDER_NO_PUSH_COMMANDER = "No commander to lead the attack";

/** Whether any of these stacks has a commander — which is all a push needs, since one leads every army the caller has at the gate. */
export function hasCommander(stacks: readonly { units: Partial<KingdomBuilderGarrison> }[]): boolean {
    return stacks.some(stack => (stack.units.commander ?? 0) > 0);
}
