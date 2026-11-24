// Rules version 13's Hold Out sites (realm-arena-hold-out.md §5.1, §5.2): where
// each map Hold Out is fought on stands every warband's nests, in the warbands'
// order, and the team's Shrine. They are the ruleset's, not the map's: a battle
// reads its sites from its own rules version, so a version-12 battle keeps the
// map's nests (`BattlefieldMap.nests`) whatever later happens to them, and moving
// a nest or the Shrine is a new rules version rather than an edit to a map in
// play. The nests start as literal copies of the maps' own.
import type { HoldOutSites } from "../ruleValues";

export const HOLD_OUT_SITES_V13: Readonly<Record<string, HoldOutSites>> = {
    ruinedFort: {
        nests: [[{ col: 9, row: 44 }, { col: 26, row: 44 }]],
        shrine: { col: 17, row: 3 },
    },
    twinGateFort: {
        nests: [[{ col: 4, row: 44 }, { col: 17, row: 44 }], [{ col: 30, row: 44 }, { col: 43, row: 44 }]],
        shrine: { col: 23, row: 3 },
    },
    threeGateFort: {
        nests: [[{ col: 4, row: 44 }, { col: 16, row: 44 }], [{ col: 26, row: 44 }, { col: 37, row: 44 }], [{ col: 47, row: 44 }, { col: 59, row: 44 }]],
        shrine: { col: 31, row: 3 },
    },
    sackedFortTwo: {
        nests: [[{ col: 8, row: 0 }, { col: 45, row: 53 }], [{ col: 53, row: 8 }, { col: 0, row: 45 }]],
        shrine: { col: 26, row: 23 },
    },
    sackedFortThree: {
        nests: [[{ col: 8, row: 0 }, { col: 45, row: 53 }], [{ col: 18, row: 0 }, { col: 35, row: 53 }], [{ col: 42, row: 0 }, { col: 11, row: 53 }]],
        shrine: { col: 26, row: 23 },
    },
    sackedFortFour: {
        nests: [[{ col: 8, row: 0 }, { col: 53, row: 17 }], [{ col: 53, row: 8 }, { col: 36, row: 53 }], [{ col: 45, row: 53 }, { col: 0, row: 36 }], [{ col: 0, row: 45 }, { col: 17, row: 0 }]],
        shrine: { col: 26, row: 22 },
    },
    sunkenVillageThree: {
        nests: [[{ col: 8, row: 0 }, { col: 45, row: 53 }], [{ col: 18, row: 0 }, { col: 35, row: 53 }], [{ col: 42, row: 0 }, { col: 11, row: 53 }]],
        shrine: { col: 26, row: 23 },
    },
    sunkenVillageFour: {
        nests: [[{ col: 8, row: 0 }, { col: 53, row: 17 }], [{ col: 53, row: 8 }, { col: 36, row: 53 }], [{ col: 45, row: 53 }, { col: 0, row: 36 }], [{ col: 0, row: 45 }, { col: 17, row: 0 }]],
        shrine: { col: 26, row: 22 },
    },
};
