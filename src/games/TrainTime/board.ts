// Static board data + pure rules helpers for Train Time: the 36-city North
// American map, its 100 claimable routes, the carriage-card deck composition
// and the scoring maths from docs/games/train-time.md.
//
// It also owns the shape of a game in progress and the deck/market helpers
// that mutate it, so the rules module never has to reach into
// TrainTimeModels.ts — that file pulls in Mongoose and Clerk, and the rules
// module is bundled for the client too (every game's rules ride along in the
// GameLogic barrel).
//
// Everything here is pure and isomorphic — no server-only imports — so the
// command classes (server) and the board/actions components (client) share one
// definition of "is this claim legal" rather than each growing their own.

import { shuffle } from "@/utils/games/shuffle";

// ─── Colours ────────────────────────────────────────────────────────────────

// The eight carriage-card colours plus the Engine wild (§3).
export const TRAIN_TIME_CARD_COLOURS = [
    'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'white', 'black',
] as const;

export type TrainTimeCardColour = (typeof TRAIN_TIME_CARD_COLOURS)[number] | 'engine';

// A route is one of the card colours, or grey (claimable with any single colour).
export type TrainTimeRouteColour = (typeof TRAIN_TIME_CARD_COLOURS)[number] | 'grey';

// 12 of each colour + 14 Engines = 110 cards (§3).
export const CARDS_PER_COLOUR = 12;
export const ENGINE_CARD_COUNT = 14;

export function buildCarriageDeck(): TrainTimeCardColour[] {
    const deck: TrainTimeCardColour[] = [];
    for (const colour of TRAIN_TIME_CARD_COLOURS) {
        for (let i = 0; i < CARDS_PER_COLOUR; i++) deck.push(colour);
    }
    for (let i = 0; i < ENGINE_CARD_COUNT; i++) deck.push('engine');
    return deck;
}

// ─── Setup constants (§4, §7) ───────────────────────────────────────────────

export const STARTING_HAND_SIZE = 4;
export const MARKET_SIZE = 5;
export const TRAINS_PER_PLAYER = 45;
export const CARDS_DRAWN_PER_TURN = 2;
// Three Engines face-up wipes the market and deals five fresh cards.
export const MARKET_ENGINE_WIPE_THRESHOLD = 3;
// At the end of a turn, this few trains left starts everyone's last lap.
export const FINAL_ROUND_TRAIN_THRESHOLD = 2;
// Below 4 players every double route is closed once either half is claimed (§6).
export const DOUBLE_ROUTES_OPEN_FROM_PLAYERS = 4;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;

// ─── Cities ─────────────────────────────────────────────────────────────────

export interface TrainTimeCityDef {
    id: number;
    /** Short code used by the route table below, e.g. "SLC". */
    key: string;
    name: string;
    /** Position on the board SVG (see BOARD_VIEWBOX). */
    x: number;
    y: number;
    /** Which side of the dot its name sits on, so labels don't cover track. */
    labelDir: 'n' | 's' | 'e' | 'w';
}

