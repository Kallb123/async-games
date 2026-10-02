// The Four-Gate Fort (docs/games/realm-arena.md §15.4): the Ruined Fort's idea
// at the size three or four players fight on, 48 squares a side (§13.1). Each
// player musters in a corner, about 40 squares from the next; between them a
// square curtain wall with a gate at each of its corners, facing a deployment
// zone, a tower midway along each side, between a pair of gates, and the
// ruined keep in the middle, which is the centre Hold the Centre scores
// (§13.7).
//
// A quarter turn leaves it unchanged, so no corner has the better approach.
// Each corner's own gate is the short way in, a diagonal walk from its zone;
// the gates either side of it are the long way round, past the trees between
// the corners. Each tower is climbed by one stair from inside the walls, and
// looks down into the keep.
//
// Three players fight here too, from the first three corners (the seats go
// clockwise from the north-west), so one corner stands empty.
//
// Letters are `TERRAIN`'s (src/utils/games/battlefield/terrain.ts): `.` open
// ground, `,` rubble and `o` low walls (low cover), `T` trees and `#` wall
// (high cover), `s` a tower stair and `^` a tower top.

import { buildBattlefield, type BattlefieldMap } from "@/utils/games/battlefield/terrain";

export const FOUR_GATE_FORT_MAP: BattlefieldMap = {
    name: "Four-Gate Fort",
    rows: [
        "................................................",
        "................................................",
        ".........,,.....................................",
        ".......................T........................",
        "...............,,.....TTTT......................",
        "......................TTTT......................",
        "........................T.......................",
        "..............................,,................",
        "..........,,.....T...............TT.............",
        ".................T................T..........,..",
        "......................####.............,.....,..",
        "......................#^^#.............,........",
        "................#######^^#######................",
        "........TT............#s##....,,................",
        "........T.......................................",
        "..................o........................,....",
        ".......,....#,..........oo.........#.......,....",
        ".......,....#,........oo...........#..TT........",
        "............#...................o..#............",
        "............#......oo......oo......#............",
        "............#......o........o......#............",
        "............#......................#............",
        "....TT....####..o.............o...####....TT....",
        "....TTT...#^^#..o.............o...s^^#....TTT...",
        "...TTT....#^^s...o.............o..#^^#...TTT....",
        "....TT....####...o.............o..####....TT....",
        "............#......................#............",
        "............#......o........o......#............",
        "............#......oo......oo......#............",
        "............#..o...................#............",
        "........TT..#...........oo........,#....,.......",
        "....,.......#.........oo..........,#....,.......",
        "....,........................o..................",
        ".......................................T........",
        "................,,....##s#............TT........",
        "................#######^^#######................",
        "........,.............#^^#......................",
        "..,.....,.............####......................",
        "..,..........T................T.................",
        ".............TT...............T.....,,..........",
        "................,,..............................",
        ".......................T........................",
        "......................TTTT......................",
        "......................TTTT.....,,...............",
        "........................T.......................",
        ".....................................,,.........",
        "................................................",
        "................................................",
    ],
    // Clockwise from the north-west, so seat after seat goes round the fort.
    deployments: [
        { col: 0, row: 0, width: 6, height: 6 },
        { col: 42, row: 0, width: 6, height: 6 },
        { col: 42, row: 42, width: 6, height: 6 },
        { col: 0, row: 42, width: 6, height: 6 },
    ],
    objectives: {
        centre: { col: 21, row: 21, width: 6, height: 6 },
    },
};

export const FOUR_GATE_FORT = buildBattlefield(FOUR_GATE_FORT_MAP);
