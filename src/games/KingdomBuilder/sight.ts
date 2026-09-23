// Fog of war (GDD §6.3, §11.3 PR 20), pure like armies.ts. Every settlement is
// public — where it is and whose — but an army is seen only by its owner and
// by whoever has something of their own close enough to see it: an army of
// theirs (farther with a scout in it), or a settlement (farther as its
// barracks grows). The server decides what each viewer is sent from these; the
// world map only draws the circles it is handed.

import type { KingdomBuilderGarrison } from "./units";
import type { TerrainField } from "./worldgen/terrainField";

/** One thing of the viewer's that can see, and how far: a radius in tiles around the tile it stands on. */
export interface KingdomBuilderSight {
    tile: number;
    radius: number;
    /** An army with a scout in it (§6.1): the one sight that also reads a rival settlement's garrison. */
    scouting?: true;
}

/** How far any army sees, in tiles. */
export const KINGDOM_BUILDER_ARMY_SIGHT = 4;
/** How far an army with at least one scout in it sees (§6.1's "reveals a target before you commit"). */
export const KINGDOM_BUILDER_SCOUT_SIGHT = 8;
/**
 * How far a settlement watches, indexed by its barracks level — §6.3's
 * detection upgrade: a town sees its own doorstep, and a developed barracks
 * posts lookouts farther out. First-pass numbers (§12).
 */
export const KINGDOM_BUILDER_SETTLEMENT_SIGHT: readonly number[] = [3, 3, 5, 7];

export function armySight(tile: number, units: Partial<KingdomBuilderGarrison>): KingdomBuilderSight {
    return (units.scout ?? 0) > 0
        ? { tile, radius: KINGDOM_BUILDER_SCOUT_SIGHT, scouting: true }
        : { tile, radius: KINGDOM_BUILDER_ARMY_SIGHT };
}

export function settlementSight(tile: number, barracksLevel: number): KingdomBuilderSight {
    const levels = KINGDOM_BUILDER_SETTLEMENT_SIGHT;
    return { tile, radius: levels[Math.max(0, Math.min(levels.length - 1, barracksLevel))] };
}

/** Whether a tile lies within one sight's circle — measured centre to centre, in tiles. */
function covers(field: Pick<TerrainField, "columns">, sight: KingdomBuilderSight, tile: number): boolean {
    const dx = tile % field.columns - sight.tile % field.columns;
    const dy = Math.floor(tile / field.columns) - Math.floor(sight.tile / field.columns);
    return dx * dx + dy * dy <= sight.radius * sight.radius;
}

/** Whether any of these sights can see the tile — or, with `scouting`, any scouting one. */
export function isInSight(field: Pick<TerrainField, "columns">, sights: readonly KingdomBuilderSight[], tile: number, scouting = false): boolean {
    return sights.some(sight => (!scouting || sight.scouting) && covers(field, sight, tile));
}