const CITY_DEFS: Omit<TrainTimeCityDef, 'id'>[] = [
    { key: 'VAN', name: "Vancouver", x: 120, y: 125, labelDir: 'n' },
    { key: 'SEA', name: "Seattle", x: 120, y: 182, labelDir: 'w' },
    { key: 'POR', name: "Portland", x: 118, y: 278, labelDir: 'w' },
    { key: 'SFO', name: "San Francisco", x: 98, y: 465, labelDir: 'w' },
    { key: 'LAX', name: "Los Angeles", x: 170, y: 615, labelDir: 's' },
    { key: 'LVG', name: "Las Vegas", x: 240, y: 575, labelDir: 'w' },
    { key: 'PHX', name: "Phoenix", x: 276, y: 635, labelDir: 's' },
    { key: 'ELP', name: "El Paso", x: 408, y: 680, labelDir: 's' },
    { key: 'SFE', name: "Santa Fe", x: 426, y: 525, labelDir: 'w' },
    { key: 'SLC', name: "Salt Lake City", x: 312, y: 385, labelDir: 'w' },
    { key: 'DEN', name: "Denver", x: 480, y: 442, labelDir: 'n' },
    { key: 'HEL', name: "Helena", x: 378, y: 245, labelDir: 'n' },
    { key: 'CAL', name: "Calgary", x: 276, y: 102, labelDir: 'n' },
    { key: 'WIN', name: "Winnipeg", x: 546, y: 98, labelDir: 'n' },
    { key: 'DUL', name: "Duluth", x: 684, y: 212, labelDir: 'n' },
    { key: 'OMA', name: "Omaha", x: 666, y: 360, labelDir: 'w' },
    { key: 'KCY', name: "Kansas City", x: 684, y: 432, labelDir: 'e' },
    { key: 'OKC', name: "Oklahoma City", x: 600, y: 495, labelDir: 'w' },
    { key: 'DAL', name: "Dallas", x: 666, y: 622, labelDir: 's' },
    { key: 'HOU', name: "Houston", x: 708, y: 680, labelDir: 's' },
    { key: 'NOR', name: "New Orleans", x: 822, y: 655, labelDir: 's' },
    { key: 'LRK', name: "Little Rock", x: 750, y: 532, labelDir: 'e' },
    { key: 'STL', name: "Saint Louis", x: 792, y: 418, labelDir: 'e' },
    { key: 'CHI', name: "Chicago", x: 816, y: 326, labelDir: 'w' },
    { key: 'SSM', name: "Sault St. Marie", x: 822, y: 138, labelDir: 'n' },
    { key: 'TOR', name: "Toronto", x: 924, y: 212, labelDir: 'n' },
    { key: 'MTL', name: "Montreal", x: 1044, y: 92, labelDir: 'n' },
    { key: 'BOS', name: "Boston", x: 1128, y: 186, labelDir: 'e' },
    { key: 'NYC', name: "New York", x: 1092, y: 260, labelDir: 'e' },
    { key: 'PIT', name: "Pittsburgh", x: 984, y: 314, labelDir: 'n' },
    { key: 'WAS', name: "Washington", x: 1104, y: 360, labelDir: 'e' },
    { key: 'NSH', name: "Nashville", x: 894, y: 465, labelDir: 'n' },
    { key: 'RAL', name: "Raleigh", x: 1056, y: 465, labelDir: 'e' },
    { key: 'CHS', name: "Charleston", x: 1068, y: 525, labelDir: 'e' },
    { key: 'ATL', name: "Atlanta", x: 960, y: 525, labelDir: 'w' },
    { key: 'MIA', name: "Miami", x: 1080, y: 712, labelDir: 's' },];

export const CITIES: TrainTimeCityDef[] = CITY_DEFS.map((c, id) => ({ ...c, id }));

export const CITY_COUNT = CITIES.length;

const CITY_ID_BY_KEY: Record<string, number> = Object.fromEntries(CITIES.map(c => [c.key, c.id]));

export const BOARD_VIEWBOX = { width: 1240, height: 790 };

// ─── Routes ─────────────────────────────────────────────────────────────────

export interface TrainTimeRouteDef {
    id: number;
    cityA: number;
    cityB: number;
    length: number;
    colour: TrainTimeRouteColour;
    /** The parallel track of a double route, or null for a single route. */
    twinId: number | null;
    /** Curvature of the drawn track, so long routes bend around the map. */
    bend: number;
    /** -1 / +1 offset the two halves of a double route to either side. */
    side: -1 | 0 | 1;
}

interface RouteSource {
    cityA: string;
    cityB: string;
    length: number;
    colour: TrainTimeRouteColour;
    twinId: number | null;
    bend: number;
    side: number;
}

