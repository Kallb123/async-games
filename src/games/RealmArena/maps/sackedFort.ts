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

import { buildBattlefield, type BattlefieldMap } from "@/utils/games/battlefield/terrain";
import { edgeStrips, FOUR_IN_THE_MIDDLE, MIDDLE_CENTRE, TEAM_ROWS, THREE_IN_THE_MIDDLE } from "./middleOut";

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

/** The edge whole, north, east, south and west. */
const WHOLE = edgeStrips(1).map(([strip]) => strip);

/**
 * For a team of two: one warband from the north and south edges, the other
 * from the east and west. The team's zones first, west to east, then the
 * warbands' (§29.8).
 */
export const SACKED_FORT_TWO_MAP: BattlefieldMap = {
    name: "Sacked Fort",
    rows: ROWS,
    deployments: [
        { col: 21, ...TEAM_ROWS, width: 6 },
        { col: 27, ...TEAM_ROWS, width: 6 },
        [WHOLE[0], WHOLE[2]],
        [WHOLE[1], WHOLE[3]],
    ],
    objectives: { centre: MIDDLE_CENTRE },
};

/**
 * For a team of three: three across the keep, and every edge in thirds, each
 * warband a third of every edge, the second's facing every gate (`THREE_IN_THE_MIDDLE`).
 */
export const SACKED_FORT_THREE_MAP: BattlefieldMap = {
    name: "Sacked Fort",
    rows: ROWS,
    deployments: THREE_IN_THE_MIDDLE,
    objectives: { centre: MIDDLE_CENTRE },
};

/**
 * For a team of four: one in each quarter of the keep, and every edge in
 * thirds, each warband the third of three of the edges (`FOUR_IN_THE_MIDDLE`).
 */
export const SACKED_FORT_FOUR_MAP: BattlefieldMap = {
    name: "Sacked Fort",
    rows: ROWS,
    deployments: FOUR_IN_THE_MIDDLE,
    objectives: { centre: MIDDLE_CENTRE },
};

export const SACKED_FORT_TWO = buildBattlefield(SACKED_FORT_TWO_MAP);
export const SACKED_FORT_THREE = buildBattlefield(SACKED_FORT_THREE_MAP);
export const SACKED_FORT_FOUR = buildBattlefield(SACKED_FORT_FOUR_MAP);
