import type { GameMeta } from "@/utils/ui/games";

export const meta: GameMeta = {
    url: "realmarena",
    name: "Realm Arena",
    categories: ["Strategy"],
    // Two until free-for-all and the 48×48 fort (docs/games/realm-arena.md §17.4 B2).
    players: "2 players",
    minPlayers: 2,
    maxPlayers: 2,
    tagline: "Muster a squad in secret, then fight for the centre one action at a time.",
    accent: "#8a2c2c",
    glyph: "⚔️",
    // Hidden from the game library until PR 10 (§17.1). Its setup screen can
    // still be reached by URL for playtesting once PR 4 builds it.
    available: false,
};
