// Realm Arena's rules (docs/games/realm-arena.md §13, §17.2, §20–§22): what
// an action costs and whether it can be taken, hit chances, grazes and damage,
// who reacts to a move and in what order, abilities, status effects, items
// and the smoke a smoke pot leaves, the low cover a blast clears, knock-outs
// and raising, scoring, the end of the battle with its tie-break chain, and
// what a squad may muster.
//
// Pure and isomorphic, with no server-only imports (docs/new-game.md,
// "Isomorphic rules modules"): PR 3's commands act through it, and the board
// imports it to shade a character's reach and show a hit chance before the
// player commits — the same number the server will roll against.
//
// **Rolls are inputs.** Nothing here draws a random number. An action that
// rolls takes a `Roll` — a function handing over the next 1–100 roll — and
// asks it only as each roll is needed, because a move can set off any number
// of reactions and nobody knows how many until it's walked. The command
// behind it draws, records and replays those rolls (§17.2); a test hands in
// the exact rolls it wants with `fixedRolls`.
//
// **Nothing mutates.** Every function that changes the battle returns new
// fighters and a list of what happened, and leaves the state it was given
// alone, so the board can ask "what would this do" as cheaply as a command
// can do it.
//
// **What these functions refuse.** `check` is total: an action from a client
// can be any shape at all, and gets a plain-English reason when it can't be
// taken. `act` throws on anything `check` refuses, since by then it's a
// programming error.

import { coverAgainst } from "@/utils/games/battlefield/cover";
import { canSee } from "@/utils/games/battlefield/lineOfSight";
import { DEFAULT_CLIMB, pathCost, reachFrom, type MoveRules, type Reach } from "@/utils/games/battlefield/pathfinding";
import { coordsOf, distance, HALF_HEIGHT, isNeighbour, riseOf, squareAt, type Battlefield, type Cover, type Square } from "@/utils/games/battlefield/terrain";
import {
    ABILITIES, CHARACTERS, EFFECT_IDS, EFFECTS, isCharacterId, isItemId, ITEMS, MAX_OF_EACH, squadPoints,
    type Ability, type AbilityId, type Affliction, type CharacterId, type EffectId, type Item, type ItemId, type PlayerCount,
} from "./characters";

// ─── Numbers (§13) ──────────────────────────────────────────────────────────

/** Every character starts each of its owner's turns with this many AP (§13.2). */
export const ACTION_POINTS = 4;
export const ATTACK_AP = 2;
export const HUNKER_AP = 1;
/** AP a reaction takes from the bank, so 4 banked buy two and 2 or 3 buy one (§13.4). */
export const REACTION_COST = 2;
export const OVERWATCH_PENALTY = 15;
export const HIGH_GROUND_BONUS = 10;
/** How far above its target, in quarters, an attacker has to stand to have the high ground: half a height (§25.2). */
export const HIGH_GROUND_RISE = HALF_HEIGHT;
/** What a target's cover takes off a shot's chance to hit. Hunkering down doubles it (§13.2, §13.3). */
export const COVER_PENALTY: Readonly<Record<Cover, number>> = { none: 0, half: 20, full: 40 };
/** A shot that misses by this much or less grazes, for half damage (§13.3). */
export const GRAZE_BAND = 10;
/** A shot at a flanked target does this much more damage, instead of a critical hit (§13.3). */
export const FLANK_BONUS = 1;
export const ROLL_SIDES = 100;

/** The mission's scoring area, by the id a map gives its objective (§13.7). */
export const CENTRE = "centre";
export const CENTRE_POINTS = 5;
/** The centre scores from this battle round, so neither side can reach it before the other has moved (§15.3). */
export const CENTRE_SCORES_FROM_ROUND = 3;
/** A knock-out scores the fallen character's points cost divided by this (§13.7). */
export const KNOCKOUT_DIVISOR = 5;

/** How many battle rounds a battle lasts, by player count (§13.8). */
export const BATTLE_ROUNDS: Readonly<Record<PlayerCount, number>> = { 2: 15, 3: 13, 4: 12 };

// ─── State ──────────────────────────────────────────────────────────────────
//
// Declared here rather than beside PR 3's schema, so the schema, the commands
// and the board all read one definition, as Race Cars' rules do.

/** One character on the battlefield. */
export interface Fighter {
    /** Unique within the battle, and never reused. */
    id: number;
    /** The player whose squad it's in. */
    owner: string;
    character: CharacterId;
    /** Where it stands, or where it fell. */
    square: Square;
    /** 0 means it's down: out of the battle unless a Cleric raises it (§13.5). */
    hp: number;
    /** AP left to spend this turn. */
    ap: number;
    /** AP banked on overwatch or guard, spent 2 a reaction until its owner's next turn (§13.4). */
    banked: number;
    /**
     * The effects on it and their counts, the stances it holds among them:
     * each counted down as a cooldown is, and absent once spent (§20.1).
     */
    effects: Partial<Record<EffectId, number>>;
    /** The character that set it burning, whose owner a knock-out by the burning scores for (§20.2). Only while it burns. */
    burnedBy?: number;
    /** Turns until each ability on cooldown can be used again; absent means ready. */
    cooldowns: Partial<Record<AbilityId, number>>;
    /** Once-per-battle abilities it has used. */
    spent: AbilityId[];
    /** The item it carries, bought at muster, or null once it's used or when it never had one (§21.1). */
    item: ItemId | null;
    /**
     * Where the smoke pot it threw landed, while the cloud lasts: until the
     * start of its owner's next turn, as a shield wall does, and gone with it
     * if it's downed first (§21.2). The cloud is the 3×3 around that square.
     */
    smoke?: Square;
}

/** What every rule reads: the ground, and everyone on it. */
export interface BattleState {
    /** The map with whatever has been blasted away so far already cleared from it (`battlefieldWith`, §22). */
    field: Battlefield;
    fighters: readonly Fighter[];
}

