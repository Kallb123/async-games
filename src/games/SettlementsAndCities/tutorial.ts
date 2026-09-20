import type { GameTutorial } from "@/utils/ui/gameTutorials";

// The two-minute guided tour of a first Settlements & Cities match — shown
// once per account in place of the guide's auto-show (see
// docs/game-tutorials.md). One step asks something of the player (roll);
// everything else is a narration step pointing at a real piece of the board.
// Closest in shape to Dice Cities' tour, minus the card-detail steps — this
// game has no card to tap and inspect.
export type SettlementsAndCitiesSignal = "myTurn" | "hasRolled" | "canBuild";

export const tutorial: GameTutorial<SettlementsAndCitiesSignal> = {
    steps: [
        {
            title: "Welcome to Settlements & Cities",
            body: "Build settlements, roads and cities across the island and be first to the victory points needed to win. Two minutes and you'll have the hang of it.",
        },
        {
            anchor: "scoreboard",
            title: "The scoreboard",
            body: "How close everyone is to winning, plus who's holding Longest Road and Largest Army. Tap it open for the detail.",
        },
        {
            anchor: "board",
            title: "The island",
            body: "Each hex pays out its resource when its number comes up on the roll. Build a settlement or city next to the hexes you want.",
        },
        {
            anchor: "sac-roll",
            title: "Your roll",
            body: "Roll two dice — every hex with a matching number pays out to whoever's built next to it, you included.",
            when: "myTurn",
            advanceOn: "hasRolled",
            hint: "Tap Roll the dice",
        },
        {
            anchor: "sac-build",
            title: "Build something",
            body: "Spend what the roll just paid you on a road, settlement or city — or a development card. It's your board to build on; nobody else can build on your roads.",
            when: "canBuild",
        },
        {
            anchor: "menu",
            title: "Anything else",
            body: "The full rules, the match history and this tour again all live here.",
        },
    ],
};
