// The Three-Gate Fort (docs/games/realm-arena.md §29.2): the co-op
// battlefield for a team of three, 64 squares wide and 48 deep. It's the
// Twin-Gate Fort a lane wider: the team musters along the top edge, a zone
// each, side by side, and the enemy's three warbands along the bottom, each
// opposite a player. Between them a curtain wall right across the map, with a
// gate facing each zone, a tower at each end and one between each pair of
// gates, and the ruined keep in the middle, which is the centre Hold the
// Centre scores (§13.7). The players at the ends walk further to it than the
// one in the middle; in co-op that's a team's plan, and the ends hold the
// flanks.
//
// Turned upside down it's unchanged, so every warband's zone and approach is
// exactly a player's (§29.2). Each player has their own gate and a rubble
// breach by the tower on either hand of it — for a player at an end, the one
// on the outer hand is in the side wall, past the trees — and the breaches by
// the inner towers are the ways across to a teammate. Each tower is climbed by
// one stair from inside the walls, and every one looks down into the keep.
//
// Letters are `TERRAIN`'s (src/utils/games/battlefield/terrain.ts): `.` open
// ground, `,` rubble and `o` low walls (half and three quarters of a height:
// half cover), `T` trees and `#` wall (full cover), `s` a tower stair, `^` a
// tower top and `P` the parapet round it (half cover for whoever is on the
// tower), each at its own height (§25). The map is flat ground.

import { buildBattlefield, type BattlefieldMap } from "@/utils/games/battlefield/terrain";

export const THREE_GATE_FORT_MAP: BattlefieldMap = {
    name: "Three-Gate Fort",
    rows: [
        "................................................................",
        "................................................................",
        "................................................................",
        ".....TT....................TT........................TT.........",
        ".....TTT...................TTT................,,,...TTT.........",
        "......T.....................T........................T..........",
        ".....................,,,.....................................T..",
        "..............,,......................,,....................TTT.",
        ".............................................................TT.",
        ".TT................T........................T...................",
        "TTT......,,,......TT............,,,........TT.......,,,.........",
        "T...............................................................",
        "....PPPP...........PPPP..................PPPP...........PPPP....",
        "....P^^P#......#,,,P^^P,,,###......###,,,P^^P,,,#......#P^^P....",
        "....P^^s...........P^^P..................P^^P...........s^^P....",
        ".T..PPP............PssP..................PssP............PPP....",
        ".TT..#....................oo..............................#.....",
        ".TTT.#........................................o...........#.....",
        ".....,...oo.........................o.........o...........,.....",
        ".....,..............................o.....................,.....",
        ".....,...........oo.......................................,.....",
        ",....#.......................oo.............oo............#.....",
        ",....#.....o...............o.o..o...................o.....#.....",
        ".....#.....o...............o..............................#.....",
        ".....#..............................o...............o.....#.....",
        ".....#.....o...................o..o.o...............o.....#....,",
        ".....#............oo.............oo.......................#....,",
        ".....,.......................................oo...........,.....",
        ".....,.....................o..............................,.....",
        ".....,...........o.........o.........................oo...,.....",
        ".....#...........o........................................#.TTT.",
        ".....#..............................oo....................#..TT.",
        "....PPP............PssP..................PssP............PPP..T.",
        "....P^^s...........P^^P..................P^^P...........s^^P....",
        "....P^^P#......#,,,P^^P,,,###......###,,,P^^P,,,#......#P^^P....",
        "....PPPP...........PPPP..................PPPP...........PPPP....",
        "...............................................................T",
        ".........,,,.......TT........,,,............TT......,,,......TTT",
        "...................T........................T................TT.",
        ".TT.............................................................",
        ".TTT....................,,......................,,..............",
        "..T.....................................,,,.....................",
        "..........T........................T.....................T......",
        ".........TTT...,,,................TTT...................TTT.....",
        ".........TT........................TT....................TT.....",
        "................................................................",
        "................................................................",
        "................................................................",
    ],
    // The team's zones first, west to east, then the warbands', each opposite
    // the player it faces (§29.8). 64 doesn't split in three, so the middle
    // zone is a square wider, which keeps the map unchanged by a half turn.
    deployments: [
        { col: 0, row: 0, width: 21, height: 3 },
        { col: 21, row: 0, width: 22, height: 3 },
        { col: 43, row: 0, width: 21, height: 3 },
        { col: 0, row: 45, width: 21, height: 3 },
        { col: 21, row: 45, width: 22, height: 3 },
        { col: 43, row: 45, width: 21, height: 3 },
    ],
    objectives: {
        centre: { col: 29, row: 21, width: 6, height: 6 },
    },
};

export const THREE_GATE_FORT = buildBattlefield(THREE_GATE_FORT_MAP);
