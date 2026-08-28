import type { GameMeta } from "@/utils/ui/games";
import { MIN_PLAYERS, MAX_PLAYERS } from "./board";

export const meta: GameMeta = {
    url: "outbreak",
    name: "Outbreak",
    categories: ["Strategy", "Co-op"],
    players: "2–4 players",
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    tagline: "Race a spreading pandemic as a team — cure all four diseases before the world falls apart.",
    accent: "#c0392b",
    glyph: "🦠",
    available: true,
};
