import { Types } from "mongoose";

import { KingdomBuilderSettlementModel, prepareMultipleSettlementsIndex } from "./KingdomBuilderSettlementModel";
import { KingdomBuilderWorldModel } from "./KingdomBuilderWorldModel";
import { foundSettlement, KingdomBuilderPersistenceError } from "./persistence";
import type { Landmass, OverlayPlacement, TerrainField, WorldEdge, WorldNode } from "./worldgen";
import { completedBuildLevels } from "./worldSummaryTypes";

export interface KingdomBuilderWorldView {
    worldId: string;
    currentTick: number;
    completedBuildLevels: number;
    landmass: Landmass;
    /** The generated ground (§3.5.2) — absent on a world generated before it landed, which keeps drawing today's flat silhouette instead (§3.5.6). */
    terrainField?: TerrainField;
    /** The derived, load-bearing overlays (bridges, fords) on that ground (§3.5.3). */
    overlays?: OverlayPlacement[];
    nodes: WorldNode[];
    edges: WorldEdge[];
    settlements: Array<{
        settlementId: string;
        nodeId: string;
        isMine: boolean;
    }>;
}

function validateWorldId(worldId: string) {
    if (!Types.ObjectId.isValid(worldId)) {
        throw new KingdomBuilderPersistenceError("INVALID_INPUT", "A valid world is required");
    }
}

export async function worldView(worldId: string, userId: string): Promise<KingdomBuilderWorldView> {
    validateWorldId(worldId);
    const settlements = await KingdomBuilderSettlementModel.find({ worldId })
        .select({ ownerId: 1, nodeId: 1, tiles: 1 })
        .lean();
    if (!settlements.some(settlement => settlement.ownerId === userId)) {
        throw new KingdomBuilderPersistenceError("WORLD_NOT_FOUND", "Kingdom Builder world not found");
    }

    const world = await KingdomBuilderWorldModel.findById(worldId)
        .select({ currentTick: 1, landmass: 1, terrainField: 1, overlays: 1, nodes: 1, edges: 1 })
        .lean();
    if (!world) throw new KingdomBuilderPersistenceError("WORLD_NOT_FOUND", "Kingdom Builder world not found");

    return {
        worldId,
        currentTick: world.currentTick,
        completedBuildLevels: settlements
            .filter(settlement => settlement.ownerId === userId)
            .reduce((total, settlement) => total + completedBuildLevels(settlement.tiles ?? []), 0),
        landmass: world.landmass,
        terrainField: world.terrainField,
        overlays: world.overlays,
        nodes: world.nodes,
        edges: world.edges,
        settlements: settlements.map(settlement => ({
            settlementId: settlement._id.toString(),
            nodeId: settlement.nodeId,
            isMine: settlement.ownerId === userId,
        })),
    };
}

export async function foundExpansion(worldId: string, userId: string, siteId: unknown): Promise<KingdomBuilderWorldView> {
    validateWorldId(worldId);
    if (typeof siteId !== "string" || !siteId.trim()) throw new KingdomBuilderPersistenceError("INVALID_INPUT", "Choose a settlement site");
    const isMember = await KingdomBuilderSettlementModel.exists({ worldId, ownerId: userId });
    if (!isMember) throw new KingdomBuilderPersistenceError("WORLD_NOT_FOUND", "Kingdom Builder world not found");

    try {
        await prepareMultipleSettlementsIndex();
        await foundSettlement(worldId, userId, siteId, undefined, "expansion");
    } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
            throw new KingdomBuilderPersistenceError("SITE_NOT_AVAILABLE", "That site is unavailable or you already have two settlements");
        }
        throw error;
    }
    return worldView(worldId, userId);
}
