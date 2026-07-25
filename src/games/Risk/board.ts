// Static board data + pure helpers for Risk: the 42-territory / 6-continent
// world map, its adjacency graph, and the rules maths (reinforcement counts,
// card-set values, connectivity) from docs/games/risk.md.

export type RiskPhase = 'setup' | 'reinforce' | 'attack' | 'fortify';

export type RiskContinentId =
    | 'northAmerica' | 'southAmerica' | 'europe' | 'africa' | 'asia' | 'australia';

export interface RiskContinent {
    id: RiskContinentId;
    name: string;
    bonus: number;
    /** Schematic label anchor for the board SVG. */
    labelPos: { x: number; y: number };
    /** Tint for the continent's board region + chip accents. */
    color: string;
}

export const CONTINENTS: Record<RiskContinentId, RiskContinent> = {
    northAmerica: { id: 'northAmerica', name: 'North America', bonus: 5, labelPos: { x: 40, y: 20 }, color: '#fdcd0d' },
    southAmerica: { id: 'southAmerica', name: 'South America', bonus: 2, labelPos: { x: 150, y: 445 }, color: '#fd7816' },
    europe: { id: 'europe', name: 'Europe', bonus: 5, labelPos: { x: 335, y: 20 }, color: '#0c97e2' },
    africa: { id: 'africa', name: 'Africa', bonus: 3, labelPos: { x: 335, y: 445 }, color: '#ed362d' },
    asia: { id: 'asia', name: 'Asia', bonus: 7, labelPos: { x: 630, y: 20 }, color: '#4bbc4f' },
    australia: { id: 'australia', name: 'Australia', bonus: 2, labelPos: { x: 630, y: 445 }, color: '#a961b7' },
};

export const CONTINENT_ORDER: RiskContinentId[] = [
    'northAmerica', 'southAmerica', 'europe', 'africa', 'asia', 'australia',
];

export interface RiskTerritoryDef {
    id: number;
    name: string;
    continentId: RiskContinentId;
    /** Schematic (not geographic) board position for the SVG map, 0-800 x 0-480. */
    x: number;
    y: number;
}

