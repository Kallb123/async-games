// Anglet Chambre d'Amour — the second circuit (§20's first iteration hook): a
// tighter, seven-corner street course transcribed off the board art at
// art-masters/racecars/anglet.png, read start/finish and clockwise. Two of
// its chicanes (VVF and La Barre) are marked on that art with a doubled
// "STOP" pip rather than one, which is what `stops: 2` is for — Ashcombe's
// own Hairpin already proved the field, this is the second track exercising
// it rather than a new rule.
//
// The whole circuit is derived from ONE table, `SECTIONS`, for the reason
// ashcombe.ts gives: row-by-row lane widths and the corner bands are two
// readings of the same fact, and writing them out separately is how a corner
// comes to sit half on a three-lane row.
import type { RaceCarsCorner, RaceCarsTrack } from "../board";
import { roundedRectGeometry } from "./loopGeometry";

interface AngletSection {
    name: string;
    /** Inclusive row band. */
    from: number;
    to: number;
    lanes: 2 | 3;
    /** Corner id and stop count, or null for a straight. */
    corner: { id: string; stops: 1 | 2 } | null;
}

// Read off the art in the direction its arrows run: out of the grid along the
// seafront, round the harbour hook at the far end (Port Sweep into the tight
// Chambre d'Amour hairpin the circuit is named for, out again through Sables
// d'Or), back along the villas through the two doubled-stop chicanes, and
// home through Villa Hairpin — the loop back beside the grid the art draws
// right next to the start/finish line, same as it draws Chambre d'Amour at
// the opposite end.
const SECTIONS: AngletSection[] = [
    { name: 'Start / Finish Straight', from: 0, to: 9, lanes: 3, corner: null },
    { name: 'La Digue Kink', from: 10, to: 13, lanes: 2, corner: { id: 'digue', stops: 1 } },
    { name: 'Front de Mer', from: 14, to: 33, lanes: 3, corner: null },
    { name: 'Port Sweep', from: 34, to: 37, lanes: 2, corner: { id: 'port', stops: 1 } },
    { name: 'Jetée Esses', from: 38, to: 40, lanes: 2, corner: null },
    { name: "Chambre d'Amour Hairpin", from: 41, to: 45, lanes: 2, corner: { id: 'chambre', stops: 1 } },
    { name: "Sables d'Or Straight", from: 46, to: 57, lanes: 3, corner: null },
    { name: "Sables d'Or Bend", from: 58, to: 61, lanes: 2, corner: { id: 'sables', stops: 1 } },
    { name: 'VVF Esses', from: 62, to: 67, lanes: 2, corner: null },
    { name: 'VVF Chicane', from: 68, to: 72, lanes: 2, corner: { id: 'vvf', stops: 2 } },
    { name: 'Barre Esses', from: 73, to: 78, lanes: 2, corner: null },
    { name: 'La Barre Chicane', from: 79, to: 83, lanes: 2, corner: { id: 'barre', stops: 2 } },
    { name: 'Villa Approach', from: 84, to: 88, lanes: 3, corner: null },
    { name: 'Villa Hairpin', from: 89, to: 92, lanes: 2, corner: { id: 'villa', stops: 1 } },
    { name: 'Run to the Line', from: 93, to: 97, lanes: 3, corner: null },
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

// Placeholder geometry, built the same way as Ashcombe's (`loopGeometry.ts`)
// but stretched into a long, narrow stadium rather than a near-square
// rectangle — closer to the art's shape, a spit of road doubling back on
// itself round two hairpins rather than a loop round a park. Sized so each
// hairpin's rows land inside one of the two short ends: Chambre d'Amour
// (rows 41-45, the circuit's tightest corner) centres at row 43 of 98, ~44%
// round the loop, inside the far short end below; Villa Hairpin (89-92)
// centres at row 90.5, ~92%, inside the near one. Nothing outside the board
// screen reads x/y/heading, so this is free to be replaced by §23.6's real
// centre-line sampler without touching a rule.
const TRACK_WIDTH = 1310;
const TRACK_HEIGHT = 210;
const TRACK_RADIUS = 95;
/** Gap between neighbouring lanes, across the road. */
const LANE_PITCH = 22;
/** Room round the loop for the cars, the corner-stop pips and the corner names. */
const MARGIN = 64;

const GEOMETRY = roundedRectGeometry(
    LANE_WIDTH,
    { width: TRACK_WIDTH, height: TRACK_HEIGHT, radius: TRACK_RADIUS, margin: MARGIN },
    LANE_PITCH,
);

export const ANGLET: RaceCarsTrack = {
    id: 'anglet',
    name: "Anglet Chambre d'Amour",
    rows: ROWS,
    laneWidth: LANE_WIDTH,
    corners: CORNERS,
    // Six staggered spaces on rows 0-2, lanes 1 and 3, so no car starts
    // directly behind another — the same grid shape as Ashcombe's, on the
    // same width of starting straight. P1 first.
    grid: [
        { row: 2, lane: 1 },
        { row: 2, lane: 3 },
        { row: 1, lane: 1 },
        { row: 1, lane: 3 },
        { row: 0, lane: 1 },
        { row: 0, lane: 3 },
    ],
    // Four, not five or six: the longest corner-free run (Front de Mer, 20
    // rows) is shorter than Ashcombe's Mile, and this is a tighter, more
    // technical circuit than a straight-line speed one — seven corners to
    // Ashcombe's three, on twenty more rows.
    maxGear: 4,
    art: {
        href: '/art/racecars/anglet.png',
        viewBox: {
            width: MARGIN * 2 + TRACK_WIDTH,
            height: MARGIN * 2 + TRACK_HEIGHT,
        },
    },
    geometry: GEOMETRY,
};
