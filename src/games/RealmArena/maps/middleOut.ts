// The zones of a Hold Out battlefield built with the team in the middle
// (docs/games/realm-arena.md §30.9, §35), 54 squares square: the team across
// the middle of the map, round its centre, and the warbands round the edge,
// three squares deep. The Sacked Fort and the Sunken Village share them, for
// a team of three and for a team of four (§37).

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

/**
 * For a team of four: four zones of 6 × 4 round the centre, one in each
 * quarter of the middle 12 × 8 — north west, north east, south east, south
 * west, clockwise from the top left, which is the order the seats take. They
 * stand on rows 23 to 30 to stay clear of the Sacked Fort's rubble in the
 * keep's corners (rows 22 and 31), and between them they cover the centre.
 * Then the warbands' (§29.8): the edge is cut in thirds as it is for three,
 * but where three warbands take a whole third of every edge, four can't
 * share the thirds that way — so warband k takes the first third of one edge,
 * the middle of the next one clockwise and the last third of the one after,
 * strip (k + j) mod 4 for its jth part. Each warband reaches three edges,
 * every third of the edge is somebody's exactly once, and a quarter turn
 * carries each warband's zone onto the next one's.
 */
export const FOUR_IN_THE_MIDDLE: BattlefieldMap["deployments"] = [
    { col: 21, row: 23, width: 6, height: 4 },
    { col: 27, row: 23, width: 6, height: 4 },
    { col: 27, row: 27, width: 6, height: 4 },
    { col: 21, row: 27, width: 6, height: 4 },
    ...[0, 1, 2, 3].map(k => [0, 1, 2].map(j => THIRDS[(k + j) % 4][j])),
];

/** Where each of those four team zones is, in seat order: clockwise from the top left. */
export const FOUR_QUARTERS = ["north-west", "north-east", "south-east", "south-west"];

const EDGES = ["north", "east", "south", "west"];
const THIRD_NAMES = ["the first third", "the middle", "the last third"];

/** Where each of those four warbands deploys, as the setup log names it: worked out from the same rotation as the zones. */
export const EDGE_THIRDS_ROTATING = [0, 1, 2, 3].map(k => {
    const third = (j: number) => `${THIRD_NAMES[j]} of the ${EDGES[(k + j) % 4]} edge`;
    return `at ${third(0)}, ${third(1)} and ${third(2)}`;
});

/** The four-seat deployment names around a middle `ground` ("keep", "green"): the team's quarter of it, then each warband's edge thirds. */
export const fourAround = (ground: string): string[] => [...FOUR_QUARTERS.map(quarter => `in the ${quarter} of the ${ground}`), ...EDGE_THIRDS_ROTATING];
