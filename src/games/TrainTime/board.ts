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
import { pluralize, signed } from "@/utils/ui/text";

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

// ─── Destination Tickets (§3, §6) ───────────────────────────────────────────

export interface TrainTimeTicketDef {
    id: number;
    cityA: number;
    cityB: number;
    /** Added to your score if you connect the two cities, subtracted if you don't. */
    points: number;
}

// The 30-ticket deck: 4 points for a neighbourly hop, 22 for crossing the
// continent. Every pair is connectable on this map — the board graph is one
// connected component, which TrainTimeLogic.test.ts asserts.
const TICKET_DEFS: [string, string, number][] = [
    ['DEN', 'ELP', 4],
    ['KCY', 'HOU', 5],
    ['NYC', 'ATL', 6],
    ['CHI', 'NOR', 7],
    ['CAL', 'SLC', 7],
    ['HEL', 'LAX', 8],
    ['DUL', 'HOU', 8],
    ['SSM', 'NSH', 8],
    ['MTL', 'ATL', 9],
    ['SSM', 'OKC', 9],
    ['SEA', 'LAX', 9],
    ['CHI', 'SFE', 9],
    ['DUL', 'ELP', 10],
    ['TOR', 'MIA', 10],
    ['POR', 'PHX', 11],
    ['WIN', 'LRK', 11],
    ['DEN', 'PIT', 11],
    ['DAL', 'NYC', 11],
    ['BOS', 'MIA', 12],
    ['WIN', 'HOU', 12],
    ['MTL', 'NOR', 13],
    ['CAL', 'PHX', 13],
    ['VAN', 'SFE', 13],
    ['LAX', 'CHI', 16],
    ['POR', 'NSH', 17],
    ['SFO', 'ATL', 17],
    ['VAN', 'MTL', 20],
    ['LAX', 'MIA', 20],
    ['LAX', 'NYC', 21],
    ['SEA', 'NYC', 22],
];

export const TICKETS: TrainTimeTicketDef[] = TICKET_DEFS.map(([a, b, points], id) => ({
    id,
    cityA: CITY_ID_BY_KEY[a],
    cityB: CITY_ID_BY_KEY[b],
    points,
}));

export const TICKET_COUNT = TICKETS.length;

/** Dealt at setup (§4); the player keeps at least SETUP_TICKETS_KEPT_MIN of them. */
export const SETUP_TICKETS_DEALT = 3;
export const SETUP_TICKETS_KEPT_MIN = 2;
/** Action C draws this many and makes you keep at least one (§5). */
export const TICKETS_DRAWN_PER_TURN = 3;
export const DRAWN_TICKETS_KEPT_MIN = 1;

export function ticketName(ticket: TrainTimeTicketDef): string {
    return `${cityName(ticket.cityA)} – ${cityName(ticket.cityB)}`;
}

/**
 * Union-find over the routes one player owns: returns, per city id, the id of
 * the network component that city sits in. Cities the player never reached sit
 * alone in their own component, which is exactly what makes a ticket fail.
 */
export function playerNetwork(routeOwners: (string | null)[], ownerId: string): number[] {
    const parent = CITIES.map(c => c.id);
    const find = (city: number): number => {
        let root = city;
        while (parent[root] !== root) root = parent[root];
        return root;
    };

    for (const route of ROUTES) {
        if (routeOwners[route.id] !== ownerId) continue;
        const rootA = find(route.cityA);
        const rootB = find(route.cityB);
        if (rootA !== rootB) parent[rootA] = rootB;
    }
    return CITIES.map(c => find(c.id));
}

/** True when an unbroken chain of the player's routes links the ticket's two cities. */
export function ticketIsComplete(ticket: TrainTimeTicketDef, network: number[]): boolean {
    return network[ticket.cityA] === network[ticket.cityB];
}

export interface TicketOutcome {
    ticket: TrainTimeTicketDef;
    complete: boolean;
}

