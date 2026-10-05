// Realm Arena's rules (docs/games/realm-arena.md §13, §17.2, §20–§22): what
// an action costs and whether it can be taken, hit chances, grazes and damage,
// who reacts to a move and in what order, abilities, status effects, items
// and the smoke a smoke pot leaves, the low cover a blast clears, knock-outs
// and raising, scoring, the end of the battle with its tie-break chain, and
// what a squad may muster, including the options its owner's ranks unlock
// (§23.2).
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
import { DEFAULT_CLIMB, pathCost, pathTo, reachFrom, type MoveRules, type Reach } from "@/utils/games/battlefield/pathfinding";
import { coordsOf, distance, facingTowards, HALF_HEIGHT, isNeighbour, riseOf, squareAt, type Battlefield, type Cover, type Facing, type Square } from "@/utils/games/battlefield/terrain";
import {
    ABILITIES, AFFLICTIONS, CHARACTERS, EFFECT_IDS, EFFECTS, isCharacterId, isItemId, isOptionId, ITEMS, kitOf, OPTIONS, squadPoints,
    type Ability, type AbilityId, type Affliction, type CharacterId, type EffectId, type Faction, type Item, type ItemId, type OptionId, type PlayerCount, type Weapon,
} from "./characters";
import { addTally, NO_TALLY, type Ranks, type Tally } from "./mastery";

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

/**
 * How far most characters see, in squares, wherever nothing blocks their
 * sight — what fog of war leaves their owner able to see (§27). An Archer or a
 * Scout sees further and a Knight less far (`sightOf`). Every character sees
 * at least as far as anything it can use reaches, so anything it could shoot
 * at, aim at or throw at, it can see: fog takes nothing away from what can be
 * done, only from what's known.
 */
export const SIGHT_RANGE = 20;

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
    /**
     * The way it last stepped, which the board draws it facing. Only for the
     * eye: no rule reads it — flanking doesn't care which way a character
     * faces — and it's absent until the character first moves.
     */
    facing?: Facing;
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
    /** The option it was mustered with, swapping part of its kit for another (§23.2): absent on the starter character. */
    option?: OptionId;
    /**
     * Where the smoke pot it threw landed, while the cloud lasts: until the
     * start of its owner's next turn, as a shield wall does, and gone with it
     * if it's downed first (§21.2). The cloud is the 3×3 around that square.
     */
    smoke?: Square;
    /**
     * What it has done this battle that earns mastery (§23.3): its attacks,
     * reactions among them, its abilities and its items. Kept by the command
     * that acts (`tallied`, RealmArenaLogic.ts) rather than any rule here, and
     * absent until it first does one.
     */
    tally?: Tally;
}

/** What every rule reads: the ground, and everyone on it. */
export interface BattleState {
    /** The map with whatever has been blasted away so far already cleared from it (`battlefieldWith`, §22). */
    field: Battlefield;
    fighters: readonly Fighter[];
    /**
     * Whether the battle is fought in fog of war (§27): a player acts on what
     * their squad can see (`viewOf`), so an enemy out of sight can't be in
     * the way of a path they send. Absent in a battle without it.
     */
    fog?: boolean;
    /**
     * Smoke clouds whose throwers are out of the viewer's sight, by the square
     * each landed on (§27): a player's view of a fogged battle keeps a cloud
     * it can see when it drops the thrower. Never set on the whole battle,
     * where every cloud is on its thrower.
     */
    clouds?: readonly Square[];
    /**
     * The side each owner fights on, by owner (§29.6): absent in a
     * free-for-all, where every owner is a side of its own. Never stored or
     * sent — `battleFrom` builds it from what the battle was created as, on
     * the server, the board and the recap alike. Read only through `sideOf`.
     */
    sides?: Readonly<Record<string, string>>;
}

/** What a `BattleState` is built from: the persisted state on the server, the response on the board and in the recap. */
export interface BattleSource {
    fighters: readonly Fighter[];
    fog?: boolean;
    clouds?: readonly Square[];
}

/**
 * The one way a `BattleState` is built (§29.6), so the board's previews and
 * the recap read a battle exactly as the server does. A free-for-all — every
 * battle so far — has no `sides`; co-op adds them here, from what the battle
 * was created as, and nowhere else.
 */
export function battleFrom(field: Battlefield, { fighters, fog, clouds }: BattleSource): BattleState {
    return { field, fighters, ...(fog ? { fog: true } : {}), ...(clouds && clouds.length > 0 ? { clouds } : {}) };
}

/** The side an owner fights on (§29.6): its own, in a free-for-all. */
export function sideOf(state: Pick<BattleState, "sides">, owner: string): string {
    return state.sides && Object.hasOwn(state.sides, owner) ? state.sides[owner] : owner;
}

/**
 * Whether two owners fight on the same side (§29.6): every "is this an enemy?"
 * a rule asks. An owner is its own ally; nobody — a null viewer, a fighter
 * not found — is nobody's. "Whose character is this?" — the actor is the
 * player's own, its turn begins — stays an owner check.
 */
export function allied(state: Pick<BattleState, "sides">, a: string | null | undefined, b: string | null | undefined): boolean {
    return a != null && b != null && sideOf(state, a) === sideOf(state, b);
}

