// What a figure does on the 3D board while an action plays that it does not do
// standing still (docs/realm-arena-3d.md), worked out from the same pure cue
// functions the isometric board draws from (`fadeOutAt`, `fadeInAt`, `shoveAt`)
// and placed in the world rather than on the isometric board: a downed
// character fading out as its fallen figure fades in, a figure knocked or
// lunging along the ground, and whether a figure stands where something in
// front of it hides it. Pure: no three.js objects, so it's tested without a GPU.

import { fadeInAt, fadeOutAt, shoveAt, type Shove, type Timed } from "@/games/RealmArena/ui";
import type { Battlefield } from "@/utils/games/battlefield/terrain";
import { fromBoardUnits, toBoardUnits } from "./billboards";
import { onScreen, QUARTER, squareCentre, type CameraBasis, type Vec3 } from "./iso3d";

/** How much of each of a downed character's two figures is there: how much of the one still standing as the action found it, and of the one lying where it fell (null while that one isn't drawn at all). */
export interface Falling {
    standing: number;
    lying: number | null;
}

/**
 * A downed character `ms` into the playback: standing as it was until the
 * blow lands, then easing out (`fadeOutAt`) while its fallen figure, unseen
 * until then, eases in quicker (`fadeInAt`), so the two never leave a gap to
 * see through. The fallen figure appears at the blow, or when the walk the
 * character was downed partway through has reached the square it fell on
 * (`arrives`), whichever is later. With `still` it appears at once.
 */
export function fallingAt(fall: Timed, arrives: number | undefined, ms: number, still: boolean): Falling {
    const appears = { start: Math.max(arrives ?? 0, fall.start), length: fall.length };
    return { standing: fadeOutAt(fall, ms), lying: still ? (ms < appears.start ? null : 1) : fadeInAt(appears, ms) };
}

/**
 * Where the ground-plane move is that a shove has on screen: `offset` is how
 * far `shoveAt` pushes a figure off its square, in the isometric board's units
 * across the frame (down positive), and the answer is the move along the
 * ground (a vector in the world, no height to it) that lands as far across the
 * frame. A figure knocked sideways on the isometric board moves in the screen's
 * plane; here it slides over the ground, so it never sinks into it or climbs
 * out of it, and looks the same size and way on screen.
 */
export function groundMove(basis: CameraBasis, offset: { x: number; y: number }): Vec3 {
    const { x: sx, y: sy } = fromBoardUnits(offset);
    const { right, up } = basis;
    // right·g = sx, up·g = sy, for g on the ground (its y is nothing).
    const det = right[0] * up[2] - right[2] * up[0];
    return [(sx * up[2] - sy * right[2]) / det, 0, (right[0] * sy - up[0] * sx) / det];
}

/** The ground move of `shoves` `ms` in, from where the camera has the squares: `shoveAt`, through `groundMove`. */
export function shoveOf(shoves: readonly Shove[], ms: number, field: Pick<Battlefield, "width" | "tiles">, basis: CameraBasis): Vec3 {
    if (shoves.length === 0) return [0, 0, 0];
    const offset = shoveAt(shoves, ms, square => toBoardUnits(onScreen(basis, squareCentre(field, square))));
    return groundMove(basis, offset);
}

/** How far over a figure's feet its body is checked for being hidden, in world units: its shoes, its middle and its head. */
const BODY_HEIGHTS = [0.15, 0.5, 0.9];
/** How far along the view towards the camera the check steps over the ground, in squares. */
const STEP = 0.25;

/**
 * Whether the terrain between a figure and the camera could hide any part of
 * it: whether a line of sight from its shoes, middle or head, towards the
 * camera, passes under the top of a square (a wall, a tower, a tree) on its
 * way. It leaves out the figure's own square, and is generous at the edges: the
 * depth buffer settles what's really in the way (`solidMaterial`'s `behind`),
 * this only keeps the faint figure's draw to figures it could matter for.
 * `top` is the battlefield's tallest top in quarters, above which nothing is
 * in the way.
 */
export function mayBeHidden(field: Pick<Battlefield, "width" | "height" | "tiles">, basis: CameraBasis, feet: Vec3, top: number): boolean {
    const [bx, by, bz] = basis.back;
    const along = Math.hypot(bx, bz);
    const stepX = bx / along * STEP, stepZ = bz / along * STEP, rise = by / along * STEP;
    const ceiling = top * QUARTER;
    const col0 = Math.floor(feet[0]), row0 = Math.floor(feet[2]);
    for (const height of BODY_HEIGHTS) {
        let x = feet[0], z = feet[2], y = feet[1] + height;
        while (y <= ceiling) {
            x += stepX;
            z += stepZ;
            y += rise;
            const col = Math.floor(x), row = Math.floor(z);
            if (col < 0 || row < 0 || col >= field.width || row >= field.height) break;
            if (col === col0 && row === row0) continue;
            if (field.tiles[row * field.width + col].elevation * QUARTER > y) return true;
        }
    }
    return false;
}
