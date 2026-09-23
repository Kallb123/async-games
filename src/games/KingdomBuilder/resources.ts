import type { KingdomBuilderResources } from "./KingdomBuilderSettlementModel";

// Pure, like buildings.ts and units.ts: the settlement screen prices its rows
// with the same helpers the server checks the stores against.

export const KINGDOM_BUILDER_RESOURCE_TYPES = ["wood", "stone", "iron"] as const;

/** A complete set of resources, reading a missing one as none. */
export function resourcesOf(partial?: Partial<KingdomBuilderResources>): KingdomBuilderResources {
    return { wood: partial?.wood ?? 0, stone: partial?.stone ?? 0, iron: partial?.iron ?? 0 };
}

/**
 * An entry read from economy.json, refusing anything but whole non-negative
 * amounts of known resources — a negative price would pay the player to build,
 * so a bad edit fails loudly at load rather than open in someone's stores.
 */
export function tunedResources(name: string, entry: Partial<Record<string, number>>): KingdomBuilderResources {
    for (const [resource, amount] of Object.entries(entry)) {
        if (!(KINGDOM_BUILDER_RESOURCE_TYPES as readonly string[]).includes(resource) || !Number.isInteger(amount) || amount! < 0) {
            throw new Error(`economy.json: ${name} has a bad ${resource} amount (${amount})`);
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