const ROUTE_DEFS: RouteSource[] = [
    { cityA: 'VAN', cityB: 'SEA', length: 1, colour: 'grey', twinId: 1, bend: 0, side: -1 },
    { cityA: 'VAN', cityB: 'SEA', length: 1, colour: 'grey', twinId: 0, bend: 0, side: 1 },
    { cityA: 'VAN', cityB: 'CAL', length: 3, colour: 'grey', twinId: null, bend: 0, side: 0 },
    { cityA: 'SEA', cityB: 'CAL', length: 4, colour: 'grey', twinId: null, bend: 0, side: 0 },
    { cityA: 'SEA', cityB: 'POR', length: 1, colour: 'grey', twinId: 5, bend: 0, side: -1 },
    { cityA: 'SEA', cityB: 'POR', length: 1, colour: 'grey', twinId: 4, bend: 0, side: 1 },
    { cityA: 'SEA', cityB: 'HEL', length: 6, colour: 'yellow', twinId: null, bend: 0, side: 0 },
    { cityA: 'POR', cityB: 'SFO', length: 5, colour: 'green', twinId: 8, bend: 0, side: -1 },
    { cityA: 'POR', cityB: 'SFO', length: 5, colour: 'purple', twinId: 7, bend: 0, side: 1 },
    { cityA: 'POR', cityB: 'SLC', length: 6, colour: 'blue', twinId: null, bend: 0, side: 0 },
    { cityA: 'SFO', cityB: 'SLC', length: 5, colour: 'orange', twinId: 11, bend: 0, side: -1 },
    { cityA: 'SFO', cityB: 'SLC', length: 5, colour: 'white', twinId: 10, bend: 0, side: 1 },
    { cityA: 'SFO', cityB: 'LAX', length: 3, colour: 'yellow', twinId: 13, bend: 0, side: -1 },
    { cityA: 'SFO', cityB: 'LAX', length: 3, colour: 'purple', twinId: 12, bend: 0, side: 1 },
    { cityA: 'LAX', cityB: 'LVG', length: 2, colour: 'grey', twinId: null, bend: 0, side: 0 },
    { cityA: 'LAX', cityB: 'PHX', length: 3, colour: 'grey', twinId: null, bend: 0, side: 0 },
    { cityA: 'LAX', cityB: 'ELP', length: 6, colour: 'black', twinId: null, bend: 48, side: 0 },
    { cityA: 'LVG', cityB: 'SLC', length: 3, colour: 'orange', twinId: null, bend: 0, side: 0 },
    { cityA: 'SLC', cityB: 'HEL', length: 3, colour: 'purple', twinId: null, bend: 0, side: 0 },
    { cityA: 'SLC', cityB: 'DEN', length: 3, colour: 'red', twinId: 20, bend: 0, side: -1 },
    { cityA: 'SLC', cityB: 'DEN', length: 3, colour: 'yellow', twinId: 19, bend: 0, side: 1 },
    { cityA: 'CAL', cityB: 'HEL', length: 4, colour: 'grey', twinId: null, bend: 0, side: 0 },
    { cityA: 'CAL', cityB: 'WIN', length: 6, colour: 'white', twinId: null, bend: 0, side: 0 },
    { cityA: 'HEL', cityB: 'WIN', length: 4, colour: 'blue', twinId: null, bend: 0, side: 0 },
    { cityA: 'HEL', cityB: 'DUL', length: 6, colour: 'orange', twinId: null, bend: 0, side: 0 },
    { cityA: 'HEL', cityB: 'OMA', length: 5, colour: 'red', twinId: null, bend: 0, side: 0 },
    { cityA: 'HEL', cityB: 'DEN', length: 4, colour: 'green', twinId: null, bend: 0, side: 0 },
    { cityA: 'DEN', cityB: 'PHX', length: 5, colour: 'white', twinId: null, bend: 46, side: 0 },
    { cityA: 'DEN', cityB: 'SFE', length: 2, colour: 'grey', twinId: null, bend: 0, side: 0 },
    { cityA: 'DEN', cityB: 'OKC', length: 4, colour: 'red', twinId: null, bend: 0, side: 0 },
    { cityA: 'DEN', cityB: 'KCY', length: 4, colour: 'black', twinId: 31, bend: 0, side: -1 },
    { cityA: 'DEN', cityB: 'KCY', length: 4, colour: 'orange', twinId: 30, bend: 0, side: 1 },
    { cityA: 'DEN', cityB: 'OMA', length: 4, colour: 'purple', twinId: null, bend: 0, side: 0 },
    { cityA: 'PHX', cityB: 'SFE', length: 3, colour: 'grey', twinId: null, bend: 0, side: 0 },
    { cityA: 'PHX', cityB: 'ELP', length: 3, colour: 'grey', twinId: null, bend: 0, side: 0 },
    { cityA: 'SFE', cityB: 'ELP', length: 2, colour: 'grey', twinId: null, bend: 0, side: 0 },
    { cityA: 'SFE', cityB: 'OKC', length: 3, colour: 'blue', twinId: null, bend: 0, side: 0 },
    { cityA: 'ELP', cityB: 'OKC', length: 5, colour: 'yellow', twinId: null, bend: 0, side: 0 },
    { cityA: 'ELP', cityB: 'DAL', length: 4, colour: 'red', twinId: null, bend: 0, side: 0 },
    { cityA: 'ELP', cityB: 'HOU', length: 6, colour: 'green', twinId: null, bend: 34, side: 0 },
    { cityA: 'WIN', cityB: 'SSM', length: 6, colour: 'grey', twinId: null, bend: 0, side: 0 },
    { cityA: 'WIN', cityB: 'DUL', length: 4, colour: 'black', twinId: null, bend: 0, side: 0 },
    { cityA: 'DUL', cityB: 'SSM', length: 3, colour: 'grey', twinId: null, bend: 0, side: 0 },
    { cityA: 'DUL', cityB: 'TOR', length: 6, colour: 'purple', twinId: null, bend: -38, side: 0 },
    { cityA: 'DUL', cityB: 'CHI', length: 3, colour: 'red', twinId: null, bend: 0, side: 0 },
    { cityA: 'DUL', cityB: 'OMA', length: 2, colour: 'grey', twinId: 46, bend: 0, side: -1 },
    { cityA: 'DUL', cityB: 'OMA', length: 2, colour: 'grey', twinId: 45, bend: 0, side: 1 },
    { cityA: 'OMA', cityB: 'CHI', length: 4, colour: 'blue', twinId: null, bend: 0, side: 0 },
    { cityA: 'OMA', cityB: 'KCY', length: 1, colour: 'grey', twinId: 49, bend: 0, side: -1 },
    { cityA: 'OMA', cityB: 'KCY', length: 1, colour: 'grey', twinId: 48, bend: 0, side: 1 },
    { cityA: 'KCY', cityB: 'STL', length: 2, colour: 'blue', twinId: 51, bend: 0, side: -1 },
    { cityA: 'KCY', cityB: 'STL', length: 2, colour: 'purple', twinId: 50, bend: 0, side: 1 },
    { cityA: 'KCY', cityB: 'OKC', length: 2, colour: 'grey', twinId: 53, bend: 0, side: -1 },
    { cityA: 'KCY', cityB: 'OKC', length: 2, colour: 'grey', twinId: 52, bend: 0, side: 1 },
    { cityA: 'OKC', cityB: 'LRK', length: 2, colour: 'grey', twinId: null, bend: 0, side: 0 },
    { cityA: 'OKC', cityB: 'DAL', length: 2, colour: 'grey', twinId: 56, bend: 0, side: -1 },
    { cityA: 'OKC', cityB: 'DAL', length: 2, colour: 'grey', twinId: 55, bend: 0, side: 1 },
    { cityA: 'DAL', cityB: 'LRK', length: 2, colour: 'grey', twinId: null, bend: 0, side: 0 },
    { cityA: 'DAL', cityB: 'HOU', length: 1, colour: 'grey', twinId: 59, bend: 0, side: -1 },
    { cityA: 'DAL', cityB: 'HOU', length: 1, colour: 'grey', twinId: 58, bend: 0, side: 1 },
    { cityA: 'HOU', cityB: 'NOR', length: 2, colour: 'grey', twinId: null, bend: 0, side: 0 },
    { cityA: 'LRK', cityB: 'NOR', length: 3, colour: 'green', twinId: null, bend: 0, side: 0 },
    { cityA: 'LRK', cityB: 'NSH', length: 3, colour: 'white', twinId: null, bend: 0, side: 0 },
    { cityA: 'LRK', cityB: 'STL', length: 2, colour: 'grey', twinId: null, bend: 0, side: 0 },
    { cityA: 'STL', cityB: 'CHI', length: 2, colour: 'green', twinId: 65, bend: 0, side: -1 },
    { cityA: 'STL', cityB: 'CHI', length: 2, colour: 'white', twinId: 64, bend: 0, side: 1 },
    { cityA: 'STL', cityB: 'PIT', length: 5, colour: 'green', twinId: null, bend: 0, side: 0 },
    { cityA: 'STL', cityB: 'NSH', length: 2, colour: 'grey', twinId: null, bend: 0, side: 0 },
    { cityA: 'CHI', cityB: 'PIT', length: 3, colour: 'orange', twinId: 69, bend: 0, side: -1 },
    { cityA: 'CHI', cityB: 'PIT', length: 3, colour: 'black', twinId: 68, bend: 0, side: 1 },
    { cityA: 'CHI', cityB: 'TOR', length: 4, colour: 'white', twinId: null, bend: 0, side: 0 },
    { cityA: 'SSM', cityB: 'TOR', length: 2, colour: 'grey', twinId: null, bend: 0, side: 0 },
    { cityA: 'SSM', cityB: 'MTL', length: 5, colour: 'black', twinId: null, bend: 0, side: 0 },
    { cityA: 'TOR', cityB: 'MTL', length: 3, colour: 'grey', twinId: null, bend: 0, side: 0 },
    { cityA: 'TOR', cityB: 'PIT', length: 2, colour: 'grey', twinId: null, bend: 0, side: 0 },
    { cityA: 'MTL', cityB: 'BOS', length: 2, colour: 'grey', twinId: 76, bend: 0, side: -1 },
    { cityA: 'MTL', cityB: 'BOS', length: 2, colour: 'grey', twinId: 75, bend: 0, side: 1 },
    { cityA: 'MTL', cityB: 'NYC', length: 3, colour: 'blue', twinId: null, bend: 0, side: 0 },
    { cityA: 'BOS', cityB: 'NYC', length: 2, colour: 'yellow', twinId: 79, bend: 0, side: -1 },
    { cityA: 'BOS', cityB: 'NYC', length: 2, colour: 'red', twinId: 78, bend: 0, side: 1 },
    { cityA: 'NYC', cityB: 'PIT', length: 2, colour: 'white', twinId: 81, bend: 0, side: -1 },
    { cityA: 'NYC', cityB: 'PIT', length: 2, colour: 'green', twinId: 80, bend: 0, side: 1 },
    { cityA: 'NYC', cityB: 'WAS', length: 2, colour: 'orange', twinId: 83, bend: 0, side: -1 },
    { cityA: 'NYC', cityB: 'WAS', length: 2, colour: 'black', twinId: 82, bend: 0, side: 1 },
    { cityA: 'PIT', cityB: 'WAS', length: 2, colour: 'grey', twinId: null, bend: 0, side: 0 },
    { cityA: 'PIT', cityB: 'RAL', length: 2, colour: 'grey', twinId: null, bend: 0, side: 0 },
    { cityA: 'WAS', cityB: 'RAL', length: 2, colour: 'grey', twinId: 87, bend: 0, side: -1 },
    { cityA: 'WAS', cityB: 'RAL', length: 2, colour: 'grey', twinId: 86, bend: 0, side: 1 },
    { cityA: 'RAL', cityB: 'CHS', length: 2, colour: 'grey', twinId: null, bend: 0, side: 0 },
    { cityA: 'RAL', cityB: 'ATL', length: 2, colour: 'grey', twinId: 90, bend: 0, side: -1 },
    { cityA: 'RAL', cityB: 'ATL', length: 2, colour: 'grey', twinId: 89, bend: 0, side: 1 },
    { cityA: 'RAL', cityB: 'NSH', length: 3, colour: 'black', twinId: null, bend: 0, side: 0 },
    { cityA: 'NSH', cityB: 'ATL', length: 1, colour: 'grey', twinId: null, bend: 0, side: 0 },
    { cityA: 'NSH', cityB: 'PIT', length: 4, colour: 'yellow', twinId: null, bend: 0, side: 0 },
    { cityA: 'ATL', cityB: 'CHS', length: 2, colour: 'grey', twinId: null, bend: 0, side: 0 },
    { cityA: 'ATL', cityB: 'MIA', length: 5, colour: 'blue', twinId: null, bend: 0, side: 0 },
    { cityA: 'ATL', cityB: 'NOR', length: 4, colour: 'yellow', twinId: 97, bend: 0, side: -1 },
    { cityA: 'ATL', cityB: 'NOR', length: 4, colour: 'orange', twinId: 96, bend: 0, side: 1 },
    { cityA: 'CHS', cityB: 'MIA', length: 4, colour: 'purple', twinId: null, bend: 0, side: 0 },
    { cityA: 'NOR', cityB: 'MIA', length: 6, colour: 'red', twinId: null, bend: 0, side: 0 },];

