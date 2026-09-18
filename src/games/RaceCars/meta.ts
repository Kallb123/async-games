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
    // §23.6: gains `art: "/art/racecars/icon.png"` once there is a crop of the
    // circuit render worth using — still owed, and §23.3 records why PR 9 shipped
    // the guide without it. §19.1 is explicit that this is the one place a car
    // may be an emoji — nothing here is carrying identity.
    glyph: "🏎️",
    // On from PR 4, the board screen — which is what makes the game playable
    // by hand rather than only by the test harness, and is the point of turning
    // it on: every PR after this one is playtestable as it lands.
    //
    // `available` is a catalogue filter and not a gate (`GameLibrary` is its
    // only reader), so what flipping it buys is that a race can be *found*
    // rather than hand-requested. Two things ride with it until their own PRs
    // land, listed here rather than left to be discovered:
    //
    // - **PR 6 landed the turn-timeout adapter** (`turnTimeout.ts`'s
    //   `RaceCarsGameType` registration), so the cron's plain-advance
    //   `noAdapter` fallback — which walked `currentTurn` one step along
    //   `gameState.turnOrder`, the join order, while the race order in
    //   `roundOrder`/`roundIndex` sat untouched (§23.2) — no longer runs for
    //   Race Cars. The one other surface that did the same untouched-`turnOrder`
    //   walk, `POST /api/game/taketurn`, now refuses outright for any game with
    //   a registered adapter, for the identical reason: a driver could call it
    //   on their own turn to desync `currentTurn` from `roundOrder[roundIndex]`
    //   onto an innocent driver who could never satisfy `driverOnTurn`, banking
    //   a missed turn against them every sweep until the abandon ladder ended
    //   the race. `roundOrder[roundIndex]` (§23.4) stays as the guard Race Cars
    //   actually depends on regardless.
    // - The replay and recap adapters landed in PR 8, so the board's "Review
    //   actions" scrubber builds a timeline like every other game's. Kept here
    //   only because the note above it dates from when neither existed.
    available: true,
};
