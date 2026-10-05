// The Sacked Fort (docs/games/realm-arena.md §30.9): the battlefield built for
// Hold Out (§30.3), 54 squares square. The Ruined Fort's walls (§15) after
// the enemy has already been through them once: the team musters in the
// middle, inside the ruined keep, and the warbands close in from every edge,
// where each wave lands too.
//
// It's meant to be held badly. The keep is a ring of low walls with a
// broken pillar at each corner and four wide gaps; the curtain wall round it
// has a gate six squares wide in every side and, either side of the gate, a
// breach in the open and one over rubble — six ways through each side. A
// tower stands at each corner, out where the enemy arrives, so whoever
// climbs one has left the keep to do it. Turned a quarter it's unchanged, so
// no edge has the easier approach.
//
// Letters are `TERRAIN`'s (src/utils/games/battlefield/terrain.ts): `.` open
// ground, `,` rubble and `o` low walls (half and three quarters of a height:
// half cover), `T` trees and `#` wall (full cover), `s` a tower stair, `^` a
// tower top and `P` the parapet round it (half cover for whoever is on the
// tower), each at its own height (§25). The map is flat ground.

import { buildBattlefield, type Area, type BattlefieldMap } from "@/utils/games/battlefield/terrain";

const ROWS = [
    "......................................................",
    "......................................................",
    "......................................................",
    "......................................................",
    "......................................T....,..........",
    "......TT.........,,,..................TT...,..........",
    "......TTT......................T...............TT.....",
    ".......T......................TT..............TTT.....",
    "...........,.........T............,,...........T......",
    ".....................TT...............................",
    "....,,................................................",
    "...........PPPP........................PPPP..,........",
    "...........P^^P###..##,#......#,##..###P^^P...........",
    "...........P^^s........................P^^P...........",
    ".....T.....PPP..........................sPP...........",
    "....TT......#..................,.........#............",
    "............#...##...oo.............##...#............",
    "............#...#....................#...#......,.....",
    "........,.......................................,.....",
    "........,.......................................,.....",
    "............#.......#o..o....o..o#.......#............",
    "............#.......o............o...o...#..TT........",
    "......TT....,..,......,........,.....o...,..T.........",
    ".......T....#............................#............",
    "....................o............o....................",
    "......................................................",
    "......................................................",
    "......................................................",
    "......................................................",
    "....................o............o....................",
    "............#............................#....T.......",
    ".........T..,...o.....,........,......,..,....TT......",
    "........TT..#...o...o............o.......#............",
    "............#.......#o..o....o..o#.......#............",
    ".....,.......................................,........",
    ".....,.......................................,........",
    ".....,......#...#....................#...#............",
    "............#...##.............oo...##...#............",
    "............#.........,..................#......TT....",
    "...........PPs..........................PPP.....T.....",
    "...........P^^P........................s^^P...........",
    "...........P^^P###..##,#......#,##..###P^^P...........",
    "........,..PPPP........................PPPP...........",
    "................................................,,....",
    "...............................TT.....................",
    "......T...........,,............T.........,...........",
    ".....TTT..............TT......................T.......",
    ".....TT...............T......................TTT......",
    "..........,...TT..................,,,.........TT......",
    "..........,....T......................................",
    "......................................................",
    "......................................................",
    "......................................................",
    "......................................................",
];

/** The team's zones, inside the keep: the west and east halves for two, three across it for three. */
const KEEP = { row: 24, height: 6 };
/** The keep's middle, which still scores as any battle's centre does (§13.7). */
const CENTRE: Area = { col: 24, row: 24, width: 6, height: 6 };

/**
 * The edge, three squares deep, as four strips that turn into each other a
 * quarter at a time — north west to east, east north to south, south east to
 * west, west south to north — each cut into `parts` lengths, in that order.
 */
function edges(parts: number): Area[][] {
    const length = 51 / parts;
    const along = Array.from({ length: parts }, (_, k) => k * length);
    return [
        along.map(from => ({ col: from, row: 0, width: length, height: 3 })),
        along.map(from => ({ col: 51, row: from, width: 3, height: length })),
        along.map(from => ({ col: 54 - from - length, row: 51, width: length, height: 3 })),
        along.map(from => ({ col: 0, row: 54 - from - length, width: 3, height: length })),
    ];
}

/** The edge whole, north, east, south and west, and in thirds. */
const WHOLE = edges(1).map(([strip]) => strip);
const THIRDS = edges(3);

/**
 * For a team of two: one warband from the north and south edges, the other
 * from the east and west. The team's zones first, west to east, then the
 * warbands' (§29.8).
 */
export const SACKED_FORT_TWO_MAP: BattlefieldMap = {
    name: "Sacked Fort",
    rows: ROWS,
    deployments: [
        { col: 21, ...KEEP, width: 6 },
        { col: 27, ...KEEP, width: 6 },
        [WHOLE[0], WHOLE[2]],
        [WHOLE[1], WHOLE[3]],
    ],
    objectives: { centre: CENTRE },
};

/**
 * For a team of three: every edge in thirds, and each warband a third of every
 * edge — the first the one at the start of each strip, the second the middle,
 * facing every gate, and the third the one at its end.
 */
export const SACKED_FORT_THREE_MAP: BattlefieldMap = {
    name: "Sacked Fort",
    rows: ROWS,
    deployments: [
        { col: 21, ...KEEP, width: 4 },
        { col: 25, ...KEEP, width: 4 },
        { col: 29, ...KEEP, width: 4 },
        ...[0, 1, 2].map(k => THIRDS.map(side => side[k])),
    ],
    objectives: { centre: CENTRE },
};

export const SACKED_FORT_TWO = buildBattlefield(SACKED_FORT_TWO_MAP);
export const SACKED_FORT_THREE = buildBattlefield(SACKED_FORT_THREE_MAP);
