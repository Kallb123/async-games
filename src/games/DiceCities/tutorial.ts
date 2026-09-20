import type { GameTutorial } from "@/utils/ui/gameTutorials";
import { DiceCitiesCardIds } from "./cards";
import { DEFAULT_DICE_CITIES_THEME, type DiceCitiesTheme } from "./themes";

// The two-minute guided tour of a first Dice Cities match — shown once per
// account in place of the guide's auto-show (see docs/game-tutorials.md).
// Only the roll step asks anything of the player; everything else is a
// narration step pointing at a real piece of the board.
export type DiceCitiesSignal = "myTurn" | "hasRolled" | "canBuild";

// Built from the theme, same reason as buildDiceCitiesGuide: a tour of the
// wasteland re-skin has to say "caps" and "the Caravan Market", not the
// Rising Sun's own nouns.
export function buildDiceCitiesTutorial(theme: DiceCitiesTheme): GameTutorial<DiceCitiesSignal> {
    const { words, cards } = theme;
    const trainStation = cards[DiceCitiesCardIds.TRAIN_STATION].title;

    return {
        steps: [
            {
                title: "Welcome to Dice Cities",
                body: `Build all four ${words.landmarks} before anyone else and you win. Two minutes and you'll have the hang of it.`,
            },
            {
                anchor: "scoreboard",
                title: "The scoreboard",
                body: "How close everyone is to winning. Tap it open for the detail.",
            },
            {
                anchor: "board",
                title: `Your ${words.city}`,
                body: `Every ${words.establishment} you've built, and what each one pays out.`,
            },
            {
                anchor: "dc-roll",
                title: "Your roll",
                body: `Roll one die (two once you've built the ${trainStation}). Every matching ${words.establishment} in every ${words.city} pays out before you build.`,
                when: "myTurn",
                advanceOn: "hasRolled",
                hint: "Tap Roll the dice",
            },
            {
                anchor: "dc-market",
                title: words.market,
                body: `Spend what the roll just paid you on one card or ${words.landmark} a turn. It's shared, so grab what you need before someone else does.`,
                when: "canBuild",
            },
            {
                anchor: "menu",
                title: "Anything else",
                body: "The full rules, the match history and this tour again all live here.",
            },
        ],
    };
}

/**
 * The tutorial as `GAME_TUTORIALS` holds it — the game in the theme it ships
 * in. A match builds its own from the theme it is actually being played in;
 * this is what the registry gets.
 */
export const tutorial: GameTutorial<DiceCitiesSignal> = buildDiceCitiesTutorial(DEFAULT_DICE_CITIES_THEME);
