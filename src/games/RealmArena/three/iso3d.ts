// The geometry of the 3D board (docs/realm-arena-3d.md): where the battlefield's
// squares, heights and figures are in the world, the orthographic camera that
// looks at them as the isometric board does, and fitting a region of the map
// into the frame. Pure: no three.js objects, so it's tested without a GPU.
//
// The world: x along the map's columns, z along its rows, y up, a square's side
// to the unit — the units the character masters are written in — so square
// (col, row) is the unit cell from (col, row) to (col + 1, row + 1) on the
// ground. A quarter of height (the rules' unit, docs/games/realm-arena.md §25)
// is `QUARTER`: a full height (`FULL_HEIGHT` quarters) is √(2/3) of a square,
// which is what makes a full height stand half as tall on screen as a square is
// wide, as it does on the isometric board and in every sheet of its art
// (scripts/lib/isoRender.mjs).
//
// The camera is the sprites' own: orthographic, looking down at 30°, turned 45°
// to the grid, so the map's back corner is at the top and its columns run down
// to the right. Turning the view (`IsoRotation`) swings it a quarter round the
// map, the world staying put; the light turns with it, as the sprites' light
// never moves from the upper left.

import { FULL_HEIGHT, type Battlefield, type Facing, type Square } from "@/utils/games/battlefield/terrain";
import type { IsoRotation } from "@/utils/ui/isometric";
import type { Rect } from "@/utils/ui/mapLabels";

export type Vec3 = [number, number, number];

/** A quarter of height, in a square's sides. */
export const QUARTER = Math.sqrt(2 / 3) / FULL_HEIGHT;
/** The camera's angle above the ground. */
const ELEVATION = Math.PI / 6;

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const normalise = (a: Vec3): Vec3 => scale(a, 1 / Math.hypot(...a));

/** The middle of a square's ground, and how high its top stands. */
export function squareCentre(field: Pick<Battlefield, "width" | "tiles">, square: Square): Vec3 {
    const col = square % field.width, row = Math.floor(square / field.width);
    return [col + 0.5, field.tiles[square].elevation * QUARTER, row + 0.5];
}

/**
 * The camera's horizontal heading, as an angle in the ground's plane from the
 * x axis towards z: where the camera stands from what it looks at. Unturned it
 * stands off the map's front corner (+x, +z), so its back corner, the first
 * square, is at the top of the frame; each turn clockwise swings it a quarter
 * the other way, which turns the map clockwise in the frame, as the isometric
 * board's turn does (a figure facing `d` drawn as one facing `d + 2r`).
 */
export const azimuthOf = (rotation: number) => Math.PI / 4 - rotation * Math.PI / 2;

/** The camera's axes at `azimuth`: `back` from what it looks at towards it, `right` and `up` across the frame. */
export interface CameraBasis { back: Vec3; right: Vec3; up: Vec3 }

export function cameraBasis(azimuth: number): CameraBasis {
    const flat: Vec3 = [Math.cos(azimuth), 0, Math.sin(azimuth)];
    const back = normalise(add(scale(flat, Math.cos(ELEVATION)), [0, Math.sin(ELEVATION), 0]));
    // Looking along -back with y up: right is forward × up, and up is right × forward.
    const right = normalise([flat[2], 0, -flat[0]]);
    const up: Vec3 = [
        right[1] * -back[2] - right[2] * -back[1],
        right[2] * -back[0] - right[0] * -back[2],
        right[0] * -back[1] - right[1] * -back[0],
    ];
    return { back, right, up };
}

/** Where a point of the world lands across the frame, in world units from the camera's own axes (orthographic: depth drops out). */
export function onScreen(basis: CameraBasis, point: Vec3): { x: number; y: number } {
    return { x: dot(point, basis.right), y: dot(point, basis.up) };
}

/** The point the camera looks at for a frame centred on (`x`, `y`) of `onScreen`: any point along the view does, so the one in the camera's own plane. */
export function lookAtFor(basis: CameraBasis, { x, y }: { x: number; y: number }): Vec3 {
    return add(scale(basis.right, x), scale(basis.up, y));
}

/**
 * The light, as the sprite renderer has it (scripts/lib/isoRender.mjs `LIGHT`):
 * from up, to the left and a little towards the viewer, fixed to the camera;
 * and the halfway vector a highlight is measured against.
 */
export function lightOf(basis: CameraBasis): { light: Vec3; halfway: Vec3 } {
    const forwardFlat = normalise([basis.back[0], 0, basis.back[2]]);
    const light = normalise(add(add(scale(basis.right, -0.55), scale(forwardFlat, 0.45)), [0, 0.95, 0]));
    const view = scale(basis.back, -1);
    return { light, halfway: normalise(add(light, scale(view, -1))) };
}

/**
 * The world bounds of a region of the map — a `Rect` of squares, as
 * `focusOn`, `aimFocus` and `reachFocus` give one — standing `top` quarters
 * high, as they land across the frame.
 */
export function regionOnScreen(basis: CameraBasis, { x, y, width, height }: Rect, top: number): { x: number; y: number; width: number; height: number } {
    const xs: number[] = [], ys: number[] = [];
    for (const [col, row] of [[x, y], [x + width, y], [x + width, y + height], [x, y + height]]) {
        for (const h of [0, top * QUARTER]) {
            const p = onScreen(basis, [col, h, row]);
            xs.push(p.x);
            ys.push(p.y);
        }
    }
    const left = Math.min(...xs), bottom = Math.min(...ys);
    return { x: left, y: bottom, width: Math.max(...xs) - left, height: Math.max(...ys) - bottom };
}

/** The pose a figure lies in fallen, as kit.mjs's `POSES` has it: tipped onto its back about its own y, and slid to lie across its square. */
const FALLEN = { tilt: -Math.PI / 2, shift: [0.34, 0, 0.09] as Vec3 };

/** A 4×4 matrix, column-major as three.js and WebGL keep one. */
export type Matrix = number[];

const multiply = (a: Matrix, b: Matrix): Matrix => {
    const out = new Array<number>(16).fill(0);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
    return out;
};

/**
 * Where a figure's model goes: its own frame (x forward, y left, z up) turned
 * to `facing` — facing 0 along +x, each next 45° on towards +z, as
 * `facingTowards` counts them — fallen or standing, its feet at `at`.
 */
export function figureMatrix(at: Vec3, facing: Facing | number, fallen: boolean): Matrix {
    // The model's frame into the world's: forward x stays x, up z becomes y, left y becomes -z.
    const frame: Matrix = [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1];
    // Facing `d` heads 45°·d from +x towards +z: a turn of -45°·d about y.
    const angle = -facing * Math.PI / 4, c = Math.cos(angle), s = Math.sin(angle);
    const turn: Matrix = [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, at[0], at[1], at[2], 1];
    let matrix = multiply(turn, frame);
    if (fallen) {
        // Tipped about the model's own y, then slid in its own frame.
        const t = FALLEN.tilt, tc = Math.cos(t), ts = Math.sin(t);
        const pose: Matrix = [tc, 0, -ts, 0, 0, 1, 0, 0, ts, 0, tc, 0, ...FALLEN.shift, 1];
        matrix = multiply(matrix, pose);
    }
    return matrix;
}

/** The zoom a region fits at: pixels per world unit to bring `region` (in `onScreen` units) into `frame` pixels with `margin` pixels round it. */
export function fitZoom(region: { width: number; height: number }, frame: { width: number; height: number }, margin: number): number {
    return Math.min((frame.width - 2 * margin) / Math.max(region.width, 1e-6), (frame.height - 2 * margin) / Math.max(region.height, 1e-6));
}