export type Action =
    | { kind: "move" | "sneak"; fighter: number; path: Square[] }
    | { kind: "attack" | "aimedShot" | "heal" | "raise" | "draught" | "shieldBash" | "cripplingShot" | "huntersMark"; fighter: number; target: number }
    | { kind: "hunker" | "watch" | "shieldWall" | "purify"; fighter: number }
    | { kind: "cleave"; fighter: number; targets: number[] }
    /** A demolish is aimed at the square of low cover it blasts. */
    | { kind: "fireball" | "throw" | "demolish"; fighter: number; at: Square };

export type ShotResult = "hit" | "graze" | "miss";

/** One thing that happened, in the order it happened: what the board shows coming back, and what a recap tells. */
export type BattleEvent =
    | { kind: "moved"; fighter: number; path: Square[]; sneaking: boolean }
    | { kind: "shot"; fighter: number; target: number; chance: number; roll: number; result: ShotResult; damage: number; reaction: boolean }
    | { kind: "struck"; fighter: number; target: number; damage: number; reaction: boolean }
    | { kind: "fireball"; fighter: number; at: Square; targets: number[]; damage: number }
    | { kind: "downed"; fighter: number; by: number }
    /**
     * A Cleric's Heal; or, by `via`, a healing draught given by `fighter` — to
     * itself, when `target` is `fighter` — or one ally a Purify reached, the
     * Cleric among them (§23.2).
     */
    | { kind: "healed"; fighter: number; target: number; hp: number; via?: "draught" | "purify" }
    /** A thrown item landing: `targets` is everyone it hit, which a smoke pot never does — its cloud is the thrower's `smoke`. */
    | { kind: "thrown"; fighter: number; item: ItemId; at: Square; targets: number[]; damage: number }
    /** Low cover blasted away to scorched ground by `fighter`'s fireball, fire flask or Demolish, after its damage (§22). */
    | { kind: "blasted"; fighter: number; squares: Square[] }
    /** A Knight's Demolish at the cover on `at`: `targets` is everyone beside it that it struck (§23.2). Its `blasted` follows. */
    | { kind: "demolished"; fighter: number; at: Square; targets: number[]; damage: number }
    /** A Scout's Hunter's mark on `target`, whose `effect` follows (§23.2). */
    | { kind: "marked"; fighter: number; target: number }
    | { kind: "raised"; fighter: number; target: number; hp: number }
    | { kind: "hunkered" | "shieldWall"; fighter: number }
    | { kind: "watching"; fighter: number; banked: number }
    /**
     * An enemy out of sight standing in a move's path, found by the mover, which
     * went round it rather than stopping (§27): `by` is who it found. Told
     * before the move it made instead.
     */
    | { kind: "spotted"; fighter: number; by: number }
    /** An effect put on a character, put on again (the longer count stands), or cleared by a heal. Not the stances, which have their own events, nor an effect running out. */
    | { kind: "effect"; fighter: number; effect: EffectId; change: "applied" | "refreshed" | "cleared" }
    /** Burning doing its damage at the start of its owner's turn. */
    | { kind: "burned"; fighter: number; damage: number }
    | { kind: "scored"; player: string; points: number; reason: "centre" | "knockout" };

/**
 * An event as a review sends it to every player (§26.2): a shot without the
 * roll that decided it, which the log never tells.
 */
export type ToldEvent = Exclude<BattleEvent, { kind: "shot" }> | Omit<Extract<BattleEvent, { kind: "shot" }>, "roll">;

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

/** What a set of items costs at muster, a missing one nothing. */
export const itemsPoints = (items: readonly (ItemId | null | undefined)[]): number => items.reduce((total, item) => total + itemPoints(item), 0);

/** What a character fights with: its character's weapon, or the one its option swaps in (§23.2). */
export const weaponOf = (fighter: Pick<Fighter, "character" | "option">): Weapon => kitOf(fighter.character, fighter.option).weapon;

/** The abilities a character has: its character's, with the one its option swaps out swapped for its own (§23.2). */
export const abilitiesOf = (fighter: Pick<Fighter, "character" | "option">): readonly AbilityId[] => kitOf(fighter.character, fighter.option).abilities;

/** Movement points each AP spent on moving buys it: its character's, halved and rounded up while it's slowed (§20.1). */
export function movementOf(fighter: Fighter): number {
    const { movement } = CHARACTERS[fighter.character];
    return hasEffect(fighter, "slowed") ? Math.ceil(movement / 2) : movement;
}

export function fighterById(state: BattleState, id: unknown): Fighter | undefined {
    return state.fighters.find(fighter => fighter.id === id);
}

/** Whether two characters touch, and nothing stands between them at the corner they share. A healing draught, raising and the shield wall need it; melee needs `inMeleeReach` too. */
export function nextTo(field: Battlefield, a: Square, b: Square): boolean {
    return isNeighbour(field, a, b) && canSee(field, a, b);
}

/** How far apart in height, in quarters, two characters can be and still fight hand to hand (§25.2). */
export const MELEE_RISE = 1;

/** Whether a melee weapon reaches from one square to another: next to it, and no more than a quarter above or below it. */
export function inMeleeReach(field: Battlefield, a: Square, b: Square): boolean {
    return nextTo(field, a, b) && Math.abs(riseOf(field, a, b)) <= MELEE_RISE;
}