export type Action =
    | { kind: "move" | "sneak"; fighter: number; path: Square[] }
    | { kind: "attack" | "aimedShot" | "heal" | "raise" | "draught"; fighter: number; target: number }
    | { kind: "hunker" | "watch" | "shieldWall"; fighter: number }
    | { kind: "cleave"; fighter: number; targets: number[] }
    | { kind: "fireball" | "throw"; fighter: number; at: Square };

export type ShotResult = "hit" | "graze" | "miss";

/** One thing that happened, in the order it happened: what the board shows coming back, and what a recap tells. */
export type BattleEvent =
    | { kind: "moved"; fighter: number; path: Square[]; sneaking: boolean }
    | { kind: "shot"; fighter: number; target: number; chance: number; roll: number; result: ShotResult; damage: number; reaction: boolean }
    | { kind: "struck"; fighter: number; target: number; damage: number; reaction: boolean }
    | { kind: "fireball"; fighter: number; at: Square; targets: number[]; damage: number }
    | { kind: "downed"; fighter: number; by: number }
    /** A Cleric's Heal, or a healing draught (`draught`) given by `fighter` — to itself, when `target` is `fighter`. */
    | { kind: "healed"; fighter: number; target: number; hp: number; draught?: true }
    /** A thrown item landing: `targets` is everyone it hit, which a smoke pot never does — its cloud is the thrower's `smoke`. */
    | { kind: "thrown"; fighter: number; item: ItemId; at: Square; targets: number[]; damage: number }
    /** Low cover blasted away to scorched ground by `fighter`'s fireball or fire flask, after its damage (§22). */
    | { kind: "blasted"; fighter: number; squares: Square[] }
    | { kind: "raised"; fighter: number; target: number; hp: number }
    | { kind: "hunkered" | "shieldWall"; fighter: number }
    | { kind: "watching"; fighter: number; banked: number }
    /** An effect put on a character, put on again (the longer count stands), or cleared by a heal. Not the stances, which have their own events, nor an effect running out. */
    | { kind: "effect"; fighter: number; effect: EffectId; change: "applied" | "refreshed" | "cleared" }
    /** Burning doing its damage at the start of its owner's turn. */
    | { kind: "burned"; fighter: number; damage: number }
    | { kind: "scored"; player: string; points: number; reason: "centre" | "knockout" };

export interface Outcome {
    fighters: Fighter[];
    events: BattleEvent[];
}

/** Hands over the next roll, 1–100. */
export type Roll = () => number;

/** The rolls given, in order, and an error once they run out: for tests, and for replaying recorded rolls. */
export function fixedRolls(rolls: readonly number[]): Roll {
    let next = 0;
    return () => {
        if (next >= rolls.length) throw new Error("Ran out of rolls");
        return rolls[next++];
    };
}

// ─── Reading the battle ─────────────────────────────────────────────────────

export const isStanding = (fighter: Fighter): boolean => fighter.hp > 0;

export const hasEffect = (fighter: Fighter, effect: EffectId): boolean => (fighter.effects[effect] ?? 0) > 0;

/** The item a character carries, if any (§21.1). */
export const itemOf = (fighter: Pick<Fighter, "item">): Item | undefined => fighter.item ? ITEMS[fighter.item] : undefined;

/** What an item adds to a muster's cost: nothing for none. */
export const itemPoints = (item: ItemId | null | undefined): number => item ? ITEMS[item].points : 0;

/** Movement points each AP spent on moving buys it: its character's, halved and rounded up while it's slowed (§20.1). */
export function movementOf(fighter: Fighter): number {
    const { movement } = CHARACTERS[fighter.character];
    return hasEffect(fighter, "slowed") ? Math.ceil(movement / 2) : movement;
}

export function fighterById(state: BattleState, id: unknown): Fighter | undefined {
    return state.fighters.find(fighter => fighter.id === id);
}

/** Whether two characters touch, and nothing stands between them at the corner they share. Healing, raising and the shield wall need it; melee needs `inMeleeReach` too. */
export function nextTo(field: Battlefield, a: Square, b: Square): boolean {
    return isNeighbour(field, a, b) && canSee(field, a, b);
}

/** How far apart in height, in quarters, two characters can be and still fight hand to hand (§25.2). */
export const MELEE_RISE = 1;

/** Whether a melee weapon reaches from one square to another: next to it, and no more than a quarter above or below it. */
export function inMeleeReach(field: Battlefield, a: Square, b: Square): boolean {
    return nextTo(field, a, b) && Math.abs(riseOf(field, a, b)) <= MELEE_RISE;
}

/** Whether one square is within `range` squares of another and can be seen from it: a ranged weapon's reach, and a fireball's (§13.3). */
export function inRange(field: Battlefield, from: Square, to: Square, range: number): boolean {
    return distance(field, from, to) <= range && canSee(field, from, to);
}

/** Whether a character's weapon could hit someone on a square from where it stands: in melee reach for a melee weapon, in range and in sight for a ranged one. */
export function weaponReaches(state: BattleState, fighter: Fighter, square: Square): boolean {
    const weapon = CHARACTERS[fighter.character].weapon;
    return weapon.kind === "ranged" ? inRange(state.field, fighter.square, square, weapon.range) : inMeleeReach(state.field, fighter.square, square);
}

/** What a move by one character may cross and stop on, and how far it can climb: enemies block, allies may be crossed but not stopped on. The fallen do neither. */
export function moveRules(state: BattleState, mover: Fighter): Required<MoveRules> {
    const blocked = new Set<Square>(), occupied = new Set<Square>();
    for (const other of state.fighters) {
        if (other.id === mover.id || !isStanding(other)) continue;
        (other.owner === mover.owner ? occupied : blocked).add(other.square);
    }
    return { blocked, occupied, climb: CHARACTERS[mover.character].climb ?? DEFAULT_CLIMB };
}

