import type { GameMeta } from "@/utils/ui/games";

export const meta: GameMeta = {
    url: "settlementsandcities",
    name: "Settlements & Cities",
    categories: ["Strategy", "Dice"],
    players: "2–6 players",
    minPlayers: 2,
    maxPlayers: 6,
    tagline: "Trade, build and out-manoeuvre for the most victory points.",
    accent: "gold",
    glyph: "🏘️",
    shape: "hexagon",
    available: true,
    // Trade offers are posted and accepted on anyone's turn (docs/games/
    // settlements-and-cities.md §10), so the board polls while it is yours and
    // every move says which board it was built against.
    hasOutOfTurnPlays: true,
};