// Territory list — order and numbering follow docs/games/risk.md §8 exactly
// (0-indexed here vs. the doc's 1-indexed list).
// x/y are calibrated to line up with the printed territory labels in
// public/art/world-domination/world-domination-map.png once it's placed
// behind the board at BOARD_VIEWBOX size (see RiskBoard's "slice" image fit).
// Ukraine has no matching region in that art, so it's parked on the
// Northern Europe / Ural border it connects to.
const TERRITORY_DEFS: Omit<RiskTerritoryDef, 'id'>[] = [
    // North America (0-8)
    { name: 'Alaska', continentId: 'northAmerica', x: 56, y: 38 },
    { name: 'Northwest Territory', continentId: 'northAmerica', x: 136, y: 32 },
    { name: 'Greenland', continentId: 'northAmerica', x: 280, y: 12 },
    { name: 'Alberta', continentId: 'northAmerica', x: 128, y: 83 },
    { name: 'Ontario', continentId: 'northAmerica', x: 179, y: 95 },
    { name: 'Quebec', continentId: 'northAmerica', x: 235, y: 98 },
    { name: 'Western United States', continentId: 'northAmerica', x: 128, y: 137 },
    { name: 'Eastern United States', continentId: 'northAmerica', x: 187, y: 163 },
    { name: 'Central America', continentId: 'northAmerica', x: 134, y: 201 },
    // South America (9-12)
    { name: 'Venezuela', continentId: 'southAmerica', x: 190, y: 250 },
    { name: 'Peru', continentId: 'southAmerica', x: 195, y: 326 },
    { name: 'Brazil', continentId: 'southAmerica', x: 246, y: 298 },
    { name: 'Argentina', continentId: 'southAmerica', x: 214, y: 381 },
    // Europe (13-19)
    { name: 'Iceland', continentId: 'europe', x: 339, y: 59 },
    { name: 'Great Britain', continentId: 'europe', x: 326, y: 121 },
    { name: 'Scandinavia', continentId: 'europe', x: 398, y: 46 },
    { name: 'Western Europe', continentId: 'europe', x: 352, y: 174 },
    { name: 'Northern Europe', continentId: 'europe', x: 451, y: 94 },
    { name: 'Southern Europe', continentId: 'europe', x: 401, y: 178 },
    { name: 'Ukraine', continentId: 'europe', x: 491, y: 126 },
    // Africa (20-25)
    { name: 'North Africa', continentId: 'africa', x: 374, y: 289 },
    { name: 'Egypt', continentId: 'africa', x: 422, y: 262 },
    { name: 'East Africa', continentId: 'africa', x: 459, y: 326 },
    { name: 'Congo', continentId: 'africa', x: 422, y: 372 },
    { name: 'South Africa', continentId: 'africa', x: 433, y: 430 },
    { name: 'Madagascar', continentId: 'africa', x: 505, y: 436 },
    // Asia (26-37)
    { name: 'Ural', continentId: 'asia', x: 526, y: 82 },
    { name: 'Siberia', continentId: 'asia', x: 574, y: 36 },
    { name: 'Yakutsk', continentId: 'asia', x: 638, y: 19 },
    { name: 'Kamchatka', continentId: 'asia', x: 710, y: 16 },
    { name: 'Irkutsk', continentId: 'asia', x: 630, y: 87 },
    { name: 'Mongolia', continentId: 'asia', x: 630, y: 138 },
    { name: 'Japan', continentId: 'asia', x: 710, y: 155 },
    { name: 'Afghanistan', continentId: 'asia', x: 515, y: 151 },
    { name: 'China', continentId: 'asia', x: 625, y: 196 },
    { name: 'Middle East', continentId: 'asia', x: 475, y: 223 },
    { name: 'India', continentId: 'asia', x: 561, y: 243 },
    { name: 'Siam', continentId: 'asia', x: 636, y: 265 },
    // Australia (38-41)
    { name: 'Indonesia', continentId: 'australia', x: 622, y: 356 },
    { name: 'New Guinea', continentId: 'australia', x: 716, y: 326 },
    { name: 'Western Australia', continentId: 'australia', x: 665, y: 441 },
    { name: 'Eastern Australia', continentId: 'australia', x: 732, y: 430 },
];

export const TERRITORIES: RiskTerritoryDef[] = TERRITORY_DEFS.map((t, id) => ({ ...t, id }));

export const TERRITORY_COUNT = TERRITORIES.length; // 42

const NAME_TO_ID: Record<string, number> = {};
TERRITORIES.forEach(t => { NAME_TO_ID[t.name] = t.id; });

