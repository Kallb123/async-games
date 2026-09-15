// Anglet Chambre d'Amour — the second circuit (§20's first iteration hook): a
// tighter, seven-corner street course transcribed off the board art at
// art-masters/racecars/anglet.png, read start/finish and clockwise. Two of
// its chicanes (VVF and La Barre) are marked on that art with a doubled
// "STOP" pip rather than one, which is what `stops: 2` is for — Ashcombe's
// own Hairpin already proved the field, this is the second track exercising
// it rather than a new rule.
import type { RaceCarsTrack } from "../board";
import { polylineGeometry, type Waypoint } from "./loopGeometry";
import { deriveTrack, STAGGERED_SIX_GRID, type TrackSection } from "./sections";

// Read off the art in the direction its arrows run: out of the grid along the
// seafront, round the harbour hook at the far end (Port Sweep into the tight
// Chambre d'Amour hairpin the circuit is named for, out again through Sables
// d'Or), back along the villas through the two doubled-stop chicanes, and
// home through Villa Hairpin — the loop back beside the grid the art draws
// right next to the start/finish line, same as it draws Chambre d'Amour at
// the opposite end.
//
// Section lengths are chosen so each corner falls at its own fraction of the
// way round that same path (nothing reads x/y as a rule, so a placeholder here
// changes none): Digue ~7%, Port ~32%, Chambre ~38%, Sables ~51%, VVF ~63%,
// La Barre ~75%, Villa ~87% of 98 rows — read off `WAYPOINTS` below, not
// guessed, so where a corner sits in the lap and where it is drawn agree. The
// rows themselves are derived from the sections (`sections.ts`), never typed.
const SECTIONS: TrackSection[] = [
    { id: 'start', name: 'Start / Finish Straight', length: 6, lanes: 3, corner: null },
    { id: 'digue', name: 'La Digue Kink', length: 4, lanes: 2, corner: { stops: 1 } },
    { id: 'front', name: 'Front de Mer', length: 20, lanes: 3, corner: null },
    { id: 'port', name: 'Port Sweep', length: 4, lanes: 2, corner: { stops: 1 } },
    { id: 'jetee', name: 'Jetée Esses', length: 2, lanes: 2, corner: null },
    { id: 'chambre', name: "Chambre d'Amour Hairpin", length: 5, lanes: 2, corner: { stops: 1 } },
    { id: 'sablesStraight', name: "Sables d'Or Straight", length: 7, lanes: 3, corner: null },
    { id: 'sables', name: "Sables d'Or Bend", length: 4, lanes: 2, corner: { stops: 1 } },
    { id: 'vvfEsses', name: 'VVF Esses', length: 7, lanes: 2, corner: null },
    { id: 'vvf', name: 'VVF Chicane', length: 5, lanes: 2, corner: { stops: 2 } },
    { id: 'barreEsses', name: 'Barre Esses', length: 7, lanes: 2, corner: null },
    { id: 'barre', name: 'La Barre Chicane', length: 5, lanes: 2, corner: { stops: 2 } },
    { id: 'villaApproach', name: 'Villa Approach', length: 7, lanes: 3, corner: null },
    { id: 'villa', name: 'Villa Hairpin', length: 4, lanes: 2, corner: { stops: 1 } },
    { id: 'run', name: 'Run to the Line', length: 11, lanes: 3, corner: null },
];

const { rows: ROWS, spaces: SPACES, corners: CORNERS } = deriveTrack(SECTIONS);

// The art is a real 2835×1843 illustration (art-masters/racecars/anglet.png),
// not a park drawn for this game, so there is a real centre line to read
// waypoints off by eye — one per corner above, plus a few more where a
// straight line between corners would cut across ground the road doesn't
// cover (see the harbour hook below) — in art-pixel coordinates scaled down
// by ~0.292 to sit at Ashcombe's own coordinate scale
// (order of magnitude ~800×500), which is load-bearing: RaceCarsBoard.tsx's
// SPACE_LENGTH/SPACE_WIDTH/CAR_LENGTH and the corner-pip sizing are constants
// tuned to that scale and shared by every track, so a track drawn ten times
// bigger would draw lozenges ten times too small for its own road.
//
// `polylineGeometry` walks these as straight edges rather than a curve, so a
// corner's drawn heading changes sharply at its waypoint instead of easing
// into it — coarser than the road it is standing in for, exactly as
// Ashcombe's rounded rectangle stands in for corners it was never measured
// against. §23.6's generator, sampling the real centre line as a proper path,
// replaces this the same way it replaces Ashcombe's.
// Port, the two unnamed points after it and Chambre d'Amour trace the
// harbour hook's own outer edge — the loop the road actually runs — rather
// than jumping straight from one corner marker to the next, which cuts
// across the field the hook encloses instead of following the road round it.
const WAYPOINTS: Waypoint[] = [
    { x: 285, y: 248 },  // Start/finish, at the grid.
    { x: 397, y: 244 },  // La Digue Kink.
    { x: 745, y: 288 },  // Approaching Port Sweep.
    { x: 789, y: 295 },  // Port Sweep, the harbour hook's near side.
    { x: 805, y: 327 },
    { x: 802, y: 365 },
    { x: 783, y: 393 },  // Chambre d'Amour Hairpin, the harbour hook's tip.
    { x: 716, y: 428 },  // Out of the hook, onto the straight back.
    { x: 571, y: 404 },  // Sables d'Or Bend, the harbour hook's far side.
    { x: 393, y: 370 },  // VVF Chicane.
    { x: 204, y: 354 },  // La Barre Chicane.
    { x: 85, y: 222 },   // Villa Hairpin, the loop back beside the grid.
];

/** Gap between neighbouring lanes, across the road — Ashcombe's own pitch. */
const LANE_PITCH = 22;

const GEOMETRY = polylineGeometry(ROWS, SPACES, WAYPOINTS, LANE_PITCH);

export const ANGLET: RaceCarsTrack = {
    id: 'anglet',
    name: "Anglet Chambre d'Amour",
    rows: ROWS,
    spaces: SPACES,
    corners: CORNERS,
    grid: STAGGERED_SIX_GRID,
    // Four, not five or six: the longest corner-free run (Front de Mer, 20
    // rows) is shorter than Ashcombe's Mile, and this is a tighter, more
    // technical circuit than a straight-line speed one — seven corners to
    // Ashcombe's three, on twenty more rows.
    maxGear: 4,
    art: {
        href: '/art/racecars/anglet.png',
        // The art's own aspect ratio (2835×1843), scaled down to WAYPOINTS'
        // coordinate space — not a value picked for the loop, but for the
        // `<image>` under it: a viewBox any other shape crops or stretches
        // the real picture against (§23.4's "art does not draw the spaces"
        // cuts both ways — the spaces must not mis-draw the art either).
        viewBox: { width: 828, height: 538 },
    },
    geometry: GEOMETRY,
};
