// Realm Arena's achievements (docs/games/realm-arena.md §30.4), registered
// in GAME_ACHIEVEMENTS. This file is browser-safe: its state is the public
// response shape and its only runtime helpers are the battle's pure rules.
//
// Every match achievement is judged at the end. During a battle fought in fog
// the table view contains no fighters; once it is over, fog lifts and the same
// response contains the battlefield that these checks read.
import type { GameAchievement } from "@/utils/games/achievements";
import type { IRealmArenaSpecificGameStateResponse } from "./apiModels";
import { isStanding, isWarband } from "./rules";

function wholeTeamStanding(view: IRealmArenaSpecificGameStateResponse): boolean {
    const team = view.fighters.filter(fighter => !isWarband(fighter.owner));
    return team.length > 0 && team.every(isStanding);
}

export const achievements: GameAchievement<IRealmArenaSpecificGameStateResponse>[] = [
    {
        id: "realmarena.recruit",
        title: "Recruit",
        icon: "⚔️",
        description: "Play 5 battles of Realm Arena.",
        criteria: { kind: "career", progress: record => record.played, target: 5 },
    },
    {
        id: "realmarena.warlord",
        title: "Warlord",
        icon: "👑",
        description: "Win 5 battles of Realm Arena.",
        criteria: { kind: "career", progress: record => record.won, target: 5 },
    },
    {
        id: "realmarena.shoulder-to-shoulder",
        title: "Shoulder to Shoulder",
        icon: "🤝",
        description: "Win a battle against the computer.",
        criteria: {
            kind: "match",
            at: "end",
            check: (view, { outcome }) => view.coop && outcome === "win",
        },
    },
    {
        id: "realmarena.none-left-behind",
        title: "None Left Behind",
        icon: "🛡️",
        description: "Win a battle against the computer with every character on your team still standing.",
        criteria: {
            kind: "match",
            at: "end",
            check: (view, { outcome }) =>
                view.coop
                && outcome === "win"
                && wholeTeamStanding(view),
        },
    },
    {
        id: "realmarena.last-stand",
        title: "Last Stand",
        icon: "🏰",
        description: "Win a battle of Hold Out.",
        criteria: {
            kind: "match",
            at: "end",
            check: (view, { outcome }) => view.coop && view.mission === "holdOut" && outcome === "win",
        },
    },
    {
        id: "realmarena.against-the-odds",
        title: "Against the Odds",
        icon: "⚖️",
        description: "Win a battle against the computer on Hard.",
        criteria: {
            kind: "match",
            at: "end",
            check: (view, { outcome }) => view.coop && view.difficulty === "hard" && outcome === "win",
        },
    },
];