/** How every one of a player's tickets ended up, in the order they were kept. */
export function ticketOutcomes(ticketIds: number[], routeOwners: (string | null)[], ownerId: string): TicketOutcome[] {
    const network = playerNetwork(routeOwners, ownerId);
    return ticketIds
        .map(id => TICKETS[id])
        .filter((ticket): ticket is TrainTimeTicketDef => ticket !== undefined)
        .map(ticket => ({ ticket, complete: ticketIsComplete(ticket, network) }));
}

/** Completed tickets add their value, incomplete ones subtract it (§7). */
export function ticketPoints(outcomes: TicketOutcome[]): number {
    return outcomes.reduce((total, o) => total + (o.complete ? o.ticket.points : -o.ticket.points), 0);
}

// ─── The Long Haul bonus (§7) ───────────────────────────────────────────────

/** Awarded at the end to the longest continuous run of track — shared on a tie. */
export const LONG_HAUL_BONUS = 10;

/**
 * A player's whole score: track points banked as they claimed, the ticket
 * swing, and the Long Haul bonus (§7). Both the persisted player state and the
 * response shape carry these three, so scoring, the standings and the final
 * score sheet all add them up the same way.
 */
export function totalScore(ps: { score: number; ticketScore: number; longHaulBonus: number }): number {
    return ps.score + ps.ticketScore + ps.longHaulBonus;
}

// Finding a longest trail is exponential in the worst case. The bound inside
// the walk settles a real network in a fraction of a millisecond — 45 trains
// buy at most 27 of this map's routes, and a player may never own both halves
// of a double — but it is a bound, not a guarantee: handed a board no game
// could deal (every route to one player), the search runs for minutes. So the
// walk counts its steps and gives up too, which keeps a pure helper from
// spinning on whatever state it is passed. Real boards never come near it.
const LONGEST_RUN_STEP_BUDGET = 200_000;

/**
 * The longest continuous run of track a player owns, measured in train spaces
 * (§7.3). Branches and loops are fine as part of a network, but the measured
 * run may not use the same route twice — so this is a longest *trail*, not a
 * longest simple path: cities may repeat, routes may not.
 *
 * Depth-first from every city the player has reached, walking each of their
 * routes at most once, and cutting any branch whose remaining track can no
 * longer beat the best run already found.
 */
export function longestRun(routeOwners: (string | null)[], ownerId: string): number {
    /** One of the player's routes, as seen from one of its two cities. */
    interface Link { to: number; routeId: number; length: number }

    const linksFrom = new Map<number, Link[]>();
    const addLink = (city: number, link: Link) => {
        const links = linksFrom.get(city);
        if (links) links.push(link);
        else linksFrom.set(city, [link]);
    };
    let unwalked = 0;
    for (const route of ROUTES) {
        if (routeOwners[route.id] !== ownerId) continue;
        addLink(route.cityA, { to: route.cityB, routeId: route.id, length: route.length });
        addLink(route.cityB, { to: route.cityA, routeId: route.id, length: route.length });
        unwalked += route.length;
    }

    // Longest track first, so a good run turns up early and the bound starts
    // cutting sooner.
    for (const links of linksFrom.values()) links.sort((a, b) => b.length - a.length);

    const walked = new Set<number>();
    let longest = 0;
    let stepsTaken = 0;

    const walk = (city: number, run: number): void => {
        if (run > longest) longest = run;
        if (stepsTaken++ >= LONGEST_RUN_STEP_BUDGET) return;
        // Even laying every route still unwalked wouldn't beat the best run,
        // so nothing below here can either.
        if (run + unwalked <= longest) return;
        for (const link of linksFrom.get(city) ?? []) {
            if (walked.has(link.routeId)) continue;
            walked.add(link.routeId);
            unwalked -= link.length;
            walk(link.to, run + link.length);
            unwalked += link.length;
            walked.delete(link.routeId);
        }
    };
    for (const city of linksFrom.keys()) walk(city, 0);

    return longest;
}

