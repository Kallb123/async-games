import type { GameGuide } from "@/utils/ui/gameGuides";

// The general how-to-play primer shown from the game-options menu and, once
// per account, the first time a player opens a Dice Cities match (see
// useGameGuide).
export const guide: GameGuide = {
    title: "How to play Dice Cities",
    sections: [
        {
            heading: "Goal",
            body: "Be the first to build all four landmarks — Train Station, Shopping Mall, Amusement Park and Radio Tower — to win.",
        },
        {
            heading: "Your turn",
            body: "Roll one die (two once you've built the Train Station) — every card in every player's city that matches the total activates before you build, then you spend what you earned on one card or landmark for your own city.",
        },
        {
            heading: "Card colours",
            body: "Blue cards pay out to whoever rolls, on anyone's turn. Green cards only pay you, and only on your own roll. Red cards let you take coins straight from whoever just rolled — build a few and their bad luck is your good luck.",
        },
        {
            heading: "Landmarks",
            body: "The Train Station unlocks a second die, the Shopping Mall adds a coin to every dining and store card you own, the Amusement Park gives you another roll whenever you roll doubles, and the Radio Tower lets you reroll once a turn if you don't like what you got.",
        },
        {
            heading: "Watch the market",
            body: "The cards on offer are shared — the one you need might not last until your next turn, so grab high-value blues and reds while they're there instead of banking coins for later.",
        },
        {
            heading: "The Docks",
            body: "If the game was set up with the Docks, your build track gains a fifth landmark: the Harbour, cheapest of the five at 2 coins. Once you've built it, any roll of 10 or more offers you +2 — your call each time — and it never counts toward winning, so the original four still decide that. The Docks also adds six cards: the Flower Shop pays a coin for every Flower Orchard you own and the Food Warehouse 2 for every dining card, while the three sea cards — Sushi Bar, Mackerel Boat, Tuna Boat — stay idle until their owner has built the Harbour. The Tuna Boat pays each of those owners the same shared two-dice haul on 12 to 14, and 13 and 14 only come up with the +2.",
        },
    ],
};
