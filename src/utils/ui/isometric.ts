// An isometric view of a grid of squares that stand at different heights —
// Realm Arena's battlefield, and the same ground Defender of the Realm will
// fight on (docs/games/realm-arena.md §10). Pure geometry, like mapEdges.ts
// and mapLabels.ts: the board component decides what to draw, and this says
// where it lands.
//
// A square is the 2:1 diamond every isometric tile sheet draws, so a sheet's
// tiles can replace the flat colours later without the geometry moving.
// Column runs down and to the right, row down and to the left, and a square
// raised by `h` storeys is drawn `h * ISO_STOREY` higher, with its front
// faces showing wherever the square in front of it is lower.
//
// Everything is in board units: the SVG's viewBox is `IsoView.size`.

import type { Rect } from "./mapLabels";

/** Half a square's width on the board. */
export const ISO_HALF_WIDTH = 10;
/** Half a square's height on the board: half its width, for the 2:1 diamond. */
export const ISO_HALF_HEIGHT = 5;
/** How far one storey of height lifts a square, in board units. */
export const ISO_STOREY = 5;

export interface Point {
    x: number;
    y: number;
}

/** A grid to draw, and how high each square of it stands. */
export interface IsoGrid {
    width: number;
    height: number;
    /** Each square's height in storeys, by index (`row * width + col`). The ground is 0, and nothing is below it. */
    heights: readonly number[];
}

export interface IsoViewOptions {
    /** How deep the ground's slab is drawn under the map's front edges, in storeys. */
    base: number;
    /** Room kept above the highest square, in board units, for whatever stands on it. */
    headroom: number;
    /**
     * The least the board's height may be as a fraction of its width. An
     * isometric map is twice as wide as it is tall whatever its shape, which
     * fitted to a phone is a strip; padding it above and below keeps the
     * frame tall enough to pan around once zoomed.
     */
    minAspect?: number;
}

export interface IsoView extends IsoGrid {
    /** The tallest square, in storeys. */
    top: number;
    /** Where the back corner of the map — column 0, row 0, on the ground — falls. */
    origin: Point;
    /** The board's size: its SVG's viewBox. */
    size: { width: number; height: number };
    base: number;
}

export function isoView(grid: IsoGrid, { base, headroom, minAspect = 0 }: IsoViewOptions): IsoView {
    const top = Math.max(0, ...grid.heights);
    const width = (grid.width + grid.height) * ISO_HALF_WIDTH;
    const drawn = top * ISO_STOREY + headroom + (grid.width + grid.height) * ISO_HALF_HEIGHT + base * ISO_STOREY;
    const height = Math.max(drawn, width * minAspect);
    const pad = (height - drawn) / 2;
    return {
        ...grid,
        top,
        base,
        origin: { x: grid.height * ISO_HALF_WIDTH, y: pad + headroom + top * ISO_STOREY },
        size: { width, height },
    };
}

/** A point of the grid — a corner, or anywhere between — at a height in storeys. */
export function isoPoint(view: IsoView, col: number, row: number, height: number): Point {
    return {
        x: view.origin.x + (col - row) * ISO_HALF_WIDTH,
        y: view.origin.y + (col + row) * ISO_HALF_HEIGHT - height * ISO_STOREY,
    };
}

function colRow(view: IsoGrid, square: number): { col: number; row: number } {
    return { col: square % view.width, row: Math.floor(square / view.width) };
}

/** How high a square stands, or the ground off the edge of the map. */
function heightAt(view: IsoGrid, col: number, row: number): number {
    return col < 0 || row < 0 || col >= view.width || row >= view.height ? 0 : view.heights[row * view.width + col];
}

/** The middle of a square's top: where whatever stands on it stands. */
export function isoCentre(view: IsoView, square: number): Point {
    const { col, row } = colRow(view, square);
    return isoPoint(view, col + 0.5, row + 0.5, view.heights[square]);
}

/**
 * The order squares are drawn in, back to front: a square is only ever hidden
 * by one with a higher depth, so anything standing on a square is drawn
 * between its depth and the next.
 */
export function isoDepth(view: IsoGrid, square: number): number {
    const { col, row } = colRow(view, square);
    return col + row;
}

/** Points as an SVG `points` list: a polygon's corners, or a polyline's stops. */
export function isoPoints(corners: readonly Point[]): string {
    return corners.map(({ x, y }) => `${x},${y}`).join(" ");
}

const points = (...corners: Point[]) => isoPoints(corners);

/** The polygon a rectangle of the grid makes at one height, as an SVG `points` list. */
export function isoArea(view: IsoView, { x: col, y: row, width, height }: Rect, at = 0): string {
    return points(
        isoPoint(view, col, row, at),
        isoPoint(view, col + width, row, at),
        isoPoint(view, col + width, row + height, at),
        isoPoint(view, col, row + height, at),
    );
}

/**
 * The part of the board a rectangle of the grid (in squares) covers, from the
 * ground to the tallest square's top: what `BoardZoom` is asked to bring into
 * view for a region of the map.
 */
