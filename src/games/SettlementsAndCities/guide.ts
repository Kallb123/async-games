import type { GameGuide } from "@/utils/ui/gameGuides";

// The general how-to-play primer shown from the game-options menu and, once
// per account, the first time a player opens a Settlements & Cities match
// (see useGameGuide).
export const guide: GameGuide = {
    title: "How to play Settlements & Cities",
    sections: [
        {
            heading: "Goal",
            body: "Be the first to reach the match's victory point target from settlements, cities, Longest Road, Largest Army and any development cards you've played.",
        },
        {
            heading: "Your turn",
            body: "Roll the dice — everyone collects resources from hexes matching the roll — then trade, build settlements, roads and cities, or buy a development card before passing the turn on.",
        },
        {
            heading: "The robber",
            body: "Roll a 7 and the robber moves: anyone holding more than 7 cards discards down to half, and you block one hex and can steal a card from whoever's next to it.",
        },
        {
            heading: "Longest Road & Largest Army",
            body: "Build an unbroken road of 5+ segments to hold Longest Road, or play 3+ Knight cards to hold Largest Army — both are worth bonus points and can change hands if someone out-builds you.",
        },
        {
            heading: "Development cards",
            body: "Knights move the robber and count toward Largest Army, Road Building and Year of Plenty give you free roads or resources, and Monopoly forces everyone to hand over one resource type — a Victory Point card counts the moment you hold it, but stays hidden until you reveal it or win.",
        },
    ],
};
