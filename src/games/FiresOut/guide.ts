import type { GameGuide } from "@/utils/ui/gameGuides";

// The general how-to-play primer shown from the game-options menu and, once
// per account, the first time a player opens a Fires Out! match (see
// useGameGuide). Covers the Family game first, since that's the setup
// screen's default, and keeps the Experienced extras — the difficulty tiers,
// specialists, hazmats, hot spots — to the last section so a Family crew can
// stop reading after four (docs/games/fires-out-gdd.md §5, §7, §8, §9, §10,
// §11, §13).
export const guide: GameGuide = {
    title: "How to play Fires Out!",
    sections: [
        {
            heading: "Goal",
            body: "Everyone wins or loses together. Carry 7 victims out of the burning house to win; lose 4 of them, or let the building take 24 damage and collapse, and the whole crew loses.",
        },
        {
            heading: "Your turn",
            body: "Spend 4 action points: 1 to step to the next space (2 to push into fire), 1 to work a door, 1 to knock fire down to smoke (2 to clear it), and 2 to chop a wall — twice over to open a way through. Your own chopping counts towards the same 24 damage, so the quickest route to a victim is also the quickest route to losing. Unspent points bank up to 4.",
        },
        {
            heading: "How the fire spreads",
            body: "It advances when you end your turn — after every player, not once a round. Two dice pick a space: an empty one gains smoke, or fire if a fire already adjoins it; smoke flips to fire; and fire explodes outward in all four directions, wrecking walls and doors as it goes. Then all smoke touching fire catches too, so a smoky corridor can go up at once.",
        },
        {
            heading: "Victims",
            body: "The \"?\" markers are 10 victims mixed with 5 false alarms, and only reaching one tells you which. Carrying costs 2 points a space and you can't cross fire while doing it. In the Family game anywhere outside counts as the rescue — so fire catching you carries you both out and saves them. In the Experienced game only the ambulance will do.",
        },
        {
            heading: "The Experienced game",
            body: "All of the above, plus a Recruit, Veteran or Heroic difficulty to pick. The fire is no longer the printed layout: it comes from explosions rolled at setup that damage walls before anyone has moved. Every firefighter also gets a Specialist with its own points and abilities, hazmats explode when fire reaches them, and hot spots make fire landing on them roll again.",
        },
    ],
};
