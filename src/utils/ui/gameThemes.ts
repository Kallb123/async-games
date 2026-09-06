// Shared shape and lookup for a game's *themes* — the alternative dressings a
// host picks between on the New Game screen.
//
// A theme re-skins a game without touching a single rule: the same costs,
// activation numbers, colours and win condition, with different names, copy and
// artwork over the top. Dice Cities' "Rust & Bottlecaps" is a Wheat Field
// renamed to a Hydroponic Plot, not a new establishment.
//
// Same aggregation idiom as GameMeta in games.ts and GameGuide in
// gameGuides.ts: each game owns its own themes as a `themes.ts` next to its
// meta, and this file only declares the shared shape, collects every themed
// game's list into one lookup, and answers the two questions the generic code
// has — "what can this game be played as?" and "is this stored id still real?".
//
// A game with no entry here has no themes, and every screen below degrades to
// showing no picker rather than needing to know which games are themed.

export interface GameTheme {
    /**
     * Stored on the invitation and on the game itself, so it outlives the
     * setup screen — never change a shipped id, or every game already played
     * under it falls back to the default.
     */
    id: string;
    /** How the theme is named in the picker. */
    name: string;
    /** One line on what the game becomes, in the player's language. */
    description: string;
    /** Leads the picker row — themes have no artwork of their own to show. */
    glyph: string;
    /**
     * A caveat worth reading before choosing, shown under the row. Today that
     * means "the art for this one isn't drawn yet"; the theme still plays, it
     * just borrows the default theme's card faces.
     */
    note?: string;
}

import { DICE_CITIES_THEMES } from "@/games/DiceCities/themes";

/**
 * Every themed game's list, keyed by the same url slug as GAME_META.
 *
 * The **first entry of each list is that game's default** — what a game
 * created before the game was themed is played as, and what an unrecognised
 * stored id falls back to.
 */
export const GAME_THEMES: Record<string, GameTheme[]> = {
    dicecities: DICE_CITIES_THEMES,
};

/** The themes a game offers — empty for a game that isn't themed. */
export function themesForGame(gameUrl: string): GameTheme[] {
    return GAME_THEMES[gameUrl] ?? [];
}

/**
 * The theme id to actually store for a game, given whatever the client asked
 * for. Anything unrecognised — a themeless game, a missing field, a typo, a
 * theme that has since been withdrawn — resolves to the game's default rather
 * than being rejected: a theme is presentation, and no choice of one can make
 * a game unplayable, so there is nothing here worth failing a request over.
 *
 * This is also how anything asks for a game's default: pass nothing.
 */
export function themeIdFor(gameUrl: string, requested: unknown): string | undefined {
    const themes = themesForGame(gameUrl);
    if (themes.length === 0) return undefined;
    return themes.find(theme => theme.id === requested)?.id ?? themes[0].id;
}
