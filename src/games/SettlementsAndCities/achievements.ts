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

/** Every player lays two roads in setup, and the board is the only record of them. */
export const SETUP_ROADS = 2;

function roadsOf(view: ISACSpecificGameStateResponse, userId: string): number {
    return view.edges.filter(edge => edge.hasRoad && edge.owner === userId).length;
}

function hasHeldWool(view: ISACSpecificGameStateResponse, userId: string): boolean {
    // An unsent flag reads as "held", so a view from mid-game never passes.
    return view.playerStates[userId]?.hasHeldWool ?? true;
}

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
    {
        // Setup gives every player two roads and roads never come off the board,
        // so holding no more than those two means none were built afterwards.
        id: "settlementsandcities.no-roads",
        title: "Roads? Where we're going we don't need roads!",
        icon: "🚀",
        description: "Win a game without building any roads after setup.",
        criteria: {
            kind: "match",
            at: "end",
            check: (view, { userId, outcome }) => outcome === "win" && roadsOf(view, userId) <= SETUP_ROADS,
        },
    },
    {
        // Gathering (production, setup, steals, Year of Plenty, Monopoly) and
        // trading both count; the flag is only sent once the game is complete.
        id: "settlementsandcities.no-animals-harmed",
        title: "No Animals Were Harmed",
        icon: "🐑",
        description: "Win a game without gathering or trading for any wool.",
        criteria: {
            kind: "match",
            at: "end",
            check: (view, { userId, outcome }) => outcome === "win" && !hasHeldWool(view, userId),
        },
    },
];
