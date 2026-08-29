// Static board data for Outbreak: the 48-city / 4-colour world map and its
// adjacency graph, from docs/games/outbreak-gdd.md §5.1. Same shape as
// WorldDomination/board.ts — a flat list of positioned nodes, a one-directional
// adjacency transcription closed into a symmetric graph (via the shared
// adjacencyGraph helper both games use), and a schematic viewBox for the map
// SVG. No server-only imports: rules.ts (and, via it, the client action
// picker) depends on this module staying isomorphic.
import { buildSymmetricAdjacency, isAdjacentIn } from "@/utils/games/adjacencyGraph";

export type OutbreakDiseaseColor = 'blue' | 'yellow' | 'black' | 'red';

export const DISEASE_COLORS: OutbreakDiseaseColor[] = ['blue', 'yellow', 'black', 'red'];

export interface OutbreakDiseaseColorDef {
    id: OutbreakDiseaseColor;
    name: string;
    region: string;
    /** Accent for cubes, the region legend, and cure/eradication markers. */
    hex: string;
}

export const DISEASE_COLOR_DEFS: Record<OutbreakDiseaseColor, OutbreakDiseaseColorDef> = {
    blue: { id: 'blue', name: 'Blue', region: 'North America & Europe', hex: '#0c97e2' },
    yellow: { id: 'yellow', name: 'Yellow', region: 'South America & Africa', hex: '#fdcd0d' },
    black: { id: 'black', name: 'Black', region: 'Middle East & Central/South Asia', hex: '#2b2b2b' },
    red: { id: 'red', name: 'Red', region: 'East/Southeast Asia & Oceania', hex: '#ed362d' },
};

/** Which side of its node a city's name label sits on (see CITY_LABEL_OFFSET), hand-picked to keep the 48 labels off the printed routes and each other on this densely-packed map. */
export type OutbreakLabelDir = 'n' | 's' | 'e' | 'w';

export interface OutbreakCityDef {
    id: number;
    name: string;
    color: OutbreakDiseaseColor;
    /** Schematic (not geographic) board position for the SVG map, 0-800 x 0-460. */
    x: number;
    y: number;
    labelDir: OutbreakLabelDir;
}

