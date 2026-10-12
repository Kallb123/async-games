// Realm Arena's tactics (docs/games/realm-arena.md §29.3, §29.7): the
// questions a player asks before an action — who it could be aimed at, where
// it could land, the odds of a shot from a square it hasn't moved to yet, the
// overwatch a path walks into — and what each kind of action is aimed at.
// The board asks them to shade and list what a tap could line up, and the
// computer's planner (`ai.ts`) asks them to list what it could do, so the two
// can't drift apart.
//
// Readings of the rules, never rules of their own: every answer comes from
// rules.ts — `check` above all — so nothing here can offer what the server
// would refuse. Pure and browser-safe, like rules.ts.

import type { Square } from "@/utils/games/battlefield/terrain";
import { ABILITIES, STRIKING_ABILITIES } from "./characters";
import {
    ACTION_POINTS, check, coverNextTo, fighterById, inRange, itemOf, nextTo, oddsBreakdown, reactionsTo, damageTo, shoots, shotOdds, strikeChance, weaponReaches,
    type Action, type BattleState, type Fighter, type ShotKind, type ShotOdds,
} from "./rules";

/**
 * What decides where an aimed action can land: the character's weapon, the
 * squares next to it (a raise, a healing draught), the low cover next
 * to it (a Demolish), the item it carries (a throw), or — a number — how far
 * something aimed reaches (a fireball, a Hunter's mark, a heal).
 */
export type RangeKind = "weapon" | "nextTo" | "cover" | "item" | number;

/** The actions aimed at one character. */
export type TargetKind = "attack" | "aimedShot" | "heal" | "raise" | "draught" | "shieldBash" | "cripplingShot" | "huntersMark" | "rend" | "regrowth";

export type ActionKind = Action["kind"];

/**
 * What a kind of action is aimed at (§29.3): a path to walk; nothing, for one
 * that goes the moment it's taken; one enemy or one ally, in its range; a
 * number of enemies at once, each one that `each` could be aimed at; or a
 * square, whoever stands on it. `shot` is the shot an action at an enemy takes
 * with a ranged weapon, whose odds are `shotOdds`: anything else lands.
 */
export type ActionAim =
    | { at: "path" | "self" }
    | { at: "enemy"; range: RangeKind; shot?: Exclude<ShotKind, "overwatch"> }
    | { at: "ally"; range: RangeKind }
    | { at: "enemies"; count: number; each: TargetKind; range: RangeKind }
    | { at: "square"; range: RangeKind };

/**
 * Every kind of action, and what it's aimed at (§29.3): what the board's taps
 * line up and what the planner lists the ways to use. A new kind of action —
 * a new faction's ability — is aimed by a line here, and is then usable by a
 * player and by the computer alike.
 */
export const ACTION_AIMS: Readonly<Record<ActionKind, ActionAim>> = {
    move: { at: "path" },
    sneak: { at: "path" },
    attack: { at: "enemy", range: "weapon", shot: "attack" },
    aimedShot: { at: "enemy", range: "weapon", shot: "aimedShot" },
    shieldBash: { at: "enemy", range: "weapon" },
    cripplingShot: { at: "enemy", range: "weapon", shot: "cripplingShot" },
    huntersMark: { at: "enemy", range: ABILITIES.huntersMark.range },
    heal: { at: "ally", range: ABILITIES.heal.range },
    raise: { at: "ally", range: "nextTo" },
    draught: { at: "ally", range: "nextTo" },
    // Cleave strikes where an attack could: within the Man-at-arms's melee reach.
    cleave: { at: "enemies", count: 2, each: "attack", range: "weapon" },
    fireball: { at: "square", range: ABILITIES.fireball.range },
    dynamite: { at: "square", range: ABILITIES.dynamite.range },
    throw: { at: "square", range: "item" },
    demolish: { at: "square", range: "cover" },
    hunker: { at: "self" },
    watch: { at: "self" },
    shieldWall: { at: "self" },
    purify: { at: "self" },
    rend: { at: "enemy", range: "weapon" },
    regrowth: { at: "ally", range: ABILITIES.regrowth.range },
    burst: { at: "self" },
};

/** The shot an action takes, if it's one: its odds are `shotOdds`. Anything else aimed at an enemy is a strike or lands. */
export function shotOf(kind: ActionKind): Exclude<ShotKind, "overwatch"> | undefined {
    const aim = ACTION_AIMS[kind];
    return aim.at === "enemy" ? aim.shot : undefined;
}

/**
 * Whether an action rolls to hit what it's aimed at: a shot, a strike with a
 * weapon (an attack or an aimed shot by a melee character falls back to it),
 * or one of the abilities that strike. A Hunter's mark, a heal, a fireball and
 * the rest land.
 */
export function rollsToHit(kind: ActionKind): boolean {
    return shotOf(kind) !== undefined || STRIKING_ABILITIES.has(kind);
}