/** The AP a move of this many movement points costs: whole AP, each buying the character's allowance; a sneak pays double (§13.2). */
export function moveAp(fighter: Fighter, cost: number, sneaking = false): number {
    return Math.ceil(cost / movementOf(fighter)) * (sneaking ? ABILITIES.sneak.ap : 1);
}

/**
 * Everywhere a character could move to with the AP it has left, for the
 * board's shading: `moveAp` of a square's cost is the band it's shaded in.
 */
export function reachOf(state: BattleState, fighter: Fighter, sneaking = false): Reach {
    const allowances = sneaking ? Math.floor(fighter.ap / ABILITIES.sneak.ap) : fighter.ap;
    return reachFrom(state.field, fighter.square, allowances * movementOf(fighter), moveRules(state, fighter));
}

export interface ShotOdds {
    /** Percent to hit, 0–100. */
    chance: number;
    /** Percent to graze, on top of the chance to hit. */
    grazeChance: number;
    damage: number;
    grazeDamage: number;
    /** The cover the target has against this shot, a shield wall's included. */
    cover: Cover;
    flanked: boolean;
}

/** Whether a standing ally holds a shield wall next to this character (§13.6). */
function shielded(state: BattleState, target: Fighter): boolean {
    return state.fighters.some(knight => hasEffect(knight, "shieldWall") && isStanding(knight) && knight.id !== target.id
        && knight.owner === target.owner && nextTo(state.field, knight.square, target.square));
}

/**
 * The squares under a smoke cloud: the 3×3 around where each smoke pot
 * landed, while it lasts (§21.2). A thrower who is downed loses its `smoke`.
 */
export function smokeSquares(state: BattleState): ReadonlySet<Square> {
    return new Set(state.fighters.flatMap(thrower => thrower.smoke !== undefined ? areaAround(state.field, thrower.smoke) : []));
}

/**
 * The odds of a shot from where the attacker stands, or undefined when it
 * can't take one: it fights in melee, the target is out of range, or it can't
 * see the target (§13.3).
 */
export function shotOdds(state: BattleState, attacker: Fighter, target: Fighter, kind: "attack" | "aimedShot" | "overwatch" = "attack"): ShotOdds | undefined {
    const { field } = state;
    const weapon = CHARACTERS[attacker.character].weapon;
    if (weapon.kind !== "ranged") return undefined;
    if (!inRange(field, attacker.square, target.square, weapon.range)) return undefined;

    const sideCover = coverAgainst(field, target.square, attacker.square);
    const cover = sideCover === "none" && shielded(state, target) ? "half" : sideCover;
    const highGround = riseOf(field, attacker.square, target.square) >= HIGH_GROUND_RISE;
    const raw = weapon.accuracy
        - COVER_PENALTY[cover] * (hasEffect(target, "hunkered") ? 2 : 1)
        + (highGround ? HIGH_GROUND_BONUS : 0)
        + (hasEffect(target, "marked") ? EFFECTS.marked.hitBonus : 0)
        - (smokeSquares(state).has(target.square) ? ITEMS.smokePot.hitPenalty : 0)
        + (kind === "aimedShot" ? ABILITIES.aimedShot.hitBonus : 0)
        - (kind === "overwatch" ? OVERWATCH_PENALTY : 0);
    const clamp = (percent: number) => Math.min(ROLL_SIDES, Math.max(0, percent));
    const chance = clamp(raw);
    const flanked = cover === "none";
    const damage = weapon.damage + (flanked ? FLANK_BONUS : 0);
    // Grazes are the rolls that miss by `GRAZE_BAND` or less, counted from the
    // raw chance: a shot at −10% can't so much as graze.
    return { chance, grazeChance: clamp(raw + GRAZE_BAND) - chance, damage, grazeDamage: Math.ceil(damage / 2), cover, flanked };
}

/** A roll of 1–100 against a shot's odds: at or under the chance to hit hits, the graze band above it grazes, and anything more misses. */
export function shotResult({ chance, grazeChance }: Pick<ShotOdds, "chance" | "grazeChance">, roll: number): ShotResult {
    return roll <= chance ? "hit" : roll <= chance + grazeChance ? "graze" : "miss";
}

/**
 * Whether a watcher would react to an enemy stepping onto this square:
 * overwatch at one it can see in range, guard at one in melee reach (§13.4, §25.2).
 * Nobody reacts to a character mid-climb, only as it lands on a square it
 * could stop on — so a character a reaction downs always falls where it could
 * stand, and a Cleric can raise it. Overwatch can't fire into smoke; a guard
 * strikes in it all the same (§21.2).
 */
function setsOff(state: BattleState, watcher: Fighter, square: Square, smoke: ReadonlySet<Square>): boolean {
    if (!state.field.tiles[square].terrain.standable || !weaponReaches(state, watcher, square)) return false;
    return CHARACTERS[watcher.character].weapon.kind === "melee" || !smoke.has(square);
}

export interface Reaction {
    watcher: number;
    /** The index in the path of the square the mover is on when it comes. */
    step: number;
}

/**
 * Every reaction a move along this path sets off, in the order they'd come:
 * step by step along the path, and nearest watcher first at each step. Each
 * watcher reacts at most once to a move, and needs `REACTION_COST` banked to
 * react at all (§13.4). A sneak sets off none.
 *
 * Assumes the mover survives: the move stops at the first reaction that downs
 * it, and the rest never come. That's the preview the board flags before a
 * move is sent.
 */
export function reactionsTo(state: BattleState, mover: Fighter, path: readonly Square[]): Reaction[] {
    const watchers = state.fighters.filter(watcher =>
        isStanding(watcher) && watcher.owner !== mover.owner && watcher.banked >= REACTION_COST);
    const smoke = smokeSquares(state);
    const reacted = new Set<number>();
    const reactions: Reaction[] = [];
    for (let step = 1; step < path.length; step++) {
        const square = path[step];
        watchers
            .filter(watcher => !reacted.has(watcher.id) && setsOff(state, watcher, square, smoke))
            .sort((a, b) => distance(state.field, a.square, square) - distance(state.field, b.square, square) || a.id - b.id)
            .forEach(watcher => {
                reacted.add(watcher.id);
                reactions.push({ watcher: watcher.id, step });
            });
    }
    return reactions;
}

