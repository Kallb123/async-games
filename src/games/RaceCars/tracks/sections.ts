// The one table every track's circuit is derived from — row-by-row lane
// widths and the corner bands are two readings of the same fact, and writing
// them out separately (as ashcombe.ts once did, before anglet.ts needed the
// same derivation) is how a corner comes to sit half on a three-lane row: a
// discrepancy no rule would report, because every rule reads only one of the
// two.
import type { RaceCarsCorner, RaceCarsSpace } from "../board";

/**
 * Six staggered spaces on rows 0-2, lanes 1 and 3, so no car starts directly
 * behind another (§5.2) — every track's grid so far starts on a three-lane
 * straight the same width as this one, so there has been nothing yet for a
 * second circuit to say differently. P1 first.
 */
export const STAGGERED_SIX_GRID: RaceCarsSpace[] = [
    { row: 2, lane: 1 },
    { row: 2, lane: 3 },
    { row: 1, lane: 1 },
    { row: 1, lane: 3 },
    { row: 0, lane: 1 },
    { row: 0, lane: 3 },
];

export interface TrackSection {
    name: string;
    /** Inclusive row band. */
    from: number;
    to: number;
    lanes: 2 | 3;
    /** Corner id and stop count, or null for a straight. */
    corner: { id: string; stops: 1 | 2 } | null;
}

/** A track's `rows`, `laneWidth` and `corners`, all read off one `SECTIONS` table. */
export function deriveTrack(sections: TrackSection[]): {
    rows: number;
    laneWidth: number[];
    corners: RaceCarsCorner[];
} {
    const rows = sections[sections.length - 1].to + 1;

    const laneWidth = sections.flatMap(
        section => Array.from({ length: section.to - section.from + 1 }, () => section.lanes),
    );

    const corners: RaceCarsCorner[] = sections
        .filter(section => section.corner !== null)
        .map(section => ({
            id: section.corner!.id,
            name: section.name,
            from: section.from,
            to: section.to,
            stops: section.corner!.stops,
        }));

    return { rows, laneWidth, corners };
}
