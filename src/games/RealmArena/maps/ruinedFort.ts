// The Ruined Fort (docs/games/realm-arena.md §15): the first battlefield, and
// the two-player one, 36 squares wide and 48 long so it stands upright on a
// phone. Player A musters along the top edge and player B along the bottom;
// between them a square curtain wall with a tower at each corner, a broken
// gate facing each side and the ruined keep in the middle, which is the
// centre Hold the Centre scores (§13.7).
//
// Turned upside down it's unchanged, so neither side has the better approach
// (§15.2). Each side has three ways in: the gate, straight at the keep and
// looked down on by every tower; the breach in the side wall on its own half
// (the west for A, the east for B), a climb over rubble; and round the
// outside, past the trees. Each tower is climbed by one stair from inside the
// walls.
//
// Letters are `TERRAIN`'s (src/utils/games/battlefield/terrain.ts): `.` open
// ground, `,` rubble and `o` low walls (low cover), `T` trees and `#` wall
// (high cover), `s` a tower stair and `^` a tower top.

import { buildBattlefield, type BattlefieldMap } from "@/utils/games/battlefield/terrain";

export const RUINED_FORT_MAP: BattlefieldMap = {
    name: "Ruined Fort",
    rows: [
        "....................................",
        "....................................",
        "....................................",
        "......TT....................TT......",
        "......TTT......,,,.........TTT......",
        ".......T....................T.......",
        "..................................T.",
        "....,,...............,,..........TTT",
        ".................................TT.",
        ".TT.................................",
        "TTT......,,,............,,,.........",
        "T...................................",
        "......####................####......",
        "......#^^######......######^^#......",
        "......#^^s................s^^#......",
        "....T.###..................###.T....",
        "...TT..#....oo..............#..TT...",
        "...TTT.#....................#.TTT...",
        ".......,..............o.....#.......",
        ".......,..............o.....#.......",
        ".......,....................#.......",
        ",......#.......oo...........#......,",
        ",......#.....o.o..o.........#......,",
        ".......#.....o..............#.......",
        ".......#..............o.....#.......",
        ",......#.........o..o.o.....#......,",
        ",......#...........oo.......#......,",
        ".......#....................,.......",
        ".......#.....o..............,.......",
        ".......#.....o..............,.......",
        "...TTT.#....................#.TTT...",
        "...TT..#..............oo....#..TT...",
        "....T.###..................###.T....",
        "......#^^s................s^^#......",
        "......#^^######......######^^#......",
        "......####................####......",
        "...................................T",
        ".........,,,............,,,......TTT",
        ".................................TT.",
        ".TT.................................",
        "TTT..........,,...............,,....",
        ".T..................................",
        ".......T....................T.......",
        "......TTT.........,,,......TTT......",
        "......TT....................TT......",
        "....................................",
        "....................................",
        "....................................",
    ],
    deployments: [
        { col: 0, row: 0, width: 36, height: 3 },
        { col: 0, row: 45, width: 36, height: 3 },
    ],
    objectives: {
        centre: { col: 15, row: 21, width: 6, height: 6 },
    },
};

export const RUINED_FORT = buildBattlefield(RUINED_FORT_MAP);
