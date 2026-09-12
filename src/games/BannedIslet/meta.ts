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
    // On from PR 5 of docs/games/banned-islet.md §21.6, ahead of that plan's
    // §21.6 PR 10, because that is the PR the island starts fighting back in:
    // the game is playable start to finish, winnable and loseable, at every
    // difficulty. What is still coming is polish rather than play — the six
    // roles, the two special cards, the guide, the art and the away recap.
    available: true,
};
