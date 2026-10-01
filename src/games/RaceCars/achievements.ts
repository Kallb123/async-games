// Race Cars' own achievements (docs/achievements.md §11), registered in
// GAME_ACHIEVEMENTS. Browser-safe, like everything the catalogue imports:
// board.ts is static track data, and the response type is `import type`.
//
// Each match achievement is a moment from real motor racing, reduced to
// something the table can see on the board. Race Cars hides nothing (§2's
// fourth pillar — docs/games/race-cars.md §23.4), so the table's view a check
// is handed is the whole race, and its key set is pinned in hiddenHands.test.ts.
//
// The view is the state *at* a turn end, not the history behind it: nothing
// here can ask "were you ever last" or "did you take a tow", because no field
// remembers. A check reads where the cars are now, what they have left, and the
// two facts the race does keep for good — the grid slot printed on each car,
// and the round order fixed at the start of every round.
import type { GameAchievement } from "@/utils/games/achievements";
import { cornerAt } from "./board";
import type { IRaceCarsSpecificGameStateResponse } from "./apiModels";
import { MONACO } from "./tracks/monaco";

/**
 * Senna started fourth at Donington in 1993, and led by the end of the lap.
 * A grid slot, so P1 is 1.
 */
export const DONINGTON_GRID_SLOT = 4;

/** Watson won Long Beach '83 from 22nd; in a field of at most six, third will do. */
export const LONG_BEACH_GRID_SLOT = 3;

/**
 * La Rascasse, as Monaco's section ids name it. Matched by id rather than by
 * name so a corrected spelling on the board doesn't quietly retire the
 * achievement; achievements.test.ts pins that this id is still La Rascasse.
 */
export const RASCASSE_CORNER_ID = "section18";

/** The round after §6a's startup round: its order is the field as round one left it. */
const ROUND_TWO = 2;

/** The grid slot printed on this car, or 0 for a seat with no car. */
function gridSlot(view: IRaceCarsSpecificGameStateResponse, userId: string): number {
    return view.playerStates[userId]?.raceNumber ?? 0;
}

export const achievements: GameAchievement<IRaceCarsSpecificGameStateResponse>[] = [
    {
        id: "racecars.rookie-season",
        title: "Rookie Season",
        icon: "🏁",
        description: "Play 5 games of Race Cars.",
        criteria: { kind: "career", progress: record => record.played, target: 5 },
    },
    {
        // Juan Manuel Fangio's five world titles, a record that stood for 46 years.
        id: "racecars.el-maestro",
        title: "El Maestro",
        icon: "🏆",
        description: "Win 5 games of Race Cars.",
        criteria: { kind: "career", progress: record => record.won, target: 5 },
    },
    {
        // Ayrton Senna, the 1993 European Grand Prix at Donington Park: fourth on
        // the grid, fifth after the start, and past Schumacher, Wendlinger, Hill
        // and Prost to lead by the end of the opening lap.
        //
        // Round two's order is fixed when round one ends, leader first (§15),
        // and stays put for the whole round — so every turn end in round two
        // still says who led out of round one, even when the wrap itself was a
        // turn the cron played and nobody judged.
        //
        // One accepted edge: a driver dropped mid-round leaves the order then
        // and there, so if round one's leader is dropped in round two, the car
        // they led moves up to slot 0 and can earn it from fourth or further
        // back. Tightening to `roundIndex === 0` would close that and lose the
        // cron-played wrap instead; four cars and a dropout is the rarer case.
        id: "racecars.donington-93",
        title: "Donington '93",
        icon: "🌧️",
        description: "Lead the field at the end of the first round, having started fourth on the grid or further back.",
        // It comes true at the end of the last turn of round one, which is
        // usually somebody else's.
        notify: true,
        criteria: {
            kind: "match",
            at: "turnEnd",
            check: (view, { userId }) =>
                view.round === ROUND_TWO
                && view.roundOrder[0] === userId
                && gridSlot(view, userId) >= DONINGTON_GRID_SLOT,
        },
    },
    {
        // Michael Schumacher, qualifying for the 2006 Monaco Grand Prix: he
        // stopped his Ferrari at La Rascasse, the stewards decided it was
        // deliberate, and he started from the back. A spun car is the one
        // parked in a corner in Race Cars: dumped on its last row, sitting out
        // its next turn (§13).
        //
        // That flag is the only evidence, and it is cleared when the spun car's
        // slot comes round — in a two-car race, at the very next turn end. So
        // if the spinner's own turn end was one the cron played (§4.2: no
        // checkpoint sees it), the spin goes unrewarded. Accepted, as §4.2
        // accepts it for every state that lasts only one turn.
        id: "racecars.rascassegate",
        title: "Rascassegate",
        icon: "🅿️",
        description: "Spin at La Rascasse in Monaco.",
        criteria: {
            kind: "match",
            at: "turnEnd",
            check: (view, { userId }) => {
                const car = view.playerStates[userId];
                if (view.trackId !== MONACO.id || !car?.skipNextTurn) return false;
                return cornerAt(MONACO, car.row, car.lane)?.id === RASCASSE_CORNER_ID;
            },
        },
    },
    {
        // John Watson, the 1983 United States Grand Prix West at Long Beach: won
        // from 22nd on the grid, still the furthest back anyone has won from.
        id: "racecars.long-beach-83",
        title: "Long Beach '83",
        icon: "🚀",
        description: "Win a race from third on the grid or further back.",
        criteria: {
            kind: "match",
            at: "end",
            check: (view, { userId, outcome }) =>
                outcome === "win" && gridSlot(view, userId) >= LONG_BEACH_GRID_SLOT,
        },
    },
    {
        // Lewis Hamilton, the 2020 British Grand Prix at Silverstone: his front-
        // left tyre failed on the last lap and he limped home on three wheels,
        // still ahead.
        id: "racecars.three-wheeler",
        title: "Three Wheels at Silverstone",
        icon: "🛞",
        description: "Win a race with your tyres worn down to nothing.",
        criteria: {
            kind: "match",
            at: "end",
            check: (view, { userId, outcome }) => outcome === "win" && view.playerStates[userId]?.tyres === 0,
        },
    },
];
