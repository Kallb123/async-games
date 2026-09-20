import type { GameTutorial } from "@/utils/ui/gameTutorials";

// The two-minute guided tour of a first Settlements & Cities match — shown
// once per account in place of the guide's auto-show (see
// docs/game-tutorials.md). One step asks something of the player (roll);
// everything else is a narration step pointing at a real piece of the board.
// Closest in shape to Dice Cities' tour, minus the card-detail steps — this
// game has no card to tap and inspect. Unlike Dice Cities it opens on a
// setup phase (everyone places two settlements and two roads before the
// real turns begin), so `canRoll`/`setupPlacing` split what Dice Cities
// covers with a single `myTurn` — the roll button doesn't exist yet during
// setup, and a step naming it would point at nothing.
//
// `turnOverview` covers the rest: whoever's tour this is, if it isn't their
// turn to roll and it isn't their turn to build, there's a real build list
// on screen already (the off-turn preview every waiting player gets, or
// this player's own setup-turn preview — see SettlementsAndCitiesActions'
// `tutorialPreview` prop) worth a general "here's what a turn looks like"
// step, distinct from the later do-it steps that only apply once there's a
// real turn to take. It's defined as `!canRoll && !canBuild` (page.tsx), so
// it can never hold at the same time as either of them — the three
// `when`s below are mutually exclusive by construction, not by an
// invariant borrowed from two files away.
export type SettlementsAndCitiesSignal = "setupPlacing" | "canRoll" | "hasRolled" | "canBuild" | "turnOverview";

export const tutorial: GameTutorial<SettlementsAndCitiesSignal> = {
    steps: [
        {
            title: "Welcome to Settlements & Cities",
            body: "Build settlements, roads and cities across the island and be first to the victory points needed to win. Two minutes and you'll have the hang of it.",
        },
        {
            anchor: "scoreboard",
            title: "The scoreboard",
            body: "How close everyone is to winning: their card count, and the 🛣️ and ⚔️ marks for Longest Road and Largest Army. Tap it open for the detail.",
        },
        {
            anchor: "board",
            title: "The island",
            body: "Each hex pays out its resource when its number comes up on the roll. Build a settlement or city next to the hexes you want.",
        },
        {
            anchor: "sac-setup",
            title: "Setup",
            body: "Every game starts here — each player places two settlements and two roads before the real turns begin. Tap where you'd like yours, then Next when you're ready to carry on.",
            when: "setupPlacing",
        },
        {
            anchor: "sac-hand",
            title: "Your resources",
            body: "This is what a hex pays you — wool, ore, brick and the rest. Spend them to build on the island or buy a development card.",
        },
        {
            anchor: "sac-build",
            title: "Your turn",
            body: "Each turn starts with a roll, then you spend what you've collected: a road, a settlement, a city or a development card, as many as you can afford, before you pass to the next player.",
            when: "turnOverview",
        },
        {
            anchor: "sac-roll",
            title: "Your roll",
            body: "Roll two dice — every hex with a matching number pays out to whoever's built next to it, you included.",
            when: "canRoll",
            advanceOn: "hasRolled",
            hint: "Tap Roll the dice",
        },
        {
            anchor: "sac-build",
            title: "Build something",
            body: "Spend what the roll just paid you on a road, settlement or city — or a development card. New roads and settlements have to connect to one you've already got.",
            when: "canBuild",
        },
        {
            anchor: "menu",
            title: "Anything else",
            body: "The full rules, the match history and this tour again all live here.",
        },
    ],
};
