// Presentation helpers for the Train Time board: the card/track palette and
// the geometry that turns a route definition into the little carriage-shaped
// blocks drawn between two cities. Pure maths — no React — so the board
// component stays a thin map over these.

import { CITIES, ROUTES, TrainTimeCardColour, TrainTimeRouteColour, TrainTimeRouteDef } from "./board";

export interface TrackPalette {
    /** Block fill. */
    fill: string;
    /** Block outline. */
    stroke: string;
    /** Readable text colour on top of `fill`. */
    ink: string;
}

// Card and track colours are printed colours, not theme accents, so they're
// literal here rather than ag-* tokens — the eight carriage colours have to
// stay recognisably themselves on every screen.
export const TRACK_PALETTE: Record<TrainTimeRouteColour | 'engine', TrackPalette> = {
    red: { fill: '#e2574c', stroke: '#c0453b', ink: '#fff' },
    orange: { fill: '#ef9138', stroke: '#cf762a', ink: '#4a2a06' },
    yellow: { fill: '#f3c53f', stroke: '#d5a627', ink: '#4a3706' },
    green: { fill: '#43ad5c', stroke: '#34904a', ink: '#fff' },
    blue: { fill: '#3f8fd4', stroke: '#2f75b4', ink: '#fff' },
    purple: { fill: '#b06bc8', stroke: '#9354ab', ink: '#fff' },
    white: { fill: '#fbf8f0', stroke: '#cfc8b6', ink: '#3a3226' },
    black: { fill: '#4b5561', stroke: '#38424c', ink: '#fff' },
    grey: { fill: '#c4ccd3', stroke: '#a7b1b9', ink: '#2f3f4d' },
    engine: { fill: '#f0e6d2', stroke: '#b9a888', ink: '#4a3706' },
};

export const CARD_LABEL: Record<TrainTimeCardColour, string> = {
    red: 'Red', orange: 'Orange', yellow: 'Yellow', green: 'Green', blue: 'Blue',
    purple: 'Purple', white: 'White', black: 'Black', engine: 'Engine',
};

/** One carriage block on a route, positioned and rotated along the track. */
export interface TrackBlock {
    x: number;
    y: number;
    angle: number;
    width: number;
}

export interface RouteGeometry {
    blocks: TrackBlock[];
    /** Midpoint of the track, for the length badge and the tap target. */
    midX: number;
    midY: number;
    /** The whole track as a path, used as a fat invisible tap target. */
    path: string;
}

const BLOCK_HEIGHT = 12;
const BLOCK_GAP = 4.2;
// Leaves the city dots uncovered at each end of a route.
const CITY_CLEARANCE = 17;
// How far the two halves of a double route sit either side of the centre line.
const DOUBLE_OFFSET = 8;
const CURVE_SAMPLES = 160;

/**
 * Samples the quadratic curve between two cities (bent by `bend`, shifted
 * sideways by `side` for double routes) and walks it at even spacing to place
 * one block per train space.
 */
function buildGeometry(route: TrainTimeRouteDef): RouteGeometry {
    const a = CITIES[route.cityA];
    const b = CITIES[route.cityB];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    const shift = route.side * DOUBLE_OFFSET;

    // Control point: the midpoint pushed out along the segment's normal.
    const cx = (a.x + b.x) / 2 + (-dy / length) * route.bend;
    const cy = (a.y + b.y) / 2 + (dx / length) * route.bend;

    const points: [number, number][] = [];
    for (let i = 0; i <= CURVE_SAMPLES; i++) {
        const t = i / CURVE_SAMPLES;
        const m = 1 - t;
        const px = m * m * a.x + 2 * m * t * cx + t * t * b.x;
        const py = m * m * a.y + 2 * m * t * cy + t * t * b.y;
        const tx = 2 * m * (cx - a.x) + 2 * t * (b.x - cx);
        const ty = 2 * m * (cy - a.y) + 2 * t * (b.y - cy);
        const tl = Math.hypot(tx, ty) || 1;
        points.push([px + (-ty / tl) * shift, py + (tx / tl) * shift]);
    }

    const cumulative = [0];
    for (let i = 1; i < points.length; i++) {
        cumulative.push(cumulative[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
    }
    const total = cumulative[cumulative.length - 1];

    const at = (distance: number) => {
        let i = 1;
        while (i < cumulative.length - 1 && cumulative[i] < distance) i++;
        const span = cumulative[i] - cumulative[i - 1] || 1;
        const t = (distance - cumulative[i - 1]) / span;
        return {
            x: points[i - 1][0] + (points[i][0] - points[i - 1][0]) * t,
            y: points[i - 1][1] + (points[i][1] - points[i - 1][1]) * t,
            angle: Math.atan2(points[i][1] - points[i - 1][1], points[i][0] - points[i - 1][0]) * 180 / Math.PI,
        };
    };

    const usable = total - 2 * CITY_CLEARANCE;
    const step = usable / route.length;
    const blocks: TrackBlock[] = [];
    for (let i = 0; i < route.length; i++) {
        const { x, y, angle } = at(CITY_CLEARANCE + (i + 0.5) * step);
        blocks.push({ x, y, angle, width: Math.max(step - BLOCK_GAP, 6) });
    }

    const mid = at(total / 2);
    return {
        blocks,
        midX: mid.x,
        midY: mid.y,
        path: `M ${a.x} ${a.y} Q ${cx + (-dy / length) * shift} ${cy + (dx / length) * shift} ${b.x} ${b.y}`,
    };
}

// The map never changes, so every route's geometry is built once at module load.
export const ROUTE_GEOMETRY: RouteGeometry[] = ROUTES.map(buildGeometry);

export const TRACK_BLOCK_HEIGHT = BLOCK_HEIGHT;

/** Offset + anchor for a city's name label, keyed by which side it sits on. */
export const CITY_LABEL_OFFSET: Record<'n' | 's' | 'e' | 'w', { dx: number; dy: number; anchor: 'start' | 'middle' | 'end' }> = {
    n: { dx: 0, dy: -19, anchor: 'middle' },
    s: { dx: 0, dy: 25, anchor: 'middle' },
    e: { dx: 15, dy: 4.5, anchor: 'start' },
    w: { dx: -15, dy: 4.5, anchor: 'end' },
};