/** The 3×3 around a square, as far as the map goes: what a fireball, a thunder flask or a smoke pot centred there covers. */
export function areaAround(field: Battlefield, at: Square): Square[] {
    const { col, row } = coordsOf(field, at);
    const area: Square[] = [];
    for (let r = row - 1; r <= row + 1; r++) {
        for (let c = col - 1; c <= col + 1; c++) {
            const square = squareAt(field, c, r);
            if (square !== undefined) area.push(square);
        }
    }
    return area;
}

export function knockoutPoints(character: CharacterId): number {
    return CHARACTERS[character].points / KNOCKOUT_DIVISOR;
}

// ─── Checking an action ─────────────────────────────────────────────────────

const isSquare = (field: Battlefield, value: unknown): value is Square =>
    Number.isInteger(value) && (value as number) >= 0 && (value as number) < field.tiles.length;

/** Why a character can't use an ability now, or undefined when it can. */
function abilityRefusal(fighter: Fighter, ability: AbilityId): string | undefined {
    const character = CHARACTERS[fighter.character];
    if (!character.abilities.includes(ability)) return `A ${character.name} can't use ${ABILITIES[ability].name}`;
    if (fighter.spent.includes(ability)) return `${ABILITIES[ability].name} has been used this battle`;
    if ((fighter.cooldowns[ability] ?? 0) > 0) return `${ABILITIES[ability].name} isn't ready yet`;
    return undefined;
}

/** Why a path can't be walked by this character, or its cost in movement points. */
function pathRefusal(state: BattleState, mover: Fighter, path: unknown): string | number {
    if (!Array.isArray(path) || path.length < 2 || !path.every(square => isSquare(state.field, square))) return "That isn't a path";
    if (path[0] !== mover.square) return "A path starts where the character stands";
    const { blocked, occupied, climb } = moveRules(state, mover);
    if (path.some(square => blocked.has(square))) return "An enemy is in the way";
    const end = path[path.length - 1];
    if (!state.field.tiles[end].terrain.standable || occupied.has(end)) return "Nobody can stop there";
    return pathCost(state.field, path, climb) ?? "That path can't be walked";
}

const isEnemy = (actor: Fighter, target: Fighter | undefined): target is Fighter =>
    target !== undefined && isStanding(target) && target.owner !== actor.owner;

/** Why an attack can't be made, or undefined when it can. */
function attackRefusal(state: BattleState, actor: Fighter, target: Fighter | undefined, kind: "attack" | "aimedShot"): string | undefined {
    if (!isEnemy(actor, target)) return "Pick an enemy";
    if (CHARACTERS[actor.character].weapon.kind === "melee") {
        if (weaponReaches(state, actor, target.square)) return undefined;
        return nextTo(state.field, actor.square, target.square) ? "Too far above or below to strike" : "Too far away to strike";
    }
    return shotOdds(state, actor, target, kind) ? undefined : "Out of range or out of sight";
}

export type Check = { ap: number } | { refused: string };

/**
 * Whether a player can take an action now, and the AP it costs — or, when
 * they can't, why not. Total: `action` may be anything a client sent. Whose
 * turn it is is the caller's to check.
 */
export function check(state: BattleState, player: string, action: unknown): Check {
    const refused = (reason: string): Check => ({ refused: reason });
    if (typeof action !== "object" || action === null) return refused("That isn't an action");
    const { kind, fighter: id, target: targetId, targets, path, at } = action as Record<string, unknown>;
    const actor = fighterById(state, id);
    if (!actor || actor.owner !== player) return refused("That isn't one of your characters");
    if (!isStanding(actor)) return refused("That character is down");
    const target = fighterById(state, targetId);
    const afford = (ap: number): Check => ap <= actor.ap ? { ap } : refused("Not enough AP");
    const ability = (abilityId: AbilityId, then: () => string | undefined): Check => {
        const reason = abilityRefusal(actor, abilityId) ?? then();
        return reason ? refused(reason) : afford(ABILITIES[abilityId].ap);
    };

    switch (kind) {
        case "move":
        case "sneak": {
            if (kind === "sneak") {
                const reason = abilityRefusal(actor, "sneak");
                if (reason) return refused(reason);
            }
            const cost = pathRefusal(state, actor, path);
            return typeof cost === "string" ? refused(cost) : afford(moveAp(actor, cost, kind === "sneak"));
        }
        case "attack": {
            const reason = attackRefusal(state, actor, target, "attack");
            return reason ? refused(reason) : afford(ATTACK_AP);
        }
        case "aimedShot":
            return ability("aimedShot", () => attackRefusal(state, actor, target, "aimedShot"));
        case "hunker":
            return afford(HUNKER_AP);
        case "watch":
            // All it has left, and enough for at least one reaction — which a
            // stunned character can't make until its owner's next turn (§20.1).
            if (hasEffect(actor, "stunned")) return refused("A stunned character can't go on watch");
            return actor.ap >= REACTION_COST ? { ap: actor.ap } : refused(`Going on watch needs at least ${REACTION_COST} AP`);
        case "cleave":
            return ability("cleave", () => {
                if (!Array.isArray(targets) || targets.length !== 2 || targets[0] === targets[1]) return "Pick two enemies";
                const enemies = targets.map(one => fighterById(state, one));
                if (!enemies.every((one): one is Fighter => isEnemy(actor, one))) return "Pick two enemies";
                return enemies.every(one => inMeleeReach(state.field, actor.square, one.square)) ? undefined : "Both enemies must be next to them, within a quarter of their height";
            });
        case "shieldWall":
            return ability("shieldWall", () => undefined);
        case "fireball":
            return ability("fireball", () => aimRefusal(state, actor, at, ABILITIES.fireball.range));
        case "heal":
            return ability("heal", () => healRefusal(state, actor, target, false));
        case "raise":
            return ability("raise", () => {
                if (!target || target.owner !== actor.owner || isStanding(target)) return "Pick a downed ally";
                if (!nextTo(state.field, actor.square, target.square)) return "Too far away to raise";
                const clear = state.field.tiles[target.square].terrain.standable
                    && !state.fighters.some(other => isStanding(other) && other.square === target.square);
                return clear ? undefined : "There's no room to stand there";
            });
        case "throw": {
            const item = itemOf(actor);
            if (item?.range === undefined) return refused("They have nothing to throw");
            const reason = aimRefusal(state, actor, at, item.range);
            return reason ? refused(reason) : afford(item.ap);
        }
        case "draught": {
            if (actor.item !== "healingDraught") return refused("They have no healing draught");
            const reason = healRefusal(state, actor, target, true);
            return reason ? refused(reason) : afford(ITEMS.healingDraught.ap);
        }
        default:
            return refused("That isn't an action");
    }
}

