// Where the 3D board's previews of a lined-up action stand (docs/realm-arena-3d.md):
// the pieces a move's path is drawn from, the shields of the cover a square
// gives, and where the centre's name stands, clear of its area and of the figures
// on it. Pure: no three.js
// objects, so it's tested without a GPU (`previewGeometry.test.ts`). Everything
// across the frame is in the isometric board's units, as `Billboards` takes it.

import { coverBySide, SIDE_STEPS, type Side } from "@/utils/games/battlefield/cover";
import type { Battlefield, Square } from "@/utils/games/battlefield/terrain";
import { circleRect, resolveMapLabels, type PlacedMapLabel, type Rect } from "@/utils/ui/mapLabels";
import { CENTRE_LABEL, figureRectAt } from "@/games/RealmArena/ui";
import { BOARD_UNIT, toBoardUnits } from "./billboards";
import { lerp3, onScreen, squareCentre, type BoardFrame, type CameraBasis, type Vec3 } from "./iso3d";

/** One straight run of a path, as a rectangle hung from its middle: how long it is across the frame, and the turn it takes (clockwise, in degrees) to lie along it. */
export interface PathPiece { at: Vec3; length: number; rotate: number }

/** A path drawn as pieces: the runs, and the round dots that join them and cap their ends. */
export interface PathStroke { pieces: PathPiece[]; discs: Vec3[] }

/**
 * A path's stroke, as the camera sees it. A path is a line over the squares'
 * tops, so a run up a step slopes up the frame, and the pieces lie along it
 * afresh as the view turns.
 *
 * Solid (no `dash`), it is a run between each point and the next, with a dot on
 * every point to round the joints and the ends. Dashed, `dash` is a dash and a
 * gap in board units across the frame, as the isometric board's `stroke-dasharray`
 * gives them: the pattern runs on round the corners from the path's start, the
 * way an SVG's does, and each dash is round-capped, with a dot at either end and
 * one on any corner it turns.
 */
export function pathStroke(points: readonly Vec3[], basis: CameraBasis, dash?: readonly [number, number]): PathStroke {
    const runs: { from: Vec3; to: Vec3; start: number; length: number; rotate: number }[] = [];
    let total = 0;
    for (let i = 1; i < points.length; i++) {
        const a = toBoardUnits(onScreen(basis, points[i - 1])), b = toBoardUnits(onScreen(basis, points[i]));
        const dx = b.x - a.x, dy = b.y - a.y;
        const length = Math.hypot(dx, dy);
        if (length < 1e-6) continue;
        // Across the frame y is down, which is the way an SVG's `rotate` turns.
        runs.push({ from: points[i - 1], to: points[i], start: total, length, rotate: Math.atan2(dy, dx) * 180 / Math.PI });
        total += length;
    }
    if (!dash || runs.length === 0) {
        return { pieces: runs.map(({ from, to, length, rotate }) => ({ at: lerp3(from, to, 0.5), length, rotate })), discs: [...points] };
    }

    const [lit, gap] = dash;
    const pointAt = (distance: number): Vec3 => {
        const run = runs.find(({ start, length }) => distance <= start + length) ?? runs[runs.length - 1];
        return lerp3(run.from, run.to, (distance - run.start) / run.length);
    };
    const pieces: PathPiece[] = [], discs: Vec3[] = [];
    for (let from = 0; from < total; from += lit + gap) {
        const to = Math.min(from + lit, total);
        discs.push(pointAt(from), pointAt(to));
        for (const run of runs) {
            const end = run.start + run.length;
            const a = Math.max(from, run.start), b = Math.min(to, end);
            if (b - a < 1e-6) continue;
            pieces.push({ at: lerp3(run.from, run.to, ((a + b) / 2 - run.start) / run.length), length: b - a, rotate: run.rotate });
            // A corner this dash runs round is joined with a dot, as a solid path's are.
            if (to > end && end > from) discs.push(run.to);
        }
    }
    return { pieces, discs };
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

/**
 * Where the centre's name goes, as the isometric board's `MapLabelLayer` puts it
 * (the same `resolveMapLabels`): just clear of the top of the area as the camera
 * sees it, unless a figure on any of `figures`' squares stands there, when it
 * moves round to another side. Worked out in the camera's own plane, in board
 * units, from the middle of the area (x right, y down, as `Billboards` takes a
 * quad's place), with each figure the rectangle the isometric board gives it
 * (`figureRectAt`) and the board's `frame` as the edge it keeps within. The name
 * comes back as `resolveMapLabels` places it, with `x` the middle of its line of
 * text, `textWide` wide (a name `resolveMapLabels` anchors at its start or end has
 * half that width on one side of where it puts `x`), and `y` its baseline.
 */
export function centreLabel(
    field: Pick<Battlefield, "width" | "tiles">, basis: CameraBasis, area: Rect, figures: readonly Square[], frame: BoardFrame, text: string, textWide: number,
): Omit<PlacedMapLabel, "textAnchor"> {
    const middle = onScreen(basis, areaMiddle(area));
    const relative = (across: { x: number; y: number }) => toBoardUnits({ x: across.x - middle.x, y: across.y - middle.y });
    const rise = areaRise(basis, area);
    const corner = relative(frame.origin);
    const { x, textAnchor, ...placed } = resolveMapLabels(
        [{ x: 0, y: 0, text, fontSize: CENTRE_LABEL.fontSize, offset: rise + CENTRE_LABEL.gap, dir: "n" }],
        {
            bounds: { x: corner.x, y: corner.y, width: frame.size.width / BOARD_UNIT, height: frame.size.height / BOARD_UNIT },
            obstacles: [circleRect(0, 0, rise), ...figures.map(square => figureRectAt(relative(onScreen(basis, squareCentre(field, square)))))],
        },
    )[0];
    return { ...placed, x: textAnchor === "start" ? x + textWide / 2 : textAnchor === "end" ? x - textWide / 2 : x };
}
