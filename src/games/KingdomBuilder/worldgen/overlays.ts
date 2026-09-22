// The overlay registry (GDD §3.5.3): things that sit on top of an area
// without replacing it — a bridge over a river, a ford across a lake, a road
// laid along the grass it crosses. Same "nothing branches on it by name" rule
// as AREAS.
//
// PR 9 shipped only the *derived, load-bearing* entries — the bridge or ford
// the connectivity pass writes on every water crossing it finds, because
// without one of those two a crossing simply isn't offered to the graph. This
// file now carries the rest of the vocabulary (PR 12, worldgen/overlayVocabulary.ts):
// the derived-but-not-load-bearing piers, roads and signposts, and the
// scattered, decorative pass — ruins, standing stones, shipwrecks,
// watchtowers.

export type OverlaySource = "derived" | "scattered";

/**
 * An overlay's movement effect, stated explicitly rather than left to be
 * inferred from its name — a decorative overlay that quietly changed a
 * travel time would be a nasty bug to find.
 */
export type OverlayMovement =
    | { kind: "none" }
    | { kind: "weight"; multiplier: number }
    /** Makes an otherwise-impassable area crossable, at the stated multiplier, for the listed area codes only. */
    | { kind: "passable"; multiplier: number; appliesTo: readonly string[] };

export interface OverlayDefinition {
    /** One character, same persisted-wire-format rule as an area's code. */
    code: string;
    name: string;
    movement: OverlayMovement;
    source: OverlaySource;
}

export const OVERLAYS: readonly OverlayDefinition[] = [
    {
        code: "B",
        name: "Bridge",
        movement: { kind: "passable", multiplier: 2.5, appliesTo: ["r"] },
        source: "derived",
    },
    {
        code: "F",
        name: "Ford",
        movement: { kind: "passable", multiplier: 2, appliesTo: ["l"] },
        source: "derived",
    },
    {
        code: "R",
        name: "Road",
        // Stated as a fixed weight rather than a per-area override: every
        // area's own weight is at least 1 (grass/fields/beach), so capping a
        // road tile at 1 can only ever match or improve the ground beneath
        // it, never cost more (worldgen/overlayVocabulary.ts's road pass, and
        // its own guard test, both rest on that).
        movement: { kind: "weight", multiplier: 1 },
        source: "derived",
    },
    {
        code: "P",
        name: "Pier",
        movement: { kind: "none" },
        source: "derived",
    },
    {
        code: "J",
        name: "Signpost",
        movement: { kind: "none" },
        source: "derived",
    },
    {
        code: "U",
        name: "Ruins",
        movement: { kind: "none" },
        source: "scattered",
    },
    {
        code: "T",
        name: "Standing stones",
        movement: { kind: "none" },
        source: "scattered",
    },
    {
        code: "K",
        name: "Shipwreck",
        movement: { kind: "none" },
        source: "scattered",
    },
    {
        code: "V",
        name: "Watchtower",
        movement: { kind: "none" },
        source: "scattered",
    },
];

export const OVERLAY_BY_CODE: ReadonlyMap<string, OverlayDefinition> = new Map(OVERLAYS.map(overlay => [overlay.code, overlay]));

/** A tile placement of one overlay — a sparse list, not a grid, since overlays are rare. */
export interface OverlayPlacement {
    /** Row-major index into the terrain field's `codes` string, same indexing as an area tile. */
    tile: number;
    code: string;
    orientation?: string;
}

/** Every overlay able to make the given (otherwise impassable) area code crossable, in registry order. */
export function overlaysCrossing(areaCode: string): readonly OverlayDefinition[] {
    return OVERLAYS.filter(overlay => overlay.movement.kind === "passable" && overlay.movement.appliesTo.includes(areaCode));
}

export function overlayForCode(code: string): OverlayDefinition | undefined {
    return OVERLAY_BY_CODE.get(code);
}

/**
 * The sparse overlay list indexed by tile — shared by generation (which
 * overlay, if any, already claims a tile) and rendering (which overlay a
 * self-connecting mask like Road autotiles against). Two placements on one
 * tile is a generated-world bug rather than something to draw twice over: the
 * last one in wins the square's identity.
 */
export function overlayCodesByTile(overlays: readonly OverlayPlacement[]): Map<number, string> {
    return new Map(overlays.map(placement => [placement.tile, placement.code]));
}
