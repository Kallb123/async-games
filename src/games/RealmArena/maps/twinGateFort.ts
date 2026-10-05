// The Twin-Gate Fort (docs/games/realm-arena.md §29.2): the co-op battlefield
// for a team of two, 48 squares square. It's the Ruined Fort (§15) stretched
// sideways: the team musters along the top edge, a zone each, side by side,
// and the enemy's two warbands along the bottom, each opposite a player.
// Between them a curtain wall right across the map, with a gate facing each
// zone, a tower at each end and one in the middle between the two gates, and
// the ruined keep in the middle, which is the centre Hold the Centre scores
// (§13.7).
//
// Turned upside down it's unchanged, so every warband's zone and approach is
// exactly a player's (§29.2). Each player has three ways in: their own gate;
// the breach beside the middle tower, a climb over rubble, which is also the
// way across to their teammate; and the breach in the side wall at their end,
// past the trees. A tower stands on either hand of every gate, each climbed by
// one stair from inside the walls, and every one looks down into the keep.
//
// Letters are `TERRAIN`'s (src/utils/games/battlefield/terrain.ts): `.` open
// ground, `,` rubble and `o` low walls (half and three quarters of a height:
// half cover), `T` trees and `#` wall (full cover), `s` a tower stair, `^` a
// tower top and `P` the parapet round it (half cover for whoever is on the
// tower), each at its own height (§25). The map is flat ground.

import { buildBattlefield, type BattlefieldMap } from "@/utils/games/battlefield/terrain";

export const TWIN_GATE_FORT_MAP: BattlefieldMap = {
    name: "Twin-Gate Fort",
    rows: [
        "................................................",
        "................................................",
        "................................................",
        "......TT.............................TT.........",
        "......TTT........,,,................TTT.........",
        ".......T.............................T..........",
        ".............................................T..",
        "....,,....................,,................TTT.",
        ".............................................TT.",
        ".TT...................T.........................",
        "TTT.......,,,........TT.........,,,.............",
        "T...............................................",
        "....PPPP..............PPPP..............PPPP....",
        "....P^^P###......##,,,P^^P,,,##......###P^^P....",
        "....P^^s..............P^^P..............s^^P....",
        "..T.PPP...............PssP...............PPP....",
        ".TT..#............oo......................#.....",
        ".TTT.#...............................o....#.....",
        ".....,...oo.................o........o....,.....",
        ".....,......................o.............,.....",
        ".....,....................................,.....",
        ",....#...............oo............oo.....#.....",
        ",....#.....o.......o.o..o.................#.....",
        ".....#.....o.......o......................#.....",
        ".....#......................o.......o.....#.....",
        ".....#.................o..o.o.......o.....#....,",
        ".....#.....oo............oo...............#....,",
        ".....,....................................,.....",
        ".....,.............o......................,.....",
        ".....,....o........o.................oo...,.....",
        ".....#....o...............................#.TTT.",
        ".....#......................oo............#..TT.",
        "....PPP...............PssP...............PPP.T..",
        "....P^^s..............P^^P..............s^^P....",
        "....P^^P###......##,,,P^^P,,,##......###P^^P....",
        "....PPPP..............PPPP..............PPPP....",
        "...............................................T",
        ".............,,,.........TT........,,,.......TTT",
        ".........................T...................TT.",
        ".TT.............................................",
        ".TTT................,,....................,,....",
        "..T.............................................",
        "..........T.............................T.......",
        ".........TTT................,,,........TTT......",
        ".........TT.............................TT......",
        "................................................",
        "................................................",
        "................................................",
    ],
    // The team's zones first, west to east, then the warbands', each opposite
    // the player it faces (§29.8).
    deployments: [
        { col: 0, row: 0, width: 24, height: 3 },
        { col: 24, row: 0, width: 24, height: 3 },
        { col: 0, row: 45, width: 24, height: 3 },
        { col: 24, row: 45, width: 24, height: 3 },
    ],
    objectives: {
        centre: { col: 21, row: 21, width: 6, height: 6 },
    },
};

export const TWIN_GATE_FORT = buildBattlefield(TWIN_GATE_FORT_MAP);
