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

export interface OutbreakCityDef {
    id: number;
    name: string;
    color: OutbreakDiseaseColor;
    /** Schematic (not geographic) board position for the SVG map, 0-800 x 0-460. */
    x: number;
    y: number;
}

// City list — order and colour grouping follow docs/games/outbreak-gdd.md §5.1
// (48 cities, 12 per colour). x/y are calibrated to the node centres actually
// drawn in public/art/outbreak/board.png (the SVG's viewBox and the art's
// preserveAspectRatio="xMidYMid slice" crop are both accounted for), not just
// roughly-geographic placeholders — see the note on Miami and Riyadh below,
// the two cities the art doesn't draw at all.
const CITY_DEFS: Omit<OutbreakCityDef, 'id'>[] = [
    // Blue — North America & Europe (0-11)
    { name: 'San Francisco', color: 'blue', x: 61, y: 141 },
    { name: 'Chicago', color: 'blue', x: 134, y: 115 },
    { name: 'Atlanta', color: 'blue', x: 179, y: 199 },
    { name: 'Montreal', color: 'blue', x: 197, y: 115 },
    { name: 'New York', color: 'blue', x: 208, y: 153 },
    { name: 'Washington', color: 'blue', x: 147, y: 157 },
    { name: 'London', color: 'blue', x: 329, y: 83 },
    { name: 'Madrid', color: 'blue', x: 311, y: 148 },
    { name: 'Paris', color: 'blue', x: 362, y: 115 },
    { name: 'Essen', color: 'blue', x: 371, y: 79 },
    { name: 'Milan', color: 'blue', x: 416, y: 135 },
    { name: 'St. Petersburg', color: 'blue', x: 433, y: 70 },
    // Yellow — South America & Africa (12-23)
    { name: 'Los Angeles', color: 'yellow', x: 80, y: 192 },
    { name: 'Mexico City', color: 'yellow', x: 123, y: 210 },
    // The art has no Miami node at all — Atlanta connects straight to Bogotá
    // in board.png instead of routing through it. x/y here are interpolated
    // from its neighbours (Atlanta, Washington, Mexico City, Bogotá) rather
    // than read off the art, and will need correcting if the art ever adds it.
    { name: 'Miami', color: 'yellow', x: 195, y: 225 },
    { name: 'Bogota', color: 'yellow', x: 175, y: 251 },
    { name: 'Lima', color: 'yellow', x: 167, y: 315 },
    { name: 'Santiago', color: 'yellow', x: 179, y: 370 },
    { name: 'Buenos Aires', color: 'yellow', x: 227, y: 356 },
    { name: 'Sao Paulo', color: 'yellow', x: 260, y: 315 },
    { name: 'Lagos', color: 'yellow', x: 390, y: 291 },
    { name: 'Kinshasa', color: 'yellow', x: 360, y: 243 },
    { name: 'Khartoum', color: 'yellow', x: 424, y: 239 },
    { name: 'Johannesburg', color: 'yellow', x: 424, y: 342 },
    // Black — Middle East & Central/South Asia (24-35)
    { name: 'Algiers', color: 'black', x: 375, y: 169 },
    { name: 'Cairo', color: 'black', x: 410, y: 187 },
    { name: 'Istanbul', color: 'black', x: 456, y: 163 },
    { name: 'Moscow', color: 'black', x: 467, y: 102 },
    { name: 'Baghdad', color: 'black', x: 463, y: 218 },
    { name: 'Tehran', color: 'black', x: 499, y: 128 },
    // Same gap as Miami above: the art has no Riyadh node either — Baghdad
    // connects straight to Karachi/Khartoum instead. Interpolated from Cairo,
    // Baghdad and Karachi, not read off the art.
    { name: 'Riyadh', color: 'black', x: 460, y: 250 },
    { name: 'Karachi', color: 'black', x: 513, y: 188 },
    { name: 'Delhi', color: 'black', x: 597, y: 180 },
    { name: 'Mumbai', color: 'black', x: 522, y: 225 },
    { name: 'Chennai', color: 'black', x: 558, y: 256 },
    { name: 'Kolkata', color: 'black', x: 547, y: 167 },
    // Red — East/Southeast Asia & Oceania (36-47)
    { name: 'Beijing', color: 'red', x: 630, y: 121 },
    { name: 'Seoul', color: 'red', x: 679, y: 119 },
    { name: 'Tokyo', color: 'red', x: 723, y: 141 },
    { name: 'Shanghai', color: 'red', x: 632, y: 159 },
    { name: 'Hong Kong', color: 'red', x: 633, y: 203 },
    { name: 'Taipei', color: 'red', x: 682, y: 193 },
    { name: 'Osaka', color: 'red', x: 724, y: 182 },
    { name: 'Bangkok', color: 'red', x: 603, y: 228 },
    { name: 'Ho Chi Minh City', color: 'red', x: 638, y: 262 },
    { name: 'Manila', color: 'red', x: 692, y: 255 },
    { name: 'Jakarta', color: 'red', x: 596, y: 296 },
    { name: 'Sydney', color: 'red', x: 729, y: 356 },
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

// ─── Shared state vocabulary ────────────────────────────────────────────────
// Here (rather than in OutbreakModels.ts) so apiModels.ts can import it
// without a cycle — the same reason WorldDominationPhase lives in
// WorldDomination/board.ts.

/** A disease's cure marker (§8.4, §8.3). */
export type OutbreakCureState = 'none' | 'cured' | 'eradicated';

export type OutbreakPhase = 'actions' | 'discard' | 'forecast';
