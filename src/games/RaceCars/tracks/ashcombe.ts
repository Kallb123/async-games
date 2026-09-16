// Ashcombe Park — the circuit that ships, transcribed from
// docs/games/race-cars.md §5.2: 78 rows, 214 spaces, three corners and one
// very long straight.
import type { RaceCarsTrack } from "../board";
import { roundedRectGeometry } from "./loopGeometry";
import { deriveTrack, plainTileId, spacesOf, type TrackSection } from "./sections";

const SECTIONS: TrackSection[] = [
    { id: 'start', name: 'Start / Finish Straight', length: 10, lanes: 3, corner: null },
    { id: 'hairpin', name: 'Ashcombe Hairpin', length: 5, lanes: 2, corner: { stops: 2 } },
    { id: 'mile', name: 'The Mile', length: 32, lanes: 3, corner: null },
    { id: 'gravel', name: 'Gravel Bend', length: 5, lanes: 2, corner: { stops: 1 } },
    { id: 'esses', name: 'Woodland Esses', length: 10, lanes: 2, corner: null },
    { id: 'kink', name: 'The Kink', length: 4, lanes: 3, corner: { stops: 1 } },
    { id: 'run', name: 'Run to the Line', length: 12, lanes: 3, corner: null },
];

const DERIVED = deriveTrack(SECTIONS);
const { rows: ROWS, spaces: SPACES, corners: CORNERS } = DERIVED;

/**
 * Six staggered slots on the first three rows of the grid straight, lanes 1 and
 * 3, so no car starts directly behind another (§5.2). P1 first.
 *
 * Named as tiles and resolved through the derivation, like every other
 * circuit's: a slot written as a row and a lane is a guess at what the rows will
 * come out as, and Anglet is what a wrong guess costs (`anglet.ts`).
 */
const GRID = spacesOf(DERIVED, [2, 1, 0].flatMap(index => [
    plainTileId("start", 1, index),
    plainTileId("start", 3, index),
]));

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
    ROWS,
    SPACES,
    { width: TRACK_WIDTH, height: TRACK_HEIGHT, radius: TRACK_RADIUS, margin: MARGIN },
    LANE_PITCH,
);

export const ASHCOMBE: RaceCarsTrack = {
    id: 'ashcombe',
    name: 'Ashcombe Park',
    rows: ROWS,
    spaces: SPACES,
    corners: CORNERS,
    grid: GRID,
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
