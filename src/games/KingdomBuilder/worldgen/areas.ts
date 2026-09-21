// The ground registry (GDD §3.5.2): the world's terrain areas, one entry
// each. This is the extension point a new area (desert, tundra, whatever a
// season's theme wants) is meant to cost — one entry here plus one block of
// art — so nothing outside this file may branch on an area by name. The
// generator (terrainField.ts) walks `placement`, the cost walk
// (graphConnectivity.ts) reads `weight`, and the eventual renderer and legend
// (PR10) read `priority` and the manifest.
//
// Same "registry-and-its-test" shape the repo already uses for game guides
// and themes (see src/utils/ui/gameThemes.ts) — this file only declares the
// data, and areas.test.ts is the guard.

/** A production/travel multiplier, or "impassable" without a compatible overlay. */
export type AreaWeight = number | "impassable";

/** A window on the generated noise: an elevation band, and optionally a moisture band. Both are inclusive, in the field's own 0–1 units. */
export interface AreaWindowPlacement {
    kind: "window";
    elevation: readonly [number, number];
    moisture?: readonly [number, number];
}

/**
 * A named pass run after every window has been resolved, for areas defined by
 * *relationships* rather than by a value at a point — the border flood fill
 * that tells ocean from lake, the downhill trace that carves rivers, the
 * shore band that lays beach where land meets ocean, and the radius that
 * paints fields around inhabited sites (terrainField.ts has one function per
 * name below, each tested on its own).
 */
export interface AreaPassPlacement {
    kind: "pass";
    name: "water-split" | "river-trace" | "beach-band" | "fields-radius";
}

export type AreaPlacement = AreaWindowPlacement | AreaPassPlacement;

export interface AreaDefinition {
    /** One character. This is the persisted wire format — see the storage rule below. */
    code: string;
    /** What the legend calls it. */
    name: string;
    /** The §6.2 movement multiplier, or "impassable" without a compatible overlay. */
    weight: AreaWeight;
    /** Paint order, which is also border-overlay order (§3.5.5). */
    priority: number;
    /** The flat fill used when there is no art yet, or the sheet fails to load. */
    fallbackColour: string;
    /** How the generator decides a tile is this area. */
    placement: AreaPlacement;
}

/**
 * The launch set (§3.5.2's table) plus what a map needs to read as a place.
 * Priority doubles as paint order, lowest first — water under land, land
 * under the bands drawn on top of it.
 *
 * Codes are append-only. Never reused, never renamed: reusing a retired
 * area's letter would silently rewrite the ground under every world already
 * stored. There are no retirements yet, but when one happens its code stays
 * reserved here with a note instead of being freed for reuse.
 */
export const AREAS: readonly AreaDefinition[] = [
    {
        code: "o",
        name: "Ocean",
        weight: "impassable",
        priority: 0,
        fallbackColour: "#2f6f8f",
        placement: { kind: "pass", name: "water-split" },
    },
    {
        code: "l",
        name: "Lake",
        weight: "impassable",
        priority: 1,
        fallbackColour: "#3f7fa0",
        placement: { kind: "pass", name: "water-split" },
    },
    {
        code: "r",
        name: "River",
        weight: "impassable",
        priority: 2,
        fallbackColour: "#4a90b8",
        placement: { kind: "pass", name: "river-trace" },
    },
    {
        code: "b",
        name: "Beach",
        weight: 1,
        priority: 3,
        fallbackColour: "#e8d9ae",
        placement: { kind: "pass", name: "beach-band" },
    },
    {
        code: "g",
        name: "Grass",
        weight: 1,
        priority: 4,
        fallbackColour: "#8fbf6a",
        // The baseline: middling elevation, middling moisture — and also the
        // catch-all for any land tile no more specific window claims.
        placement: { kind: "window", elevation: [0, 1] },
    },
    {
        code: "f",
        name: "Fields",
        weight: 1,
        priority: 5,
        fallbackColour: "#b9d17a",
        placement: { kind: "pass", name: "fields-radius" },
    },
    {
        code: "w",
        name: "Woodland",
        weight: 1.5,
        priority: 6,
        fallbackColour: "#4f8f52",
        placement: { kind: "window", elevation: [0, 0.52], moisture: [0.55, 1] },
    },
    {
        code: "h",
        name: "Hills",
        weight: 2,
        priority: 7,
        fallbackColour: "#b98f5a",
        placement: { kind: "window", elevation: [0.52, 0.66] },
    },
    {
        code: "m",
        name: "Mountains",
        weight: 3.5,
        priority: 8,
        fallbackColour: "#9a9a9a",
        placement: { kind: "window", elevation: [0.66, 1] },
    },
    {
        code: "s",
        name: "Marsh",
        weight: 2.5,
        priority: 9,
        fallbackColour: "#6f8f6a",
        placement: { kind: "window", elevation: [0, 0.41], moisture: [0.68, 1] },
    },
];

export const AREA_BY_CODE: ReadonlyMap<string, AreaDefinition> = new Map(AREAS.map(area => [area.code, area]));

/** The land elevation windows, most specific first — marsh and woodland both need moisture, so they are checked before the elevation-only bands either side of them. */
export const AREA_WINDOWS: readonly AreaDefinition[] = [
    AREA_BY_CODE.get("m")!,
    AREA_BY_CODE.get("h")!,
    AREA_BY_CODE.get("s")!,
    AREA_BY_CODE.get("w")!,
    AREA_BY_CODE.get("g")!,
];

/** The provisional code every water tile is given before the water-split pass tells ocean from lake. */
export const PROVISIONAL_WATER_CODE = "l";
export const GRASS_CODE = "g";

let loggedUnknownAreaCode = false;

/**
 * Never throws on an unrecognised code — a rolling deploy can have an older
 * instance read a world a newer one generated. An unknown code renders as
 * neutral ground at grass weight and logs once; a map that draws something
 * slightly wrong for a minute beats a map that 500s.
 */
export function areaForCode(code: string): AreaDefinition {
    const area = AREA_BY_CODE.get(code);
    if (area) return area;
    if (!loggedUnknownAreaCode) {
        loggedUnknownAreaCode = true;
        // eslint-disable-next-line no-console
        console.warn(`Kingdom Builder: unknown terrain area code "${code}" — rendering as grass.`);
    }
    return AREA_BY_CODE.get(GRASS_CODE)!;
}

export function areaWeightForCode(code: string): AreaWeight {
    return areaForCode(code).weight;
}

function inBand(value: number, band: readonly [number, number]): boolean {
    return value >= band[0] && value <= band[1];
}

/** Picks the land window an elevation/moisture sample falls into — never water, which the water-split pass decides instead. */
export function windowAreaFor(elevation: number, moisture: number): AreaDefinition {
    for (const area of AREA_WINDOWS) {
        const placement = area.placement as AreaWindowPlacement;
        if (!inBand(elevation, placement.elevation)) continue;
        if (placement.moisture && !inBand(moisture, placement.moisture)) continue;
        return area;
    }
    return AREA_BY_CODE.get(GRASS_CODE)!;
}