// One-directional adjacency as transcribed from docs/games/risk.md §8. Built
// into a symmetric graph below (a name pair only needs to appear once).
const RAW_ADJACENCY: Record<string, string[]> = {
    'Alaska': ['Northwest Territory', 'Alberta', 'Kamchatka'],
    'Northwest Territory': ['Alaska', 'Alberta', 'Ontario', 'Greenland'],
    'Greenland': ['Northwest Territory', 'Quebec', 'Iceland'],
    'Alberta': ['Alaska', 'Northwest Territory', 'Ontario', 'Western United States'],
    'Ontario': ['Northwest Territory', 'Alberta', 'Quebec', 'Western United States', 'Eastern United States'],
    'Quebec': ['Greenland', 'Ontario', 'Eastern United States'],
    'Western United States': ['Alberta', 'Ontario', 'Eastern United States', 'Central America'],
    'Eastern United States': ['Quebec', 'Ontario', 'Western United States', 'Central America'],
    'Central America': ['Western United States', 'Eastern United States', 'Venezuela'],
    'Venezuela': ['Central America', 'Peru', 'Brazil'],
    'Peru': ['Venezuela', 'Brazil', 'Argentina'],
    'Brazil': ['Venezuela', 'Peru', 'Argentina', 'North Africa'],
    'Argentina': ['Peru', 'Brazil'],
    'Iceland': ['Greenland', 'Great Britain', 'Scandinavia'],
    'Great Britain': ['Iceland', 'Scandinavia', 'Northern Europe', 'Western Europe'],
    'Scandinavia': ['Iceland', 'Great Britain', 'Northern Europe', 'Ukraine'],
    'Western Europe': ['Great Britain', 'Northern Europe', 'Southern Europe', 'North Africa'],
    'Northern Europe': ['Great Britain', 'Scandinavia', 'Western Europe', 'Southern Europe', 'Ukraine'],
    'Southern Europe': ['Western Europe', 'Northern Europe', 'Ukraine', 'North Africa', 'Egypt', 'Middle East'],
    'Ukraine': ['Scandinavia', 'Northern Europe', 'Southern Europe', 'Ural', 'Afghanistan', 'Middle East'],
    'North Africa': ['Brazil', 'Western Europe', 'Southern Europe', 'Egypt', 'East Africa', 'Congo'],
    'Egypt': ['Southern Europe', 'North Africa', 'East Africa', 'Middle East'],
    'East Africa': ['Egypt', 'North Africa', 'Congo', 'South Africa', 'Madagascar', 'Middle East'],
    'Congo': ['North Africa', 'East Africa', 'South Africa'],
    'South Africa': ['Congo', 'East Africa', 'Madagascar'],
    'Madagascar': ['East Africa', 'South Africa'],
    'Ural': ['Ukraine', 'Siberia', 'Afghanistan', 'China'],
    'Siberia': ['Ural', 'Yakutsk', 'Irkutsk', 'Mongolia', 'China'],
    'Yakutsk': ['Siberia', 'Kamchatka', 'Irkutsk'],
    'Kamchatka': ['Yakutsk', 'Irkutsk', 'Mongolia', 'Japan', 'Alaska'],
    'Irkutsk': ['Siberia', 'Yakutsk', 'Kamchatka', 'Mongolia'],
    'Mongolia': ['Siberia', 'Irkutsk', 'Kamchatka', 'Japan', 'China'],
    'Japan': ['Kamchatka', 'Mongolia'],
    'Afghanistan': ['Ukraine', 'Ural', 'China', 'India', 'Middle East'],
    'China': ['Ural', 'Siberia', 'Mongolia', 'Afghanistan', 'India', 'Siam'],
    'Middle East': ['Ukraine', 'Southern Europe', 'Egypt', 'East Africa', 'Afghanistan', 'India'],
    'India': ['Middle East', 'Afghanistan', 'China', 'Siam'],
    'Siam': ['India', 'China', 'Indonesia'],
    'Indonesia': ['Siam', 'New Guinea', 'Western Australia'],
    'New Guinea': ['Indonesia', 'Western Australia', 'Eastern Australia'],
    'Western Australia': ['Indonesia', 'New Guinea', 'Eastern Australia'],
    'Eastern Australia': ['New Guinea', 'Western Australia'],
};

