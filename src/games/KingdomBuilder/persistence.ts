import { Types, type ClientSession } from "mongoose";

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

export type KingdomBuilderSettlementKind = "first" | "expansion";

export async function createWorld(seed: string, session?: ClientSession) {
    const normalisedSeed = seed.trim();
    if (!normalisedSeed) {
        throw new KingdomBuilderPersistenceError("INVALID_INPUT", "A world seed is required");
    }

    const generated = generateWorld(normalisedSeed);
    const values = { ...generated, currentTick: 0 };
    if (!session) return KingdomBuilderWorldModel.create(values);
    const [world] = await KingdomBuilderWorldModel.create([values], { session });
    return world;
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
 * Claims either a player's starting slot or their one expansion slot. Unique
 * world/node and world/owner/settlement-number indexes arbitrate concurrent
 * claims, so neither a site nor a player's second-settlement slot can race.
 */
export async function foundSettlement(
    worldId: string,
    userId: string,
    siteId: string,
    session?: ClientSession,
    kind: KingdomBuilderSettlementKind = "first",
) {
    if (!Types.ObjectId.isValid(worldId) || !userId.trim() || !siteId.trim()) {
        throw new KingdomBuilderPersistenceError("INVALID_INPUT", "A valid world, user and site are required");
    }

    const query = KingdomBuilderWorldModel.findById(worldId).select({ nodes: 1 });
    const world = await (session ? query.session(session) : query).lean();
    if (!world) {
        throw new KingdomBuilderPersistenceError("WORLD_NOT_FOUND", "Kingdom Builder world not found");
    }

    const site = world.nodes.find((node: WorldNode) => node.id === siteId);
    if (!site || site.kind !== "settlement") {
        throw new KingdomBuilderPersistenceError("SITE_NOT_FOUND", "Settlement site not found in this world");
    }
    const requiredSiteType = kind === "first" ? "player-start" : "expansion";
    if (site.siteType !== requiredSiteType) {
        throw new KingdomBuilderPersistenceError("SITE_NOT_AVAILABLE", `The site is not available for ${kind === "first" ? "a first" : "an expansion"} settlement`);
    }

    if (kind === "first") {
        const ownerQuery = KingdomBuilderSettlementModel.exists({ worldId, ownerId: userId.trim() });
        const existing = await (session ? ownerQuery.session(session) : ownerQuery);
        if (existing) throw new KingdomBuilderPersistenceError("SITE_NOT_AVAILABLE", "This player already has a settlement in the world");
    }

    const values = {
        worldId: new Types.ObjectId(worldId),
        ownerId: userId.trim(),
        nodeId: siteId,
        settlementNumber: kind === "first" ? 0 : 1,
        tiles: createStartingTiles(),
        resources: { wood: 0, stone: 0, iron: 0 },
    };
    if (!session) return KingdomBuilderSettlementModel.create(values);
    const [settlement] = await KingdomBuilderSettlementModel.create([values], { session });
    return settlement;
}
