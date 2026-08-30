import type { GameGuide } from "@/utils/ui/gameGuides";

// The general how-to-play primer shown from the game-options menu and, once
// per account, the first time a player opens a World Domination match (see
// useGameGuide).
export const guide: GameGuide = {
    title: "How to play World Domination",
    sections: [
        {
            heading: "Goal",
            body: "Conquer the map — the last player still holding territory wins.",
        },
        {
            heading: "Your turn",
            body: "Each turn moves through three phases: Reinforce (place new armies on territories you hold), Attack (invade adjacent enemy territories) and Fortify (move armies once between two of your own connected territories).",
        },
        {
            heading: "Attacking",
            body: "Pick a territory with at least two armies, then an adjacent enemy territory to invade — dice decide the battle, and taking the last army on a territory captures it, eliminating its owner if it was their last one.",
        },
        {
            heading: "Reinforcements",
            body: "How many armies you get each turn depends on how many territories — and whole continents — you hold, so a continent is worth defending even if it costs you elsewhere.",
        },
        {
            heading: "Territory cards",
            body: "Conquering at least one territory a turn earns you a card, and a matching set of cards can be turned in for bonus armies — the set bonus climbs the more the table has already turned in, so timing when you cash in matters.",
        },
    ],
};