// City list — order and colour grouping follow docs/games/outbreak-gdd.md §5.1
// (48 cities, 12 per colour). x/y are calibrated to the node centres actually
// drawn in public/art/outbreak/board.png (the SVG's viewBox and the art's
// preserveAspectRatio="xMidYMid slice" crop are both accounted for), not just
// roughly-geographic placeholders — see the note on Miami and Riyadh below,
// the two cities the art doesn't draw at all.
const CITY_DEFS: Omit<OutbreakCityDef, 'id'>[] = [
    // Blue — North America & Europe (0-11)
    { name: 'San Francisco', color: 'blue', x: 61, y: 141, labelDir: 'n' },
    { name: 'Chicago', color: 'blue', x: 134, y: 115, labelDir: 'n' },
    { name: 'Atlanta', color: 'blue', x: 179, y: 199, labelDir: 'w' },
    { name: 'Montreal', color: 'blue', x: 197, y: 115, labelDir: 'n' },
    { name: 'New York', color: 'blue', x: 208, y: 153, labelDir: 's' },
    { name: 'Washington', color: 'blue', x: 147, y: 157, labelDir: 'w' },
    { name: 'London', color: 'blue', x: 329, y: 83, labelDir: 'n' },
    { name: 'Madrid', color: 'blue', x: 311, y: 148, labelDir: 'w' },
    { name: 'Paris', color: 'blue', x: 362, y: 115, labelDir: 'n' },
    { name: 'Essen', color: 'blue', x: 371, y: 79, labelDir: 'n' },
    { name: 'Milan', color: 'blue', x: 416, y: 135, labelDir: 'e' },
    { name: 'St. Petersburg', color: 'blue', x: 433, y: 70, labelDir: 'n' },
    // Yellow — South America & Africa (12-23)
    { name: 'Los Angeles', color: 'yellow', x: 80, y: 192, labelDir: 'w' },
    { name: 'Mexico City', color: 'yellow', x: 123, y: 210, labelDir: 's' },
    // The art has no Miami node at all — Atlanta connects straight to Bogotá
    // in board.png instead of routing through it. x/y here are interpolated
    // from its neighbours (Atlanta, Washington, Mexico City, Bogotá) rather
    // than read off the art, and will need correcting if the art ever adds it.
    { name: 'Miami', color: 'yellow', x: 195, y: 225, labelDir: 'e' },
    { name: 'Bogota', color: 'yellow', x: 175, y: 251, labelDir: 'w' },
    { name: 'Lima', color: 'yellow', x: 167, y: 315, labelDir: 'w' },
    { name: 'Santiago', color: 'yellow', x: 179, y: 370, labelDir: 'w' },
    { name: 'Buenos Aires', color: 'yellow', x: 227, y: 356, labelDir: 's' },
    { name: 'Sao Paulo', color: 'yellow', x: 260, y: 315, labelDir: 'e' },
    { name: 'Lagos', color: 'yellow', x: 390, y: 291, labelDir: 's' },
    { name: 'Kinshasa', color: 'yellow', x: 360, y: 243, labelDir: 'w' },
    { name: 'Khartoum', color: 'yellow', x: 424, y: 239, labelDir: 'n' },
    { name: 'Johannesburg', color: 'yellow', x: 424, y: 342, labelDir: 's' },
    // Black — Middle East & Central/South Asia (24-35)
    { name: 'Algiers', color: 'black', x: 375, y: 169, labelDir: 'w' },
    { name: 'Cairo', color: 'black', x: 410, y: 187, labelDir: 's' },
    { name: 'Istanbul', color: 'black', x: 456, y: 163, labelDir: 'n' },
    { name: 'Moscow', color: 'black', x: 467, y: 102, labelDir: 'n' },
    { name: 'Baghdad', color: 'black', x: 463, y: 218, labelDir: 's' },
    { name: 'Tehran', color: 'black', x: 499, y: 128, labelDir: 'e' },
    // Same gap as Miami above: the art has no Riyadh node either — Baghdad
    // connects straight to Karachi/Khartoum instead. Interpolated from Cairo,
    // Baghdad and Karachi, not read off the art.
    { name: 'Riyadh', color: 'black', x: 460, y: 250, labelDir: 'w' },
    { name: 'Karachi', color: 'black', x: 513, y: 188, labelDir: 'w' },
    { name: 'Delhi', color: 'black', x: 547, y: 167, labelDir: 's' },
    { name: 'Mumbai', color: 'black', x: 522, y: 225, labelDir: 's' },
    { name: 'Chennai', color: 'black', x: 558, y: 256, labelDir: 'w' },
    { name: 'Kolkata', color: 'black', x: 597, y: 180, labelDir: 'e' },
    // Red — East/Southeast Asia & Oceania (36-47)
    { name: 'Beijing', color: 'red', x: 630, y: 121, labelDir: 'n' },
    { name: 'Seoul', color: 'red', x: 679, y: 119, labelDir: 'n' },
    { name: 'Tokyo', color: 'red', x: 723, y: 141, labelDir: 'n' },
    { name: 'Shanghai', color: 'red', x: 632, y: 159, labelDir: 'e' },
    { name: 'Hong Kong', color: 'red', x: 633, y: 203, labelDir: 'w' },
    { name: 'Taipei', color: 'red', x: 682, y: 193, labelDir: 'e' },
    { name: 'Osaka', color: 'red', x: 724, y: 182, labelDir: 's' },
    { name: 'Bangkok', color: 'red', x: 603, y: 228, labelDir: 'w' },
    { name: 'Ho Chi Minh City', color: 'red', x: 638, y: 262, labelDir: 's' },
    { name: 'Manila', color: 'red', x: 692, y: 255, labelDir: 'e' },
    { name: 'Jakarta', color: 'red', x: 596, y: 296, labelDir: 'w' },
    { name: 'Sydney', color: 'red', x: 729, y: 356, labelDir: 'e' },
];

export const CITIES: OutbreakCityDef[] = CITY_DEFS.map((c, id) => ({ ...c, id }));

export const CITY_COUNT = CITIES.length; // 48