export const ROUTES: TrainTimeRouteDef[] = ROUTE_DEFS.map((r, id) => ({
    id,
    cityA: CITY_ID_BY_KEY[r.cityA],
    cityB: CITY_ID_BY_KEY[r.cityB],
    length: r.length,
    colour: r.colour,
    twinId: r.twinId,
    bend: r.bend,
    side: r.side as -1 | 0 | 1,
}));

export const ROUTE_COUNT = ROUTES.length;

export function cityName(cityId: number): string {
    return CITIES[cityId]?.name ?? String(cityId);
}

export function routeName(route: TrainTimeRouteDef): string {
    return `${cityName(route.cityA)} – ${cityName(route.cityB)}`;
}

// ─── Scoring (§6) ───────────────────────────────────────────────────────────

// Points for a claimed route, indexed by its length. Deliberately steep: a
// 6-length route is worth more than six 1-length ones put together.
const ROUTE_POINTS: Record<number, number> = { 1: 1, 2: 2, 3: 4, 4: 7, 5: 10, 6: 15 };

export function routeScore(length: number): number {
    return ROUTE_POINTS[length] ?? 0;
}

// ─── Claim legality ─────────────────────────────────────────────────────────

/** Why a route can't be claimed right now, or null when it can. */
export type ClaimBlockedReason = 'taken' | 'twin-taken' | 'own-twin' | 'not-enough-trains' | 'no-matching-cards';