/** Whether one square is within `range` squares of another and can be seen from it: a ranged weapon's reach, and a fireball's or a heal's (§13.3). */
export function inRange(field: Battlefield, from: Square, to: Square, range: number): boolean {
    return distance(field, from, to) <= range && canSee(field, from, to);
}

/** Whether a character's weapon could hit someone on a square from where it stands: in melee reach for a melee weapon, in range and in sight for a ranged one. */
export function weaponReaches(state: BattleState, fighter: Fighter, square: Square): boolean {
    const weapon = weaponOf(fighter);
    return weapon.kind === "ranged" ? inRange(state.field, fighter.square, square, weapon.range) : inMeleeReach(state.field, fighter.square, square);
}

/** What a move by one character may cross and stop on, and how far it can climb: enemies block, allies may be crossed but not stopped on. The fallen do neither. */
export function moveRules(state: BattleState, mover: Fighter): Required<MoveRules> {
    const blocked = new Set<Square>(), occupied = new Set<Square>();
    for (const other of state.fighters) {
        if (other.id === mover.id || !isStanding(other)) continue;
        (allied(state, other.owner, mover.owner) ? occupied : blocked).add(other.square);
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
 * Kept out of the squares it's `avoiding`, as out of an enemy's: the
 * computer's way round the overwatch (`watchedSquares`).
 */
export function reachOf(state: BattleState, fighter: Fighter, sneaking = false, avoiding: ReadonlySet<Square> = new Set()): Reach {
    const allowances = sneaking ? Math.floor(fighter.ap / ABILITIES.sneak.ap) : fighter.ap;
    const rules = moveRules(state, fighter);
    const blocked = new Set(rules.blocked);
    for (const square of avoiding) if (square !== fighter.square) blocked.add(square);
    return reachFrom(state.field, fighter.square, allowances * movementOf(fighter), { ...rules, blocked });
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
        && allied(state, knight.owner, target.owner) && nextTo(state.field, knight.square, target.square));
}

/**
 * The squares under a smoke cloud: the 3×3 around where each smoke pot
 * landed, while it lasts (§21.2). A thrower who is downed loses its `smoke`.
 */
export function smokeSquares(state: BattleState): ReadonlySet<Square> {
    return new Set([...landedSmoke(state.fighters), ...state.clouds ?? []].flatMap(at => areaAround(state.field, at)));
}

/** Where each of these characters' smoke pots landed, while its cloud lasts (§21.2). */
export function landedSmoke(throwers: readonly Fighter[]): Square[] {
    return throwers.flatMap(thrower => thrower.smoke !== undefined ? [thrower.smoke] : []);
}

/**
 * The odds of a shot from where the attacker stands, or undefined when it
 * can't take one: it fights in melee, the target is out of range, or it can't
 * see the target (§13.3).
 */
/** The kinds of shot: an attack, an aimed shot, a crippling shot — at an attack's odds — and one on overwatch. */
export type ShotKind = "attack" | "aimedShot" | "cripplingShot" | "overwatch";

/**
 * What a shot leaves on a hit, and only then (§20.2): a crippling shot's
 * slow, or else whatever the weapon leaves — a Frost bolt's, on overwatch
 * too (§23.2).
 */
export function shotEffect(shooter: Fighter, kind: ShotKind): Affliction | undefined {
    if (kind === "cripplingShot") return ABILITIES.cripplingShot.effect;
    const weapon = weaponOf(shooter);
    return weapon.kind === "ranged" ? weapon.effect : undefined;
}

export function shotOdds(state: BattleState, attacker: Fighter, target: Fighter, kind: ShotKind = "attack"): ShotOdds | undefined {
    const { field } = state;
    const weapon = weaponOf(attacker);
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
    return weaponOf(watcher).kind === "melee" || !smoke.has(square);
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
    const watchers = watchersOf(state, mover.owner);
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

/** The enemies watching that could react to a move by one of a player's characters: standing, with a reaction's AP banked (§13.4). */
function watchersOf(state: BattleState, player: string): Fighter[] {
    return state.fighters.filter(watcher => isStanding(watcher) && !allied(state, watcher.owner, player) && watcher.banked >= REACTION_COST);
}

/**
 * Every square a move by one of a player's characters would set off a
 * reaction on, from whoever is watching now (§13.4): what a path keeps out of
 * to set off none.
 */
export function watchedSquares(state: BattleState, player: string): ReadonlySet<Square> {
    const watchers = watchersOf(state, player);
    if (watchers.length === 0) return new Set();
    const smoke = smokeSquares(state);
    return new Set(state.field.tiles.flatMap((_, square) => watchers.some(watcher => setsOff(state, watcher, square, smoke)) ? [square] : []));
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

// ─── Fog of war (§27) ───────────────────────────────────────────────────────
//
// Fog changes what a player knows, never what can be done: a character sees
// as far as its `sightOf` wherever its line of sight is clear, which is at
// least as far as anything it can use reaches, so every attack, aim and throw
// is at something seen. The one rule it touches is moving: a path is checked
// against what its player can see, and an enemy out of sight standing in it
// sends the mover round it (`routed`).

/**
 * Whether a player's side sees a square: any standing character of theirs or
 * an ally's does, since a side shares its sight (§29.1). Remembers each
 * answer, since a view asks about the same squares again and again.
 */
export function squadSight(state: BattleState, player: string | null): (square: Square) => boolean {
    const eyes = state.fighters.filter(fighter => allied(state, fighter.owner, player) && isStanding(fighter));
    const known = new Map<Square, boolean>();
    return square => {
        let seen = known.get(square);
        if (seen === undefined) {
            // As a shot is in range: near enough, and nothing in the way.
            seen = eyes.some(eye => inRange(state.field, eye.square, square, sightOf(eye)));
            known.set(square, seen);
        }
        return seen;
    };
}

/**
 * The battle as one player knows it under fog of war (§27): their own side,
 * every other character — standing or fallen — on a square their side sees,
 * and every smoke cloud they can see: on its thrower when they see it too,
 * and on its own (`clouds`) when they don't. A cloud they can't see isn't
 * there, whoever threw it. The
 * whole battle when it isn't fogged. A player with nobody standing — or no
 * player at all — sees nobody else. Their allies are their own side's, so
 * shown in full, smoke and all (§29.1).
 *
 * Applied to a view already, it changes nothing: sight is read off the
 * player's own side and the ground, which a view keeps whole. So the board
 * reads its own view with the same rules the server reads the battle with.
 */
export function viewOf(state: BattleState, player: string | null): BattleState {
    if (!state.fog) return state;
    const seen = squadSight(state, player);
    const ours = (fighter: Fighter) => allied(state, fighter.owner, player);
    const known = (fighter: Fighter) => ours(fighter) || seen(fighter.square);
    const inSight = (cloud: Square) => areaAround(state.field, cloud).some(seen);
    const hidden = state.fighters.filter(fighter => !known(fighter));
    const clouds = [...landedSmoke(hidden), ...state.clouds ?? []].filter(inSight);
    // A character in sight whose cloud isn't keeps it to itself: where it
    // landed is somewhere the player can't see.
    const shown = state.fighters.filter(known).map(fighter => {
        if (ours(fighter) || fighter.smoke === undefined || inSight(fighter.smoke)) return fighter;
        const { smoke: _smoke, ...rest } = fighter;
        return rest;
    });
    return {
        field: state.field,
        fighters: shown,
        fog: true,
        ...(clouds.length > 0 ? { clouds } : {}),
        ...(state.sides ? { sides: state.sides } : {}),
    };
}

/** How far a character sees in fog of war, in squares (§27): its character's own sight, or `SIGHT_RANGE`. */
export function sightOf(fighter: Pick<Fighter, "character">): number {
    return CHARACTERS[fighter.character].sight ?? SIGHT_RANGE;
}

/**
 * The path a move takes, the enemies it found in its way, and the AP it costs
 * (§27). That's the path sent, at what `check` charged, unless an enemy out of
 * its player's sight stands in it — the only kind `check` lets a path cross.
 * Then the mover doesn't stop there, stranded with its AP spent: it goes
 * round, by the cheapest way to the square it was sent to that keeps clear of
 * every enemy it now knows of, within the AP it has. When there's none — the
 * square is the enemy's, or the way round costs too much — it goes as near to
 * that square as it can. It pays for the path it walks. The way round keeps
 * clear only of the enemies it knows of, so its shape gives nobody else away;
 * if it crosses another it can't see, that one is found and gone round too.
 * Without fog every enemy is known, so no path `check` allowed finds one.
 */
function routed(state: BattleState, mover: Fighter, sent: readonly Square[], sneaking: boolean): { path: Square[]; found: Fighter[]; ap?: number } {
    const known = new Set(viewOf(state, mover.owner).fighters.map(fighter => fighter.id));
    const unknownOn = (square: Square) => state.fighters.find(other => !allied(state, other.owner, mover.owner) && isStanding(other) && other.square === square && !known.has(other.id));
    const goal = sent[sent.length - 1];
    const found: Fighter[] = [];
    let path = [...sent];
    let ap: number | undefined;
    for (let enemy = path.slice(1).map(unknownOn).find(Boolean); enemy; enemy = path.slice(1).map(unknownOn).find(Boolean)) {
        found.push(enemy);
        known.add(enemy.id);
        const reach = reachOf({ ...state, fighters: state.fighters.filter(one => known.has(one.id) || allied(state, one.owner, mover.owner)) }, mover, sneaking);
        const to = reach.costs[goal] !== Infinity ? goal : nearestTo(state.field, reach, goal, moveRules(state, mover).climb);
        path = pathTo(reach, to)?.squares ?? [mover.square];
        ap = moveAp(mover, reach.costs[to], sneaking);
    }
    return { path, found, ap };
}

/**
 * The square in reach nearest `goal` (§27): nearest to walk to it, ignoring
 * who stands where, so the mover never loops round a wall for a square only
 * a crow would call closer; then as the crow flies, for a goal nothing in
 * reach can walk to; then the cheapest, then the first. Never none, since
 * where the mover stands is in reach. Every measure is exact — walking costs
 * are halves, and the crow's is squared — so a replay picks the same square.
 */
function nearestTo(field: Battlefield, reach: Reach, goal: Square, climb: number): Square {
    const walk = reachFrom(field, goal, Infinity, { climb }).costs;
    const { col, row } = coordsOf(field, goal);
    const crow = (square: Square) => {
        const at = coordsOf(field, square);
        return (at.col - col) ** 2 + (at.row - row) ** 2;
    };
    const score = (square: Square) => [walk[square], crow(square), reach.costs[square]];
    let best = reach.from;
    reach.costs.forEach((cost, square) => {
        if (cost === Infinity) return;
        const [a, b] = [score(square), score(best)];
        const first = a.findIndex((value, i) => value !== b[i]);
        if (first >= 0 && a[first] < b[first]) best = square;
    });
    return best;
}

export function knockoutPoints(character: CharacterId): number {
    return CHARACTERS[character].points / KNOCKOUT_DIVISOR;
}

// ─── Checking an action ─────────────────────────────────────────────────────

const isSquare = (field: Battlefield, value: unknown): value is Square =>
    Number.isInteger(value) && (value as number) >= 0 && (value as number) < field.tiles.length;

/** Why a character can't use an ability now, or undefined when it can. */
function abilityRefusal(fighter: Fighter, ability: AbilityId): string | undefined {
    if (!abilitiesOf(fighter).includes(ability)) return `This ${CHARACTERS[fighter.character].name} can't use ${ABILITIES[ability].name}`;
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

const isEnemy = (state: BattleState, actor: Fighter, target: Fighter | undefined): target is Fighter =>
    target !== undefined && isStanding(target) && !allied(state, target.owner, actor.owner);

/** Why an attack can't be made, or undefined when it can. */
function attackRefusal(state: BattleState, actor: Fighter, target: Fighter | undefined, kind: Exclude<ShotKind, "overwatch">): string | undefined {
    if (!isEnemy(state, actor, target)) return "Pick an enemy";
    if (weaponOf(actor).kind === "melee") {
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
export function check(battle: BattleState, player: string, action: unknown): Check {
    // Under fog, what the player can see (§27): an enemy out of sight is
    // neither in the way nor there to be aimed at.
    const state = viewOf(battle, player);
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
        // An attack with the character's own weapon, at its usual odds, that
        // leaves an effect: Shield bash strikes, Crippling shot shoots (§23.2).
        case "shieldBash":
            return ability("shieldBash", () => attackRefusal(state, actor, target, "attack"));
        case "cripplingShot":
            return ability("cripplingShot", () => attackRefusal(state, actor, target, "cripplingShot"));
        case "huntersMark":
            return ability("huntersMark", () => isEnemy(state, actor, target)
                ? aimRefusal(state, actor, target.square, ABILITIES.huntersMark.range)
                : "Pick an enemy");
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
                if (!enemies.every((one): one is Fighter => isEnemy(state, actor, one))) return "Pick two enemies";
                return enemies.every(one => inMeleeReach(state.field, actor.square, one.square)) ? undefined : "Both enemies must be next to them, within a quarter of their height";
            });
        case "shieldWall":
            return ability("shieldWall", () => undefined);
        case "demolish":
            return ability("demolish", () => isSquare(state.field, at) && coverNextTo(state.field, actor.square, at) ? undefined : "Pick low cover next to them");
        case "purify":
            return ability("purify", () => purified(state, actor).length > 0 ? undefined : "Nobody beside them needs it");
        case "fireball":
            return ability("fireball", () => aimRefusal(state, actor, at, ABILITIES.fireball.range));
        case "heal":
            return ability("heal", () => healRefusal(state, actor, target, false));
        case "raise":
            return ability("raise", () => {
                if (!target || !allied(state, target.owner, actor.owner) || isStanding(target)) return "Pick a downed ally";
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
 * Why a character can't heal `target`, or undefined when it can: an ally that
 * is hurt or has something a heal clears (§20.2, §21.2) — one it can see in
 * Heal's range, or, for a healing draught (`draught`), one next to it or
 * itself.
 */
function healRefusal(state: BattleState, healer: Fighter, target: Fighter | undefined, draught: boolean): string | undefined {
    if (!target || !allied(state, target.owner, healer.owner) || !isStanding(target) || (target.id === healer.id && !draught)) return "Pick an ally to heal";
    const far = draught ? undefined : aimRefusal(state, healer, target.square, ABILITIES.heal.range);
    if (far) return far;
    if (draught && target.id !== healer.id && !nextTo(state.field, healer.square, target.square)) return "Too far away to heal";
    return target.hp < CHARACTERS[target.character].hp || healedEffects(target).length > 0 ? undefined : "Already at full health";
}

/** Whether a square is low cover next to one standing on `from`: what a Knight's Demolish can be aimed at (§23.2). */
export function coverNextTo(field: Battlefield, from: Square, square: Square): boolean {
    return !!field.tiles[square].terrain.destructible && nextTo(field, from, square);
}

/** Who a Demolish at the cover on `at` strikes: everyone beside it but the Knight that swung it, friend or foe (§23.2). */
export function demolishArea(field: Battlefield, knight: Square, at: Square): Square[] {
    return areaAround(field, at).filter(square => square !== knight);
}

/** The afflictions on a character, which Purify clears: every one, Marked among them (§23.2). */
export function afflictionsOn(fighter: Fighter): Affliction[] {
    return AFFLICTIONS.filter(effect => hasEffect(fighter, effect));
}

/**
 * Who a Cleric's Purify would reach (§23.2): itself and every standing ally
 * next to it, as a healing draught reaches, that is hurt or afflicted — the
 * ones it would do anything for. Ids in battle order.
 */
export function purified(state: BattleState, cleric: Fighter): Fighter[] {
    return state.fighters.filter(ally => allied(state, ally.owner, cleric.owner) && isStanding(ally)
        && (ally.id === cleric.id || nextTo(state.field, cleric.square, ally.square))
        && (ally.hp < CHARACTERS[ally.character].hp || afflictionsOn(ally).length > 0));
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
 * square of it in the 3×3 round `at` for Fireball or a fire flask, `at`
 * itself for a Demolish, and none for anything else.
 */
export function blastedBy(field: Battlefield, by: Ability | Item | undefined, at: Square): Square[] {
    const squares = by?.blasts === "area" ? areaAround(field, at) : by?.blasts === "target" ? [at] : [];
    return squares.filter(square => field.tiles[square].terrain.destructible);
}

/** Every square a run of events blasted away, in order (§22). */
export function blastedIn(events: readonly BattleEvent[]): Square[] {
    return events.flatMap(event => event.kind === "blasted" ? event.squares : []);
}

/** A working copy of the battle that an action changes as it resolves, writing down what happens. */
function resolver(state: BattleState, roll: Roll) {
    const fighters = structuredClone(state.fighters) as Fighter[];
    const battle: BattleState = { ...state, fighters };
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
        // Downing your own side's character — a fireball's, say — scores nobody anything.
        if (!allied(battle, by.owner, target.owner)) events.push({ kind: "scored", player: by.owner, points: knockoutPoints(target.character), reason: "knockout" });
    };

    const afflict = (by: Fighter, target: Fighter, effect: Affliction) => {
        const result = afflicted(target, effect, by.id);
        if (!result) return;
        Object.assign(target, result.fighter);
        events.push(result.event);
    };

    /** A shot, which leaves its `shotEffect` on a hit, and only then (§20.2). */
    const shoot = (by: Fighter, target: Fighter, kind: ShotKind) => {
        const effect = shotEffect(by, kind);
        const odds = shotOdds(battle, by, target, kind);
        if (!odds) throw new Error(`${by.id} can't shoot ${target.id}`);
        const rolled = roll();
        const result = shotResult(odds, rolled);
        const damage = result === "hit" ? odds.damage : result === "graze" ? odds.grazeDamage : 0;
        events.push({ kind: "shot", fighter: by.id, target: target.id, chance: odds.chance, roll: rolled, result, damage, reaction: kind === "overwatch" });
        if (damage > 0) wound(by, target, damage);
        if (result === "hit" && effect) afflict(by, target, effect);
    };

    /** A melee strike, which always hits (§13.3): for the weapon's damage, or an ability's own (Shield bash). */
    const strike = (by: Fighter, target: Fighter, reaction = false, damage = weaponOf(by).damage) => {
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
     * heal does — every affliction, for a Purify: the one heal-and-clear a
     * Cleric's Heal, a healing draught and Purify share (§20.2, §21.3, §23.2).
     */
    const mend = (by: Fighter, target: Fighter, hp: number, via?: "draught" | "purify") => {
        const restored = Math.min(hp, CHARACTERS[target.character].hp - target.hp);
        target.hp += restored;
        events.push({ kind: "healed", fighter: by.id, target: target.id, hp: restored, ...(via ? { via } : {}) });
        for (const effect of via === "purify" ? afflictionsOn(target) : healedEffects(target)) {
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
 * The mover turns to face each step it takes, so it ends facing its last.
 */
function walk(state: BattleState, run: ReturnType<typeof resolver>, mover: Fighter, path: Square[], sneaking: boolean) {
    const reactions = sneaking ? [] : reactionsTo(state, mover, path);
    let from = 0;
    const moveTo = (step: number) => {
        if (step > from) {
            run.events.push({ kind: "moved", fighter: mover.id, path: path.slice(from, step + 1), sneaking });
            mover.facing = facingTowards(state.field, path[step - 1], path[step]);
        }
        mover.square = path[step];
        from = step;
    };
    for (const { watcher: id, step } of reactions) {
        moveTo(step);
        const watcher = run.get(id);
        watcher.banked -= REACTION_COST;
        if (weaponOf(watcher).kind === "ranged") run.shoot(watcher, mover, "overwatch");
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
    // A move's AP waits on where it goes (`routed`, §27).
    const moving = action.kind === "move" || action.kind === "sneak";
    if (!moving) actor.ap -= checked.ap;
    if (Object.hasOwn(ABILITIES, action.kind)) {
        const id = action.kind as AbilityId;
        const ability: Ability = ABILITIES[id];
        if (ability.cooldown > 0) actor.cooldowns[id] = ability.cooldown;
        if (ability.oncePerBattle) actor.spent.push(id);
    }

    switch (action.kind) {
        case "move":
        case "sneak": {
            // An enemy out of sight in the way is found and gone round (§27).
            const sneaking = action.kind === "sneak";
            const { path, found, ap } = routed(state, actor, action.path, sneaking);
            actor.ap -= ap ?? checked.ap;
            for (const enemy of found) events.push({ kind: "spotted", fighter: actor.id, by: enemy.id });
            walk(state, run, actor, path, sneaking);
            break;
        }
        case "attack":
        case "aimedShot": {
            const target = get(action.target);
            if (weaponOf(actor).kind === "melee") run.strike(actor, target);
            else run.shoot(actor, target, action.kind);
            break;
        }
        case "shieldBash":
            // For the ability's damage, not the sword's, and stunned if it stays up (§23.2).
            run.strike(actor, get(action.target), false, ABILITIES.shieldBash.damage);
            run.afflict(actor, get(action.target), ABILITIES.shieldBash.effect);
            break;
        case "cripplingShot":
            // At the bow's usual odds; slowed only on a hit (§20.2).
            run.shoot(actor, get(action.target), "cripplingShot");
            break;
        case "huntersMark":
            events.push({ kind: "marked", fighter: actor.id, target: action.target });
            run.afflict(actor, get(action.target), ABILITIES.huntersMark.effect);
            break;
        case "demolish": {
            // Everyone beside the cover but the Knight, friend or foe as any
            // blast is, then the cover goes, after the damage (§22, §23.2).
            const { damage } = ABILITIES.demolish;
            run.land(actor, demolishArea(state.field, actor.square, action.at), damage, undefined,
                targets => ({ kind: "demolished", fighter: actor.id, at: action.at, targets, damage }));
            run.blast(actor, blastedBy(state.field, ABILITIES.demolish, action.at));
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
            run.mend(actor, get(action.target), ABILITIES.heal.hp);
            break;
        case "purify":
            for (const ally of purified(state, actor)) run.mend(actor, get(ally.id), ABILITIES.purify.hp, "purify");
            break;
        case "draught":
            // Used up whatever it does (§21.1).
            actor.item = null;
            run.mend(actor, get(action.target), ITEMS.healingDraught.hp, "draught");
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

/** The characters standing in the centre (§13.7). */
function inCentre(state: BattleState): Fighter[] {
    const centre = new Set(state.field.objectives[CENTRE] ?? []);
    return state.fighters.filter(fighter => isStanding(fighter) && centre.has(fighter.square));
}

/**
 * The sides with someone standing in the centre: one of them holds it, two or
 * more contest it (§13.7). In a free-for-all a side is a player (`sideOf`).
 */
export function centreHolders(state: BattleState): string[] {
    return [...new Set(inCentre(state).map(fighter => sideOf(state, fighter.owner)))];
}

/**
 * What holding the centre scores a player at the end of their own turn: some
 * of theirs in it, and no enemy (§13.7). An ally beside them there is no
 * enemy, and an ally's alone doesn't score for them (§29.1).
 */
export function centrePoints(state: BattleState, player: string, round: number): number {
    if (round < CENTRE_SCORES_FROM_ROUND) return 0;
    const there = inCentre(state);
    return there.some(fighter => fighter.owner === player) && there.every(fighter => allied(state, fighter.owner, player)) ? CENTRE_POINTS : 0;
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
    const points = centrePoints({ ...state, fighters }, player, round);
    if (points > 0) events.push({ kind: "scored", player, points, reason: "centre" });
    return { fighters, events };
}

// ─── The end of the battle (§5.1) ───────────────────────────────────────────

export function battleRounds(playerCount: number): number {
    const rounds = BATTLE_ROUNDS[playerCount as PlayerCount];
    if (rounds === undefined) throw new Error(`Realm Arena has no battle length for ${playerCount} players`);
    return rounds;
}

/** The players, in seat order, who still have someone of their own standing: whose turns there are still to take. */
export function squadsStanding(state: BattleState, players: readonly string[]): string[] {
    return players.filter(player => state.fighters.some(fighter => fighter.owner === player && isStanding(fighter)));
}

/** The sides with someone still standing (§29.6). In a free-for-all, the players who have. */
export function sidesStanding(state: BattleState): string[] {
    return [...new Set(state.fighters.filter(isStanding).map(fighter => sideOf(state, fighter.owner)))];
}

/** Whether the battle is over: the turn limit has been played out, or at most one side is left (§5.1). */
export function isBattleOver(state: BattleState, players: readonly string[], roundsPlayed: number): boolean {
    return roundsPlayed >= battleRounds(players.length) || sidesStanding(state).length <= 1;
}

/** The points' worth of a side still standing: the first tie-break. In a free-for-all, a player's squad (`sideOf`). */
export function standingPoints(state: BattleState, side: string): number {
    return squadPoints(state.fighters.filter(fighter => sideOf(state, fighter.owner) === side && isStanding(fighter)).map(fighter => fighter.character));
}

/**
 * The players from first to last, ranked by side (§29.6). The side with the
 * highest score — its players' added together — wins; level scores go to the
 * one with more points' worth still standing, and if that's level too, to
 * the side with the later seat, which makes up for the advantage of going
 * early (§5.1). Teammates rank together, by their own scores and then the
 * later seat. The last link never ties, so every battle has a winner. In a
 * free-for-all every side is one player, so it's that player's score, squad
 * and seat.
 */
export function standings(state: BattleState, players: readonly string[], scores: Readonly<Record<string, number>>): string[] {
    const seat = new Map(players.map((player, index) => [player, index]));
    const team = (side: string) => players.filter(player => sideOf(state, player) === side);
    const score = (side: string) => team(side).reduce((total, player) => total + (scores[player] ?? 0), 0);
    const lastSeat = (side: string) => Math.max(...team(side).map(player => seat.get(player) ?? 0));
    return [...players].sort((a, b) => {
        const [x, y] = [sideOf(state, a), sideOf(state, b)];
        return score(y) - score(x)
            || standingPoints(state, y) - standingPoints(state, x)
            || lastSeat(y) - lastSeat(x)
            // Only teammates get this far: in a free-for-all the seat has decided it.
            || (scores[b] ?? 0) - (scores[a] ?? 0)
            || (seat.get(b) ?? 0) - (seat.get(a) ?? 0);
    });
}

// ─── Mustering (§5, §17.2) ──────────────────────────────────────────────────

export interface MusterPick {
    character: CharacterId;
    square: Square;
    /** The one item it carries into battle, if any (§21.1). */
    item?: ItemId;
    /** The option it's mustered with, if any: one its owner's rank with the character unlocks (§23.2). */
    option?: OptionId;
}

/** A pick as `musterRefusal` checked it, and nothing else a request carried: no `item` or `option` key at all when it has none. */
export function pickOf({ character, square, item, option }: MusterPick): MusterPick {
    return { character, square, ...(item ? { item } : {}), ...(option ? { option } : {}) };
}

/** What a muster costs: its characters, and the items they carry (§21.1). */
export function musterPoints(picks: readonly MusterPick[]): number {
    return squadPoints(picks.map(pick => pick.character)) + itemsPoints(picks.map(pick => pick.item));
}

/**
 * Why a pick's option can't be mustered, or undefined when it can (§23.2):
 * none at all, or one of that character's that `ranks` — the player's own, as
 * the battle snapshotted them when it was created (§23.3) — has unlocked. The
 * client never claims an option; it only sends the pick.
 */
function optionRefusal(pick: Partial<MusterPick>, character: CharacterId, ranks: Ranks): string | undefined {
    if (pick.option == null) return undefined;
    if (!isOptionId(pick.option) || OPTIONS[pick.option].character !== character) return "That isn't an option for that character";
    return (ranks[character] ?? 0) >= OPTIONS[pick.option].rank ? undefined : "That option isn't unlocked yet";
}

/**
 * Why a squad can't muster, or undefined when it can: at least one
 * character, each from its faction's roster (§29.3), as many of any one as the budget buys, at most one item each,
 * at most one option each that `ranks` unlocks, within the budget with the
 * items, and each on its own square of the seat's deployment zone. Total,
 * like `check`.
 */
export function musterRefusal(field: Battlefield, seat: number, picks: unknown, budget: number, ranks: Ranks, faction: Faction): string | undefined {
    if (!Array.isArray(picks) || picks.length === 0) return "Muster at least one character";
    const zone = new Set(Array.isArray(field.deployments[seat]) ? field.deployments[seat] : []);
    const squares = new Set<Square>();
    for (const pick of picks as Partial<MusterPick>[]) {
        if (!isCharacterId(pick?.character)) return "That isn't a character";
        if (!faction.characters.includes(pick.character)) return "That character isn't in your faction";
        // One slot, so an item is one id or nothing: never a list (§21.1).
        if (pick.item != null && !isItemId(pick.item)) return "That isn't an item";
        const option = optionRefusal(pick, pick.character, ranks);
        if (option) return option;
        if (!zone.has(pick.square as Square) || squares.has(pick.square as Square)) return "Each character needs its own square in your deployment zone";
        squares.add(pick.square as Square);
    }
    const points = musterPoints(picks as MusterPick[]);
    return points <= budget ? undefined : `That squad costs ${points} points, and the budget is ${budget}`;
}

/** A character as it first stands on the battlefield, at full HP with nothing spent, carrying what it was mustered with. */
export function newFighter(id: number, owner: string, character: CharacterId, square: Square, item: ItemId | null = null, option?: OptionId): Fighter {
    return { id, owner, character, square, hp: CHARACTERS[character].hp, ap: 0, banked: 0, effects: {}, cooldowns: {}, spent: [], item, ...(option ? { option } : {}) };
}

/**
 * A fighter read back from storage, in full. An empty `cooldowns` or
 * `effects` doesn't survive every way a document is copied — a Mongoose
 * insert minimises it away — and every rule here reads both. A fighter from
 * before items carries none.
 */
export function storedFighter(fighter: Fighter): Fighter {
    return {
        ...fighter, effects: { ...fighter.effects }, cooldowns: { ...fighter.cooldowns }, spent: [...(fighter.spent ?? [])], item: fighter.item ?? null,
        // Copied, so an undo snapshot never shares it with the live fighter.
        ...(fighter.tally ? { tally: addTally(fighter.tally, NO_TALLY) } : {}),
    };
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
