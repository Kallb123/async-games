// The outline round an area of squares, for the 3D board (docs/realm-arena-3d.md):
// the isometric board strokes the edge of a deployment zone, the centre, a
// blast and the squares a pick may be placed on, and the ground overlay — a
// colour a square — has no way to draw a line. Pure, so it's tested without a
// GPU: where the edge of a set of squares runs, cut into the dashes it's drawn
// in, and the strip of ground each is as wide as the stroke.
//
// An edge lies on the top of the square it belongs to, as the shading does
// (`groundHeight`). Where two squares of a set stand at different heights there
// is no edge between them, whichever is higher: the set carries on across, and
// it is only where the set ends that a line is drawn — on the rim of a raised
// top, or at the foot of the block that stands beside it.

import type { Battlefield, Square } from "@/utils/games/battlefield/terrain";
import { ISO_HALF_HEIGHT, ISO_HALF_WIDTH } from "@/utils/ui/isometric";
import type { Vec3 } from "./iso3d";

/**
 * A straight run of the boundary: along x (`z0 === z1`) or along z (`x0 === x1`),
 * from the lower end to the higher, at height `y`. In the world's units — a
 * square's side to the unit, square (col, row) from (col, row) to (col + 1, row + 1).
 */
export interface EdgeRun { x0: number; z0: number; x1: number; z1: number; y: number }

/** How long a run is. */
const lengthOf = (run: EdgeRun) => run.x1 - run.x0 + run.z1 - run.z0;

/**
 * Every edge of a square in `squares` whose neighbour across it is out of the
 * set, or off the map, as runs: edges that meet end to end along one line at
 * one height are one run, so a dash flows along the whole of a side and not
 * square by square. `heightOf` is how high a square's top stands, in the world's
 * units. In a fixed order, nearest the back corner first.
 */
export function boundaryRuns(field: Pick<Battlefield, "width" | "height">, squares: ReadonlySet<Square>, heightOf: (square: Square) => number): EdgeRun[] {
    const { width, height } = field;
    // The unit edges on each line, as `from`s: a line is an axis, where along the other it lies, and a height.
    const lines = new Map<string, { axis: "x" | "z"; at: number; y: number; from: number[] }>();
    const add = (axis: "x" | "z", at: number, from: number, y: number) => {
        const key = `${axis}:${at}:${y}`;
        const line = lines.get(key) ?? { axis, at, y, from: [] };
        line.from.push(from);
        lines.set(key, line);
    };
    const has = (col: number, row: number) => col >= 0 && col < width && row >= 0 && row < height && squares.has(row * width + col);
    for (const square of squares) {
        const col = square % width, row = Math.floor(square / width), y = heightOf(square);
        if (!has(col, row - 1)) add("x", row, col, y);
        if (!has(col, row + 1)) add("x", row + 1, col, y);
        if (!has(col - 1, row)) add("z", col, row, y);
        if (!has(col + 1, row)) add("z", col + 1, row, y);
    }
    const runs: EdgeRun[] = [];
    for (const { axis, at, y, from } of lines.values()) {
        from.sort((a, b) => a - b);
        let start = from[0], end = start + 1;
        const close = () => runs.push(axis === "x" ? { x0: start, z0: at, x1: end, z1: at, y } : { x0: at, z0: start, x1: at, z1: end, y });
        for (const next of from.slice(1)) {
            if (next !== end) { close(); start = next; }
            end = next + 1;
        }
        close();
    }
    return runs.sort((a, b) => a.y - b.y || a.z0 - b.z0 || a.x0 - b.x0 || a.z1 - b.z1 || a.x1 - b.x1);
}

/**
 * How a stroke of the isometric board's units (its SVG's, where a square's
 * diamond is `2 * ISO_HALF_WIDTH` across) is drawn on the ground. That board
 * strokes in the picture's own space, so what is asked for is a width and a
 * dash as the eye sees them; the ground is foreshortened, and every edge of a
 * square lies at the same slant to the camera, so one factor each way holds for
 * every edge at every turn of the view: a square's side is `SIDE` units long on
 * screen, and a strip a world unit wide along it covers the diamond's area
 * (`2 * ISO_HALF_WIDTH * ISO_HALF_HEIGHT`) over that length.
 */
const SIDE = Math.hypot(ISO_HALF_WIDTH, ISO_HALF_HEIGHT);
export const strokeWidth = (units: number) => units * SIDE / (2 * ISO_HALF_WIDTH * ISO_HALF_HEIGHT);
export const strokeLength = (units: number) => units / SIDE;

/**
 * `run` cut into the dashes of a dashed stroke, `pattern` a dash and a gap, in
 * the world's units. The pattern is fitted to the run so that it holds a whole
 * number of them with half a dash at each end — a corner is always lit, and a
 * side reads the same from either end — rather than running on from wherever the
 * last run left it. The first piece and the last reach `cap` past the run's ends
 * (the corner a stroke's width fills in), and no dash reaches past anywhere else.
 */
export function dashesOf(run: EdgeRun, [dash, gap]: readonly [number, number], cap = 0): EdgeRun[] {
    const length = lengthOf(run);
    const count = Math.max(1, Math.round(length / (dash + gap)));
    const period = length / count, lit = period * dash / (dash + gap);
    const piece = (from: number, to: number) => along(run, from - (from <= 0 ? cap : 0), to + (to >= length ? cap : 0));
    const dashes = [piece(0, lit / 2)];
    for (let i = 1; i < count; i++) dashes.push(piece(i * period - lit / 2, i * period + lit / 2));
    dashes.push(piece(length - lit / 2, length));
    return dashes;
}

/** The part of `run` from `from` to `to` along it. */
function along(run: EdgeRun, from: number, to: number): EdgeRun {
    const alongX = run.x1 > run.x0;
    return alongX ? { ...run, x0: run.x0 + from, x1: run.x0 + to } : { ...run, z0: run.z0 + from, z1: run.z0 + to };
}

/** `run` as one unbroken stroke, `cap` further out at each end. */
export const solidOf = (run: EdgeRun, cap = 0): EdgeRun => along(run, -cap, lengthOf(run) + cap);

/** The four corners of the strip of ground `run` is stroked as, `width` across and centred on it, lying `lift` over its height: a quad, wound one way round. */
export function stripCorners(run: EdgeRun, width: number, lift = 0): [Vec3, Vec3, Vec3, Vec3] {
    const half = width / 2, y = run.y + lift;
    return run.x1 > run.x0
        ? [[run.x0, y, run.z0 - half], [run.x1, y, run.z0 - half], [run.x1, y, run.z0 + half], [run.x0, y, run.z0 + half]]
        : [[run.x0 - half, y, run.z0], [run.x0 + half, y, run.z0], [run.x0 + half, y, run.z1], [run.x0 - half, y, run.z1]];
}
