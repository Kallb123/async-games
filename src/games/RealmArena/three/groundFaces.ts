// The ground's own solid faces in 3D (terrain3d.ts): pure, so it's tested without a GPU.
//
// The ground is one plane at height 0, so ground the map raises (its elevation
// layer) would float with nothing under it, and the board's edge would be a
// sheet of paper. So every square stands on a plinth from the ground beside it
// up to the ground its terrain stands on, and the board is a slab
// `BOARD_DEPTH` thick: a top on each raised square, and a side wherever a
// square's ground stands over its neighbour's — or over the slab's underside,
// at the map's edge. A side that something else covers (a raised neighbour, a
// block standing on the square) is never built. Each face is drawn with the
// picture of the ground on its square's top (`cell`), so a side is the same
// grass or scorched ground as the top it falls from, shaded by the way it faces.

import { coordsOf, groundOf, squareAt, type Battlefield, type Square } from "@/utils/games/battlefield/terrain";
import { BOARD_DEPTH, cross, dot, minus, QUARTER, type Vec3 } from "./iso3d";

/** One face of the ground: four corners, anticlockwise seen from outside it. */
export interface GroundFace {
    square: Square;
    corners: [Vec3, Vec3, Vec3, Vec3];
    normal: Vec3;
    /**
     * Where each corner falls on its square's top, as a fraction across (x) and
     * down (z) it: a top lies on itself, and a side hangs from its top edge, the
     * picture running down from the edge it falls from, a square's side of it to
     * a square's side of drop (and squeezed into one square below that).
     */
    cell: [[number, number], [number, number], [number, number], [number, number]];
}

/** The four ways out of a square: the step to the neighbour, and which of its edges it crosses. */
const SIDES: readonly { dc: number; dr: number }[] = [{ dc: 0, dr: -1 }, { dc: 0, dr: 1 }, { dc: -1, dr: 0 }, { dc: 1, dr: 0 }];

/** Whether a face's corners run anticlockwise seen from the way it faces. */
export const facesOut = (corners: GroundFace["corners"], normal: Vec3) => dot(cross(minus(corners[1], corners[0]), minus(corners[2], corners[0])), normal) >= 0;

/** A face, its corners turned round if they run clockwise seen from the way it faces. */
function face(square: Square, corners: GroundFace["corners"], cell: GroundFace["cell"], normal: Vec3): GroundFace {
    if (facesOut(corners, normal)) return { square, corners, cell, normal };
    return { square, corners: [corners[0], corners[3], corners[2], corners[1]], cell: [cell[0], cell[3], cell[2], cell[1]], normal };
}

/** Every face of the ground `field` stands on, but the flat ground's own plane. */
export function groundFaces(field: Battlefield): GroundFace[] {
    const faces: GroundFace[] = [];
    for (let square = 0; square < field.tiles.length; square++) {
        const { col, row } = coordsOf(field, square);
        const top = groundOf(field, square);
        const y = top * QUARTER;
        if (top > 0) {
            faces.push(face(square, [[col, y, row], [col, y, row + 1], [col + 1, y, row + 1], [col + 1, y, row]], [[0, 0], [0, 1], [1, 1], [1, 0]], [0, 1, 0]));
        }
        for (const { dc, dr } of SIDES) {
            const next = squareAt(field, col + dc, row + dr);
            const beside = next === undefined ? -BOARD_DEPTH : groundOf(field, next);
            if (beside >= top) continue;
            const foot = beside * QUARTER;
            // The edge the side hangs from, as two points of the square's top, and its picture from there down.
            const [a, b]: [number, number][] = dr !== 0 ? [[0, dr < 0 ? 0 : 1], [1, dr < 0 ? 0 : 1]] : [[dc < 0 ? 0 : 1, 0], [dc < 0 ? 0 : 1, 1]];
            const drop = Math.min(1, y - foot);
            const down = (at: [number, number]): [number, number] => dr !== 0 ? [at[0], dr < 0 ? drop : 1 - drop] : [dc < 0 ? drop : 1 - drop, at[1]];
            faces.push(face(
                square,
                [[col + a[0], y, row + a[1]], [col + b[0], y, row + b[1]], [col + b[0], foot, row + b[1]], [col + a[0], foot, row + a[1]]],
                [a, b, down(b), down(a)],
                [dc, 0, dr],
            ));
        }
    }
    return faces;
}
