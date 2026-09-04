// The dressings Dice Cities can be played in.
//
// A theme changes what the game is *called*, never what it *does*: the same
// costs, activation numbers, activation colours, icon combos, bank total and
// win condition, with different names, rules copy and card faces over the top.
// A Brahmin Pen is a Ranch with a different picture on it — see
// docs/games/dice-cities.md §11, which this file implements.
//
// Everything themed about a card lives on the themed card table below, so a
// screen looks a card up in `theme.cards` exactly as it used to look it up in
// `DiceCitiesCards` and gets the themed name, rules text and picture for free —
// no component that draws a card needs to know a theme exists. The shared
// vocabulary in `words` covers the copy around the cards — the coins, the bank,
// the landmark track — which no card owns.

import type { GameTheme } from "@/utils/ui/gameThemes";
import type { IDiceCitiesCard } from "./apiModels";
import { DiceCitiesCardIds, DiceCitiesCards } from "./cards";

/**
 * The game's own nouns, as they read mid-sentence. Anywhere one of these
 * starts a line it is capitalised at the callsite (`capitalise` in
 * utils/ui/text.ts) rather than being stored twice.
 */
export interface DiceCitiesWords {
    coin: string;
    coins: string;
    /** Where bank payouts come out of and card purchases go back into. */
    bank: string;
    establishment: string;
    establishments: string;
    landmark: string;
    landmarks: string;
    /** A player's tableau. */
    city: string;
    /** The shared supply of buyable cards. A proper noun, so already cased. */
    market: string;
}

/** Themed name and rules text for one card. Everything else is the card's. */
interface DiceCitiesCardCopy {
    title: string;
    text: string;
}

/** What a theme is written as. `buildTheme` turns it into a DiceCitiesTheme. */
interface DiceCitiesThemeDef extends GameTheme {
    /**
     * The folder under `/public/art/dicecities/` holding this theme's card
     * faces, every one named the same as the default theme's. A new theme
     * starts by copying that folder wholesale, so its cards are all drawable
     * from day one and each face can be redrawn over its placeholder one at a
     * time; the theme's `note` is what tells the host that some of them still
     * are placeholders.
     */
    artDir: string;
    /** The two colours the board's sky gradient runs between. */
    sky: [string, string];
    words: DiceCitiesWords;
    /** Renamed cards. A card left out keeps the name printed in `cards.ts`. */
    cards: Partial<Record<DiceCitiesCardIds, DiceCitiesCardCopy>>;
}

export interface DiceCitiesTheme extends GameTheme {
    artDir: string;
    sky: [string, string];
    words: DiceCitiesWords;
    /**
     * Every card in the game, themed — same keys as `DiceCitiesCards`, so this
     * is a drop-in replacement for it on any screen that has a theme in hand.
     * Each card's `art` is resolved here from the file name `cards.ts` holds to
     * the full path under this theme's own folder, which is why nothing
     * downstream has to combine the two.
     */
    cards: Record<string, IDiceCitiesCard>;
}

/** Where a theme's card faces live in /public. Every theme names its files
 *  identically, so the card says which picture and the theme says which set. */
function artPath(artDir: string, fileName: string): string {
    return `/art/dicecities/${artDir}/${fileName}`;
}

function buildTheme(def: DiceCitiesThemeDef): DiceCitiesTheme {
    const cards: Record<string, IDiceCitiesCard> = {};
    for (const [cardId, card] of Object.entries(DiceCitiesCards)) {
        cards[cardId] = {
            ...card,
            ...def.cards[cardId as DiceCitiesCardIds],
            art: artPath(def.artDir, card.art),
        };
    }
    return { ...def, cards };
}

// ── Rising Sun: the game as it shipped ───────────────────────────────────────
// Every name is the one printed in `cards.ts`, so this theme renames nothing
// and only has to say what the game already calls things.
const risingSun = buildTheme({
    id: "japanese",
    name: "Rising Sun",
    description: "The original: a bright region of rival towns, wheat fields and sushi bars.",
    glyph: "🏯",
    artDir: "japanese",
    sky: ["oklch(0.85 0.06 235)", "oklch(0.73 0.08 240)"],
    words: {
        coin: "coin",
        coins: "coins",
        bank: "bank",
        establishment: "establishment",
        establishments: "establishments",
        landmark: "landmark",
        landmarks: "landmarks",
        city: "city",
        market: "Market",
    },
    cards: {},
});

