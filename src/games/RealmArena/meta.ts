import type { GameMeta } from "@/utils/ui/games";

export const meta: GameMeta = {
    url: "realmarena",
    name: "Realm Arena",
    categories: ["Strategy"],
    // Two on the Ruined Fort, or a free-for-all of three or four on the
    // Four-Gate Fort (docs/games/realm-arena.md §17.4 B2).
    players: "2–4 players",
    minPlayers: 2,
    maxPlayers: 4,
    tagline: "Muster a squad in secret, then fight for the centre one action at a time.",
    accent: "#8a2c2c",
    glyph: "⚔️",
    // Hidden from the game library until PR 10 (§17.1). Its setup screen can
    // still be reached by URL for playtesting once PR 4 builds it.
    available: false,
};