/** The `check` kind that says who an action can be aimed at: its own, or — for a cleave — each of its targets'. Undefined for one not aimed at a character. */
export function targetKindOf(kind: ActionKind): TargetKind | undefined {
    const aim = ACTION_AIMS[kind];
    // Every kind aimed at one enemy or ally is a `TargetKind`, by the table above.
    return aim.at === "enemies" ? aim.each : aim.at === "enemy" || aim.at === "ally" ? kind as TargetKind : undefined;
}

/** What a kind of action's range is read from, for where it could land: undefined for a move or one that goes at once. */
export function rangeKindOf(kind: ActionKind): RangeKind | undefined {
    const aim = ACTION_AIMS[kind];
    return "range" in aim ? aim.range : undefined;
}

/**
 * An aimed action's range from where a character stands: every square it
 * could be lined up on, were someone there to aim at. A weapon, a
 * draught or a raise is aimed at a character, so only a square one could stand on
 * counts; a fireball or a throw can land on any square it can see in range.
 * Where the character stands isn't drawn. Read from the rules `check` itself
 * asks, so the shading and what the server allows can't drift apart.
 */
export function rangeSquares(state: BattleState, fighter: Fighter, kind: RangeKind): ReadonlySet<Square> {
    const { field } = state;
    const range = kind === "item" ? itemOf(fighter)?.range : kind;
    if (range === undefined) return new Set();
    const reaches = (square: Square): boolean => {
        if (square === fighter.square) return false;
        if (typeof range === "number") return inRange(field, fighter.square, square, range);
        if (range === "cover") return coverNextTo(field, fighter.square, square);
        if (!field.tiles[square].terrain.standable) return false;
        return range === "weapon" ? weaponReaches(state, fighter, square) : nextTo(field, fighter.square, square);
    };
    return new Set(field.tiles.flatMap((_, square) => reaches(square) ? [square] : []));
}

/** The characters an action could be aimed at now, by the server's own `check`. */
export function targetsOf(state: BattleState, player: string, fighter: Fighter, kind: TargetKind): number[] {
    return state.fighters
        .filter(one => !("refused" in check(state, player, { kind, fighter: fighter.id, target: one.id })))
        .map(one => one.id);
}

/** The battle as it would stand with one character moved to another square: what a previewed move is read against. */
export function standingAt(state: BattleState, fighter: Fighter, square: Square): { battle: BattleState; moved: Fighter } {
    const moved = { ...fighter, square };
    return { battle: { ...state, fighters: state.fighters.map(one => one.id === fighter.id ? moved : one) }, moved };
}

/** One enemy a character's weapon could hit, and its chance to: a shot's odds, or a strike's. */
export interface AttackOption {
    target: Fighter;
    /** Percent to hit, 0–100. */
    chance: number;
}

/**
 * Every enemy a character's main weapon could hit from a square — where it
 * stands, or where a previewed move would take it — likeliest first. Who is
 * in reach is the server's own `check`, read as if it had the AP to attack:
 * what's in reach is a matter of where it stands, not what it has left.
 */
export function attackOptions(state: BattleState, fighter: Fighter, square: Square = fighter.square): AttackOption[] {
    const { battle, moved } = standingAt(state, { ...fighter, ap: ACTION_POINTS }, square);
    return targetsOf(battle, fighter.owner, moved, "attack").flatMap(id => {
        const target = fighterById(battle, id);
        return target ? [{ target, chance: hitChance(battle, moved, target) }] : [];
    }).sort((a, b) => b.chance - a.chance);
}

/**
 * A character's chance to hit an enemy, 0–100: a shot's odds, or — with a
 * melee weapon, or an ability that strikes — a strike's (`strikeChance`).
 */
export function hitChance(state: BattleState, fighter: Fighter, target: Fighter, shot: ShotKind = "attack"): number {
    return oddsBreakdown(state, fighter, target, shot).chance;
}

/** One reaction a move would set off, and what it would do to the mover (§13.4). */
export interface ReactionPreview {
    watcher: Fighter;
    kind: "overwatch" | "guard";
    /** An overwatch shot's odds against the mover on the square it comes at. */
    odds?: ShotOdds;
    /** Percent to hit the mover, 0–100: the overwatch shot's, or the guard's strike's. */
    chance: number;
    /** What it does on a hit. */
    damage: number;
}

/**
 * Every reaction a move along this path would set off, in the order they'd
 * come, with the odds of each overwatch shot at the mover from the square
 * it's on when the shot comes. Like `reactionsTo`, it assumes the mover
 * survives them all.
 */
export function reactionPreviews(state: BattleState, mover: Fighter, path: readonly Square[]): ReactionPreview[] {
    return reactionsTo(state, mover, path).flatMap(({ watcher: id, step }): ReactionPreview[] => {
        const watcher = fighterById(state, id);
        if (!watcher) return [];
        if (!shoots(watcher)) return [{ watcher, kind: "guard", chance: strikeChance(state, mover), damage: damageTo(state, watcher, mover) }];
        const { battle: there, moved } = standingAt(state, mover, path[step]);
        const odds = shotOdds(there, watcher, moved, "overwatch");
        return [{ watcher, kind: "overwatch", odds, chance: odds?.chance ?? 0, damage: odds?.damage ?? damageTo(state, watcher, moved) }];
    });
}
