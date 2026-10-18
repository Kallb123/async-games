import type { GameTutorial } from "@/utils/ui/gameTutorials";
import { ACTION_POINTS, CENTRE_POINTS, CENTRE_SCORES_FROM_ROUND, REACTION_COST } from "./rules";

// The guided tour of a first Realm Arena match — shown once per account in
// place of the guide's auto-show (see docs/game-tutorials.md). It covers what
// §17.3 PR 9 lists: your squad, the reach shading, an enemy's hit chance, the
// centre and End turn — and the muster, since a first match opens on it.
//
// A match has two phases, and the tour is taken in whichever one the player
// opens it in, so the signals split them (page.tsx derives each):
// - `mustering` — it's this player's turn to muster: pick and place a squad.
// - `sealed` — someone else is mustering, so there's nothing on the board yet.
// - `battle` — every squad is on the battlefield.
// - `myTurn` — a battle turn of this player's, live.
// - `selected` — one of this player's standing characters is selected on their
//   battle turn, which is what shades its reach and lists its targets. The
//   "pick a character" step waits on it, and the hit-chance step that follows
//   points at the list of targets it brings up.
export type RealmArenaSignal = "mustering" | "sealed" | "battle" | "myTurn" | "selected";

export const tutorial: GameTutorial<RealmArenaSignal> = {
    steps: [
        {
            title: "Welcome to Realm Arena",
            body: "Squads fight over a fort, one action at a time. Most points when the last round ends wins. Two minutes and you'll have it.",
        },
        {
            anchor: "scoreboard",
            title: "The scores",
            body: `Everyone's points, and how much of their squad is still standing — in fog of war, how much of it you can see. Holding the centre at the end of your turn scores ${CENTRE_POINTS}; knocking an enemy out scores more the more they cost, and in a free-for-all, hurting one that somebody else finishes off scores you an assist.`,
        },
        {
            anchor: "board",
            title: "Muster your squad",
            body: `Spend your points below on characters, as many of each as they buy, and items for them to carry — then place them in your zone on the board. Nobody sees anyone's squad until every player has mustered.`,
            when: "mustering",
        },
        {
            anchor: "board",
            title: "Sealed squads",
            body: "Every player musters in secret, one after another. The squads take the field together once the last one has, and the battle starts.",
            when: "sealed",
        },
        {
            anchor: "ra-units",
            title: "Your squad",
            body: `A box for each character: its HP, the AP it has left of its ${ACTION_POINTS} this turn, and how many enemies it could hit from where it stands. Tap one to select it.`,
            when: "battle",
        },
        {
            anchor: "board",
            title: "Where it can go",
            body: "Select one of your characters and the board shades where it can get to with the AP it has, including any bonus. Tap a square to see the path and who'd react to it, and tap again to go.",
            when: "myTurn",
            advanceOn: "selected",
            hint: "Tap one of your characters",
        },
        {
            anchor: "ra-targets",
            title: "Chance to hit",
            body: "The enemies it could hit, likeliest first. Tap one on the board to see the chance to hit, graze or miss and the damage before you commit, and again to attack. Cover lowers it; a flanked enemy has none.",
            when: "myTurn",
        },
        {
            anchor: "ra-stats",
            title: "The centre",
            body: `The marked square in the middle of the map. End your turn with someone of yours in it and no enemy, and you score ${CENTRE_POINTS} — from round ${CENTRE_SCORES_FROM_ROUND}.`,
        },
        {
            anchor: "ra-turn-end",
            title: "End turn",
            body: `Anyone left with ${REACTION_COST} AP or more goes on watch, to shoot or strike an enemy that moves near them on the next turn. Switch one off, further down the page, to keep it still. While anyone still has AP to spend, it asks before it ends.`,
            when: "myTurn",
        },
        {
            anchor: "menu",
            title: "Anything else",
            body: "The full rules, the battle log and this tour again all live here.",
        },
    ],
};
