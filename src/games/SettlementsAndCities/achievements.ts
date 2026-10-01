// Settlements & Cities' own achievements (docs/achievements.md §11), registered
// in GAME_ACHIEVEMENTS. Browser-safe, like everything the catalogue imports.
//
// Every check reads only what the whole table sees: the buildings on the board
// and the two bonus holders. A hand's contents and the development cards are
// hidden, and aren't in the view a check is handed (§9) — nor should a check go
// looking for them.
import type { GameAchievement } from "@/utils/games/achievements";
import type { ISACSpecificGameStateResponse } from "./apiModels";

/** A player's whole supply of cities. */
export const CITIES_TO_PLAN = 4;

function citiesOf(view: ISACSpecificGameStateResponse, userId: string): number {
    return view.vertices.filter(vertex => vertex.building === "city" && vertex.owner === userId).length;
}

export const achievements: GameAchievement<ISACSpecificGameStateResponse>[] = [
    {
        id: "settlementsandcities.settler",
        title: "Settler",
        icon: "🏘️",
        description: "Play 5 games of Settlements & Cities.",
        criteria: { kind: "career", progress: record => record.played, target: 5 },
    },
    {
        id: "settlementsandcities.city-planner",
        title: "City Planner",
        icon: "🏙️",
        description: "Have four cities at the end of a turn.",
        criteria: {
            kind: "match",
            at: "turnEnd",
            check: (view, { userId }) => citiesOf(view, userId) >= CITIES_TO_PLAN,
        },
    },
    {
        // Both bonuses are on the table at every moment, for every viewer.
        id: "settlementsandcities.double-honours",
        title: "Double Honours",
        icon: "🎖️",
        description: "Win a game holding both Longest Road and Largest Army.",
        criteria: {
            kind: "match",
            at: "end",
            check: (view, { userId, outcome }) =>
                outcome === "win" && view.longestRoadOwner === userId && view.largestArmyOwner === userId,
        },
    },
];
