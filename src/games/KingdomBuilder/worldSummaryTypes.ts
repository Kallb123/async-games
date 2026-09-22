export interface KingdomBuilderWorldSummary {
    worldId: string;
    currentTick: number;
    nextTickAt: string;
    settlementCount: number;
    /** Seats filled, and seats the world holds (§11.3 PR 8). */
    playerCount: number;
    seatCount: number;
    /** Sum of completed building levels, used to spot construction since the browser last opened this world. */
    completedBuildLevels: number;
}

export function worldBuildsStorageKey(worldId: string): string {
    return `kingdom-builder-seen-build-levels:${worldId}`;
}

export function completedBuildLevels(tiles: Array<{ building?: { level: number } }>): number {
    return tiles.reduce((total, tile) => total + (tile.building?.level ?? 0), 0);
}