// One-directional adjacency as transcribed from docs/games/outbreak-gdd.md §5.1
// (the printed travel routes, not geographic proximity). Built into a
// symmetric graph below (a name pair only needs to appear once).
const RAW_ADJACENCY: Record<string, string[]> = {
    'San Francisco': ['Tokyo', 'Manila', 'Los Angeles', 'Chicago'],
    'Chicago': ['San Francisco', 'Los Angeles', 'Mexico City', 'Atlanta', 'Montreal'],
    'Atlanta': ['Chicago', 'Washington', 'Miami'],
    'Montreal': ['Chicago', 'Washington', 'New York'],
    'New York': ['Montreal', 'Washington', 'London', 'Madrid'],
    'Washington': ['Atlanta', 'Montreal', 'New York', 'Miami'],
    'London': ['New York', 'Madrid', 'Essen', 'Paris'],
    'Madrid': ['New York', 'London', 'Paris', 'Algiers', 'Sao Paulo'],
    'Paris': ['London', 'Madrid', 'Essen', 'Milan', 'Algiers'],
    'Essen': ['London', 'Paris', 'Milan', 'St. Petersburg'],
    'Milan': ['Essen', 'Paris', 'Istanbul'],
    'St. Petersburg': ['Essen', 'Istanbul', 'Moscow'],

    'Los Angeles': ['San Francisco', 'Chicago', 'Mexico City', 'Sydney'],
    'Mexico City': ['Los Angeles', 'Chicago', 'Miami', 'Bogota', 'Lima'],
    'Miami': ['Atlanta', 'Washington', 'Mexico City', 'Bogota'],
    'Bogota': ['Mexico City', 'Miami', 'Lima', 'Buenos Aires', 'Sao Paulo'],
    'Lima': ['Mexico City', 'Bogota', 'Santiago'],
    'Santiago': ['Lima'],
    'Buenos Aires': ['Bogota', 'Sao Paulo'],
    'Sao Paulo': ['Madrid', 'Bogota', 'Buenos Aires', 'Lagos'],
    'Lagos': ['Sao Paulo', 'Kinshasa', 'Khartoum'],
    'Kinshasa': ['Lagos', 'Khartoum', 'Johannesburg'],
    'Khartoum': ['Lagos', 'Kinshasa', 'Johannesburg', 'Cairo'],
    'Johannesburg': ['Kinshasa', 'Khartoum'],

    'Algiers': ['Madrid', 'Paris', 'Istanbul', 'Cairo'],
    'Cairo': ['Algiers', 'Istanbul', 'Baghdad', 'Riyadh', 'Khartoum'],
    'Istanbul': ['Milan', 'St. Petersburg', 'Moscow', 'Baghdad', 'Cairo', 'Algiers'],
    'Moscow': ['St. Petersburg', 'Istanbul', 'Tehran'],
    'Baghdad': ['Istanbul', 'Cairo', 'Riyadh', 'Karachi', 'Tehran'],
    'Tehran': ['Moscow', 'Baghdad', 'Karachi', 'Delhi'],
    'Riyadh': ['Cairo', 'Baghdad', 'Karachi'],
    'Karachi': ['Baghdad', 'Tehran', 'Riyadh', 'Delhi', 'Mumbai'],
    'Delhi': ['Tehran', 'Karachi', 'Mumbai', 'Chennai', 'Kolkata'],
    'Mumbai': ['Karachi', 'Delhi', 'Chennai'],
    'Chennai': ['Mumbai', 'Delhi', 'Kolkata', 'Bangkok', 'Jakarta'],
    'Kolkata': ['Delhi', 'Chennai', 'Bangkok', 'Hong Kong'],

    'Beijing': ['Seoul', 'Shanghai'],
    'Seoul': ['Beijing', 'Shanghai', 'Tokyo'],
    'Tokyo': ['Seoul', 'Shanghai', 'Osaka', 'San Francisco'],
    'Shanghai': ['Beijing', 'Seoul', 'Tokyo', 'Hong Kong', 'Taipei'],
    'Hong Kong': ['Shanghai', 'Taipei', 'Manila', 'Ho Chi Minh City', 'Bangkok', 'Kolkata'],
    'Taipei': ['Shanghai', 'Hong Kong', 'Osaka', 'Manila'],
    'Osaka': ['Tokyo', 'Taipei'],
    'Bangkok': ['Kolkata', 'Chennai', 'Jakarta', 'Ho Chi Minh City', 'Hong Kong'],
    'Ho Chi Minh City': ['Hong Kong', 'Bangkok', 'Jakarta', 'Manila'],
    'Manila': ['San Francisco', 'Hong Kong', 'Taipei', 'Ho Chi Minh City', 'Sydney', 'Jakarta'],
    'Jakarta': ['Chennai', 'Bangkok', 'Ho Chi Minh City', 'Sydney', 'Manila'],
    'Sydney': ['Jakarta', 'Manila', 'Los Angeles'],
};

/** ADJACENCY[cityId] = sorted array of directly-connected city ids. */
export const ADJACENCY: number[][] = buildSymmetricAdjacency(CITIES.map(c => c.name), RAW_ADJACENCY);

export function isAdjacent(a: number, b: number): boolean {
    return isAdjacentIn(ADJACENCY, a, b);
}