export interface ClaimContext {
    /** Owner userId per route id, null where unclaimed. */
    routeOwners: (string | null)[];
    playerCount: number;
    /** The claiming player's hand. */
    hand: TrainTimeCardColour[];
    /** Trains the claiming player has left. */
    trains: number;
    playerId: string;
}

// Both halves of a double route are only in play with 4+ players, and nobody
// may ever own both halves themselves (§6).
export function doubleRouteBlocked(route: TrainTimeRouteDef, ctx: ClaimContext): ClaimBlockedReason | null {
    if (route.twinId === null) return null;
    const twinOwner = ctx.routeOwners[route.twinId];
    if (twinOwner === null) return null;
    if (twinOwner === ctx.playerId) return 'own-twin';
    return ctx.playerCount < DOUBLE_ROUTES_OPEN_FROM_PLAYERS ? 'twin-taken' : null;
}

/**
 * The colours a hand could pay this route with, cheapest-wild-use first.
 * A grey route accepts any single colour; a coloured route only its own.
 * Engines substitute for any colour, so a colour is payable when
 * (cards of that colour) + (engines) covers the route's length.
 */
export function payableColours(route: TrainTimeRouteDef, hand: TrainTimeCardColour[]): TrainTimeCardColour[] {
    const engines = hand.filter(c => c === 'engine').length;
    const candidates: TrainTimeCardColour[] = route.colour === 'grey'
        ? [...TRAIN_TIME_CARD_COLOURS]
        : [route.colour];
    const payable = candidates.filter(colour => {
        const owned = hand.filter(c => c === colour).length;
        return owned + engines >= route.length;
    });
    // An all-Engine payment is legal on any route — every card played is then a
    // wild, which satisfies "every card played is the same colour" vacuously.
    if (engines >= route.length) payable.push('engine');
    return payable;
}

