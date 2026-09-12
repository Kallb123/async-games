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

// Placeholder geometry: the circuit unrolled into a straight strip, one column
// of spaces per row, narrow rows centred in the three-lane band. It exists so
// the rules can be driven and tested before any art is drawn (§23.7 PR 1) —
// the generator of §23.6 replaces this wholesale, and nothing outside the
// board screen reads x/y/heading, so replacing it changes no rule.
const ROW_PITCH = 20;
const LANE_PITCH = 22;
const MARGIN = 24;
const WIDEST_ROW = 3;

const GEOMETRY: RaceCarsGeometry[] = LANE_WIDTH.flatMap((width, row) =>
    Array.from({ length: width }, (_unused, index) => ({
        row,
        lane: index + 1,
        x: MARGIN + row * ROW_PITCH,
        y: MARGIN + (index + (WIDEST_ROW - width) / 2) * LANE_PITCH,
        // Every space on an unrolled strip points the same way: along the rows.
        heading: 0,
    })),
);

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
            width: MARGIN * 2 + (ROWS - 1) * ROW_PITCH,
            height: MARGIN * 2 + (WIDEST_ROW - 1) * LANE_PITCH,
        },
    },
    geometry: GEOMETRY,
};