export function isoBounds(view: IsoView, { x: col, y: row, width, height }: Rect): Rect {
    const corners = [[col, row], [col + width, row], [col + width, row + height], [col, row + height]]
        .flatMap(([c, r]) => [isoPoint(view, c, r, 0), isoPoint(view, c, r, view.top)]);
    const xs = corners.map(p => p.x), ys = corners.map(p => p.y);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** One SVG path drawing every square that shares a key. */
export interface IsoRun<K> {
    key: K;
    d: string;
}

/**
 * The tops of every square that shares a key, one path per key rather than a
 * shape per square, since a 36×48 battlefield is 1,728 of them: neighbouring
 * squares along a row with one key and one height merge into a single
 * parallelogram, which keeps the path short and leaves no hairline seam
 * between them. A square whose key is undefined isn't drawn. Keys come in the
 * order they're first met.
 */
export function isoRuns<K>(view: IsoView, keyOf: (square: number) => K | undefined): IsoRun<K>[] {
    const runs = new Map<K, string[]>();
    for (let row = 0; row < view.height; row++) {
        let col = 0;
        while (col < view.width) {
            const start = row * view.width + col;
            const key = keyOf(start);
            const height = view.heights[start];
            let end = col + 1;
            while (end < view.width && keyOf(row * view.width + end) === key && view.heights[row * view.width + end] === height) end++;
            if (key !== undefined) {
                const corners = [isoPoint(view, col, row, height), isoPoint(view, end, row, height), isoPoint(view, end, row + 1, height), isoPoint(view, col, row + 1, height)];
                const path = runs.get(key) ?? [];
                path.push(`M${corners.map(({ x, y }) => `${x} ${y}`).join("L")}z`);
                runs.set(key, path);
            }
            col = end;
        }
    }
    return [...runs].map(([key, path]) => ({ key, d: path.join("") }));
}

/** A raised square as SVG `points` lists: its top, and each front face that shows. */
export interface IsoBlock {
    top: string;
    /** The face toward the next row, where the square there is lower. */
    left: string | null;
    /** The face toward the next column, where the square there is lower. */
    right: string | null;
}

/**
 * A square drawn as a block: its top at its own height, and each of its two
 * front faces down to the square in front of it, where that one is lower.
 * Faces down to the ground at the map's front edges, where the slab
 * (`isoSlab`) carries on below. The back faces never show.
 */
export function isoBlock(view: IsoView, square: number): IsoBlock {
    const { col, row } = colRow(view, square);
    const h = view.heights[square];
    const below = (c: number, r: number) => Math.min(h, heightAt(view, c, r));
    const front = isoPoint(view, col + 1, row + 1, h);
    const leftLow = below(col, row + 1), rightLow = below(col + 1, row);
    return {
        top: points(isoPoint(view, col, row, h), isoPoint(view, col + 1, row, h), front, isoPoint(view, col, row + 1, h)),
        left: leftLow < h
            ? points(isoPoint(view, col, row + 1, h), front, isoPoint(view, col + 1, row + 1, leftLow), isoPoint(view, col, row + 1, leftLow))
            : null,
        right: rightLow < h
            ? points(front, isoPoint(view, col + 1, row, h), isoPoint(view, col + 1, row, rightLow), isoPoint(view, col + 1, row + 1, rightLow))
            : null,
    };
}

/** The ground the whole map stands on: its top, and its two front faces down to `base`. */
export function isoSlab(view: IsoView): { top: string; left: string; right: string } {
    const { width: w, height: h, base } = view;
    return {
        top: isoArea(view, { x: 0, y: 0, width: w, height: h }),
        left: points(isoPoint(view, 0, h, 0), isoPoint(view, w, h, 0), isoPoint(view, w, h, -base), isoPoint(view, 0, h, -base)),
        right: points(isoPoint(view, w, h, 0), isoPoint(view, w, 0, 0), isoPoint(view, w, 0, -base), isoPoint(view, w, h, -base)),
    };
}

/** The lines between the squares, on the ground: anything raised is drawn over them. */
export function isoGridLines(view: IsoView): string {
    const lines: string[] = [];
    const line = (a: Point, b: Point) => lines.push(`M${a.x} ${a.y}L${b.x} ${b.y}`);
    for (let col = 0; col <= view.width; col++) line(isoPoint(view, col, 0, 0), isoPoint(view, col, view.height, 0));
    for (let row = 0; row <= view.height; row++) line(isoPoint(view, 0, row, 0), isoPoint(view, view.width, row, 0));
    return lines.join("");
}

/**
 * The square drawn under a point of the board, or undefined off the map: the
 * front-most one whose block — its top, or a face below it — covers the
 * point, since that's the one a player sees and meant to tap.
 *
 * A point on a block at height `t` is the point on the ground lifted by `t`
 * storeys, and lifting moves it the same distance along both the grid's axes.
 * So the point lies on a square's block exactly when some lift between none
 * and the square's height lands it inside the square — two intervals to
 * intersect, rather than any polygon.
 */
export function isoSquareAt(view: IsoView, x: number, y: number): number | undefined {
    const u = (x - view.origin.x) / ISO_HALF_WIDTH;
    const v = (y - view.origin.y) / ISO_HALF_HEIGHT;
    const col0 = (u + v) / 2, row0 = (v - u) / 2;
    const perStorey = ISO_STOREY / (2 * ISO_HALF_HEIGHT);
    let found: number | undefined;
    let foundDepth = -Infinity;
    for (let square = 0; square < view.heights.length; square++) {
        const { col, row } = colRow(view, square);
        if (col + row <= foundDepth) continue;
        // The least lift that brings the point into the square, if any lift
        // up to its height does: a square owns its back edges, not its front.
        const lift = Math.max(0, col - col0, row - row0);
        if (lift <= view.heights[square] * perStorey && lift < col + 1 - col0 && lift < row + 1 - row0) {
            found = square;
            foundDepth = col + row;
        }
    }
    return found;
}