function buildAdjacency(): number[][] {
    const adj: Set<number>[] = TERRITORIES.map(() => new Set<number>());
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

/** ADJACENCY[territoryId] = sorted array of directly-connected territory ids. */
export const ADJACENCY: number[][] = buildAdjacency();

export function isAdjacent(a: number, b: number): boolean {
    return ADJACENCY[a]?.includes(b) ?? false;
}

export function territoryIdsForContinent(continentId: RiskContinentId): number[] {
    return TERRITORIES.filter(t => t.continentId === continentId).map(t => t.id);
}

// Bounding box (with padding) around a continent's territories, for the board
// SVG's tinted continent regions. Derived from the schematic x/y positions
// above rather than hand-maintained separately.
const CONTINENT_PADDING = 34;
export function continentBoundingBox(continentId: RiskContinentId): { x: number; y: number; width: number; height: number } {
    const territories = TERRITORIES.filter(t => t.continentId === continentId);
    const xs = territories.map(t => t.x);
    const ys = territories.map(t => t.y);
    const minX = Math.min(...xs) - CONTINENT_PADDING;
    const maxX = Math.max(...xs) + CONTINENT_PADDING;
    const minY = Math.min(...ys) - CONTINENT_PADDING;
    const maxY = Math.max(...ys) + CONTINENT_PADDING;
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export const BOARD_VIEWBOX = { width: 800, height: 460 };

// ─── Territories & armies ──────────────────────────────────────────────────

export interface IRiskTerritory {
    owner: string | null; // Clerk userId, or null before setup deals it out
    armies: number;
}

// ─── Starting army pool (docs/games/risk.md §3.1). ─────────────────────────
// The 2-player "neutral army" variant is out of scope — 2-player games use the
// same 40-army pool without a neutral third hand.
export const STARTING_ARMIES: Record<number, number> = {
    2: 40, 3: 35, 4: 30, 5: 25, 6: 20,
};

export function startingArmiesForPlayerCount(n: number): number {
    return STARTING_ARMIES[n] ?? STARTING_ARMIES[6];
}

// ─── Reinforcement calculation (docs/games/risk.md §4.1). ──────────────────

export function baseReinforcement(territoryCount: number): number {
    return Math.max(3, Math.floor(territoryCount / 3));
}

export function continentBonusFor(userId: string, territories: IRiskTerritory[]): number {
    let bonus = 0;
    for (const continentId of CONTINENT_ORDER) {
        const ids = territoryIdsForContinent(continentId);
        if (ids.every(id => territories[id].owner === userId)) {
            bonus += CONTINENTS[continentId].bonus;
        }
    }
    return bonus;
}

export function computeReinforcement(userId: string, territories: IRiskTerritory[]): number {
    const owned = territories.filter(t => t.owner === userId).length;
    return baseReinforcement(owned) + continentBonusFor(userId, territories);
}

// ─── Risk cards (docs/games/risk.md §2.4, §4.1). ───────────────────────────

export type RiskCardType = 'infantry' | 'cavalry' | 'artillery' | 'wild';

export interface IRiskCard {
    id: string;
    type: RiskCardType;
    territoryId: number | null; // null for the 2 wild cards
}

// Each of the 42 territory cards carries one of the three unit insignia,
// cycled evenly (14 of each) — real decks assign these arbitrarily; a fixed
// cycle keeps this deterministic and testable.
const UNIT_CYCLE: RiskCardType[] = ['infantry', 'cavalry', 'artillery'];

export function buildRiskCardDeck(): IRiskCard[] {
    const deck: IRiskCard[] = TERRITORIES.map((t, i) => ({
        id: `card-${t.id}`,
        type: UNIT_CYCLE[i % 3],
        territoryId: t.id,
    }));
    deck.push({ id: 'card-wild-1', type: 'wild', territoryId: null });
    deck.push({ id: 'card-wild-2', type: 'wild', territoryId: null });
    return deck;
}

// A set is 3 cards of the same type, one of each type, or any 2 unit cards (or
// 1) plus wild card(s) — docs/games/risk.md §4.1.
export function isValidCardSet(cards: { type: RiskCardType }[]): boolean {
    if (cards.length !== 3) return false;
    const wildCount = cards.filter(c => c.type === 'wild').length;
    if (wildCount >= 1) return true;
    const nonWild = cards.map(c => c.type);
    const allSame = nonWild.every(t => t === nonWild[0]);
    const allDifferent = new Set(nonWild).size === 3;
    return allSame || allDifferent;
}

// Progressive value ruleset (docs/games/risk.md §4.1 "Standard Modern
// Variant"): 4, 6, 8, 10, 15, then +5 per further set.
export function cardSetValue(setsAlreadyCashedIn: number): number {
    const table = [4, 6, 8, 10, 15];
    if (setsAlreadyCashedIn < table.length) return table[setsAlreadyCashedIn];
    return 15 + 5 * (setsAlreadyCashedIn - (table.length - 1));
}

// ─── Fortify connectivity (docs/games/risk.md §4.3). ───────────────────────
// True if there is an unbroken chain of `owner`-controlled territories linking
// `from` to `to` (BFS over the adjacency graph, restricted to owned nodes).
export function connectedThroughOwnedTerritories(
    from: number,
    to: number,
    owner: string,
    territories: IRiskTerritory[],
): boolean {
    if (from === to) return false;
    if (territories[from].owner !== owner || territories[to].owner !== owner) return false;
    const visited = new Set<number>([from]);
    const queue = [from];
    while (queue.length) {
        const cur = queue.shift()!;
        if (cur === to) return true;
        for (const next of ADJACENCY[cur]) {
            if (visited.has(next) || territories[next].owner !== owner) continue;
            visited.add(next);
            queue.push(next);
        }
    }
    return visited.has(to);
}
