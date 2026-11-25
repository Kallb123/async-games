// Realm Arena's achievements (docs/games/realm-arena.md §30.4), registered
// in GAME_ACHIEVEMENTS. This file is browser-safe: its state is the public
// response shape and its only runtime helpers are the battle's pure rules.
//
// Every match achievement is judged at the end. During a battle fought in fog
// the table view contains no fighters; once it is over, fog lifts and the same
// response contains the battlefield that these checks read. Hold Out's stars,
// and the achievements built on them (Three Stars, Broken Tide, Scorched
// Earth), are realm-arena-hold-out.md §6: they read `stars`, sent only on the
// finished response.
//
// The catalogue is one list, judged by version 13's rules (the nests produce
// the enemy). A version 12 battle still in progress at the release ends under
// them too: ids are permanent and the criteria read only the finished response.
import type { FinishedSeat, GameAchievement } from "@/utils/games/achievements";
import type { IRealmArenaSpecificGameStateResponse } from "./apiModels";
import { HOLD_OUT_STAR_INFO, HOLD_OUT_STARS, isStanding, isWarband } from "./rules";
import { andList, numberWord } from "@/utils/ui/text";

/** The round by which Broken Tide wants the Brood broken (realm-arena-hold-out.md §6). */
const BROKEN_TIDE_BY_ROUND = 10;

/** Three Stars' wording: how many stars there are, and their names (realm-arena-hold-out.md §6). */
const EVERY_STAR = `all ${numberWord(HOLD_OUT_STARS.length)} stars`;
const STAR_NAMES = andList(HOLD_OUT_STARS.map(star => HOLD_OUT_STAR_INFO[star].name));

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

/** Whether the team broke the Brood: every nest fell before the round cap (realm-arena-hold-out.md §6). */
function brokeTheBrood(view: IRealmArenaSpecificGameStateResponse): boolean {
    return view.stars?.includes("broke") === true;
}

/** Whether the team earned every star a battle of Hold Out offers. */
function earnedEveryStar(view: IRealmArenaSpecificGameStateResponse): boolean {
    return HOLD_OUT_STARS.every(star => view.stars?.includes(star));
}

/** Whether a Brood Queen (§39.5) is down: fallen fighters stay in the finished response (the Brood scattering at the end removes only the standing), and a Queen never grows back. */
function broodQueenDown(view: IRealmArenaSpecificGameStateResponse): boolean {
    return view.fighters.some(fighter => isWarband(fighter.owner) && fighter.character === "broodQueen" && !isStanding(fighter));
}

/** The catalogue the registry lists. */
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
        description: `Win a battle of Hold Out by breaking the Brood, bringing down every nest, by the end of round ${BROKEN_TIDE_BY_ROUND}.`,
        criteria: {
            kind: "match",
            at: "end",
            check: (view, { outcome }) => wonHoldOut(view, outcome) && brokeTheBrood(view) && view.round <= BROKEN_TIDE_BY_ROUND,
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
    {
        id: "realmarena.regicide",
        title: "Regicide",
        icon: "🗡️",
        description: "Win a battle of Hold Out in which a Brood Queen was downed.",
        criteria: {
            kind: "match",
            at: "end",
            check: (view, { outcome }) => wonHoldOut(view, outcome) && broodQueenDown(view),
        },
    },
    {
        id: "realmarena.scorched-earth",
        title: "Scorched Earth",
        icon: "🔥",
        description: "Win a battle of Hold Out by breaking the Brood with every character on your team still standing.",
        criteria: {
            kind: "match",
            at: "end",
            check: (view, { outcome }) => wonHoldOut(view, outcome) && brokeTheBrood(view) && wholeTeamStanding(view),
        },
    },
    {
        id: "realmarena.three-stars",
        title: "Three Stars",
        icon: "🌟",
        description: `Earn ${EVERY_STAR} in a battle of Hold Out: ${STAR_NAMES}.`,
        criteria: {
            kind: "match",
            at: "end",
            check: (view, { outcome }) => wonHoldOut(view, outcome) && earnedEveryStar(view),
        },
    },
    {
        id: "realmarena.three-stars-hard",
        title: "Three Stars on Hard",
        icon: "💫",
        description: `Earn ${EVERY_STAR} in a battle of Hold Out on Hard.`,
        criteria: {
            kind: "match",
            at: "end",
            check: (view, { outcome }) => wonHoldOut(view, outcome) && view.difficulty === "hard" && earnedEveryStar(view),
        },
    },
];
