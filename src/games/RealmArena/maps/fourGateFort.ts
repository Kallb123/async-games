// The Four-Gate Fort (docs/games/realm-arena.md §15.4, §19): the four-player
// battlefield, 48 squares square. Each player musters in a corner; between
// them a square curtain wall whose corners have fallen, so each corner of the
// fort is a gate facing one deployment zone, with a tower in the middle of
// each wall between two gates and the ruined keep in the middle, which is the
// centre Hold the Centre scores (§13.7).
//
// Turned a quarter turn it's unchanged, so every corner has the same
// approach (§19.2). Each player has three ways in: their own gate, straight at
// the keep; the breach in the wall clockwise of it, a climb over rubble; and
// round the outside to a neighbour's gate. Each tower is climbed by one stair
// from inside the walls, and looks down into the keep.
//
// Letters are `TERRAIN`'s (src/utils/games/battlefield/terrain.ts): `.` open
// ground, `,` rubble and `o` low walls (half and three quarters of a height:
// half cover), `T` trees and `#` wall (full cover), `s` a tower stair and `^`
// a tower top, each at its own height (§25). The map is flat ground.

import { buildBattlefield, type BattlefieldMap } from "@/utils/games/battlefield/terrain";

export const FOUR_GATE_FORT_MAP: BattlefieldMap = {
    name: "Four-Gate Fort",
    rows: [
        "................................................",
        "................................................",
        "...........TT.........T.........,,,.............",
        "...........TTT......,,,.........................",
        "............................T.T.................",
        "............................TTTT................",
        "............................TT..................",
        ".........,,.....................................",
        "...............#......####......................",
        "...............#......#^^#..............,.......",
        "...............###,,,##^^########.......,.......",
        "......................#ss#..................TT..",
        "............................................TT..",
        "..,.........................................T...",
        "..,................o.....o.....o................",
        "..,.......#........o...........o.....###........",
        ".....T....#...oo.....................#..........",
        "....TT....#................o.........#..........",
        ".....TT...#..........................,..........",
        "....TTT...#.........o...........oo...,..........",
        "..........#......o..........o........,......,...",
        "..........#...........o.o............#......,...",
        "........####..o...........o.........####....,T..",
        "........#^^s.........o..............s^^#........",
        "........#^^s..............o.........s^^#........",
        "..T,....####.........o...........o..####........",
        "...,......#............o.o...........#..........",
        "...,......,........o..........o......#..........",
        "..........,...oo...........o.........#...TTT....",
        "..........,..........................#...TT.....",
        "..........#.........o................#....TT....",
        "..........#.....................oo...#....T.....",
        "........###.....o...........o........#.......,..",
        "................o.....o.....o................,..",
        "...T.........................................,..",
        "..TT............................................",
        "..TT..................#ss#......................",
        ".......,.......########^^##,,,###...............",
        ".......,..............#^^#......#...............",
        "......................####......#...............",
        ".....................................,,.........",
        "..................TT............................",
        "................TTTT............................",
        ".................T.T............................",
        ".........................,,,......TTT...........",
        ".............,,,.........T.........TT...........",
        "................................................",
        "................................................",
    ],
    // Clockwise from the top left, so the next seat in the turn order is the
    // corner clockwise of yours.
    deployments: [
        { col: 0, row: 0, width: 8, height: 8 },
        { col: 40, row: 0, width: 8, height: 8 },
        { col: 40, row: 40, width: 8, height: 8 },
        { col: 0, row: 40, width: 8, height: 8 },
    ],
    objectives: {
        centre: { col: 21, row: 21, width: 6, height: 6 },
    },
};

export const FOUR_GATE_FORT = buildBattlefield(FOUR_GATE_FORT_MAP);
