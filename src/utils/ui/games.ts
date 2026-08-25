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
export const GAME_CATEGORIES = ["Dice", "Strategy", "Word", "Puzzle", "Cards", "Solo"] as const;

export type GameCategory = (typeof GAME_CATEGORIES)[number];

export type ThemeAccent = "terracotta" | "green" | "gold" | "purple";

export interface GameMeta {
    url: string;
    name: string;
    categories: GameCategory[];
    players: string;
    // Numeric bounds a lobby's seats must satisfy to start, backing
    // PartySizeHint on setup screens. `players` above stays the free-form
    // display copy ("2–6 players"); these are the machine-checkable version.
    minPlayers: number;
    maxPlayers: number;
    tagline: string;
    // Either a named accent from the theme palette, or a raw hex colour
    // (e.g. "#009DCA") for games that need a bespoke tint.
    accent: ThemeAccent | (string & {});
    // Optional artwork; when absent a glyph block is shown instead.
    art?: string;
    glyph?: string;
    // Thumb shape override. Defaults to a rounded square; "hexagon" clips
    // the thumb to a hex badge for games where that fits the theme.
    shape?: "hexagon";
    available: boolean;
}

import { meta as diceCitiesMeta } from "@/games/DiceCities/meta";
import { meta as smartthinkMeta } from "@/games/Smartthink/meta";
import { meta as settlementsAndCitiesMeta } from "@/games/SettlementsAndCities/meta";
import { meta as snakesAndLaddersMeta } from "@/games/SnakesAndLadders/meta";
import { meta as worldDominationMeta } from "@/games/WorldDomination/meta";
import { meta as solitaireMeta } from "@/games/Solitaire/meta";
import { meta as trainTimeMeta } from "@/games/TrainTime/meta";

export const GAME_META: Record<string, GameMeta> = {
    dicecities: diceCitiesMeta,
    smartthink: smartthinkMeta,
    settlementsandcities: settlementsAndCitiesMeta,
    snakesandladders: snakesAndLaddersMeta,
    worlddomination: worldDominationMeta,
    solitaire: solitaireMeta,
    traintime: trainTimeMeta,
};

// Games that don't have an implementation yet but are teased in the library.
/** The bounds the party-size rule below needs — a `GameMeta` satisfies it. */
export type PartySizeMeta = Pick<GameMeta, "name" | "players" | "minPlayers" | "maxPlayers">;

/**
 * The 400 statusText a lobby route sends when a party is out of range, and the
 * warning PartySizeHint shows for the same party — `null` when it's fine.
 * Shared so "look up the bounds, check the size, phrase the rejection" isn't
 * copy-pasted into every route and screen that can change a seat count.
 *
 * It lives here, beside the bounds it reads, rather than with the component
 * that renders it: PartySizeHint is a `'use client'` module, and a route
 * handler importing a value out of one gets a client reference that throws
 * when called ("Attempted to call partySizeErrorMessage() from the server"),
 * not the function.
 */
export function partySizeErrorMessage(meta: PartySizeMeta, total: number): string | null {
    return total < meta.minPlayers || total > meta.maxPlayers
        ? `${meta.name} supports ${meta.players}`
        : null;
}

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
    "solitaire": "solitaire",
    "train time": "traintime",
};

export function metaForGame(opts: { url?: string; friendlyName?: string }): GameMeta | undefined {
    if (opts.url && GAME_META[opts.url]) return GAME_META[opts.url];
    if (opts.friendlyName) {
        const url = NAME_TO_URL[opts.friendlyName.toLowerCase().trim()];
        if (url) return GAME_META[url];
    }
    return undefined;
}

// The flat-top hexagon a `shape: "hexagon"` game's badge is cut to, as
// fractions of its box. Here beside `shape` itself so the thumb on screen (a
// CSS `polygon()`) and the share card (an SVG `<polygon>`) cut the same
// silhouette from the one set of vertices, in whichever notation each needs.
export const HEX_VERTICES: readonly (readonly [number, number])[] = [
    [0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5],
];

// The share card a link to this game unfurls to, drawn per game by
// `scripts/generate-icons.mjs` and served straight from `public/`. Here beside
// `gamePath` so the app (which names it in a page's metadata) and the script
// (which writes it) agree on the filename without either hard-coding it.
export function gameShareCard(gameUrl: string): string {
    return `/icons/og-game-${gameUrl}.png`;
}

// The in-app path of a game's board — `/games/<url slug>/<gameId>`. Every
// screen that sends a player to a board (the turn lists, an accepted invite,
// a lobby whose game has just started) goes through here, and
// `gameNotificationLink` builds the absolute push-notification URL on top of
// it, so the route's shape is written down once.
export function gamePath(gameUrl: string, gameId: string): string {
    return `/games/${gameUrl}/${gameId}`;
}
