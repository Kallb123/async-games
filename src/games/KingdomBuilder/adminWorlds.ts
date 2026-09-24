import { KingdomBuilderWorldModel, type KingdomBuilderEndReason } from "./KingdomBuilderWorldModel";

/** How many worlds the admin list shows — newest first, so the ones worth clearing out are the ones near the top. */
export const ADMIN_WORLD_LIST_LIMIT = 50;

/** One row of `/admin/kingdombuilder-worlds` (docs/admin-tools.md). */
export interface AdminKingdomBuilderWorld {
    worldId: string;
    seed: string;
    playerCount: number;
    seatCount: number;
    currentTick: number;
    createdAt: string;
    endedAt?: string;
    endReason?: KingdomBuilderEndReason;
}

export interface AdminKingdomBuilderWorldsResponse {
    worlds: AdminKingdomBuilderWorld[];
}

export interface AdminKingdomBuilderWorldRequest {
    worldId: string;
    action: "end" | "delete" | "boost";
}

/** Every world, newest first, with enough to tell a live one from an abandoned test world. */
export async function listAdminWorlds(): Promise<AdminKingdomBuilderWorldsResponse> {
    const worlds = await KingdomBuilderWorldModel.find({})
        .sort({ createdAt: -1 })
        .limit(ADMIN_WORLD_LIST_LIMIT)
        .select({ seed: 1, seatCount: 1, "roster.userId": 1, currentTick: 1, createdAt: 1, endedAt: 1, endReason: 1 })
        .lean();
    return {
        worlds: worlds.map(world => ({
            worldId: world._id.toString(),
            seed: world.seed,
            // A world opened before rosters existed is a world of one.
            playerCount: world.roster?.length || 1,
            seatCount: Math.max(world.seatCount ?? 1, world.roster?.length ?? 1),
            currentTick: world.currentTick,
            createdAt: world.createdAt.toISOString(),
            ...(world.endedAt ? { endedAt: world.endedAt.toISOString(), endReason: world.endReason } : {}),
        })),
    };
}