/** Why something can't be aimed at a square — a fireball, a throw — or undefined when it can: in range and in sight. */
function aimRefusal(state: BattleState, actor: Fighter, at: unknown, range: number): string | undefined {
    return isSquare(state.field, at) && inRange(state.field, actor.square, at, range) ? undefined : "Out of range or out of sight";
}

/**
 * Why a character can't heal `target`, or undefined when it can: an ally
 * next to it — or itself, for a healing draught (`self`) — that is hurt or has
 * something a heal clears (§20.2, §21.2).
 */
function healRefusal(state: BattleState, healer: Fighter, target: Fighter | undefined, self: boolean): string | undefined {
    if (!target || target.owner !== healer.owner || !isStanding(target) || (target.id === healer.id && !self)) return "Pick an ally to heal";
    if (target.id !== healer.id && !nextTo(state.field, healer.square, target.square)) return "Too far away to heal";
    return target.hp < CHARACTERS[target.character].hp || healedEffects(target).length > 0 ? undefined : "Already at full health";
}

// ─── Taking an action ───────────────────────────────────────────────────────

/**
 * A character with an effect put on it by the character `by`, or put on
 * again: effects don't stack, so the longer count stands (§20.2). Burning
 * remembers who set it last; stunning loses whatever was banked, so it can't
 * react until its owner's next turn. Undefined for a character that's down,
 * which keeps no effects.
 */
export function afflicted(target: Fighter, effect: Affliction, by: number): { fighter: Fighter; event: BattleEvent } | undefined {
    if (!isStanding(target)) return undefined;
    const was = target.effects[effect] ?? 0;
    const fighter: Fighter = { ...target, effects: { ...target.effects, [effect]: Math.max(was, EFFECTS[effect].count) } };
    if (effect === "burning") fighter.burnedBy = by;
    if (effect === "stunned") fighter.banked = 0;
    return { fighter, event: { kind: "effect", fighter: target.id, effect, change: was > 0 ? "refreshed" : "applied" } };
}

/** The effects on a character that a heal clears (§20.2). */
export function healedEffects(fighter: Fighter): EffectId[] {
    return EFFECT_IDS.filter(effect => "healed" in EFFECTS[effect] && hasEffect(fighter, effect));
}

/**
 * The low cover something landing at `at` would blast away (§22): every
 * square of it in the 3×3 round `at`, for something that blasts — Fireball,
 * a fire flask — and none for anything else.
 */
export function blastedBy(field: Battlefield, by: Ability | Item | undefined, at: Square): Square[] {
    return by?.blasts ? areaAround(field, at).filter(square => field.tiles[square].terrain.destructible) : [];
}

/** Every square a run of events blasted away, in order (§22). */
export function blastedIn(events: readonly BattleEvent[]): Square[] {
    return events.flatMap(event => event.kind === "blasted" ? event.squares : []);
}

