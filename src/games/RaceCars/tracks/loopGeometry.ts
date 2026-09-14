// Placeholder circuit shapes for tracks without a real centre line sampled
// from their art (§23.6): a rounded rectangle for a track with no art yet
// (Ashcombe), or a straight-edged polyline through waypoints traced by eye off
// real art for a track that has some (Anglet) but not yet the build-time
// generator §23.6 describes — both are stand-ins for that one script, so they
// share everything that isn't the shape itself. Ashcombe was the only track
// either ever served, so each lived inline in its own track file; a second
// track needing the same row-sampling tail is what makes it a shared piece
// rather than a second copy. Nothing outside the board screen reads
// x/y/heading, so a track can move onto the real generator without this file,
// or this one, changing.
import type { RaceCarsGeometry } from "../board";

/**
 * One stretch of the centre line, with the length the row spacing is measured
 * along.
 */
interface PathSegment {
    length: number;
    /** Where along this segment (0-1) the point and its heading are. */
    at: (t: number) => { x: number; y: number; heading: number };
}

/**
 * `laneWidth` sampled once per row along a closed path built from `segments`
 * (total length `pathLength`), each lane offset across the road by
 * `lanePitch`. Row 0 sits at the start of the first segment.
 */
function sampleCentreline(
    laneWidth: number[],
    lanePitch: number,
    pathLength: number,
    segments: PathSegment[],
): RaceCarsGeometry[] {
    /** The centre-line point and heading a given distance round the path. */
    function alongPath(distance: number): { x: number; y: number; heading: number } {
        let remaining = ((distance % pathLength) + pathLength) % pathLength;
        for (const segment of segments) {
            if (remaining <= segment.length) return segment.at(remaining / segment.length);
            remaining -= segment.length;
        }
        return segments[0].at(0);
    }

    // Lane 2 rides the centre line and lanes 1 and 3 sit either side of it, so
    // a two-lane row is the three-lane road with its outer lane taken away —
    // which is the merge `stepsFrom` already describes (lane 3 has only lane
    // 2 to go to).
    const CENTRE_LANE = 2;
    const rows = laneWidth.length;

    return laneWidth.flatMap((lanes, row) => {
        const centre = alongPath((row / rows) * pathLength);
        const radians = (centre.heading * Math.PI) / 180;
        // Across the road, to the outside of the loop.
        const acrossX = Math.sin(radians);
        const acrossY = -Math.cos(radians);
        return Array.from({ length: lanes }, (_unused, index) => {
            const offset = (index + 1 - CENTRE_LANE) * lanePitch;
            return {
                row,
                lane: index + 1,
                x: centre.x + acrossX * offset,
                y: centre.y + acrossY * offset,
                heading: centre.heading,
            };
        });
    });
}

function straight(fromX: number, fromY: number, toX: number, toY: number): PathSegment {
    const heading = (Math.atan2(toY - fromY, toX - fromX) * 180) / Math.PI;
    return {
        length: Math.hypot(toX - fromX, toY - fromY),
        at: t => ({ x: fromX + (toX - fromX) * t, y: fromY + (toY - fromY) * t, heading }),
    };
}

/** A quarter turn clockwise about (cx, cy), starting at `fromDegrees`. */
function quarter(cx: number, cy: number, radius: number, fromDegrees: number): PathSegment {
    return {
        length: (Math.PI * radius) / 2,
        at: t => {
            const angle = ((fromDegrees + 90 * t) * Math.PI) / 180;
            return {
                x: cx + radius * Math.cos(angle),
                y: cy + radius * Math.sin(angle),
                // A clockwise arc's tangent is its radius turned a quarter on.
                heading: fromDegrees + 90 * t + 90,
            };
        },
    };
}

export interface RoundedRectLoop {
    /** Width and height of the rectangle the centre line runs round. */
    width: number;
    height: number;
    radius: number;
    /** Room round the loop for the cars, the corner-stop pips and the names. */
    margin: number;
}

/**
 * A rounded-rectangle loop sized by `spec` — the shape for a track with no
 * art of its own yet, so there is nothing for the loop to resemble beyond
 * "a circuit". Row 0 sits at the start of the top straight — see
 * ashcombe.ts's history for why a loop and not an unrolled strip.
 */
export function roundedRectGeometry(
    laneWidth: number[],
    spec: RoundedRectLoop,
    lanePitch: number,
): RaceCarsGeometry[] {
    const { width: rectWidth, height: rectHeight, radius, margin } = spec;
    const straightX = rectWidth - 2 * radius;
    const straightY = rectHeight - 2 * radius;
    const left = margin;
    const top = margin;
    const right = margin + rectWidth;
    const bottom = margin + rectHeight;

    // Row 0 sits at the start of the top straight, clockwise from there.
    const segments: PathSegment[] = [
        straight(left + radius, top, right - radius, top),
        quarter(right - radius, top + radius, radius, -90),
        straight(right, top + radius, right, bottom - radius),
        quarter(right - radius, bottom - radius, radius, 0),
        straight(right - radius, bottom, left + radius, bottom),
        quarter(left + radius, bottom - radius, radius, 90),
        straight(left, bottom - radius, left, top + radius),
        quarter(left + radius, top + radius, radius, 180),
    ];
    const pathLength = 2 * straightX + 2 * straightY + 4 * ((Math.PI * radius) / 2);

    return sampleCentreline(laneWidth, lanePitch, pathLength, segments);
}

export interface Waypoint {
    x: number;
    y: number;
}

/**
 * A closed, straight-edged path through `waypoints` (wrapping from the last
 * back to the first) — the shape for a track whose art exists but whose real
 * centre line has not been traced into a path by §23.6's generator yet.
 * Row 0 sits at the first waypoint, and each corner still gets a heading
 * change only at the waypoint nearest its row band, which is a coarser turn
 * than the road actually draws — a straight-line placeholder standing in for
 * a curve, same as the rounded rectangle stands in for a real circuit's
 * corners.
 */
export function polylineGeometry(
    laneWidth: number[],
    waypoints: Waypoint[],
    lanePitch: number,
): RaceCarsGeometry[] {
    const segments: PathSegment[] = waypoints.map((point, index) => {
        const next = waypoints[(index + 1) % waypoints.length];
        return straight(point.x, point.y, next.x, next.y);
    });
    const pathLength = segments.reduce((total, segment) => total + segment.length, 0);

    return sampleCentreline(laneWidth, lanePitch, pathLength, segments);
}
