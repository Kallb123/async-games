// Realm Arena's achievements (docs/games/realm-arena.md §30.4), registered
// in GAME_ACHIEVEMENTS. This file is browser-safe: its state is the public
// response shape and its only runtime helpers are the battle's pure rules.
//
// Every match achievement is judged at the end. During a battle fought in fog
// the table view contains no fighters; once it is over, fog lifts and the same
// response contains the battlefield that these checks read.
import type { FinishedSeat, GameAchievement } from "@/utils/games/achievements";
import type { IRealmArenaSpecificGameStateResponse } from "./apiModels";
import { isStanding, isWarband } from "./rules";

function wholeTeamStanding(view: IRealmArenaSpecificGameStateResponse): boolean {
    const team = view.fighters.filter(fighter => !isWarband(fighter.owner));
    return team.length > 0 && team.every(isStanding);
}

/** Whether the team won a battle of Hold Out (§30.3). */
function wonHoldOut(view: IRealmArenaSpecificGameStateResponse, outcome: FinishedSeat["outcome"]): boolean {
    return view.coop && view.mission === "holdOut" && outcome === "win";
}

/** Whether the team was one player: solo (§30.6), which the response doesn't flag, read off whose characters fought. */
function isSolo(view: IRealmArenaSpecificGameStateResponse): boolean {
    return new Set(view.fighters.filter(fighter => !isWarband(fighter.owner)).map(fighter => fighter.owner)).size === 1;
}

/** Whether the warbands fielded anyone and nobody of theirs is standing: the last wave beaten before the rounds ran out (§30.3). */
function enemyWipedOut(view: IRealmArenaSpecificGameStateResponse): boolean {
    const enemy = view.fighters.filter(fighter => isWarband(fighter.owner));
    return enemy.length > 0 && !enemy.some(isStanding);
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
            check: (view, { outcome }) => wonHoldOut(view, outcome),
        },
    },
    {
        id: "realmarena.lone-wolf",
        title: "Lone Wolf",
        icon: "🐺",
        description: "Win a battle of Hold Out on your own, in Solo.",
        criteria: {
            kind: "match",
            at: "end",
            check: (view, { outcome }) => wonHoldOut(view, outcome) && isSolo(view),
        },
    },
    {
        id: "realmarena.hold-the-keep",
        title: "Hold the Keep",
        icon: "🏚️",
        description: "Win a battle of Hold Out on the Sacked Fort.",
        criteria: {
            kind: "match",
            at: "end",
            check: (view, { outcome }) => wonHoldOut(view, outcome) && view.map.startsWith("sackedFort"),
        },
    },
    {
        id: "realmarena.broken-tide",
        title: "Broken Tide",
        icon: "🌊",
        description: "Win a battle of Hold Out by downing every character of the last wave before the last round is over.",
        criteria: {
            kind: "match",
            at: "end",
            check: (view, { outcome }) => wonHoldOut(view, outcome) && enemyWipedOut(view),
        },
    },
    {
        id: "realmarena.unbroken",
        title: "Unbroken",
        icon: "🧱",
        description: "Win a battle of Hold Out with every character on your team still standing.",
        criteria: {
            kind: "match",
            at: "end",
            check: (view, { outcome }) => wonHoldOut(view, outcome) && wholeTeamStanding(view),
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
