// A settlement's land (GDD §4.6), as the server stores it. The tiers are
// worked out once — at founding, or, for a settlement founded before PR 18,
// the first time the tick or a screen needs them — and never again: the
// ground never changes under a world.

import { KingdomBuilderSettlementModel, type KingdomBuilderTile } from "./KingdomBuilderSettlementModel";
import { KingdomBuilderWorldModel, type StoredWorldNode } from "./KingdomBuilderWorldModel";
import { catchmentFor, groundlessCatchment, type KingdomBuilderCatchment } from "./worldgen/catchment";
import { tileAt, tileIndex, type TerrainField } from "./worldgen/terrainField";

export interface KingdomBuilderLandWorld {
    terrainField?: TerrainField;
    nodes: readonly StoredWorldNode[];
}

/**
 * The tiers for a settlement on its site. A node from before PR 16 has no
 * tile of its own yet, so the tile under it stands in — a radius of land
 * doesn't care about the one-tile snap. A world with no ground (pre-PR 9), or
 * a site that has gone missing from it, gets the groundless fallback.
 */
export function catchmentForSettlement(world: KingdomBuilderLandWorld, settlement: { nodeId: string; tiles?: readonly KingdomBuilderTile[] }): KingdomBuilderCatchment {
    const field = world.terrainField;
    const site = world.nodes.find(node => node.id === settlement.nodeId);
    if (!field || !site) return groundlessCatchment(settlement.tiles);
    if (site.tile !== undefined) return catchmentFor(field, site.tile);
    const { col, row } = tileAt(field, site);
    return catchmentFor(field, tileIndex(field, col, row));
}

/**
 * A settlement's stored tiers, backfilling them if it has none. The save is
 * best-effort and guarded on the field still being absent, so two screens
 * racing write nothing twice; a failure only means the next reader works
 * them out again — the answer is the same every time.
 */
export async function catchmentOfSettlement(
    worldId: string,
    settlement: { _id: unknown; nodeId: string; tiles?: readonly KingdomBuilderTile[]; catchment?: KingdomBuilderCatchment },
): Promise<KingdomBuilderCatchment> {
    if (settlement.catchment) return settlement.catchment;
    const world = await KingdomBuilderWorldModel.findById(worldId).select({ terrainField: 1, nodes: 1 }).lean();
    const catchment = catchmentForSettlement(world ?? { nodes: [] }, settlement);
    if (world) {
        await KingdomBuilderSettlementModel.updateOne({ _id: settlement._id, worldId, catchment: { $exists: false } }, { $set: { catchment } })
            .catch(error => console.error(`Kingdom Builder: could not save the land of settlement ${String(settlement._id)}`, error));
    }
    return catchment;
}
