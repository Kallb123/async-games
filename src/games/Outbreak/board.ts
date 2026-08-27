// Static board data for Outbreak: the 48-city / 4-colour world map and its
// adjacency graph, from docs/games/outbreak-gdd.md §5.1. Same shape as
// WorldDomination/board.ts — a flat list of positioned nodes, a one-directional
// adjacency transcription closed into a symmetric graph, and a schematic
// viewBox for the map SVG. No server-only imports: rules.ts (and, via it, the
// client action picker) depends on this module staying isomorphic.

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
    /** Schematic (not geographic) board position for the SVG map, 0-800 x 0-480. */
    x: number;
    y: number;
}

// City list — order and colour grouping follow docs/games/outbreak-gdd.md §5.1
// (48 cities, 12 per colour). x/y are schematic placeholders roughly tracking
// real-world geography, laid out to keep same-colour clusters visually
// contiguous; they aren't calibrated to any map art yet.
const CITY_DEFS: Omit<OutbreakCityDef, 'id'>[] = [
    // Blue — North America & Europe (0-11)
    { name: 'San Francisco', color: 'blue', x: 60, y: 130 },
    { name: 'Chicago', color: 'blue', x: 150, y: 105 },
    { name: 'Atlanta', color: 'blue', x: 175, y: 155 },
    { name: 'Montreal', color: 'blue', x: 205, y: 90 },
    { name: 'New York', color: 'blue', x: 230, y: 120 },
    { name: 'Washington', color: 'blue', x: 210, y: 150 },
    { name: 'London', color: 'blue', x: 400, y: 90 },
    { name: 'Madrid', color: 'blue', x: 375, y: 150 },
    { name: 'Paris', color: 'blue', x: 420, y: 110 },
    { name: 'Essen', color: 'blue', x: 440, y: 75 },
    { name: 'Milan', color: 'blue', x: 460, y: 120 },
    { name: 'St. Petersburg', color: 'blue', x: 500, y: 55 },
    // Yellow — South America & Africa (12-23)
    { name: 'Los Angeles', color: 'yellow', x: 90, y: 175 },
    { name: 'Mexico City', color: 'yellow', x: 145, y: 195 },
    { name: 'Miami', color: 'yellow', x: 195, y: 185 },
    { name: 'Bogota', color: 'yellow', x: 205, y: 235 },
    { name: 'Lima', color: 'yellow', x: 190, y: 300 },
    { name: 'Santiago', color: 'yellow', x: 190, y: 380 },
    { name: 'Buenos Aires', color: 'yellow', x: 250, y: 360 },
    { name: 'Sao Paulo', color: 'yellow', x: 280, y: 300 },
    { name: 'Lagos', color: 'yellow', x: 350, y: 320 },
    { name: 'Kinshasa', color: 'yellow', x: 380, y: 370 },
    { name: 'Khartoum', color: 'yellow', x: 440, y: 320 },
    { name: 'Johannesburg', color: 'yellow', x: 420, y: 420 },
    // Black — Middle East & Central/South Asia (24-35)
    { name: 'Algiers', color: 'black', x: 400, y: 220 },
    { name: 'Cairo', color: 'black', x: 460, y: 240 },
    { name: 'Istanbul', color: 'black', x: 470, y: 160 },
    { name: 'Moscow', color: 'black', x: 540, y: 85 },
    { name: 'Baghdad', color: 'black', x: 500, y: 210 },
    { name: 'Tehran', color: 'black', x: 540, y: 175 },
    { name: 'Riyadh', color: 'black', x: 490, y: 265 },
    { name: 'Karachi', color: 'black', x: 560, y: 220 },
    { name: 'Delhi', color: 'black', x: 600, y: 215 },
    { name: 'Mumbai', color: 'black', x: 570, y: 260 },
    { name: 'Chennai', color: 'black', x: 600, y: 290 },
    { name: 'Kolkata', color: 'black', x: 630, y: 235 },
    // Red — East/Southeast Asia & Oceania (36-47)
    { name: 'Beijing', color: 'red', x: 650, y: 100 },
    { name: 'Seoul', color: 'red', x: 700, y: 110 },
    { name: 'Tokyo', color: 'red', x: 745, y: 130 },
    { name: 'Shanghai', color: 'red', x: 680, y: 150 },
    { name: 'Hong Kong', color: 'red', x: 680, y: 200 },
    { name: 'Taipei', color: 'red', x: 715, y: 190 },
    { name: 'Osaka', color: 'red', x: 745, y: 170 },
    { name: 'Bangkok', color: 'red', x: 650, y: 260 },
    { name: 'Ho Chi Minh City', color: 'red', x: 670, y: 295 },
    { name: 'Manila', color: 'red', x: 725, y: 250 },
    { name: 'Jakarta', color: 'red', x: 670, y: 345 },
    { name: 'Sydney', color: 'red', x: 745, y: 420 },
];

export const CITIES: OutbreakCityDef[] = CITY_DEFS.map((c, id) => ({ ...c, id }));

export const CITY_COUNT = CITIES.length; // 48

const NAME_TO_ID: Record<string, number> = {};
CITIES.forEach(c => { NAME_TO_ID[c.name] = c.id; });

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

function buildAdjacency(): number[][] {
    const adj: Set<number>[] = CITIES.map(() => new Set<number>());
    for (const [fromName, toNames] of Object.entries(RAW_ADJACENCY)) {
        const fromId = NAME_TO_ID[fromName];
        for (const toName of toNames) {
            const toId = NAME_TO_ID[toName];
            adj[fromId].add(toId);
            adj[toId].add(fromId); // symmetric closure — guards against one-directional gaps
        }
    }
    return adj.map(s => [...s].sort((a, b) => a - b));
}

/** ADJACENCY[cityId] = sorted array of directly-connected city ids. */
export const ADJACENCY: number[][] = buildAdjacency();

export function isAdjacent(a: number, b: number): boolean {
    return ADJACENCY[a]?.includes(b) ?? false;
}

export function cityIdsForColor(color: OutbreakDiseaseColor): number[] {
    return CITIES.filter(c => c.color === color).map(c => c.id);
}

export const BOARD_VIEWBOX = { width: 800, height: 460 };