export function claimBlockedReason(route: TrainTimeRouteDef, ctx: ClaimContext): ClaimBlockedReason | null {
    if (ctx.routeOwners[route.id] !== null) return 'taken';
    const doubleBlocked = doubleRouteBlocked(route, ctx);
    if (doubleBlocked) return doubleBlocked;
    if (ctx.trains < route.length) return 'not-enough-trains';
    if (payableColours(route, ctx.hand).length === 0) return 'no-matching-cards';
    return null;
}

export function canClaimRoute(route: TrainTimeRouteDef, ctx: ClaimContext): boolean {
    return claimBlockedReason(route, ctx) === null;
}

/** Every route this player could claim right now. */
export function claimableRouteIds(ctx: ClaimContext): Set<number> {
    const claimable = new Set<number>();
    for (const route of ROUTES) {
        if (canClaimRoute(route, ctx)) claimable.add(route.id);
    }
    return claimable;
}

/**
 * Validates an exact payment (the list of cards the player chose to spend)
 * against a route: right number of cards, all held, and every non-Engine card
 * the same colour — matching the route's colour unless it's grey.
 */
export function paymentIsValid(route: TrainTimeRouteDef, payment: TrainTimeCardColour[], hand: TrainTimeCardColour[]): boolean {
    if (payment.length !== route.length) return false;

    const remaining = [...hand];
    for (const card of payment) {
        const idx = remaining.indexOf(card);
        if (idx === -1) return false;
        remaining.splice(idx, 1);
    }

    const coloured = payment.filter(c => c !== 'engine');
    const distinct = new Set(coloured);
    if (distinct.size > 1) return false;
    if (route.colour !== 'grey' && distinct.size === 1 && !distinct.has(route.colour)) return false;
    return true;
}

