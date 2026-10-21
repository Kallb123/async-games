// The zones of a Hold Out battlefield built with the team in the middle
// (docs/games/realm-arena.md §30.9, §35), 54 squares square: the team across
// the middle of the map, round its centre, and the warbands round the edge,
// three squares deep. The Sacked Fort and the Sunken Village share them.

import type { Area, BattlefieldMap } from "@/utils/games/battlefield/terrain";

const SIZE = 54;

/** The rows the team musters on: six deep, across the middle. */
export const TEAM_ROWS = { row: 24, height: 6 };

/** The map's middle 6 × 6, which still scores as any battle's centre does (§13.7). */
export const MIDDLE_CENTRE: Area = { col: 24, row: 24, width: 6, height: 6 };

/**
 * The edge, three squares deep, as four strips that turn into each other a
 * quarter at a time — north west to east, east north to south, south east to
 * west, west south to north — so every edge square is in exactly one. Each
 * strip is cut into `parts` lengths, in that order.
 */
export function edgeStrips(parts: number): Area[][] {
    const length = (SIZE - 3) / parts;
    const along = Array.from({ length: parts }, (_, k) => k * length);
    return [
        along.map(from => ({ col: from, row: 0, width: length, height: 3 })),
        along.map(from => ({ col: SIZE - 3, row: from, width: 3, height: length })),
        along.map(from => ({ col: SIZE - from - length, row: SIZE - 3, width: length, height: 3 })),
        along.map(from => ({ col: 0, row: SIZE - from - length, width: 3, height: length })),
    ];
}

const THIRDS = edgeStrips(3);

/**
 * For a team of three: three zones of 4 × 6 side by side across the middle,
 * west to east, then the warbands' (§29.8) — every edge in thirds, and each
 * warband a third of every edge: the first the one at the start of each
 * strip, the second the middle, and the third the one at its end.
 */
export const THREE_IN_THE_MIDDLE: BattlefieldMap["deployments"] = [
    { col: 21, ...TEAM_ROWS, width: 4 },
    { col: 25, ...TEAM_ROWS, width: 4 },
    { col: 29, ...TEAM_ROWS, width: 4 },
    ...[0, 1, 2].map(k => THIRDS.map(side => side[k])),
];

/** Where each of those three warbands deploys, as the setup log names it. */
export const EVERY_EDGE_IN_THIRDS = ["at the first third of every edge", "in the middle of every edge", "at the last third of every edge"];
