// Shared presentation metadata for each game, keyed by its url slug.
// Keeps the library, home cards and setup headers visually consistent.
//
// Each game owns its own metadata as a `meta` export next to its models,
// rules and components under src/games/<Game>/meta.ts — this file only
// declares the shared shape/vocabulary and aggregates every game's entry into
// one lookup. Adding a new game means adding one import + one line below,
// not editing a shared object literal.

// The canonical, ordered list of game categories. This is the single source
// of truth — the library's filter chips and the GameCategory type both derive
// from it, so adding a category here surfaces it everywhere.
export const GAME_CATEGORIES = ["Dice", "Strategy", "Word", "Puzzle"] as const;

export type GameCategory = (typeof GAME_CATEGORIES)[number];

export type ThemeAccent = "terracotta" | "green" | "gold" | "purple";

export interface GameMeta {
    url: string;
    name: string;
    categories: GameCategory[];
    players: string;
    tagline: string;
    // Either a named accent from the theme palette, or a raw hex colour
    // (e.g. "#009DCA") for games that need a bespoke tint.
    accent: ThemeAccent | (string & {});
    // Optional artwork; when absent a glyph block is shown instead.
    art?: string;
    glyph?: string;
    available: boolean;
}

import { meta as diceCitiesMeta } from "@/games/DiceCities/meta";
import { meta as smartthinkMeta } from "@/games/Smartthink/meta";
import { meta as settlementsAndCitiesMeta } from "@/games/SettlementsAndCities/meta";
import { meta as snakesAndLaddersMeta } from "@/games/SnakesAndLadders/meta";
import { meta as worldDominationMeta } from "@/games/WorldDomination/meta";

export const GAME_META: Record<string, GameMeta> = {
    dicecities: diceCitiesMeta,
    smartthink: smartthinkMeta,
    settlementsandcities: settlementsAndCitiesMeta,
    snakesandladders: snakesAndLaddersMeta,
    worlddomination: worldDominationMeta,
};

// Games that don't have an implementation yet but are teased in the library.
export const COMING_SOON = ["Ludo", "Chess", "Haunted Campground"];

// Map a game's friendlyName (as returned by the API) to its url slug.
const NAME_TO_URL: Record<string, string> = {
    "dice cities": "dicecities",
    "smartthink": "smartthink",
    "settlements and cities": "settlementsandcities",
    "settlements & cities": "settlementsandcities",
    "snakes and ladders": "snakesandladders",
    "snakes & ladders": "snakesandladders",
    "world domination": "worlddomination",
};

export function metaForGame(opts: { url?: string; friendlyName?: string }): GameMeta | undefined {
    if (opts.url && GAME_META[opts.url]) return GAME_META[opts.url];
    if (opts.friendlyName) {
        const url = NAME_TO_URL[opts.friendlyName.toLowerCase().trim()];
        if (url) return GAME_META[url];
    }
    return undefined;
}
