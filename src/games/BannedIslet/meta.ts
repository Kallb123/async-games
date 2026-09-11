import type { GameMeta } from "@/utils/ui/games";
import { MIN_PLAYERS, MAX_PLAYERS } from "./board";

export const meta: GameMeta = {
    url: "bannedislet",
    name: "Banned Islet",
    categories: ["Strategy", "Co-op"],
    players: "2–4 players",
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    tagline: "Lift four relics off a sinking island before the sea takes the floor out from under you.",
    accent: "#1f7a8c",
    glyph: "🏝️",
    // Turned on in the last PR of docs/games/banned-islet.md §21.6, once there
    // is a board to play it on.
    available: false,
};
