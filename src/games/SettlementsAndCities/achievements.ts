// Settlements & Cities' own achievements (docs/achievements.md §11), registered
// in GAME_ACHIEVEMENTS. Browser-safe, like everything the catalogue imports.
//
// Every check reads only what the whole table sees: the buildings on the board,
// the two bonus holders, hand sizes, and what a finished game reveals. A hand's
// contents and the development cards are hidden, and aren't in the view a check
// is handed (§9) — nor should a check go looking for them.
//
// Buildings never come off the board and a city is never knocked back down, so
// "never built next to a 6" or "never built a city" can be read off the final
// board. A hand empties, though, so "never held grain" needs a tally kept for it
// (sacHasHeld), sent once the game is over.
import type { GameAchievement } from "@/utils/games/achievements";
import type { ISACSpecificGameStateResponse } from "./apiModels";
import { BOARD_TOPOLOGY, isRedNumber } from "./board";

/** A player's whole supply of cities. */
export const CITIES_TO_PLAN = 4;

/** Every player lays two roads in setup, and the board is the only record of them. */
export const SETUP_ROADS = 2;

/** Cards in hand at the end of a turn for Living Dangerously. */
export const DANGEROUS_HAND = 15;

/** Victory-point cards held at the win for Ace Up the Sleeve. */
export const SLEEVE_VP_CARDS = 2;

function roadsOf(view: ISACSpecificGameStateResponse, userId: string): number {
    return view.edges.filter(edge => edge.hasRoad && edge.owner === userId).length;
}

function hasHeld(view: ISACSpecificGameStateResponse, userId: string, flag: "hasHeldWool" | "hasHeldGrain"): boolean {
    // An unsent flag reads as "held", so a view from mid-game never passes.
    return view.playerStates[userId]?.[flag] ?? true;
}

/** Whether any of the player's buildings touches a red number: a 6 or an 8. */
function buildsOnRedNumbers(view: ISACSpecificGameStateResponse, userId: string): boolean {
    return view.vertices.some((vertex, vid) =>
        vertex.owner === userId && vertex.building !== null &&
        BOARD_TOPOLOGY.vertexHexes[vid].some(hex => isRedNumber(view.hexes[hex]?.numberToken ?? null)),
    );
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
            check: (view, { userId, outcome }) => outcome === "win" && !hasHeld(view, userId, "hasHeldWool"),
        },
    },
    {
        id: "settlementsandcities.against-the-odds",
        title: "Against the Odds",
        icon: "🎲",
        description: "Win a game without building next to a 6 or an 8.",
        criteria: {
            kind: "match",
            at: "end",
            check: (view, { userId, outcome }) => outcome === "win" && !buildsOnRedNumbers(view, userId),
        },
    },
    {
        // Gathering (production, setup, steals, Year of Plenty, Monopoly) and
        // trading both count, as for wool.
        id: "settlementsandcities.gluten-free",
        title: "Gluten Free",
        icon: "🌾",
        description: "Win a game without gathering or trading for any grain.",
        criteria: {
            kind: "match",
            at: "end",
            check: (view, { userId, outcome }) => outcome === "win" && !hasHeld(view, userId, "hasHeldGrain"),
        },
    },
    {
        id: "settlementsandcities.suburbia",
        title: "Suburbia",
        icon: "🏡",
        description: "Win a game without building a single city.",
        criteria: {
            kind: "match",
            at: "end",
            check: (view, { userId, outcome }) => outcome === "win" && citiesOf(view, userId) === 0,
        },
    },
    {
        // The count is only sent once the game is over, when the cards are
        // revealed anyway.
        id: "settlementsandcities.ace-up-the-sleeve",
        title: "Ace Up the Sleeve",
        icon: "🃏",
        description: "Win a game holding two or more victory point cards.",
        criteria: {
            kind: "match",
            at: "end",
            check: (view, { userId, outcome }) =>
                outcome === "win" && (view.playerStates[userId]?.victoryPointCards ?? 0) >= SLEEVE_VP_CARDS,
        },
    },
    {
        // Hand size is public, and a 7 would take half of it.
        id: "settlementsandcities.living-dangerously",
        title: "Living Dangerously",
        icon: "🎒",
        description: "Hold 15 or more resource cards at the end of a turn.",
        criteria: {
            kind: "match",
            at: "turnEnd",
            check: (view, { userId }) => (view.playerStates[userId]?.resourceCount ?? 0) >= DANGEROUS_HAND,
        },
    },
    {
        id: "settlementsandcities.road-warrior",
        title: "Road Warrior",
        icon: "🛣️",
        description: "Win a game holding Longest Road with every one of your roads built.",
        criteria: {
            kind: "match",
            at: "end",
            check: (view, { userId, outcome }) =>
                outcome === "win" && view.longestRoadOwner === userId && view.playerStates[userId]?.remainingRoads === 0,
        },
    },
];