/** A working copy of the battle that an action changes as it resolves, writing down what happens. */
function resolver(state: BattleState, roll: Roll) {
    const fighters = structuredClone(state.fighters) as Fighter[];
    const battle: BattleState = { field: state.field, fighters };
    const events: BattleEvent[] = [];
    const get = (id: number): Fighter => {
        const fighter = fighterById(battle, id);
        if (!fighter) throw new Error(`No fighter ${id}`);
        return fighter;
    };

    /**
     * Takes HP off a character; at 0 it's down, losing every effect, and an
     * enemy who downed it scores (§13.5, §13.7, §20.2).
     */
    const wound = (by: Pick<Fighter, "id" | "owner">, target: Fighter, damage: number) => {
        target.hp = Math.max(0, target.hp - damage);
        if (isStanding(target)) return;
        Object.assign(target, { ap: 0, banked: 0, effects: {} });
        delete target.burnedBy;
        // Its smoke goes with it, as a downed Knight's shield wall does (§21.2).
        delete target.smoke;
        events.push({ kind: "downed", fighter: target.id, by: by.id });
        // Downing your own character — a fireball's, say — scores nobody anything.
        if (by.owner !== target.owner) events.push({ kind: "scored", player: by.owner, points: knockoutPoints(target.character), reason: "knockout" });
    };

    const afflict = (by: Fighter, target: Fighter, effect: Affliction) => {
        const result = afflicted(target, effect, by.id);
        if (!result) return;
        Object.assign(target, result.fighter);
        events.push(result.event);
    };

    const shoot = (by: Fighter, target: Fighter, kind: "attack" | "aimedShot" | "overwatch") => {
        const odds = shotOdds(battle, by, target, kind);
        if (!odds) throw new Error(`${by.id} can't shoot ${target.id}`);
        const rolled = roll();
        const result = shotResult(odds, rolled);
        const damage = result === "hit" ? odds.damage : result === "graze" ? odds.grazeDamage : 0;
        events.push({ kind: "shot", fighter: by.id, target: target.id, chance: odds.chance, roll: rolled, result, damage, reaction: kind === "overwatch" });
        if (damage > 0) wound(by, target, damage);
    };

    /** A melee strike, which always hits (§13.3). */
    const strike = (by: Fighter, target: Fighter, reaction = false) => {
        const { damage } = CHARACTERS[by.character].weapon;
        events.push({ kind: "struck", fighter: by.id, target: target.id, damage, reaction });
        wound(by, target, damage);
    };

    /**
     * Something landing on some squares without a roll — a fireball, a thrown
     * flask — hitting everyone standing there, friend or foe: the event
     * `told` makes of who it hit, then its damage, then its effect on
     * whoever it didn't down (§13.6, §20.2).
     */
    const land = (by: Fighter, squares: readonly Square[], damage: number, effect: Affliction | undefined, told: (targets: number[]) => BattleEvent) => {
        const area = new Set(squares);
        const hit = fighters.filter(one => isStanding(one) && area.has(one.square));
        events.push(told(hit.map(one => one.id)));
        if (damage > 0) for (const target of hit) wound(by, target, damage);
        if (effect) for (const target of hit) afflict(by, target, effect);
    };

    /**
     * Low cover blasted away, after whatever did it has done its damage: so
     * whoever it was covering keeps it for that, and loses it for the next
     * attack (§22). Nobody can be standing on it, so nobody moves.
     */
    const blast = (by: Fighter, squares: readonly Square[]) => {
        if (squares.length > 0) events.push({ kind: "blasted", fighter: by.id, squares: [...squares] });
    };

    /**
     * Restores up to `hp` to a character, never past full, and clears what a
     * heal does: the one heal-and-clear a Cleric's Heal and a healing draught
     * share (§20.2, §21.3).
     */
    const mend = (by: Fighter, target: Fighter, hp: number, draught: boolean) => {
        const restored = Math.min(hp, CHARACTERS[target.character].hp - target.hp);
        target.hp += restored;
        events.push({ kind: "healed", fighter: by.id, target: target.id, hp: restored, ...(draught ? { draught: true as const } : {}) });
        for (const effect of healedEffects(target)) {
            delete target.effects[effect];
            events.push({ kind: "effect", fighter: target.id, effect, change: "cleared" });
        }
        delete target.burnedBy;
    };

    return { fighters, battle, events, get, shoot, strike, wound, afflict, land, blast, mend };
}

/**
 * Walks a path, resolving each reaction as it comes (nearest watcher first),
 * and stops the mover where a reaction downs it (§17.2). The walk is told as
 * `moved` segments broken by the reactions, so a replay can play it in order.
 */
function walk(state: BattleState, run: ReturnType<typeof resolver>, mover: Fighter, path: Square[], sneaking: boolean) {
    const reactions = sneaking ? [] : reactionsTo(state, mover, path);
    let from = 0;
    const moveTo = (step: number) => {
        if (step > from) run.events.push({ kind: "moved", fighter: mover.id, path: path.slice(from, step + 1), sneaking });
        mover.square = path[step];
        from = step;
    };
    for (const { watcher: id, step } of reactions) {
        moveTo(step);
        const watcher = run.get(id);
        watcher.banked -= REACTION_COST;
        if (CHARACTERS[watcher.character].weapon.kind === "ranged") run.shoot(watcher, mover, "overwatch");
        else run.strike(watcher, mover, true);
        if (!isStanding(mover)) return;
    }
    moveTo(path.length - 1);
}

/**
 * Takes an action `check` allows, spending its AP and rolling as it goes.
 * Throws if `check` refuses it.
 */
export function act(state: BattleState, player: string, action: Action, roll: Roll): Outcome {
    const checked = check(state, player, action);
    if ("refused" in checked) throw new Error(checked.refused);

    const run = resolver(state, roll);
    const { events, get } = run;
    const actor = get(action.fighter);
    actor.ap -= checked.ap;
    if (Object.hasOwn(ABILITIES, action.kind)) {
        const id = action.kind as AbilityId;
        const ability: Ability = ABILITIES[id];
        if (ability.cooldown > 0) actor.cooldowns[id] = ability.cooldown;
        if (ability.oncePerBattle) actor.spent.push(id);
    }

    switch (action.kind) {
        case "move":
        case "sneak":
            walk(state, run, actor, action.path, action.kind === "sneak");
            break;
        case "attack":
        case "aimedShot": {
            const target = get(action.target);
            if (CHARACTERS[actor.character].weapon.kind === "melee") run.strike(actor, target);
            else run.shoot(actor, target, action.kind);
            break;
        }
        case "hunker":
            // A stance held until its owner's next turn, so it ends this one (§13.2).
            actor.ap = 0;
            actor.effects.hunkered = EFFECTS.hunkered.count;
            events.push({ kind: "hunkered", fighter: actor.id });
            break;
        case "watch":
            actor.banked = checked.ap;
            events.push({ kind: "watching", fighter: actor.id, banked: checked.ap });
            break;
        case "cleave":
            for (const id of action.targets) run.strike(actor, get(id));
            break;
        case "shieldWall":
            actor.effects.shieldWall = EFFECTS.shieldWall.count;
            events.push({ kind: "shieldWall", fighter: actor.id });
            break;
        case "fireball": {
            // Every character in the area, friend or foe — the Mage too, if it's
            // that close — and no roll (§13.6). Whoever it doesn't down is left
            // burning: it doesn't roll, so it always does (§20.2). Then the
            // low cover it landed on is gone (§22).
            const { damage, effect } = ABILITIES.fireball;
            run.land(actor, areaAround(state.field, action.at), damage, effect,
                targets => ({ kind: "fireball", fighter: actor.id, at: action.at, targets, damage }));
            run.blast(actor, blastedBy(state.field, ABILITIES.fireball, action.at));
            break;
        }
        case "heal":
            // The answer to effects: it puts out burning, and clears slowed and stunned (§20.2).
            run.mend(actor, get(action.target), ABILITIES.heal.hp, false);
            break;
        case "draught":
            // Used up whatever it does (§21.1).
            actor.item = null;
            run.mend(actor, get(action.target), ITEMS.healingDraught.hp, true);
            break;
        case "throw": {
            // `check` allowed it, so the actor carries something thrown.
            const id = actor.item as ItemId;
            const item: Item = ITEMS[id];
            actor.item = null;
            if (id === "smokePot") {
                // A smoke pot hurts nobody: the cloud lives on the thrower (§21.2).
                actor.smoke = action.at;
                events.push({ kind: "thrown", fighter: actor.id, item: id, at: action.at, targets: [], damage: 0 });
                break;
            }
            // Friend or foe, the thrower too if it's that close, as a fireball.
            const damage = item.damage ?? 0;
            run.land(actor, item.area ? areaAround(state.field, action.at) : [action.at], damage, item.effect,
                targets => ({ kind: "thrown", fighter: actor.id, item: id, at: action.at, targets, damage }));
            run.blast(actor, blastedBy(state.field, item, action.at));
            break;
        }
        case "raise": {
            // Back on its feet at half HP, with nothing to spend until its
            // owner's next turn; the points for downing it stay scored (§13.5).
            const target = get(action.target);
            target.hp = Math.ceil(CHARACTERS[target.character].hp / 2);
            events.push({ kind: "raised", fighter: actor.id, target: target.id, hp: target.hp });
            break;
        }
    }
    return { fighters: run.fighters, events };
}

