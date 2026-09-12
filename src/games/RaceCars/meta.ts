import type { GameMeta } from "@/utils/ui/games";
import { MAX_PLAYERS, MIN_PLAYERS } from "./board";

export const meta: GameMeta = {
    url: "racecars",
    name: "Race Cars",
    categories: ["Dice", "Strategy"],
    players: "2–6 players",
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    tagline: "Pick a gear, roll its die, and find out whether the corner will take it.",
    // British racing green, and chosen here rather than at the art PR on
    // purpose (§23.7 PR 2): `scripts/generate-icons.mjs` draws the share card
    // from this colour, and §23.6's render of Ashcombe Park — tarmac through
    // parkland — is drawn to match it. Picking it afterwards would be picking
    // a colour; picking it now is picking one the art already agrees with.
    accent: "#1b5e3a",
    // §23.6: gains `art: "/art/racecars/icon.png"` in PR 9, once there is a
    // crop of the circuit render worth using. §19.1 is explicit that this is
    // the one place a car may be an emoji — nothing here is carrying identity.
    glyph: "🏎️",
    // Off until the game is playable end to end, which is PR 6 at the earliest:
    // `available` is a catalogue filter and not a gate — `GameLibrary` is its
    // only reader — so the route below answers a hand-written request from any
    // unlocked account from this PR onward. What it must not do is *advertise*
    // a game whose turn timer has no adapter (PR 6) and whose board's turn
    // scrubber has no replay adapter (PR 8): a timed-out turn would deadlock
    // the race for everyone, and every tap of the scrubber would error. Banned
    // Islet's own meta.ts records the same lesson from the other direction.
    available: false,
};
