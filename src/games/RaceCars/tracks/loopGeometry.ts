// The placeholder circuit shape every track without traced art draws (§23.6):
// a rounded rectangle, its rows spaced evenly round the centre line and each
// lane offset across the road. Ashcombe was the only track this shape ever
// served, so it lived inline there; Anglet needing the same construction is
// what makes it a shared piece rather than a second copy of Ashcombe's loop
// math. §23.6's generator, once it exists, samples the real art's centre line
// and replaces a track's `geometry` wholesale — nothing outside the board
// screen reads x/y/heading, so a track can move onto it without this file, or
// this one, changing.
import type { RaceCarsGeometry } from "../board";

/**
 * One straight or one quarter-circle of the centre line, with the length the
 * row spacing is measured along. Clockwise from wherever it starts.
 */
interface LoopSegment {
    length: number;
    /** Where along this segment (0-1) the point and its heading are. */
    at: (t: number) => { x: number; y: number; heading: number };
}

function straight(fromX: number, fromY: number, toX: number, toY: number): LoopSegment {
    const heading = (Math.atan2(toY - fromY, toX - fromX) * 180) / Math.PI;
    return {
        length: Math.hypot(toX - fromX, toY - fromY),
        at: t => ({ x: fromX + (toX - fromX) * t, y: fromY + (toY - fromY) * t, heading }),
    };
}

/** A quarter turn clockwise about (cx, cy), starting at `fromDegrees`. */
function quarter(cx: number, cy: number, radius: number, fromDegrees: number): LoopSegment {
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
 * `laneWidth` sampled once per row round a rounded-rectangle loop sized by
 * `spec`, each lane offset across the road by `lanePitch`. Row 0 sits at the
 * start of the top straight — see ashcombe.ts's history for why a loop and
 * not an unrolled strip.
 */
export function roundedRectGeometry(
    laneWidth: number[],
    spec: RoundedRectLoop,
    lanePitch: number,
): RaceCarsGeometry[] {
    const { width, height, radius, margin } = spec;
    const straightX = width - 2 * radius;
    const straightY = height - 2 * radius;
    const left = margin;
    const top = margin;
    const right = margin + width;
    const bottom = margin + height;

    // Row 0 sits at the start of the top straight, clockwise from there.
    const loop: LoopSegment[] = [
        straight(left + radius, top, right - radius, top),
        quarter(right - radius, top + radius, radius, -90),
        straight(right, top + radius, right, bottom - radius),
        quarter(right - radius, bottom - radius, radius, 0),
        straight(right - radius, bottom, left + radius, bottom),
        quarter(left + radius, bottom - radius, radius, 90),
        straight(left, bottom - radius, left, top + radius),
        quarter(left + radius, top + radius, radius, 180),
    ];
    const loopLength = 2 * straightX + 2 * straightY + 4 * ((Math.PI * radius) / 2);

    /** The centre-line point and heading a given distance round the loop. */
    function alongLoop(distance: number): { x: number; y: number; heading: number } {
        let left2 = ((distance % loopLength) + loopLength) % loopLength;
        for (const segment of loop) {
            if (left2 <= segment.length) return segment.at(left2 / segment.length);
            left2 -= segment.length;
        }
        return loop[0].at(0);
    }

    // Lane 2 rides the centre line and lanes 1 and 3 sit either side of it, so
    // a two-lane row is the three-lane road with its outer lane taken away —
    // which is the merge `stepsFrom` already describes (lane 3 has only lane
    // 2 to go to).
    const CENTRE_LANE = 2;
    const rows = laneWidth.length;

    return laneWidth.flatMap((width2, row) => {
        const centre = alongLoop((row / rows) * loopLength);
        const radians = (centre.heading * Math.PI) / 180;
        // Across the road, to the outside of the loop.
        const acrossX = Math.sin(radians);
        const acrossY = -Math.cos(radians);
        return Array.from({ length: width2 }, (_unused, index) => {
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
