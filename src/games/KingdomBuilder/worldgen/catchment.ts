// A settlement's land (GDD §4.6): the tiles within a fixed radius of its own,
// and how well that ground yields each resource. Pure — the generator's
// fairness score, founding, the tick and the settlement screen all read the
// same tiers. What each kind of ground yields is the area registry's `yields`
// (never a branch on an area's name); the radius, the tier bands and what each
// tier pays live in economy.ts with the rest of the numbers.

import { KINGDOM_BUILDER_ECONOMY as economy } from "../economy";
import { KINGDOM_BUILDER_RESOURCE_TYPES, type KingdomBuilderResourceType } from "../resources";
import { areaForCode } from "./areas";
import type { TerrainField } from "./terrainField";

/** Worst to best. "none" is land that doesn't yield the resource at all — its building can't be built there. */
export const KINGDOM_BUILDER_YIELD_TIERS = ["none", "poor", "good", "rich"] as const;
export type KingdomBuilderYieldTier = typeof KINGDOM_BUILDER_YIELD_TIERS[number];

export type KingdomBuilderCatchment = Record<KingdomBuilderResourceType, KingdomBuilderYieldTier>;

const RICHEST_FIRST = (["rich", "good", "poor"] as const).map(tier => ({ tier, ...economy.yieldTiers[tier] }));

// The one rule economy.ts's types can't state, checked at load like its prices.
if (RICHEST_FIRST.some(({ fromShare, outputPerLevel }, index) =>
    !Number.isInteger(outputPerLevel) || outputPerLevel < 1 || fromShare < 0
    || (index > 0 && (fromShare > RICHEST_FIRST[index - 1].fromShare || outputPerLevel > RICHEST_FIRST[index - 1].outputPerLevel)))) {
    throw new Error("economy.ts: yieldTiers must run poor → rich with rising shares and whole, rising outputs");
}

/** What a production building makes per level on land of this tier — none on land that doesn't yield its resource. */
export function outputPerLevelFor(tier: KingdomBuilderYieldTier): number {
    return tier === "none" ? 0 : economy.yieldTiers[tier].outputPerLevel;
}

export function tierForShare(share: number): KingdomBuilderYieldTier {
    if (!(share > 0)) return "none";
    return RICHEST_FIRST.find(({ fromShare }) => share >= fromShare)?.tier ?? "poor";
}

/** Every tile within `radius` of `tile` — a disc, so a 9 × 9 square with its corners cut at radius 4 — off the map left out. */
export function catchmentTiles(field: Pick<TerrainField, "columns" | "rows">, tile: number, radius = economy.catchmentRadius): number[] {
    const col = tile % field.columns, row = Math.floor(tile / field.columns);
    const reach = (radius + 0.5) ** 2;
    const tiles: number[] = [];
    for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
            const c = col + dc, r = row + dr;
            if (dc * dc + dr * dr <= reach && c >= 0 && c < field.columns && r >= 0 && r < field.rows) tiles.push(r * field.columns + c);
        }
    }
    return tiles;
}

function besideIrrigatingWater(field: TerrainField, tile: number): boolean {
    const col = tile % field.columns, row = Math.floor(tile / field.columns);
    const beside = [[col + 1, row], [col - 1, row], [col, row + 1], [col, row - 1]];
    return beside.some(([c, r]) => c >= 0 && c < field.columns && r >= 0 && r < field.rows
        && areaForCode(field.codes[r * field.columns + c]).irrigates === true);
}

/**
 * The share of the land yielding each resource: each tile counts for what its
 * area yields — or what it yields irrigated, beside a river or lake — over
 * every tile in the catchment, sea included, so a coastal site is poorer.
 */
export function catchmentShares(field: TerrainField, tile: number, radius = economy.catchmentRadius): Record<KingdomBuilderResourceType, number> {
    const tiles = catchmentTiles(field, tile, radius);
    const totals = Object.fromEntries(KINGDOM_BUILDER_RESOURCE_TYPES.map(resource => [resource, 0])) as Record<KingdomBuilderResourceType, number>;
    for (const index of tiles) {
        const area = areaForCode(field.codes[index]);
        const yields = area.irrigated && besideIrrigatingWater(field, index) ? area.irrigated : area.yields;
        for (const resource of KINGDOM_BUILDER_RESOURCE_TYPES) totals[resource] += yields[resource] ?? 0;
    }
    return Object.fromEntries(KINGDOM_BUILDER_RESOURCE_TYPES.map(resource => [resource, tiles.length ? totals[resource] / tiles.length : 0])) as Record<KingdomBuilderResourceType, number>;
}

export function catchmentFor(field: TerrainField, tile: number): KingdomBuilderCatchment {
    const shares = catchmentShares(field, tile);
    return Object.fromEntries(KINGDOM_BUILDER_RESOURCE_TYPES.map(resource => [resource, tierForShare(shares[resource])])) as KingdomBuilderCatchment;
}

/**
 * The land of a settlement on a world with no ground to read (one generated
 * before PR 9): Good in everything, bar iron — which stays where a mine
 * already stands, and nowhere else.
 */
export function groundlessCatchment(hasMine: boolean): KingdomBuilderCatchment {
    return { wood: "good", stone: "good", iron: hasMine ? "good" : "none", wheat: "good" };
}

/** What the land is worth in total, for §3.3's parity score: the output per level of every resource, summed. */
export function catchmentScore(catchment: KingdomBuilderCatchment): number {
    return KINGDOM_BUILDER_RESOURCE_TYPES.reduce((total, resource) => total + outputPerLevelFor(catchment[resource]), 0);
}

/** The resources this land doesn't yield at all — which, for a player start, must be none (§4.6). */
export function missingResources(catchment: KingdomBuilderCatchment): KingdomBuilderResourceType[] {
    return KINGDOM_BUILDER_RESOURCE_TYPES.filter(resource => catchment[resource] === "none");
}
