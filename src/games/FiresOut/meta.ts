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
    // Not shown in the library yet — fires-out-gdd.md §17.6 step 11 flips this
    // once the Family game (steps 3-7) is complete and playable end to end.
    available: false,
};
