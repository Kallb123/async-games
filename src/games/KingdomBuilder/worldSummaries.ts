import { KingdomBuilderSettlementModel, type KingdomBuilderTile } from "./KingdomBuilderSettlementModel";
import { KingdomBuilderWorldModel } from "./KingdomBuilderWorldModel";
import { completedBuildLevels as countCompletedBuildLevels, type KingdomBuilderWorldSummary } from "./worldSummaryTypes";

/**
 * The persistent worlds a player can return to from the dashboard.
 *
 * Settlements are the membership record for a world. Collapse them before
 * reading the worlds so a player with two towns still gets one row, and so the
 * world query remains one indexed batch rather than an N+1 read.
 */
export async function worldSummaries(userId: string): Promise<KingdomBuilderWorldSummary[]> {
    const settlements = await KingdomBuilderSettlementModel.find({ ownerId: userId })
        .select({ worldId: 1, tiles: 1 })
        .lean();

    const counts = new Map<string, number>();
    const completedBuildLevels = new Map<string, number>();
    for (const settlement of settlements) {
        const worldId = settlement.worldId.toString();
        counts.set(worldId, (counts.get(worldId) ?? 0) + 1);
        const levels = countCompletedBuildLevels(settlement.tiles as KingdomBuilderTile[]);
        completedBuildLevels.set(worldId, (completedBuildLevels.get(worldId) ?? 0) + levels);
    }
    if (counts.size === 0) return [];

    const worlds = await KingdomBuilderWorldModel.find({ _id: { $in: [...counts.keys()] } })
        .select({ currentTick: 1, nextTickAt: 1, seatCount: 1, "roster.userId": 1 })
        .sort({ updatedAt: -1 })
        .lean();

    return worlds.map(world => ({
        worldId: world._id.toString(),
        currentTick: world.currentTick,
        nextTickAt: world.nextTickAt.toISOString(),
        settlementCount: counts.get(world._id.toString()) ?? 0,
        completedBuildLevels: completedBuildLevels.get(world._id.toString()) ?? 0,
        // A world opened before rosters existed is a world of one.
        playerCount: world.roster?.length || 1,
        seatCount: Math.max(world.seatCount ?? 1, world.roster?.length ?? 1),
    }));
}
