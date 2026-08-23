import type { GameMeta } from "@/utils/ui/games";
import { MAX_PLAYERS, MIN_PLAYERS } from "./board";

export const meta: GameMeta = {
    url: "traintime",
    name: "Train Time",
    categories: ["Strategy", "Cards"],
    players: "2–5 players",
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    tagline: "Collect carriage cards and claim the rail routes your rivals wanted.",
    accent: "green",
    glyph: "🚂",
    available: true,
};
