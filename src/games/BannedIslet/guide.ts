import type { GameGuide } from "@/utils/ui/gameGuides";

// The general how-to-play primer shown from the game-options menu and, once
// per account, the first time a player opens a Banned Islet match (see
// useGameGuide). Role-specific ability text lives in the shared RoleInfoPopup,
// which every seat's role name in the hands panel opens — so this only covers
// what the whole team needs whoever they were dealt
// (docs/games/banned-islet.md §4, §7, §8, §9, §11, §12).
export const guide: GameGuide = {
    title: "How to play Banned Islet",
    sections: [
        {
            heading: "Goal",
            body: "Everyone wins or loses together. Capture all four treasures, get every player onto Beacon Pier, and play a Helicopter Lift card to fly out — the escape is a card somebody has to hold and play, not something that happens once the rest is done. The team loses if Beacon Pier sinks, if both tiles of a treasure you haven't captured sink, if a player's tile sinks with nowhere to swim to, or if the water level reaches 10.",
        },
        {
            heading: "Your turn",
            body: "Take up to three actions, in any mix you like: move to a neighbouring tile, shore a flooded tile back to dry, hand a treasure card to somebody standing on your tile, or capture a treasure by discarding four matching cards while standing on either of that treasure's tiles. Then you draw two treasure cards — nobody may hold more than five, so a full hand has to spend or ditch something — and the sea floods the island. Helicopter Lift and Sandbags cost no action — playing one is free, any time it's your turn.",
        },
        {
            heading: "Flooded, then gone",
            body: "Every flood card turns a dry tile flooded and a flooded tile sunk, and a sunk tile is off the board for good — along with the route home that ran through it. A flooded tile isn't damaged, it's a tile with one life left, so shoring up is worth an action long before it looks urgent. It's also the only way to give ground back: nothing raises a sunk tile. If the tile you're standing on sinks, you swim to the nearest one still above water.",
        },
        {
            heading: "Waters Rise!",
            body: "The flood discard is your forecast — every tile in it has been bitten once already. Draw a Waters Rise! card and the water level climbs, so more tiles flood every turn, and that whole discard pile is shuffled straight back on top of the flood deck. The tiles about to sink are the ones already flooded, and there's rarely time to shore them all. Read the pile before it comes back.",
        },
        {
            heading: "Roles",
            body: "Everyone is dealt a role that breaks one rule of the island nobody else can — flying, drying two tiles at once, cutting a corner, swimming a gap, passing cards at a distance, or moving somebody else. Tap any role name (ⓘ) in the hands below to see what that player can do: the plan is usually somebody else's ability, not your own.",
        },
    ],
};
