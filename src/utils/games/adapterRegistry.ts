/**
 * A tiny per-game lookup table keyed by `gameType.className` — the shape
 * behind `registerReplayAdapter`, `registerRecapAdapter` and
 * `registerTurnTimeoutAdapter`. A game that registers nothing simply has no
 * adapter; callers treat that as "this feature is off for this game" rather
 * than an error.
 */
export interface AdapterRegistry<T extends { className: string }> {
    register(adapter: T): void;
    get(className: string): T | undefined;
    has(className: string): boolean;
}

export function createAdapterRegistry<T extends { className: string }>(): AdapterRegistry<T> {
    const adapters: Record<string, T> = {};
    return {
        register(adapter: T) {
            adapters[adapter.className] = adapter;
        },
        get(className: string) {
            return adapters[className];
        },
        has(className: string) {
            return className in adapters;
        },
    };
}
