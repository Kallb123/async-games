// Shared presentation metadata for each game, keyed by its url slug.
// Keeps the library, home cards and setup headers visually consistent.

export type GameCategory = "Dice" | "Strategy" | "Word" | "Puzzle";

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

export const GAME_META: Record<string, GameMeta> = {
    dicecities: {
        url: "dicecities",
        name: "Dice Cities",
        categories: ["Dice", "Strategy"],
        players: "2–4 players",
        tagline: "Roll, build, and grow your city faster than your friends.",
        accent: "#009DCA",
        art: "/art/dicecities/icon.png",
        available: true,
    },
    smartthink: {
        url: "smartthink",
        name: "Smartthink",
        categories: ["Puzzle"],
        players: "1-2 players",
        tagline: "Crack the hidden code before guesses run out.",
        accent: "green",
        glyph: "S?",
        available: true,
    },
    settlementsandcities: {
        url: "settlementsandcities",
        name: "Settlements & Cities",
        categories: ["Strategy", "Dice"],
        players: "2–6 players",
        tagline: "Trade, build and out-manoeuvre for the most victory points.",
        accent: "gold",
        art: "/art/dicecities/japanese/forest.png",
        available: true,
    },
    snakesandladders: {
        url: "snakesandladders",
        name: "Snakes & Ladders",
        categories: ["Dice"],
        players: "2–6 players",
        tagline: "Climb the ladders, dodge the snakes, race to 100.",
        accent: "purple",
        glyph: "1→100",
        available: true,
    },
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
};

export function metaForGame(opts: { url?: string; friendlyName?: string }): GameMeta | undefined {
    if (opts.url && GAME_META[opts.url]) return GAME_META[opts.url];
    if (opts.friendlyName) {
        const url = NAME_TO_URL[opts.friendlyName.toLowerCase().trim()];
        if (url) return GAME_META[url];
    }
    return undefined;
}
