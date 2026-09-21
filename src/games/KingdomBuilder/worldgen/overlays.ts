// The overlay registry (GDD §3.5.3): things that sit on top of an area
// without replacing it — a bridge over a river, a ford across a lake. Same
// "nothing branches on it by name" rule as AREAS.
//
// PR 9 carries only the *derived, load-bearing* entries: the bridge or ford
// the connectivity pass writes on every water crossing it finds, because
// without one of those two a crossing simply isn't offered to the graph.
// The scattered, decorative vocabulary (ruins, standing stones, watchtowers…)
// is PR 12's — the shape lands here so that PR is additive, not the
// vocabulary.

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