/**
 * Every player's longest run in one pass, keyed by the id they own routes
 * under. The Long Haul is a comparison between players, so both the award at
 * scoring time and the "took the lead" note on a claim want the whole table's
 * runs rather than one player's.
 */
export function longestRuns(routeOwners: (string | null)[], ownerIds: Iterable<string>): Map<string, number> {
    const runs = new Map<string, number>();
    for (const ownerId of ownerIds) runs.set(ownerId, longestRun(routeOwners, ownerId));
    return runs;
}

/**
 * A player's total, broken into the parts that made it (§7) — the same four
 * facts wherever a Train Time result is explained: the in-game score sheet and
 * the stored GameResult summary. Callers join them with whatever separator
 * suits, so the wording can't drift between the two.
 */
export function scoreBreakdown(ps: {
    score: number;
    ticketScore: number;
    longHaulBonus: number;
    longestRun: number;
}): string[] {
    const parts = [`${ps.score} from track`, `${signed(ps.ticketScore)} tickets`];
    if (ps.longHaulBonus > 0) parts.push(`${signed(ps.longHaulBonus)} Long Haul`);
    parts.push(`longest run ${pluralize(ps.longestRun, 'train')}`);
    return parts;
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

/** The colours this route could be claimed in — grey takes any single one. */
function candidateColours(route: TrainTimeRouteDef): TrainTimeCardColour[] {
    return route.colour === 'grey' ? [...TRAIN_TIME_CARD_COLOURS] : [route.colour];
}

/**
 * The colours a hand could pay this route with. Engines substitute for any
 * colour, so a colour is payable when (cards of that colour) + (engines)
 * covers the route's length — which also covers paying entirely in Engines,
 * since every card played is then a wild.
 */
export function payableColours(route: TrainTimeRouteDef, hand: TrainTimeCardColour[]): TrainTimeCardColour[] {
    const engines = hand.filter(c => c === 'engine').length;
    return candidateColours(route).filter(colour => {
        const owned = hand.filter(c => c === colour).length;
        return owned + engines >= route.length;
    });
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

/** One way a route could be paid for, priced against the player's hand. */
export interface PaymentOption {
    colour: TrainTimeCardColour;
    /** The cards this option would spend. Empty when the hand can't cover it. */
    payment: TrainTimeCardColour[];
    /** Engines this option burns — the cost the player feels later. */
    enginesUsed: number;
    /** How many cards short the hand is; 0 when the option is payable. */
    shortfall: number;
}

/**
 * Every colour this route could be claimed in, priced against a hand and
 * ordered by what it costs: payable options first (cheapest in Engines), then
 * the near-misses, so the claim sheet can show both "you can pay this" and
 * "you're one card away".
 */
export function paymentOptions(route: TrainTimeRouteDef, hand: TrainTimeCardColour[]): PaymentOption[] {
    const engines = hand.filter(c => c === 'engine').length;

    return candidateColours(route).map((colour): PaymentOption => {
        const owned = hand.filter(c => c === colour).length;
        const shortfall = Math.max(0, route.length - owned - engines);
        return {
            colour,
            payment: shortfall === 0 ? buildPayment(route, colour, hand) : [],
            enginesUsed: shortfall === 0 ? Math.max(0, route.length - owned) : 0,
            shortfall,
        };
    }).sort((a, b) =>
        (a.shortfall - b.shortfall) || (a.enginesUsed - b.enginesUsed) || a.colour.localeCompare(b.colour));
}

/**
 * The default payment for a route in a given colour: spend the coloured cards
 * first and top up with Engines, so wilds are only burned when they have to be.
 */
export function buildPayment(route: TrainTimeRouteDef, colour: TrainTimeCardColour, hand: TrainTimeCardColour[]): TrainTimeCardColour[] {
    const payment: TrainTimeCardColour[] = [];
    const coloured = Math.min(hand.filter(c => c === colour).length, route.length);
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
    /** Ticket ids this player has kept. Secret until final scoring (§10). */
    tickets: number[];
    /**
     * Tickets offered but not yet answered: the setup deal on a player's first
     * turn, or the three drawn by Action C. Also secret, and a turn can't move
     * on until they're resolved.
     */
    pendingTickets: number[];
    trains: number;
    /** Route points, scored the moment a route is claimed. */
    score: number;
    /** Tickets, scored once at the end (§7) — negative if the network fell short. */
    ticketScore: number;
    ticketsCompleted: number;
    /** LONG_HAUL_BONUS if this player's run was the longest, else 0. Set at scoring (§7). */
    longHaulBonus: number;
    routesClaimed: number;
}

/**
 * True while this player still owes the keep-at-least-2 choice from setup.
 * Nobody can finish setup holding no tickets, so an empty kept pile with an
 * offer on the table can only be the opening deal.
 */
export function isSetupTicketChoice(ps: ITrainTimePlayerState): boolean {
    return ps.tickets.length === 0;
}

/** How many of the tickets currently on offer this player has to keep (§4, §5). */
export function ticketsToKeep(ps: ITrainTimePlayerState): number {
    return isSetupTicketChoice(ps) ? SETUP_TICKETS_KEPT_MIN : DRAWN_TICKETS_KEPT_MIN;
}

export interface ITrainTimeSpecificGameState {
    /** Face-down draw pile; the last element is the top card. */
    deck: TrainTimeCardColour[];
    discard: TrainTimeCardColour[];
    /** The five face-up cards everybody can draw from. */
    market: TrainTimeCardColour[];
    /** Ticket ids still to be dealt; index 0 is the top, discards go to the bottom. */
    ticketDeck: number[];
    playerStates: Map<string, ITrainTimePlayerState>;
    /** Owning userId per route id, null where unclaimed. Length ROUTE_COUNT. */
    routeOwners: (string | null)[];
    /** Cards taken so far in the current draw action (0 or 1). */
    drawsThisTurn: number;
    /** Whose draw that is. A skipped turn leaves the count behind, so it only
     *  ever counts for the player it was recorded against. */
    drawTurnOwner: string | null;
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
 * How far into their two-card draw this player is. The count is dropped the
 * moment it belongs to somebody else, so a turn timer that skips a player
 * halfway through a draw can't leave the next one owing half a turn.
 */
export function drawsTakenBy(gs: ITrainTimeSpecificGameState, userId: string): number {
    return gs.drawTurnOwner === userId ? gs.drawsThisTurn : 0;
}

/**
 * Deals a fresh game: shuffled deck, four cards each, five face-up.
 * Deterministic given the shuffled deck, so it's the one place setup lives.
 */
export function buildInitialTrainTimeState(turnOrder: string[]): ITrainTimeSpecificGameState {
    const deck = shuffle(buildCarriageDeck());

    const ticketDeck = shuffle(TICKETS.map(t => t.id));

    const playerStates = new Map<string, ITrainTimePlayerState>();
    for (const userId of turnOrder) {
        playerStates.set(userId, {
            hand: deck.splice(-STARTING_HAND_SIZE, STARTING_HAND_SIZE),
            // Dealt now, chosen on the player's first turn: an async table
            // can't sit through a setup round where everybody answers at once.
            tickets: [],
            pendingTickets: ticketDeck.splice(0, SETUP_TICKETS_DEALT),
            trains: TRAINS_PER_PLAYER,
            score: 0,
            ticketScore: 0,
            ticketsCompleted: 0,
            longHaulBonus: 0,
            routesClaimed: 0,
        });
    }

    const state: ITrainTimeSpecificGameState = {
        deck,
        discard: [],
        market: deck.splice(-MARKET_SIZE, MARKET_SIZE),
        ticketDeck,
        playerStates,
        routeOwners: Array.from({ length: ROUTE_COUNT }, () => null),
        drawsThisTurn: 0,
        drawTurnOwner: null,
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