// ── Rust & Bottlecaps: the post-nuclear re-skin (dice-cities.md §11) ─────────
// Names only. Every cost, number, colour and limit beside them is the base
// game's, untouched — which is the whole point of the appendix this comes from.
const rustAndBottlecaps = buildTheme({
    id: "wasteland",
    name: "Rust & Bottlecaps",
    description: "A post-nuclear wasteland: survivors rebuilding a settlement out of scrap, paying in bottlecaps.",
    glyph: "☢️",
    note: "Same rules, same numbers — only the names change. Its card art is still being redrawn, so some cards still wear the Rising Sun faces.",
    // Its folder starts as a copy of the Rising Sun one, so every card is
    // drawable from the first day the theme exists. Redrawing a card is
    // overwriting its file in `/public/art/dicecities/wasteland/` under the
    // name it already has — no code change, and the rest keep their
    // placeholder until someone gets to them.
    artDir: "wasteland",
    sky: ["oklch(0.83 0.05 75)", "oklch(0.64 0.08 50)"],
    words: {
        coin: "cap",
        coins: "caps",
        bank: "hoard",
        establishment: "holding",
        establishments: "holdings",
        landmark: "reclamation project",
        landmarks: "reclamation projects",
        city: "settlement",
        market: "Caravan Market",
    },
    cards: {
        [DiceCitiesCardIds.WHEAT_FIELD]: {
            title: "Hydroponic Plot",
            text: "Get 1 cap from the hoard, on anyone's turn.",
        },
        [DiceCitiesCardIds.RANCH]: {
            title: "Brahmin Pen",
            text: "Get 1 cap from the hoard, on anyone's turn.",
        },
        [DiceCitiesCardIds.BAKERY]: {
            title: "Snackcake Bakery",
            text: "Get 1 cap from the hoard, on your turn only.",
        },
        [DiceCitiesCardIds.CAFE]: {
            title: "Roadside Diner",
            text: "Get 1 cap from the player who rolled the dice.",
        },
        [DiceCitiesCardIds.FAMILY_RESTAURANT]: {
            title: "Scavvers' Mess Hall",
            text: "Get 2 caps from the player who rolled the dice.",
        },
        [DiceCitiesCardIds.CONVENIENCE_STORE]: {
            title: "Salvage Trading Post",
            text: "Get 3 caps from the hoard, on your turn only.",
        },
        [DiceCitiesCardIds.FOREST]: {
            title: "Blasted Timber Yard",
            text: "Get 1 cap from the hoard, on anyone's turn.",
        },
        [DiceCitiesCardIds.MINE]: {
            title: "Uranium Mine",
            text: "Get 5 caps from the hoard, on anyone's turn.",
        },
        [DiceCitiesCardIds.APPLE_ORCHARD]: {
            title: "Mutfruit Grove",
            text: "Get 3 caps from the hoard, on anyone's turn.",
        },
        [DiceCitiesCardIds.CHEESE_FACTORY]: {
            title: "Jerky Smokehouse",
            text: "If this is your turn, get 3 caps from the hoard for each Livestock holding that you own",
        },
        [DiceCitiesCardIds.FURNITURE_FACTORY]: {
            title: "Scrap Workshop",
            text: "If this is your turn, get 3 caps from the hoard for each Salvage holding that you own",
        },
        [DiceCitiesCardIds.FRUIT_MARKET]: {
            title: "Caravan Bazaar",
            text: "If this is your turn, get 2 caps from the hoard for each Crop holding that you own",
        },
        [DiceCitiesCardIds.STADIUM]: {
            title: "Cage Fight Arena",
            text: "Get 2 caps from all players, on your turn only.",
        },
        [DiceCitiesCardIds.TV_STATION]: {
            title: "Pirate Radio Station",
            text: "If this is your turn, take 5 caps from any one player.",
        },
        [DiceCitiesCardIds.BUSINESS_CENTER]: {
            title: "Barter Exchange",
            text: "If this is your turn, trade one non-project holding with another player.",
        },
        [DiceCitiesCardIds.TRAIN_STATION]: {
            title: "Metro Junction",
            text: "You may roll 1 or 2 dice.",
        },
        [DiceCitiesCardIds.SHOPPING_MALL]: {
            title: "Ruined Superstore",
            text: "Earn +1 cap from your own Canteen and Stall holdings.",
        },
        [DiceCitiesCardIds.AMUSEMENT_PARK]: {
            title: "Abandoned Funfair",
            text: "If you roll matching dice, take another turn after this one.",
        },
        [DiceCitiesCardIds.RADIO_TOWER]: {
            title: "Signal Relay Mast",
            text: "Once every turn, you can choose to re-roll your dice.",
        },
        [DiceCitiesCardIds.HARBOUR]: {
            title: "Salvage Pier",
            text: "If you roll 10 or more, you may add 2 to the total.",
        },
        [DiceCitiesCardIds.SUSHI_BAR]: {
            title: "Crab Cake Stand",
            text: "If you have the Salvage Pier, get 3 caps from the player who rolled the dice.",
        },
        [DiceCitiesCardIds.FLOWER_ORCHARD]: {
            title: "Glowcap Bed",
            text: "Get 1 cap from the hoard, on anyone's turn.",
        },
        [DiceCitiesCardIds.FLOWER_SHOP]: {
            title: "Chem Stand",
            text: "If this is your turn, get 1 cap from the hoard for each Glowcap Bed that you own",
        },
        [DiceCitiesCardIds.MACKEREL_BOAT]: {
            title: "Fishing Raft",
            text: "If you have the Salvage Pier, get 3 caps from the hoard, on anyone's turn.",
        },
        [DiceCitiesCardIds.FOOD_WAREHOUSE]: {
            title: "Ration Depot",
            text: "If this is your turn, get 2 caps from the hoard for each Canteen holding that you own",
        },
        [DiceCitiesCardIds.TUNA_BOAT]: {
            title: "Deep-Water Trawler",
            text: "If you have the Salvage Pier, get caps from the hoard equal to the shared haul, on anyone's turn.",
        },
    },
});

/** Every theme Dice Cities can be played in. The first is the default. */
export const DICE_CITIES_THEMES: DiceCitiesTheme[] = [risingSun, rustAndBottlecaps];

/** What a game with no stored theme — one created before themes — is played as. */
export const DEFAULT_DICE_CITIES_THEME = risingSun;

/**
 * The theme a stored id names, or the default for anything unrecognised: a
 * game saved before themes existed, or one played in a theme since withdrawn.
 * Total by design — no screen, replay or history line should have to cope with
 * "this game has no theme".
 */
export function diceCitiesTheme(id: string | undefined | null): DiceCitiesTheme {
    return DICE_CITIES_THEMES.find(theme => theme.id === id) ?? DEFAULT_DICE_CITIES_THEME;
}
