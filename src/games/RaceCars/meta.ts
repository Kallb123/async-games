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
    // On from PR 4, the board screen — which is what makes the game playable
    // by hand rather than only by the test harness, and is the point of turning
    // it on: every PR after this one is playtestable as it lands.
    //
    // `available` is a catalogue filter and not a gate (`GameLibrary` is its
    // only reader), so what flipping it buys is that a race can be *found*
    // rather than hand-requested. Two things ride with it until their own PRs
    // land, listed here rather than left to be discovered:
    //
    // - **No turn-timeout adapter until PR 6**, and the cron's `noAdapter`
    //   fallback is not harmless here. It advances `currentTurn` one step along
    //   `gameState.turnOrder` — the join order — while the race order lives in
    //   `roundOrder`/`roundIndex` and is untouched (§23.2). The two then
    //   disagree: the driver `currentTurn` now names passes the command route's
    //   gate and is refused by `driverOnTurn`, and every other driver is
    //   refused by the route. The race stalls until the sweep walks
    //   `currentTurn` back round to `roundOrder[roundIndex]`, banking a missed
    //   turn against an innocent driver each tick on the way — and the abandon
    //   ladder can end the game first. Per-player `phase`/`roll` (§23.4) is
    //   what keeps this to a stall rather than one driver spending another's
    //   roll; PR 6's adapter is what removes it. Until then a race wants a
    //   turn timer its drivers will actually beat.
    // - **No replay adapter until PR 8**, so the board's "Review actions"
    //   scrubber reports that it cannot build the timeline rather than showing
    //   one. That one is inert: it fails in place and nothing else is touched.
    available: true,
};
