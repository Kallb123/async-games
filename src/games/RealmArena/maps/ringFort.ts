// The Ring Fort (docs/games/realm-arena.md §19): the three-player
// battlefield, 48 squares square. Three seats can't share a square grid's
// symmetry — a third of a turn isn't one of its moves — so the fort is round
// instead, and fair by measurement rather than by shape. Two players muster
// in the top corners and one in the middle of the bottom edge, at the points
// of a triangle round the keep; a round curtain wall has a gate facing each
// of them, a tower between each pair of gates and a breach either side of
// each tower, and the ruined keep inside is the centre Hold the Centre scores
// (§13.7).
//
// Mirrored left to right it's unchanged, so the two top seats match exactly.
// The bottom seat moves straight up while the others come in at a slant,
// which costs more on squares (a diagonal step is 1.5), so the keep sits a
// little above the middle of the map to even the walk out: its test holds
// every seat's quickest way to the keep, and to each other seat, level
// (§19.2). Each player has a gate straight at the keep, the breaches either
// side of it, and a tower on each flank looking down into the keep.
//
// Letters are `TERRAIN`'s (src/utils/games/battlefield/terrain.ts): `.` open
// ground, `,` rubble and `o` low walls (low cover), `T` trees and `#` wall
// (high cover), `s` a tower stair and `^` a tower top.

import { buildBattlefield, type BattlefieldMap } from "@/utils/games/battlefield/terrain";

export const RING_FORT_MAP: BattlefieldMap = {
    name: "Ring Fort",
    rows: [
        "................................................",
        "................................................",
        "................................................",
        "..............TT................TT..............",
        "..............T.T..............T.T..............",
        "........,,............TTTT............,,........",
        "................................................",
        "...................,..####..,...................",
        ".....................##^^##.....................",
        "..................,###s^^s###,..................",
        ".................,,#........#,,.................",
        "...............##,............,##...............",
        "...............##....oo..oo....##...............",
        "................................................",
        "................................................",
        "................o..............o................",
        "................o..............o................",
        "............#......................#............",
        "...........##......................##...........",
        "...........##.........o..o.........##...........",
        "...........,,.....o..........o.....,,...........",
        "...........,,......................,,...........",
        "..TT.......##.oo.....o....o.....oo.##.......TT..",
        "...T.......##......................##.......T...",
        "............#......................#............",
        "............#s....................s#............",
        "............#^^..................^^#............",
        ".,..........#^^s...oo......oo...s^^#..........,.",
        ".,..........###..................###..........,.",
        "..............###..............###..............",
        "....TT.........##,............,##.........TT....",
        ".....T...........,,#........#,,...........T.....",
        "..................,##......##,..................",
        "................................................",
        "............T......................T............",
        "................................................",
        "......,,................................,,......",
        "................................................",
        "................................................",
        "................................................",
        "..........TT..,..................,..TT..........",
        "...........T........................T...........",
        "................................................",
        "................................................",
        "................T..............T................",
        "................T..............T................",
        "................................................",
        "................................................",
    ],
    // Clockwise from the top left, so the next seat in the turn order is the
    // one clockwise of yours.
    deployments: [
        { col: 0, row: 5, width: 8, height: 8 },
        { col: 40, row: 5, width: 8, height: 8 },
        { col: 20, row: 40, width: 8, height: 8 },
    ],
    objectives: {
        centre: { col: 21, row: 18, width: 6, height: 6 },
    },
};

export const RING_FORT = buildBattlefield(RING_FORT_MAP);
