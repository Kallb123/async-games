// Ashcombe Park — the circuit that ships, transcribed from
// docs/games/race-cars.md §5.2: 78 rows, 214 spaces, three corners and one
// very long straight.
//
// The whole circuit is derived from ONE table, `SECTIONS`. Row-by-row lane
// widths and the corner bands are two readings of the same fact, and writing
// them out separately is how a corner comes to sit half on a three-lane row —
// a discrepancy no rule would report, because every rule reads only one of the
// two.
import type { RaceCarsCorner, RaceCarsGeometry, RaceCarsTrack } from "../board";

interface AshcombeSection {
    name: string;
    /** Inclusive row band. */
    from: number;
    to: number;
    lanes: 2 | 3;
    /** Corner id and stop count, or null for a straight. */
    corner: { id: string; stops: 1 | 2 } | null;
}

const SECTIONS: AshcombeSection[] = [
    { name: 'Start / Finish Straight', from: 0, to: 9, lanes: 3, corner: null },
    { name: 'Ashcombe Hairpin', from: 10, to: 14, lanes: 2, corner: { id: 'hairpin', stops: 2 } },
    { name: 'The Mile', from: 15, to: 46, lanes: 3, corner: null },
    { name: 'Gravel Bend', from: 47, to: 51, lanes: 2, corner: { id: 'gravel', stops: 1 } },
    { name: 'Woodland Esses', from: 52, to: 61, lanes: 2, corner: null },
    { name: 'The Kink', from: 62, to: 65, lanes: 3, corner: { id: 'kink', stops: 1 } },
    { name: 'Run to the Line', from: 66, to: 77, lanes: 3, corner: null },
];

const ROWS = SECTIONS[SECTIONS.length - 1].to + 1;

const LANE_WIDTH: number[] = SECTIONS.flatMap(
    section => Array.from({ length: section.to - section.from + 1 }, () => section.lanes),
);

const CORNERS: RaceCarsCorner[] = SECTIONS
    .filter(section => section.corner !== null)
    .map(section => ({
        id: section.corner!.id,
        name: section.name,
        from: section.from,
        to: section.to,
        stops: section.corner!.stops,
    }));

// Placeholder geometry (§23.7 PR 1): the circuit drawn as a plain
// rounded-rectangle loop, the 78 rows spaced evenly round its centre line and
// each lane offset across it. It exists so the rules — and, from PR 4, the
// board screen — can be driven before any art is drawn; §23.6's generator
// samples the real centre line and replaces this wholesale. Nothing outside
// the board screen reads x/y/heading, so replacing it changes no rule.
//
// A loop rather than the unrolled strip this started as, for one reason: a
// strip puts all 78 rows along one axis, which is the 17:1 rectangle §19.2
// measures at five pixels a row in a 400px column. Folded into a loop the same
// rows are three times that, which is what makes PR 4 playable by hand — and
// it is also the shape the real circuit is, so the board screen is not being
// written against geometry it will never see again.
const TRACK_WIDTH = 700;
const TRACK_HEIGHT = 380;
const TRACK_RADIUS = 130;
/** Gap between neighbouring lanes, across the road. */
const LANE_PITCH = 22;
/** Room round the loop for the cars, the corner-stop pips and the corner names. */
const MARGIN = 64;

/**
 * One straight or one quarter-circle of the centre line, with the length the
 * row spacing is measured along. Clockwise from the top-left corner's end.
 */
interface LoopSegment {
    length: number;
    /** Where along this segment (0-1) the point and its heading are. */
    at: (t: number) => { x: number; y: number; heading: number };
}

const STRAIGHT_X = TRACK_WIDTH - 2 * TRACK_RADIUS;
const STRAIGHT_Y = TRACK_HEIGHT - 2 * TRACK_RADIUS;
const QUARTER = (Math.PI * TRACK_RADIUS) / 2;

function straight(fromX: number, fromY: number, toX: number, toY: number): LoopSegment {
    const heading = (Math.atan2(toY - fromY, toX - fromX) * 180) / Math.PI;
    return {
        length: Math.hypot(toX - fromX, toY - fromY),
        at: t => ({ x: fromX + (toX - fromX) * t, y: fromY + (toY - fromY) * t, heading }),
    };
}

