// The map-shape checks (GDD §3.7): a hand-tuned generator drifts, so a world's
// ground is measured and asserted rather than trusted. generateWorld runs
// these beside §3.3's fairness checks, in the same reject-and-retry loop and
// under the same cap, and the "generate 20 worlds" test asserts them too.

import { FIELDS_CODE, GRASS_CODE, HILLS_CODE, LAKE_CODE, MARSH_CODE, MOUNTAINS_CODE, OCEAN_CODE, RIVER_CODE, WOODLAND_CODE } from "./areas";
import type { TerrainField } from "./terrainField";

export interface CompositionBand {
    label: string;
    codes: readonly string[];
    /** The inclusive share of the world's land (every tile that isn't ocean) these areas may take between them. */
    share: readonly [number, number];
}

/** §3.7's first-pass bands. Beach isn't banded: it is however much coast the land mask drew. */
export const COMPOSITION_BANDS: readonly CompositionBand[] = [
    { label: "mountains", codes: [MOUNTAINS_CODE], share: [0.05, 0.1] },
    { label: "hills", codes: [HILLS_CODE], share: [0.1, 0.18] },
    { label: "woodland", codes: [WOODLAND_CODE], share: [0.18, 0.3] },
    { label: "grass and fields", codes: [GRASS_CODE, FIELDS_CODE], share: [0.3, 0.5] },
    { label: "marsh", codes: [MARSH_CODE], share: [0, 0.06] },
    { label: "lakes and rivers", codes: [LAKE_CODE, RIVER_CODE], share: [0.02, 0.08] },
];

/** No one connected mass of mountains may hold more than this share of all of them — the direct answer to "one block in the middle". */
export const MAXIMUM_MOUNTAIN_REGION_SHARE = 0.4;

/** Each band's share of the land, in the order of COMPOSITION_BANDS. */
export function compositionOf(field: TerrainField): number[] {
    const counts = new Map<string, number>();
    for (const code of field.codes) counts.set(code, (counts.get(code) ?? 0) + 1);
    const land = field.codes.length - (counts.get(OCEAN_CODE) ?? 0);
    return COMPOSITION_BANDS.map(band => (land === 0 ? 0 : band.codes.reduce((sum, code) => sum + (counts.get(code) ?? 0), 0) / land));
}

/** The share of all mountain tiles in the largest eight-connected mass of them; 0 for a world with none. */
export function largestMountainRegionShare(field: TerrainField): number {
    const seen = new Uint8Array(field.codes.length);
    let total = 0, largest = 0;
    for (let start = 0; start < field.codes.length; start++) {
        if (seen[start] || field.codes[start] !== MOUNTAINS_CODE) continue;
        seen[start] = 1;
        const queue = [start];
        for (let head = 0; head < queue.length; head++) {
            const col = queue[head] % field.columns, row = Math.floor(queue[head] / field.columns);
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    const c = col + dc, r = row + dr;
                    if (c < 0 || c >= field.columns || r < 0 || r >= field.rows) continue;
                    const neighbour = r * field.columns + c;
                    if (seen[neighbour] || field.codes[neighbour] !== MOUNTAINS_CODE) continue;
                    seen[neighbour] = 1;
                    queue.push(neighbour);
                }
            }
        }
        total += queue.length;
        largest = Math.max(largest, queue.length);
    }
    return total === 0 ? 0 : largest / total;
}

/**
 * Why a world's ground fails §3.7, or an empty list if it passes: each
 * composition band it falls outside, and a mountain mass holding too much of
 * the mountains. Reasons rather than a boolean, the same as §3.3's fairness
 * report, so a world that keeps failing says why.
 */
export function checkWorldShape(field: TerrainField): string[] {
    const reasons: string[] = [];
    compositionOf(field).forEach((share, index) => {
        const band = COMPOSITION_BANDS[index];
        if (share < band.share[0] || share > band.share[1]) {
            reasons.push(`${band.label} cover ${(share * 100).toFixed(1)}% of the land, outside ${band.share[0] * 100}–${band.share[1] * 100}%`);
        }
    });
    const region = largestMountainRegionShare(field);
    if (region > MAXIMUM_MOUNTAIN_REGION_SHARE) reasons.push(`one mountain region holds ${(region * 100).toFixed(0)}% of the mountains`);
    return reasons;
}
