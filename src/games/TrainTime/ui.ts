// Presentation helpers for the Train Time board: the printed-map palette and
// the geometry that turns a route definition into the dashed run of track
// drawn between two cities. Pure maths — no React — so the board component
// stays a thin map over these.

import type { CSSProperties } from "react";
import { CITIES, ROUTES, TrainTimeCardColour, TrainTimeRouteColour, TrainTimeRouteDef } from "./board";

export interface TrackPalette {
    /** Solid fill: the track on the map, and a card's face. */
    fill: string;
    /** Outline, for a card sitting on parchment. */
    stroke: string;
    /** Readable text colour on top of `fill`. */
    ink: string;
}

// The printed-map inks from the design: warmer and more muted than raw card
// colours, so eight of them can sit on parchment without shouting. Real
// printed-colour values rather than ag-* accents — the eight carriage colours
// have to stay recognisably themselves wherever they appear.
export const TRACK_PALETTE: Record<TrainTimeRouteColour | 'engine', TrackPalette> = {
    red: { fill: '#c0392b', stroke: '#9c2f24', ink: '#fff' },
    orange: { fill: '#d97a2b', stroke: '#b46222', ink: '#fff' },
    yellow: { fill: '#e0a92e', stroke: '#bb8b24', ink: '#3a2a06' },
    green: { fill: '#2f8f6a', stroke: '#257356', ink: '#fff' },
    blue: { fill: '#2f6fb0', stroke: '#265a8f', ink: '#fff' },
    purple: { fill: '#7d5aa8', stroke: '#664989', ink: '#fff' },
    white: { fill: '#f2e8d5', stroke: '#cbbfa4', ink: '#3a3226' },
    black: { fill: '#45454f', stroke: '#33333b', ink: '#fff' },
    grey: { fill: '#b9a888', stroke: '#9c8d70', ink: '#2f2a20' },
    engine: { fill: '#dba63c', stroke: '#b98a2c', ink: '#2a1a08' },
};

// An Engine card is brass rather than flat colour, so a wild reads as
// something other than "another yellow" on the market row and in the hand.
const ENGINE_BACKGROUND = 'linear-gradient(150deg, oklch(0.82 0.11 82), oklch(0.68 0.13 74))';

/**
 * The paint for one carriage-card face. Every place a card is shown — the
 * face-up row, the hand, a payment option on the claim sheet — is the same
 * painted rectangle at a different size, so a Loco always reads as brass and a
 * Black always as slate. A style rather than a component, since those three
 * places are a button, a div and a span.
 */
export function cardFaceStyle(colour: TrainTimeCardColour): CSSProperties {
    return {
        background: colour === 'engine' ? ENGINE_BACKGROUND : TRACK_PALETTE[colour].fill,
        color: TRACK_PALETTE[colour].ink,
    };
}

export const CARD_LABEL: Record<TrainTimeCardColour, string> = {
    red: 'Red', orange: 'Orange', yellow: 'Yellow', green: 'Green', blue: 'Blue',
    purple: 'Purple', white: 'White', black: 'Black', engine: 'Loco',
};

export interface RouteGeometry {
    /** The run of track between the two city dots, clear of both. */
    trackPath: string;
    /** Dash pattern drawing exactly one dash per train space. */
    dashArray: string;
    /** Midpoint of the track, for the tap target's label. */
    midX: number;
    midY: number;
}

// Leaves the city dots uncovered at each end of a route.
const CITY_CLEARANCE = 16;
// How far the two halves of a double route sit either side of the centre line.
const DOUBLE_OFFSET = 8;
const CURVE_SAMPLES = 160;
// Of each train space's stretch of track, how much is ink rather than gap.
const DASH_DUTY = 0.72;

/**
 * Samples the quadratic curve between two cities (bent by `bend`, shifted
 * sideways for the two halves of a double route), trims the ends clear of the
 * city dots, and picks the dash pattern that lays exactly one dash per train
 * space along what's left — so a 4-length route reads as four carriages
 * without needing a number printed on it.
 */
function buildGeometry(route: TrainTimeRouteDef): RouteGeometry {
    const a = CITIES[route.cityA];
    const b = CITIES[route.cityB];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const span = Math.hypot(dx, dy) || 1;
    const shift = route.side * DOUBLE_OFFSET;

    // Control point: the midpoint pushed out along the segment's normal.
    const cx = (a.x + b.x) / 2 + (-dy / span) * route.bend;
    const cy = (a.y + b.y) / 2 + (dx / span) * route.bend;

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
        const step = cumulative[i] - cumulative[i - 1] || 1;
        const t = (distance - cumulative[i - 1]) / step;
        return {
            x: points[i - 1][0] + (points[i][0] - points[i - 1][0]) * t,
            y: points[i - 1][1] + (points[i][1] - points[i - 1][1]) * t,
        };
    };

    // A short polyline through the trimmed stretch: enough points to keep a
    // bend smooth, few enough to keep the markup small.
    const usable = Math.max(total - 2 * CITY_CLEARANCE, 1);
    const steps = route.bend === 0 ? 1 : 16;
    const path = Array.from({ length: steps + 1 }, (_, i) => {
        const { x, y } = at(CITY_CLEARANCE + (usable * i) / steps);
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');

    const stretch = usable / route.length;
    const mid = at(total / 2);
    return {
        trackPath: path,
        dashArray: `${(stretch * DASH_DUTY).toFixed(2)} ${(stretch * (1 - DASH_DUTY)).toFixed(2)}`,
        midX: mid.x,
        midY: mid.y,
    };
}

// The map never changes, so every route's geometry is built once at module load.
export const ROUTE_GEOMETRY: RouteGeometry[] = ROUTES.map(buildGeometry);

/** Offset + anchor for a city's name label, keyed by which side it sits on. */
export const CITY_LABEL_OFFSET: Record<'n' | 's' | 'e' | 'w', { dx: number; dy: number; anchor: 'start' | 'middle' | 'end' }> = {
    n: { dx: 0, dy: -14, anchor: 'middle' },
    s: { dx: 0, dy: 24, anchor: 'middle' },
    e: { dx: 13, dy: 6, anchor: 'start' },
    w: { dx: -13, dy: 6, anchor: 'end' },
};
