// What the 3D board shades on the ground, a texel a square (docs/realm-arena-3d.md):
// the isometric board paints each kind of shading as a translucent layer over
// the one before — the zones, the centre, the fog, the smoke, a reach, a range,
// a blast, the squares to place on — so where two meet the eye sees both. The
// overlay has one texel a square, so the layers are laid over one another here
// into the one colour that texel is.

import { Color } from "three";
import type { Square } from "@/utils/games/battlefield/terrain";

/** What's shaded on a square: the colour (sRGB, as written), and how strongly (0–1). */
export interface Shading { colour: Color; alpha: number }

/** One kind of shading: what it paints on a square, if anything. */
export type ShadingLayer = (square: Square) => Shading | null;

/**
 * What `layers` leave on `square`, painted in order — the first at the bottom,
 * each translucent over those before it — as one colour: a straight-alpha
 * "over", so a texel holding the blue of a reach under the red of a blast is
 * the purple the eye would see. Null where no layer paints.
 */
export function overlaid(layers: readonly ShadingLayer[], square: Square): Shading | null {
    let r = 0, g = 0, b = 0, alpha = 0;
    for (const layer of layers) {
        const over = layer(square);
        if (!over || over.alpha <= 0) continue;
        const kept = alpha * (1 - over.alpha), total = over.alpha + kept;
        r = (over.colour.r * over.alpha + r * kept) / total;
        g = (over.colour.g * over.alpha + g * kept) / total;
        b = (over.colour.b * over.alpha + b * kept) / total;
        alpha = total;
    }
    return alpha === 0 ? null : { colour: new Color(r, g, b), alpha };
}
