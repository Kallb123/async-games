import { Types } from "mongoose";

import { KingdomBuilderSettlementModel, KINGDOM_BUILDER_GRID_SIZE, KINGDOM_BUILDER_TOWN_CENTRE_INDEX, type KingdomBuilderTile } from "./KingdomBuilderSettlementModel";
import { KingdomBuilderWorldModel } from "./KingdomBuilderWorldModel";
import { generateWorld } from "./worldgen";
import type { WorldNode } from "./worldgen/landmass";

export class KingdomBuilderPersistenceError extends Error {
    constructor(public readonly code: "INVALID_INPUT" | "WORLD_NOT_FOUND" | "SITE_NOT_FOUND" | "SITE_NOT_AVAILABLE", message: string) {
        super(message);
        this.name = "KingdomBuilderPersistenceError";
    }
}

export async function createWorld(seed: string) {
    const normalisedSeed = seed.trim();
    if (!normalisedSeed) {
        throw new KingdomBuilderPersistenceError("INVALID_INPUT", "A world seed is required");
    }

    const generated = generateWorld(normalisedSeed);
    return KingdomBuilderWorldModel.create({ ...generated, currentTick: 0 });
}

function createStartingTiles(): KingdomBuilderTile[] {
    return Array.from({ length: KINGDOM_BUILDER_GRID_SIZE }, (_, position) => ({
        position,
        ...(position === KINGDOM_BUILDER_TOWN_CENTRE_INDEX
            ? { building: { type: "town-centre" as const, level: 1 } }
            : {}),
    }));
}

/**
 * Claims one generated player-start site. The unique world/owner and
 * world/node indexes are the final arbiter when concurrent claims race.
 */
export async function foundSettlement(worldId: string, userId: string, siteId: string) {
    if (!Types.ObjectId.isValid(worldId) || !userId.trim() || !siteId.trim()) {
        throw new KingdomBuilderPersistenceError("INVALID_INPUT", "A valid world, user and site are required");
    }

    const world = await KingdomBuilderWorldModel.findById(worldId).select({ nodes: 1 }).lean();
    if (!world) {
        throw new KingdomBuilderPersistenceError("WORLD_NOT_FOUND", "Kingdom Builder world not found");
    }

    const site = world.nodes.find((node: WorldNode) => node.id === siteId);
    if (!site || site.kind !== "settlement") {
        throw new KingdomBuilderPersistenceError("SITE_NOT_FOUND", "Settlement site not found in this world");
    }
    if (site.siteType !== "player-start") {
        throw new KingdomBuilderPersistenceError("SITE_NOT_AVAILABLE", "The site is not available for a first settlement");
    }

    return KingdomBuilderSettlementModel.create({
        worldId: new Types.ObjectId(worldId),
        ownerId: userId.trim(),
        nodeId: siteId,
        tiles: createStartingTiles(),
        resources: { wood: 0, stone: 0, iron: 0 },
    });
}
