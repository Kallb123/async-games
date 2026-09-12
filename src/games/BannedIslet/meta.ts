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
    // On from PR 5 of docs/games/banned-islet.md §21.6 rather than that plan's
    // PR 10, because PR 5 is where the island starts fighting back: the game is
    // playable start to finish, winnable and loseable, at every difficulty.
    // What is still coming — the six roles, the two special cards, the guide,
    // the art, the away recap and the result page — is polish rather than play,
    // and each degrades to nothing rather than to something broken.
    //
    // Two things were *not* polish and came forward with this flag, because it
    // is a promise the game works rather than a label: PR 6's turn-timeout
    // adapter (without which a turn timing out mid-discard deadlocks the match
    // for everybody) and PR 9's replay adapter (without which the board's turn
    // scrubber errors on every tap). §21.6's "What PR 5 actually shipped" says
    // why in full.
    available: true,
};