/**
 * The default payment for a route in a given colour: spend the coloured cards
 * first and top up with Engines, so wilds are only burned when they have to be.
 */
export function buildPayment(route: TrainTimeRouteDef, colour: TrainTimeCardColour, hand: TrainTimeCardColour[]): TrainTimeCardColour[] {
    const payment: TrainTimeCardColour[] = [];
    const owned = hand.filter(c => c === colour).length;
    const coloured = colour === 'engine' ? 0 : Math.min(owned, route.length);
    for (let i = 0; i < coloured; i++) payment.push(colour);
    while (payment.length < route.length) payment.push('engine');
    return payment;
}

// ─── Market (§4, §5) ────────────────────────────────────────────────────────

/** True when three or more of the face-up cards are Engines and the market must be wiped. */
export function marketNeedsWipe(market: TrainTimeCardColour[]): boolean {
    return market.filter(c => c === 'engine').length >= MARKET_ENGINE_WIPE_THRESHOLD;
}

// ─── Specific game state ────────────────────────────────────────────────────

export interface ITrainTimePlayerState {
    /** Secret — redacted from every response except its owner's (design doc §10). */
    hand: TrainTimeCardColour[];
    trains: number;
    score: number;
    routesClaimed: number;
}

export interface ITrainTimeSpecificGameState {
    /** Face-down draw pile; the last element is the top card. */
    deck: TrainTimeCardColour[];
    discard: TrainTimeCardColour[];
    /** The five face-up cards everybody can draw from. */
    market: TrainTimeCardColour[];
    playerStates: Map<string, ITrainTimePlayerState>;
    /** Owning userId per route id, null where unclaimed. Length ROUTE_COUNT. */
    routeOwners: (string | null)[];
    /** Cards taken so far in the active player's draw action (0 or 1). */
    drawsThisTurn: number;
    /**
     * Once someone ends a turn on 2 or fewer trains, everyone — including them —
     * gets exactly one more turn (§7). This holds the userIds who still owe one;
     * the game ends when it empties. Null until the last lap starts.
     */
    finalRoundPending: string[] | null;
    /** Set the moment the last lap finishes, so CheckGameOver can score up. */
    gameOver: boolean;
}

