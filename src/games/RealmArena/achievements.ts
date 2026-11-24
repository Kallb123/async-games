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
// The catalogue is a function of the rules (`achievementsFor`): Broken Tide and
// Scorched Earth are judged one way where the nests produce the enemy (rules
// version 13) and the other until then, and Three Stars exist only there. The
// registry's `achievements` is the current ruleset's, so version 13's go live
// with its release (§6.1). PR 5 deletes the older branch.
import type { FinishedSeat, GameAchievement } from "@/utils/games/achievements";
import type { IRealmArenaSpecificGameStateResponse } from "./apiModels";
import { HOLD_OUT_STAR_INFO, HOLD_OUT_STARS, isStanding, isStructure, isWarband, nestsProduce } from "./rules";
import type { RulesContext } from "./rulesets";
import { andList, numberWord } from "@/utils/ui/text";

/** The round by which Broken Tide wants the Brood broken (realm-arena-hold-out.md §6). */
const BROKEN_TIDE_BY_ROUND = 10;

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

/**
 * Whether the warbands fielded anyone and nobody of theirs is standing: the last wave beaten before the rounds ran out (§30.3).
 * A nest standing is no one (§39.7): the Swarm's characters are what the older Broken Tide asks to be downed.
 */
function enemyWipedOut(view: IRealmArenaSpecificGameStateResponse): boolean {
    const enemy = view.fighters.filter(fighter => isWarband(fighter.owner) && !isStructure(fighter, view));
    return enemy.length > 0 && !enemy.some(isStanding);
}

/** Whether a Brood Queen (§39.5) is down: fallen fighters stay in the finished response (the Brood scattering at the end removes only the standing), and a Queen never grows back. */
function broodQueenDown(view: IRealmArenaSpecificGameStateResponse): boolean {
    return view.fighters.some(fighter => isWarband(fighter.owner) && fighter.character === "broodQueen" && !isStanding(fighter));
}

/** The catalogue as `context`'s rules judge it: none is the current ruleset. */
export function achievementsFor(context?: RulesContext): GameAchievement<IRealmArenaSpecificGameStateResponse>[] {
    const brood = nestsProduce("holdOut", context);
    return [
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
            description: brood
                ? `Win a battle of Hold Out by breaking the Brood, bringing down every nest, by the end of round ${BROKEN_TIDE_BY_ROUND}.`
                : "Win a battle of Hold Out by downing every character of the last wave before the last round is over.",
            criteria: {
                kind: "match",
                at: "end",
                check: brood
                    ? (view, { outcome }) => wonHoldOut(view, outcome) && brokeTheBrood(view) && view.round <= BROKEN_TIDE_BY_ROUND
                    : (view, { outcome }) => wonHoldOut(view, outcome) && enemyWipedOut(view),
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
            description: brood
                ? "Win a battle of Hold Out by breaking the Brood with every character on your team still standing."
                : "Win a battle of Hold Out against the Swarm after destroying every nest at once, before a wave could grow them back.",
            criteria: {
                kind: "match",
                at: "end",
                check: brood
                    ? (view, { outcome }) => wonHoldOut(view, outcome) && brokeTheBrood(view) && wholeTeamStanding(view)
                    : (view, { outcome }) => wonHoldOut(view, outcome) && view.nestsCleared === true,
            },
        },
        ...(brood ? starAchievements() : []),
    ];
}

/** Three Stars and its Hard rung: version 13's only, since the stars are (realm-arena-hold-out.md §6). */
function starAchievements(): GameAchievement<IRealmArenaSpecificGameStateResponse>[] {
    const names = andList(HOLD_OUT_STARS.map(star => HOLD_OUT_STAR_INFO[star].name));
    const every = `all ${numberWord(HOLD_OUT_STARS.length)} stars`;
    return [
        {
            id: "realmarena.three-stars",
            title: "Three Stars",
            icon: "🌟",
            description: `Earn ${every} in a battle of Hold Out: ${names}.`,
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
            description: `Earn ${every} in a battle of Hold Out on Hard.`,
            criteria: {
                kind: "match",
                at: "end",
                check: (view, { outcome }) => wonHoldOut(view, outcome) && view.difficulty === "hard" && earnedEveryStar(view),
            },
        },
    ];
}

/** The current ruleset's catalogue: what the registry lists. */
export const achievements: GameAchievement<IRealmArenaSpecificGameStateResponse>[] = achievementsFor();