export function cityIdsForColor(color: OutbreakDiseaseColor): number[] {
    return CITIES.filter(c => c.color === color).map(c => c.id);
}

export const BOARD_VIEWBOX = { width: 800, height: 460 };

/** Offset + anchor for a city's name label, keyed by labelDir — same shape as TrainTime's CITY_LABEL_OFFSET, sized for this board's 7px node radius and 6px label text. */
export const CITY_LABEL_OFFSET: Record<OutbreakLabelDir, { dx: number; dy: number; anchor: 'start' | 'middle' | 'end' }> = {
    n: { dx: 0, dy: -10, anchor: 'middle' },
    s: { dx: 0, dy: 15, anchor: 'middle' },
    e: { dx: 10, dy: 2.5, anchor: 'start' },
    w: { dx: -10, dy: 2.5, anchor: 'end' },
};

// §6 steps 4-5: the first research station, and every pawn's starting city.
export const ATLANTA_CITY_ID = CITIES.find(c => c.name === 'Atlanta')!.id;

// §1: 2-4 disease specialists, co-op.
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

// §5: a hard cap of 6 research stations on the board at once; building a 7th
// requires relocating one of the existing six (§8.2).
export const MAX_RESEARCH_STATIONS = 6;

// ─── Difficulty (§13) ───────────────────────────────────────────────────────

export type OutbreakDifficulty = 'introductory' | 'standard' | 'heroic';

export interface OutbreakDifficultyDef {
    id: OutbreakDifficulty;
    label: string;
    /** Epidemic cards shuffled into the player deck at setup (§6 step 7). */
    epidemics: number;
    description: string;
}

export const DIFFICULTIES: OutbreakDifficultyDef[] = [
    { id: 'introductory', label: 'Introductory', epidemics: 4, description: 'Slower rate escalation, more time between Intensify steps.' },
    { id: 'standard', label: 'Standard', epidemics: 5, description: 'The intended baseline experience.' },
    { id: 'heroic', label: 'Heroic', epidemics: 6, description: 'The infection rate climbs fast and Intensify steps come relentlessly.' },
];

/** Epidemic cards shuffled into the player deck at setup (§6 step 7) for a difficulty. */
export function epidemicCountFor(difficulty: OutbreakDifficulty): number {
    return DIFFICULTIES.find(d => d.id === difficulty)!.epidemics;
}

// ─── The epidemic card (§6 step 7, §9.1) ────────────────────────────────────

// A sentinel player-card id: never a valid city id (0..CITY_COUNT-1), so a
// deck, hand or discard-pile slot holding it is unambiguous. Every epidemic
// card behaves identically once drawn (§9.1), so — unlike a city card, whose
// id doubles as a lookup into CITIES — nothing needs to tell one apart from
// another.
export const EPIDEMIC_CARD_ID = -1;

/** A city-card id — the one card kind whose id doubles as a CITIES lookup. */
export function isCityCardId(cardId: number): boolean {
    return cardId >= 0 && cardId < CITY_COUNT;
}

// ─── Event cards (§12, §21.6 step 10) ──────────────────────────────────────
// Five more sentinel player-card ids, one per event, playing the same
// "never a valid city id" trick as EPIDEMIC_CARD_ID above — negative and
// distinct from it and from each other, so OutbreakPlayEvent can switch on
// which one a hand or the Contingency Planner's stored slot holds.

export const EVENT_CARD_AIRLIFT = -2;
export const EVENT_CARD_GOVERNMENT_GRANT = -3;
export const EVENT_CARD_ONE_QUIET_NIGHT = -4;
export const EVENT_CARD_FORECAST = -5;
export const EVENT_CARD_RESILIENT_POPULATION = -6;

export type OutbreakEventCardId =
    | typeof EVENT_CARD_AIRLIFT
    | typeof EVENT_CARD_GOVERNMENT_GRANT
    | typeof EVENT_CARD_ONE_QUIET_NIGHT
    | typeof EVENT_CARD_FORECAST
    | typeof EVENT_CARD_RESILIENT_POPULATION;

export interface OutbreakEventCardDef {
    id: OutbreakEventCardId;
    name: string;
    effect: string;
}