/** A quarter turn clockwise about (cx, cy), starting at `fromDegrees`. */
function quarter(cx: number, cy: number, fromDegrees: number): LoopSegment {
    return {
        length: QUARTER,
        at: t => {
            const angle = ((fromDegrees + 90 * t) * Math.PI) / 180;
            return {
                x: cx + TRACK_RADIUS * Math.cos(angle),
                y: cy + TRACK_RADIUS * Math.sin(angle),
                // A clockwise arc's tangent is its radius turned a quarter on.
                heading: fromDegrees + 90 * t + 90,
            };
        },
    };
}

const LEFT = MARGIN;
const TOP = MARGIN;
const RIGHT = MARGIN + TRACK_WIDTH;
const BOTTOM = MARGIN + TRACK_HEIGHT;

// Row 0 — the start/finish line — sits at the start of the top straight, so
// the Start / Finish Straight and the run to the line share the top edge.
const LOOP: LoopSegment[] = [
    straight(LEFT + TRACK_RADIUS, TOP, RIGHT - TRACK_RADIUS, TOP),
    quarter(RIGHT - TRACK_RADIUS, TOP + TRACK_RADIUS, -90),
    straight(RIGHT, TOP + TRACK_RADIUS, RIGHT, BOTTOM - TRACK_RADIUS),
    quarter(RIGHT - TRACK_RADIUS, BOTTOM - TRACK_RADIUS, 0),
    straight(RIGHT - TRACK_RADIUS, BOTTOM, LEFT + TRACK_RADIUS, BOTTOM),
    quarter(LEFT + TRACK_RADIUS, BOTTOM - TRACK_RADIUS, 90),
    straight(LEFT, BOTTOM - TRACK_RADIUS, LEFT, TOP + TRACK_RADIUS),
    quarter(LEFT + TRACK_RADIUS, TOP + TRACK_RADIUS, 180),
];

const LOOP_LENGTH = 2 * STRAIGHT_X + 2 * STRAIGHT_Y + 4 * QUARTER;

/** The centre-line point and heading a given distance round the loop. */
function alongLoop(distance: number): { x: number; y: number; heading: number } {
    let left = ((distance % LOOP_LENGTH) + LOOP_LENGTH) % LOOP_LENGTH;
    for (const segment of LOOP) {
        if (left <= segment.length) return segment.at(left / segment.length);
        left -= segment.length;
    }
    return LOOP[0].at(0);
}

// Lane 2 rides the centre line and lanes 1 and 3 sit either side of it, so a
// two-lane row is the three-lane road with its outer lane taken away — which
// is the merge `stepsFrom` already describes (lane 3 has only lane 2 to go to).
const CENTRE_LANE = 2;

const GEOMETRY: RaceCarsGeometry[] = LANE_WIDTH.flatMap((width, row) => {
    const centre = alongLoop((row / ROWS) * LOOP_LENGTH);
    const radians = (centre.heading * Math.PI) / 180;
    // Across the road, to the outside of the loop.
    const acrossX = Math.sin(radians);
    const acrossY = -Math.cos(radians);
    return Array.from({ length: width }, (_unused, index) => {
        const offset = (index + 1 - CENTRE_LANE) * LANE_PITCH;
        return {
            row,
            lane: index + 1,
            x: centre.x + acrossX * offset,
            y: centre.y + acrossY * offset,
            heading: centre.heading,
        };
    });
});

export const ASHCOMBE: RaceCarsTrack = {
    id: 'ashcombe',
    name: 'Ashcombe Park',
    rows: ROWS,
    laneWidth: LANE_WIDTH,
    corners: CORNERS,
    // Six staggered spaces on rows 0-2, lanes 1 and 3, so no car starts
    // directly behind another (§5.2). P1 first.
    grid: [
        { row: 2, lane: 1 },
        { row: 2, lane: 3 },
        { row: 1, lane: 1 },
        { row: 1, lane: 3 },
        { row: 0, lane: 1 },
        { row: 0, lane: 3 },
    ],
    // Five, not six, and deliberately (§8.3): sixth needs roughly seventy
    // unbroken rows to climb to, which is most of a lap of Ashcombe. The gear
    // itself is specified and tested; the permission lives here.
    maxGear: 5,
    art: {
        // Drawn in PR 8 (§23.6). The board screen falls back to the space layer
        // alone until the file lands.
        href: '/art/racecars/ashcombe.png',
        viewBox: {
            width: MARGIN * 2 + TRACK_WIDTH,
            height: MARGIN * 2 + TRACK_HEIGHT,
        },
    },
    geometry: GEOMETRY,
};
