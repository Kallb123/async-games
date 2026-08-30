import type { GameGuide } from "@/utils/ui/gameGuides";

// The general how-to-play primer shown from the game-options menu and, once
// per account, the first time a player opens an Outbreak match (see
// useGameGuide). Role-specific ability text lives in OutbreakRoleInfoPopup —
// this only covers what every player needs regardless of who they were
// dealt (docs/games/outbreak-gdd.md §4, §7).
export const guide: GameGuide = {
    title: "How to play Outbreak",
    sections: [
        {
            heading: "Goal",
            body: "Work together to discover cures for all four diseases before the outbreak counter maxes out, a disease colour runs out of cubes, or the player deck runs dry.",
        },
        {
            heading: "Your turn",
            body: "Spend 4 actions moving between cities, treating disease, building research stations, sharing knowledge, or curing a disease — then draw 2 player cards and infect cities equal to the current infection rate.",
        },
        {
            heading: "Roles",
            body: "Everyone is dealt a role with a rule-breaking ability nobody else has. Tap your role name any time to see what only you can do.",
        },
        {
            heading: "Watch the danger signs",
            body: "The outbreak counter, the disease cube supply, and the infection rate track are the three ways this can end badly — keep an eye on all three, not just the one on fire.",
        },
    ],
};