// §12: five one-shot cards, shuffled into the 53-card player deck at setup
// (buildInitialOutbreakState) alongside the 48 city cards, before epidemics
// are added.
export const EVENT_CARDS: OutbreakEventCardDef[] = [
    { id: EVENT_CARD_AIRLIFT, name: 'Airlift', effect: 'Move any one pawn to any city.' },
    { id: EVENT_CARD_GOVERNMENT_GRANT, name: 'Government Grant', effect: 'Place a research station in any city, no discard required.' },
    { id: EVENT_CARD_ONE_QUIET_NIGHT, name: 'One Quiet Night', effect: 'Skip the next Infect Cities phase entirely.' },
    { id: EVENT_CARD_FORECAST, name: 'Forecast', effect: 'Draw the top 6 infection cards, rearrange them in any order, return them face-down.' },
    { id: EVENT_CARD_RESILIENT_POPULATION, name: 'Resilient Population', effect: 'Remove any 1 card from the infection discard pile permanently from the game.' },
];

export const EVENT_CARD_IDS: OutbreakEventCardId[] = EVENT_CARDS.map(c => c.id);

export function isEventCardId(cardId: number): cardId is OutbreakEventCardId {
    return (EVENT_CARD_IDS as number[]).includes(cardId);
}

export function eventCardName(cardId: number): string {
    return EVENT_CARDS.find(c => c.id === cardId)?.name ?? 'Unknown event';
}

// Shared by every screen that renders a bare hand-card id — the discard
// picker (§21.6 step 6), and the hand panel and event tray of step 11 — so
// the city-card-or-event-card ternary lives in one place rather than being
// re-typed at each call site.

/** Human-readable label for any hand-card id: a city name, or an event's name. */
export function cardName(cardId: number): string {
    return isCityCardId(cardId) ? CITIES[cardId].name : eventCardName(cardId);
}

/** The colour swatch for a hand-card tile: its home region's colour for a city card, purple for an event. */
export function cardColor(cardId: number): string {
    return isCityCardId(cardId) ? DISEASE_COLOR_DEFS[CITIES[cardId].color].hex : 'var(--ag-purple)';
}

// ─── Roles (§11, §21.6 step 9) ──────────────────────────────────────────────
// Static reference data only — dealt in OutbreakModels.buildInitialOutbreakState
// and expressed as small pure exceptions to the base rules in rules.ts, rather
// than as `if (role === ...)` branches sprayed through OutbreakLogic.ts's
// Execute methods.

export type OutbreakRoleId =
    | 'medic'
    | 'scientist'
    | 'researcher'
    | 'dispatcher'
    | 'opsExpert'
    | 'quarantineSpecialist'
    | 'contingencyPlanner';

export interface OutbreakRoleDef {
    id: OutbreakRoleId;
    name: string;
    ability: string;
}

// All seven, dealt one per seat at random (§6 step 5) — see rules.ts's
// dealRoles. contingencyPlanner has no observable effect yet: its retrieval
// ability has nothing to retrieve until event cards exist (§21.6 step 10).
export const ROLES: OutbreakRoleDef[] = [
    { id: 'medic', name: 'Medic', ability: 'Treat Disease clears every cube of a colour in one action, cured or not. Cured cubes vanish automatically from any city she enters or is in.' },
    { id: 'scientist', name: 'Scientist', ability: 'Discovers a cure with 4 cards of a colour instead of 5.' },
    { id: 'researcher', name: 'Researcher', ability: 'A card leaving her hand during Share Knowledge — given by her, or taken from her — need not match the shared city.' },
    { id: 'dispatcher', name: 'Dispatcher', ability: "May move another player's pawn using her own hand, or move any pawn to a city already occupied by another pawn." },
    { id: 'opsExpert', name: 'Operations Expert', ability: 'Builds a research station without discarding a card. Once per turn, flies from a station to any city by discarding any city card.' },
    { id: 'quarantineSpecialist', name: 'Quarantine Specialist', ability: 'Prevents all cube placement and outbreaks in her city and every adjacent city.' },
    { id: 'contingencyPlanner', name: 'Contingency Planner', ability: 'Recovers a discarded event card for later use (§21.6 step 10).' },
];

export function roleDef(roleId: OutbreakRoleId | null): OutbreakRoleDef | null {
    return roleId ? ROLES.find(r => r.id === roleId) ?? null : null;
}

// ─── Shared state vocabulary ────────────────────────────────────────────────
// Here (rather than in OutbreakModels.ts) so apiModels.ts can import it
// without a cycle — the same reason WorldDominationPhase lives in
// WorldDomination/board.ts.

/** A disease's cure marker (§8.4, §8.3). */
export type OutbreakCureState = 'none' | 'cured' | 'eradicated';

export type OutbreakPhase = 'actions' | 'discard' | 'forecast';
