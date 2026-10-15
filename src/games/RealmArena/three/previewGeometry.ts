// Where the 3D board's previews of a lined-up action stand (docs/realm-arena-3d.md):
// the pieces a move's path is drawn from, the shields of the cover a square
// gives, and how far clear of its area the centre's name stands. Pure: no three.js
// objects, so it's tested without a GPU (`previewGeometry.test.ts`). Everything
// across the frame is in the isometric board's units, as `Billboards` takes it.

import { coverBySide, SIDE_STEPS, type Side } from "@/utils/games/battlefield/cover";
import type { Battlefield, Square } from "@/utils/games/battlefield/terrain";
import type { Rect } from "@/utils/ui/mapLabels";
import { BOARD_UNIT, toBoardUnits } from "./billboards";
import { lerp3, onScreen, squareCentre, type CameraBasis, type Vec3 } from "./iso3d";

/** One straight run of a path, as a rectangle hung from its middle: how long it is across the frame, and the turn it takes (clockwise, in degrees) to lie along it. */
export interface PathPiece { at: Vec3; length: number; rotate: number }

/**
 * The runs between each point of a path and the next, as the camera sees them.
 * A path is a line over the squares' tops, so a run up a step slopes up the
 * frame, and the pieces lie along it afresh as the view turns.
 */
export function pathPieces(points: readonly Vec3[], basis: CameraBasis): PathPiece[] {
    const pieces: PathPiece[] = [];
    for (let i = 1; i < points.length; i++) {
        const a = toBoardUnits(onScreen(basis, points[i - 1])), b = toBoardUnits(onScreen(basis, points[i]));
        const dx = b.x - a.x, dy = b.y - a.y;
        const length = Math.hypot(dx, dy);
        if (length < 1e-6) continue;
        // Across the frame y is down, which is the way an SVG's `rotate` turns.
        pieces.push({ at: lerp3(points[i - 1], points[i], 0.5), length, rotate: Math.atan2(dy, dx) * 180 / Math.PI });
    }
    return pieces;
}

/** The middle of each of `squares`' tops: a path's points. */
export const pathPoints = (field: Pick<Battlefield, "width" | "tiles">, squares: readonly Square[]): Vec3[] => squares.map(square => squareCentre(field, square));

/** A shield on one side of a square: what that side gives, and the middle of its edge at the square's height. */
export interface ShieldSpec { side: Side; cover: "half" | "full"; at: Vec3 }

/** The shields for the cover each side of `square` gives: none for an open side. */
export function shieldsAt(field: Battlefield, square: Square): ShieldSpec[] {
    const sides = coverBySide(field, square);
    const [x, y, z] = squareCentre(field, square);
    return (Object.keys(SIDE_STEPS) as Side[]).flatMap(side => {
        const cover = sides[side];
        return cover === "none" ? [] : [{ side, cover, at: [x + SIDE_STEPS[side].col / 2, y, z + SIDE_STEPS[side].row / 2] as Vec3 }];
    });
}

/** The middle of an area of squares, on the ground. */
export const areaMiddle = ({ x, y, width, height }: Rect): Vec3 => [x + width / 2, 0, y + height / 2];

/**
 * How far up the frame the top edge of an area of squares reaches over its
 * middle, in board units, as the camera sees it: what the centre's name is
 * kept clear of. It changes smoothly as the view turns, as the area's
 * outline does.
 */
export function areaRise(basis: CameraBasis, area: Rect): number {
    const middle = onScreen(basis, areaMiddle(area));
    const { x, y, width, height } = area;
    const corners: [number, number][] = [[x, y], [x + width, y], [x + width, y + height], [x, y + height]];
    const highest = Math.max(...corners.map(([col, row]) => onScreen(basis, [col, 0, row]).y));
    return (highest - middle.y) / BOARD_UNIT;
}
