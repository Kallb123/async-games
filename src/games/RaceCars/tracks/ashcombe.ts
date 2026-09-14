// Ashcombe Park — the circuit that ships, transcribed from
// docs/games/race-cars.md §5.2: 78 rows, 214 spaces, three corners and one
// very long straight.
import type { RaceCarsTrack } from "../board";
import { roundedRectGeometry } from "./loopGeometry";
import { deriveTrack, STAGGERED_SIX_GRID, type TrackSection } from "./sections";

const SECTIONS: TrackSection[] = [
    { name: 'Start / Finish Straight', from: 0, to: 9, lanes: 3, corner: null },
    { name: 'Ashcombe Hairpin', from: 10, to: 14, lanes: 2, corner: { id: 'hairpin', stops: 2 } },
    { name: 'The Mile', from: 15, to: 46, lanes: 3, corner: null },
    { name: 'Gravel Bend', from: 47, to: 51, lanes: 2, corner: { id: 'gravel', stops: 1 } },
    { name: 'Woodland Esses', from: 52, to: 61, lanes: 2, corner: null },
    { name: 'The Kink', from: 62, to: 65, lanes: 3, corner: { id: 'kink', stops: 1 } },
    { name: 'Run to the Line', from: 66, to: 77, lanes: 3, corner: null },
];

const { rows: ROWS, laneWidth: LANE_WIDTH, corners: CORNERS } = deriveTrack(SECTIONS);

// Placeholder geometry (§23.7 PR 1): the circuit drawn as a plain
// rounded-rectangle loop (`loopGeometry.ts`), the 78 rows spaced evenly round
// its centre line and each lane offset across it. It exists so the rules —
// and, from PR 4, the board screen — can be driven before any art is drawn;
// §23.6's generator samples the real centre line and replaces this wholesale.
// Nothing outside the board screen reads x/y/heading, so replacing it changes
// no rule.
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

const GEOMETRY = roundedRectGeometry(
    LANE_WIDTH,
    { width: TRACK_WIDTH, height: TRACK_HEIGHT, radius: TRACK_RADIUS, margin: MARGIN },
    LANE_PITCH,
);

export const ASHCOMBE: RaceCarsTrack = {
    id: 'ashcombe',
    name: 'Ashcombe Park',
    rows: ROWS,
    laneWidth: LANE_WIDTH,
    corners: CORNERS,
    grid: STAGGERED_SIX_GRID,
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
