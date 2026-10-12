import type { GameMeta } from "@/utils/ui/games";

export const meta: GameMeta = {
    url: "worlddomination",
    name: "World Domination",
    categories: ["Strategy", "Dice"],
    players: "2–6 players",
    minPlayers: 2,
    maxPlayers: 6,
    tagline: "Deploy, invade and hold continents in a fight for world domination.",
    accent: "terracotta",
    glyph: "🌍",
    // Version 2 holds the turn's hand-off for ten seconds (docs/undo.md, "The
    // ninth game"): a Fortify, a SkipFortify or the last setup placement from
    // before it ended the turn there and then, and from a tab still running
    // that bundle would now only hold it, with no countdown on screen. Asked to
    // reload instead. Version 1's recorded moves replay unchanged: the replay
    // closes the hold they never did (closeUnrecordedHold).
    commandVersion: 2,
    available: true,
};
