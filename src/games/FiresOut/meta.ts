import type { GameMeta } from "@/utils/ui/games";
import { MAX_PLAYERS, MIN_PLAYERS } from "./board";

export const meta: GameMeta = {
    url: "firesout",
    name: "Fires Out!",
    categories: ["Strategy", "Co-op"],
    players: "2–6 players",
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    tagline: "A crew of firefighters races to pull everyone out before the building comes down.",
    accent: "#d2432c",
    glyph: "🚒",
    available: true,
};
