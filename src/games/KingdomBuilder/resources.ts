import type { KingdomBuilderResources } from "./KingdomBuilderSettlementModel";

// Pure, like buildings.ts and units.ts: the settlement screen prices its rows
// with the same helpers the server checks the stores against.

export const KINGDOM_BUILDER_RESOURCE_TYPES = ["wood", "stone", "iron"] as const;

/** A complete set of resources, reading a missing one as none. */
export function resourcesOf(partial?: Partial<KingdomBuilderResources>): KingdomBuilderResources {
    return { wood: partial?.wood ?? 0, stone: partial?.stone ?? 0, iron: partial?.iron ?? 0 };
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