// ─── Turns ──────────────────────────────────────────────────────────────────

/** Every count one lower, and any that reach 0 gone: a cooldown's, and an effect's (§13.5, §20.1). */
function countDown<Id extends string>(counts: Partial<Record<Id, number>>): Partial<Record<Id, number>> {
    return Object.fromEntries(Object.entries<number | undefined>(counts)
        .map(([id, turns]) => [id, (turns ?? 0) - 1] as const)
        .filter(([, turns]) => turns > 0)) as Partial<Record<Id, number>>;
}

/**
 * A player's turn begins: their characters get fresh AP (only 2 for one
 * stunned), anything banked and not used is lost, any smoke they threw clears,
 * and anything burning takes its damage. Then cooldowns and effects count
 * down, so a stance held since their last turn drops and a stun lifts (§13.2,
 * §13.4, §13.5, §20.1, §21.2).
 *
 * Burning can down a character here, and a knock-out by it scores for the
 * owner of whoever set it alight (§20.2), so this returns what happened as
 * an action does. It rolls nothing.
 */
export function startTurn(state: BattleState, player: string): Outcome {
    const run = resolver(state, fixedRolls([]));
    for (const fighter of run.fighters) {
        if (fighter.owner !== player || !isStanding(fighter)) continue;
        fighter.ap = hasEffect(fighter, "stunned") ? EFFECTS.stunned.ap : ACTION_POINTS;
        fighter.banked = 0;
        delete fighter.smoke;
        if (hasEffect(fighter, "burning")) {
            const { damage } = EFFECTS.burning;
            // A burner whose squad has left the battle (a dropped player's)
            // scores nobody, as a fire a player set on their own doesn't.
            const burner = run.fighters.find(one => one.id === fighter.burnedBy) ?? { id: fighter.burnedBy ?? fighter.id, owner: fighter.owner };
            run.events.push({ kind: "burned", fighter: fighter.id, damage });
            run.wound(burner, fighter, damage);
        }
        if (!isStanding(fighter)) continue;
        fighter.cooldowns = countDown(fighter.cooldowns);
        fighter.effects = countDown(fighter.effects);
        if (!hasEffect(fighter, "burning")) delete fighter.burnedBy;
    }
    return { fighters: run.fighters, events: run.events };
}

/** The players with someone standing in the centre: one of them holds it, two or more contest it (§13.7). */
export function centreHolders(state: BattleState): string[] {
    const centre = new Set(state.field.objectives[CENTRE] ?? []);
    return [...new Set(state.fighters.filter(fighter => isStanding(fighter) && centre.has(fighter.square)).map(fighter => fighter.owner))];
}

/** What holding the centre scores a player at the end of their own turn: some of theirs in it, and no enemy (§13.7). */
export function centrePoints(state: BattleState, player: string, round: number): number {
    if (round < CENTRE_SCORES_FROM_ROUND) return 0;
    const holders = centreHolders(state);
    return holders.length === 1 && holders[0] === player ? CENTRE_POINTS : 0;
}

/**
 * A player ends their turn: every character with enough AP left goes on
 * overwatch or guard, except the ones told to keep still, and the rest of
 * the AP are lost (§6). Then the centre scores. A timed-out turn ends this
 * way too, with nobody kept still (§4). `keepStill` may be anything a client
 * sent; ids that aren't the player's characters are ignored. `round` counts
 * from 1.
 */
export function endTurn(state: BattleState, player: string, round: number, keepStill: unknown = []): Outcome {
    const still = Array.isArray(keepStill) ? keepStill : [];
    const events: BattleEvent[] = [];
    const fighters = structuredClone(state.fighters).map(fighter => {
        if (fighter.owner !== player || !isStanding(fighter)) return fighter;
        const watching = fighter.ap >= REACTION_COST && !still.includes(fighter.id) && !hasEffect(fighter, "stunned");
        if (watching) events.push({ kind: "watching", fighter: fighter.id, banked: fighter.ap });
        return { ...fighter, ap: 0, banked: watching ? fighter.ap : fighter.banked };
    });
    const points = centrePoints({ field: state.field, fighters }, player, round);
    if (points > 0) events.push({ kind: "scored", player, points, reason: "centre" });
    return { fighters, events };
}

// ─── The end of the battle (§5.1) ───────────────────────────────────────────

export function battleRounds(playerCount: number): number {
    const rounds = BATTLE_ROUNDS[playerCount as PlayerCount];
    if (rounds === undefined) throw new Error(`Realm Arena has no battle length for ${playerCount} players`);
    return rounds;
}

