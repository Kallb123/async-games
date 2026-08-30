// Shared shape for a game's "game guide" — the how-to-play popup shown from
// the in-game options menu and, once per account, the first time a player
// opens a match of that game type (see useGameGuide).
//
// Same aggregation idiom as GameMeta in games.ts: each game owns its own
// content as a `guide` export next to its meta, and this file only declares
// the shared shape and collects every game's entry into one lookup. Adding a
// new game's guide means adding one import + one line below, not editing a
// shared object literal.

export interface GameGuideSection {
    heading: string;
    body: string;
}

export interface GameGuide {
    title: string;
    sections: GameGuideSection[];
}

import { guide as outbreakGuide } from "@/games/Outbreak/guide";

// Keyed by the same url slug as GAME_META. Not every game has a guide yet —
// callers look it up with guideForGame and handle a miss.
export const GAME_GUIDES: Record<string, GameGuide> = {
    outbreak: outbreakGuide,
};

export function guideForGame(url: string): GameGuide | undefined {
    return GAME_GUIDES[url];
}
