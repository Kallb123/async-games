import type { GameGuide } from "@/utils/ui/gameGuides";

// The general how-to-play primer shown from the game-options menu and, once
// per account, the first time a player opens a Train Time match (see
// useGameGuide).
export const guide: GameGuide = {
    title: "How to play Train Time",
    sections: [
        {
            heading: "Goal",
            body: "Score the most points by claiming rail routes, completing your Destination Tickets, and building the longest continuous run of track.",
        },
        {
            heading: "Your turn",
            body: "Take one action: draw two carriage cards, claim a route by discarding matching cards, or draw new Destination Tickets — then pass the turn on.",
        },
        {
            heading: "Claiming routes",
            body: "A route costs cards of its own colour (or any colour on a grey route) equal to its length, and pays points that jump sharply for longer routes — a six-car route is worth far more than two three-car ones.",
        },
        {
            heading: "Destination Tickets",
            body: "Each ticket rewards you for connecting two named cities by the end of the game — and costs you the same amount if you never do, so only keep ones you can realistically finish.",
        },
        {
            heading: "Long Haul & final scoring",
            body: "The Long Haul bonus goes to whoever holds the single longest unbroken run of claimed routes when the game ends — keep an eye on the standings' longest-run figure, since it can change hands right up to the final turn.",
        },
    ],
};