/** The players, in seat order, who still have someone standing. */
export function squadsStanding(state: BattleState, players: readonly string[]): string[] {
    return players.filter(player => state.fighters.some(fighter => fighter.owner === player && isStanding(fighter)));
}

/** Whether the battle is over: the turn limit has been played out, or at most one squad is left (§5.1). */
export function isBattleOver(state: BattleState, players: readonly string[], roundsPlayed: number): boolean {
    return roundsPlayed >= battleRounds(players.length) || squadsStanding(state, players).length <= 1;
}

/** The points' worth of a player's squad still standing: the first tie-break. */
export function standingPoints(state: BattleState, player: string): number {
    return squadPoints(state.fighters.filter(fighter => fighter.owner === player && isStanding(fighter)).map(fighter => fighter.character));
}

/**
 * The players from first to last. The highest score wins; level scores go to
 * the one with more points' worth still standing, and if that's level too, to
 * the later seat, which makes up for the advantage of going early (§5.1). The
 * last link never ties, so every battle has a winner.
 */
export function standings(state: BattleState, players: readonly string[], scores: Readonly<Record<string, number>>): string[] {
    const seat = new Map(players.map((player, index) => [player, index]));
    return [...players].sort((a, b) =>
        (scores[b] ?? 0) - (scores[a] ?? 0)
        || standingPoints(state, b) - standingPoints(state, a)
        || (seat.get(b) ?? 0) - (seat.get(a) ?? 0));
}

// ─── Mustering (§5, §17.2) ──────────────────────────────────────────────────

export interface MusterPick {
    character: CharacterId;
    square: Square;
    /** The one item it carries into battle, if any (§21.1). */
    item?: ItemId;
}

/** A pick as `musterRefusal` checked it, and nothing else a request carried: no `item` key at all when it carries none. */
export function pickOf({ character, square, item }: MusterPick): MusterPick {
    return item ? { character, square, item } : { character, square };
}

/** What a muster costs: its characters, and the items they carry (§21.1). */
export function musterPoints(picks: readonly MusterPick[]): number {
    return squadPoints(picks.map(pick => pick.character)) + picks.reduce((total, pick) => total + itemPoints(pick.item), 0);
}

/**
 * Why a squad can't muster, or undefined when it can: at least one
 * character, no more than `MAX_OF_EACH` of any one, at most one item each,
 * within the budget with the items, and each on its own square of the seat's
 * deployment zone. Total, like `check`.
 */
export function musterRefusal(field: Battlefield, seat: number, picks: unknown, budget: number): string | undefined {
    if (!Array.isArray(picks) || picks.length === 0) return "Muster at least one character";
    const zone = new Set(Array.isArray(field.deployments[seat]) ? field.deployments[seat] : []);
    const squares = new Set<Square>();
    const counts = new Map<CharacterId, number>();
    for (const pick of picks as Partial<MusterPick>[]) {
        if (!isCharacterId(pick?.character)) return "That isn't a character";
        const count = (counts.get(pick.character) ?? 0) + 1;
        if (count > MAX_OF_EACH) return `No more than ${MAX_OF_EACH} of any one character`;
        counts.set(pick.character, count);
        // One slot, so an item is one id or nothing: never a list (§21.1).
        if (pick.item != null && !isItemId(pick.item)) return "That isn't an item";
        if (!zone.has(pick.square as Square) || squares.has(pick.square as Square)) return "Each character needs its own square in your deployment zone";
        squares.add(pick.square as Square);
    }
    const points = musterPoints(picks as MusterPick[]);
    return points <= budget ? undefined : `That squad costs ${points} points, and the budget is ${budget}`;
}

/** A character as it first stands on the battlefield, at full HP with nothing spent, carrying what it was mustered with. */
export function newFighter(id: number, owner: string, character: CharacterId, square: Square, item: ItemId | null = null): Fighter {
    return { id, owner, character, square, hp: CHARACTERS[character].hp, ap: 0, banked: 0, effects: {}, cooldowns: {}, spent: [], item };
}

/**
 * A fighter read back from storage, in full. An empty `cooldowns` or
 * `effects` doesn't survive every way a document is copied — a Mongoose
 * insert minimises it away — and every rule here reads both. A fighter from
 * before items carries none.
 */
export function storedFighter(fighter: Fighter): Fighter {
    return { ...fighter, effects: { ...fighter.effects }, cooldowns: { ...fighter.cooldowns }, spent: [...(fighter.spent ?? [])], item: fighter.item ?? null };
}

/**
 * Where a ready-made squad stands (§17.2): spread evenly along the middle row
 * of the seat's deployment zone, or across the whole zone when the row is too
 * narrow. Every square of a zone can be stood on (`buildBattlefield` checks),
 * so the picks always pass `musterRefusal` — a timed-out muster runs on the
 * server and mustn't fail. It throws only for a zone with fewer squares than
 * the squad, which is a map that can't be played.
 */
export function readyMadeMuster(field: Battlefield, seat: number, squad: readonly CharacterId[]): MusterPick[] {
    const zone = (field.deployments[seat] ?? []).map(square => coordsOf(field, square));
    if (zone.length === 0) throw new Error(`${field.name} has no deployment zone for seat ${seat}`);
    const cols = zone.map(({ col }) => col), rows = zone.map(({ row }) => row);
    const left = Math.min(...cols), width = Math.max(...cols) - left + 1;
    const row = Math.floor((Math.min(...rows) + Math.max(...rows)) / 2);
    const spread = (count: number) => squad.map((_, i) => Math.floor(((i + 0.5) * count) / squad.length));
    if (squad.length <= width) return spread(width).map((col, i) => ({ character: squad[i], square: row * field.width + left + col }));
    const squares = field.deployments[seat];
    if (squad.length > squares.length) throw new Error(`${field.name}'s deployment zone ${seat} is too small for ${squad.length} characters`);
    return spread(squares.length).map((index, i) => ({ character: squad[i], square: squares[index] }));
}
