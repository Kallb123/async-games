import type { GameMeta } from "@/utils/ui/games";
import { MAX_PLAYERS, MIN_PLAYERS } from "./board";

export const meta: GameMeta = {
    url: "firesout",
    name: "Fires Out!",
    // §1 offers solitaire play too (§17.6 step 12), which is what earns the
    // Solo chip in the library alongside Co-op — one player running the whole
    // crew is the same cooperative game with nobody to talk to.
    categories: ["Strategy", "Co-op", "Solo"],
    players: "1–6 players",
    // The crew game's bounds, which is what every consumer of these two is
    // about: the invite flow's party-size check and the hint above it. Solo
    // has its own bounds (MIN_SOLO_CREW/MAX_SOLO_CREW) and its own branch of
    // the setup screen, and never goes through either.
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    tagline: "A crew of firefighters races to pull everyone out before the building comes down.",
    accent: "#d2432c",
    glyph: "🚒",
    available: true,
};