/**
 * Deals a fresh game: shuffled deck, four cards each, five face-up.
 * Deterministic given the shuffled deck, so it's the one place setup lives.
 */
export function buildInitialTrainTimeState(turnOrder: string[]): ITrainTimeSpecificGameState {
    const deck = shuffle(buildCarriageDeck());

    const playerStates = new Map<string, ITrainTimePlayerState>();
    for (const userId of turnOrder) {
        playerStates.set(userId, {
            hand: deck.splice(-STARTING_HAND_SIZE, STARTING_HAND_SIZE),
            trains: TRAINS_PER_PLAYER,
            score: 0,
            routesClaimed: 0,
        });
    }

    const state: ITrainTimeSpecificGameState = {
        deck,
        discard: [],
        market: deck.splice(-MARKET_SIZE, MARKET_SIZE),
        playerStates,
        routeOwners: Array.from({ length: ROUTE_COUNT }, () => null),
        drawsThisTurn: 0,
        finalRoundPending: null,
        gameOver: false,
    };
    // The three-Engine rule applies to the opening market too (§4).
    refillMarket(state);
    return state;
}

/**
 * Tops the market back up to five from the deck (reshuffling the discards in
 * when the deck runs dry) and applies the three-Engine wipe rule (§4). Shared
 * by setup and by every draw, so the market can only ever be refilled one way.
 */
export function refillMarket(state: ITrainTimeSpecificGameState): void {
    // A wipe can deal a market that needs wiping again, so this repeats — but
    // only while there are enough cards left to actually replace five.
    for (let guard = 0; guard < 10; guard++) {
        while (state.market.length < MARKET_SIZE) {
            const card = drawFromDeck(state);
            if (card === null) break;
            state.market.push(card);
        }
        if (state.market.length < MARKET_SIZE || !marketNeedsWipe(state.market)) return;
        state.discard.push(...state.market.splice(0, state.market.length));
    }
}

/**
 * Takes the top card off the deck, recycling the discard pile into a fresh
 * shuffled deck first if needed (§5). Null when there are no cards left at all.
 */
export function drawFromDeck(state: ITrainTimeSpecificGameState): TrainTimeCardColour | null {
    if (state.deck.length === 0) {
        if (state.discard.length === 0) return null;
        state.deck = shuffle(state.discard);
        state.discard = [];
    }
    return state.deck.pop() ?? null;
}
