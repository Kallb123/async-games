import type { KingdomBuilderResources } from "./KingdomBuilderSettlementModel";

// Pure, like buildings.ts and units.ts: the settlement screen prices its rows
// with the same helpers the server checks the stores against.

export const KINGDOM_BUILDER_RESOURCE_TYPES = ["wood", "stone", "iron", "wheat"] as const;
export type KingdomBuilderResourceType = typeof KINGDOM_BUILDER_RESOURCE_TYPES[number];

/**
 * A complete set of resources, reading a missing one as none — which is also
 * how a settlement stored before wheat existed (§4.6) reads its stores.
 */
export function resourcesOf(partial?: Partial<KingdomBuilderResources>): KingdomBuilderResources {
    return { wood: partial?.wood ?? 0, stone: partial?.stone ?? 0, iron: partial?.iron ?? 0, wheat: partial?.wheat ?? 0 };
}

/** Two sets of resources added together — what a tick does to the stores. */
export function addResources(a: Partial<KingdomBuilderResources>, b: Partial<KingdomBuilderResources>): KingdomBuilderResources {
    const left = resourcesOf(a), right = resourcesOf(b);
    return resourcesOf(Object.fromEntries(KINGDOM_BUILDER_RESOURCE_TYPES.map(resource => [resource, left[resource] + right[resource]])));
}

/**
 * An entry of economy.ts, refusing anything but whole non-negative amounts —
 * the one rule its types can't state. A negative price would pay the player
 * to build, so a bad edit fails loudly at load rather than open in someone's
 * stores.
 */
export function tunedResources(name: string, entry: Partial<KingdomBuilderResources>): KingdomBuilderResources {
    for (const [resource, amount] of Object.entries(entry)) {
        if (!Number.isInteger(amount) || amount < 0) {
            throw new Error(`economy.ts: ${name} has a bad ${resource} amount (${amount})`);
        }
    }
    return resourcesOf(entry);
}

/** How much of each resource the stores are short of the cost — all zero when it is affordable. */
export function shortfallFor(stores: KingdomBuilderResources, cost: KingdomBuilderResources): KingdomBuilderResources {
    return resourcesOf(Object.fromEntries(
        KINGDOM_BUILDER_RESOURCE_TYPES.map(resource => [resource, Math.max(0, cost[resource] - stores[resource])]),
    ));
}

export function canAfford(stores: KingdomBuilderResources, cost: KingdomBuilderResources): boolean {
    return KINGDOM_BUILDER_RESOURCE_TYPES.every(resource => stores[resource] >= cost[resource]);
}

/** "20 wood · 10 stone", skipping the resources it has none of. */
export function formatResources(amounts: KingdomBuilderResources): string {
    return KINGDOM_BUILDER_RESOURCE_TYPES.filter(resource => amounts[resource] > 0)
        .map(resource => `${amounts[resource]} ${resource}`)
        .join(" · ");
}
