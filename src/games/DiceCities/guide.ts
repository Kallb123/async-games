import type { GameGuide } from "@/utils/ui/gameGuides";
import { DiceCitiesCardIds } from "./cards";
import { DEFAULT_DICE_CITIES_THEME, type DiceCitiesTheme } from "./themes";
import { capitalise } from "@/utils/ui/text";

// The general how-to-play primer shown from the game-options menu and, once
// per account, the first time a player opens a Dice Cities match (see
// useGameGuide).
//
// Built from the game's theme rather than written out, because a themed game
// whose guide still talks about the Train Station and coins is a guide for a
// different game than the one on screen. Everything variable here is a card
// name or one of the theme's nouns — the rules being explained are the same in
// every theme, which is the whole point of a theme.
export function buildDiceCitiesGuide(theme: DiceCitiesTheme): GameGuide {
    const { words, cards } = theme;
    const card = (id: DiceCitiesCardIds) => cards[id].title;
    const trainStation = card(DiceCitiesCardIds.TRAIN_STATION);
    const harbour = card(DiceCitiesCardIds.HARBOUR);

    return {
        title: "How to play Dice Cities",
        sections: [
            {
                heading: "Goal",
                body: `Be the first to build all four ${words.landmarks} — ${trainStation}, ${card(DiceCitiesCardIds.SHOPPING_MALL)}, ${card(DiceCitiesCardIds.AMUSEMENT_PARK)} and ${card(DiceCitiesCardIds.RADIO_TOWER)} — to win.`,
            },
            {
                heading: "Your turn",
                body: `Roll one die (two once you've built the ${trainStation}) — every card in every player's ${words.city} that matches the total activates before you build, then you spend what you earned on one card or ${words.landmark} for your own ${words.city}.`,
            },
            {
                heading: "Card colours",
                body: `Blue cards pay out to whoever rolls, on anyone's turn. Green cards only pay you, and only on your own roll. Red cards let you take ${words.coins} straight from whoever just rolled — build a few and their bad luck is your good luck.`,
            },
            {
                heading: capitalise(words.landmarks),
                body: `The ${trainStation} unlocks a second die, the ${card(DiceCitiesCardIds.SHOPPING_MALL)} adds a ${words.coin} to every dining and store card you own, the ${card(DiceCitiesCardIds.AMUSEMENT_PARK)} gives you another roll whenever you roll doubles, and the ${card(DiceCitiesCardIds.RADIO_TOWER)} lets you reroll once a turn if you don't like what you got.`,
            },
            {
                heading: `Watch the ${words.market.toLowerCase()}`,
                body: `The cards on offer are shared — the one you need might not last until your next turn, so grab high-value blues and reds while they're there instead of banking ${words.coins} for later. Tap any card, in the ${words.market.toLowerCase()} or in a ${words.city} or on the ${words.landmark} track, to see it full size and read exactly what it does.`,
            },
            {
                heading: "The Docks",
                body: `If the game was set up with the Docks, your build track gains a fifth ${words.landmark}: the ${harbour}, cheapest of the five at 2 ${words.coins}. Once you've built it, any roll of 10 or more offers you +2 — your call each time — and it never counts toward winning, so the original four still decide that. The Docks also adds six cards: the ${card(DiceCitiesCardIds.FLOWER_SHOP)} pays a ${words.coin} for every ${card(DiceCitiesCardIds.FLOWER_ORCHARD)} you own and the ${card(DiceCitiesCardIds.FOOD_WAREHOUSE)} 2 for every dining card, while the three sea cards — ${card(DiceCitiesCardIds.SUSHI_BAR)}, ${card(DiceCitiesCardIds.MACKEREL_BOAT)}, ${card(DiceCitiesCardIds.TUNA_BOAT)} — stay idle until their owner has built the ${harbour}. The ${card(DiceCitiesCardIds.TUNA_BOAT)} pays each of those owners the same shared two-dice haul on 12 to 14, and 13 and 14 only come up with the +2.`,
            },
        ],
    };
}

/**
 * The guide as `GAME_GUIDES` holds it — the game in the theme it ships in.
 * A match builds its own from the theme it is actually being played in; this
 * is what the registry (and anything asking about Dice Cities in general,
 * rather than about one game of it) gets.
 */
export const guide: GameGuide = buildDiceCitiesGuide(DEFAULT_DICE_CITIES_THEME);
