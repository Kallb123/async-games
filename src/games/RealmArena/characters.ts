// Realm Arena's first faction as data (docs/games/realm-arena.md §13.6): the
// six characters a squad is bought from, their weapons and abilities, the
// options mastery unlocks for them (§23.2), the items they can carry (§21),
// the points budget, and the ready-made squad a timed-out muster gets (§17.2).
// The numbers are §13's first guesses for playtesting, not balance — tuning
// one is an edit here, and `rules.ts` reads them rather than repeating them.
//
// Pure data, with no server-only imports, so the muster screen and the board
// read the same table the commands do.

import { FULL_HEIGHT } from "@/utils/games/battlefield/terrain";

export type CharacterId = "manAtArms" | "knight" | "archer" | "scout" | "mage" | "cleric";

export type AbilityId =
    | "cleave" | "shieldWall" | "aimedShot" | "sneak" | "fireball" | "heal" | "raise"
    // The abilities an option swaps in (§23.2).
    | "shieldBash" | "demolish" | "cripplingShot" | "huntersMark" | "purify";

/**
 * Something that happens to a character for a few of its owner's turns
 * (§20.1): the four conditions, and the two stances a character takes itself.
 */
export type EffectId = "burning" | "stunned" | "slowed" | "marked" | "hunkered" | "shieldWall";

export interface Effect {
    name: string;
    /** How it reads on a character: "Bob's Knight is burning". */
    state: string;
    /**
     * The count it's applied with. It works as a cooldown does: down by one at
     * the start of each of the affected character's own turns, gone at 0
     * (§20.1).
     */
    count: number;
    /** Damage at the start of each of its owner's turns while it lasts (Burning). */
    damage?: number;
    /** The AP its owner's next turn starts with, instead of the usual (Stunned). */
    ap?: number;
    /** Added to every shot at it, reactions included (Marked). */
    hitBonus?: number;
    /** Whether a Cleric's Heal clears it (§20.2). */
    healed?: true;
}

export const EFFECTS = {
    burning: { name: "Burning", state: "burning", count: 2, damage: 1, healed: true },
    stunned: { name: "Stunned", state: "stunned", count: 1, ap: 2, healed: true },
    slowed: { name: "Slowed", state: "slowed", count: 2, healed: true },
    marked: { name: "Marked", state: "marked", count: 2, hitBonus: 15 },
    hunkered: { name: "Hunkered down", state: "hunkered down", count: 1 },
    shieldWall: { name: "Shield wall", state: "holding a shield wall", count: 1 },
} as const satisfies Record<EffectId, Effect>;

/** Every effect, in the order a character's are listed. */
export const EFFECT_IDS = Object.keys(EFFECTS) as EffectId[];

/** The effects something else puts on a character, rather than stances it takes up itself. */
export type Affliction = Exclude<EffectId, "hunkered" | "shieldWall">;

/** Every affliction, in `EFFECT_IDS` order: what Purify clears (§23.2). */
export const AFFLICTIONS = EFFECT_IDS.filter((effect): effect is Affliction => effect !== "hunkered" && effect !== "shieldWall");

/**
 * A melee weapon needs its target next to it and always hits; a ranged one
 * rolls (§13.3), and may leave an effect on whoever it hits — only on a hit,
 * not a graze (§20.2), and on overwatch as much as on the owner's turn.
 */
export type Weapon =
    | { name: string; kind: "melee"; damage: number }
    | { name: string; kind: "ranged"; damage: number; accuracy: number; range: number; effect?: Affliction };

export interface Ability {
    name: string;
    /** AP to use it. Sneak's is per movement allowance, as a move's 1 AP is (§13.2). */
    ap: number;
    /** Turns before it can be used again: set on use, and counted down at the start of each of its owner's turns (§13.5). */
    cooldown: number;
    /** Usable once per battle at most, whatever the cooldown (the Cleric's Raise). */
    oncePerBattle?: true;
    /** Added to a shot's chance to hit (Aimed shot). */
    hitBonus?: number;
    /** How far away, in squares, it can be aimed (Fireball, Hunter's mark). */
    range?: number;
    /** What it does to each character it hits, in place of the weapon's (Fireball, Shield bash, Demolish). */
    damage?: number;
    /** HP it restores (Heal, Purify). */
    hp?: number;
    /** What it leaves on everyone it hits: Fireball's burning, and the options' (§23.2). A shot leaves it only on a hit (§20.2). */
    effect?: Affliction;
    /** Blasts away the low cover in the 3×3 round where it lands, after its damage (Fireball, §22). */
    blasts?: true;
    description: string;
}

export const ABILITIES = {
    cleave: { name: "Cleave", ap: 2, cooldown: 3, description: "Strike two enemies next to them" },
    shieldWall: { name: "Shield wall", ap: 2, cooldown: 3, description: "Allies next to the Knight count as in half cover until its next turn" },
    aimedShot: { name: "Aimed shot", ap: 3, cooldown: 2, hitBonus: 20, description: "A shot at +20% to hit" },
    sneak: { name: "Sneak", ap: 2, cooldown: 0, description: "Move without setting off overwatch or guard" },
    fireball: { name: "Fireball", ap: 3, cooldown: 3, range: 12, damage: 3, effect: "burning", blasts: true, description: "Hits every character in a 3×3 area, friend or foe, sets them burning, and blasts away the low cover there" },
    heal: { name: "Heal", ap: 2, cooldown: 2, hp: 4, description: "Restore 4 HP to an ally next to them, and clear burning, slowed and stunned" },
    raise: { name: "Raise", ap: 3, cooldown: 0, oncePerBattle: true, description: "Bring a downed ally next to them back at half HP, once per battle" },
    shieldBash: { name: "Shield bash", ap: 2, cooldown: 3, damage: 2, effect: "stunned", description: "Strike one enemy next to them for 2, and stun it" },
    demolish: { name: "Demolish", ap: 2, cooldown: 2, damage: 2, description: "Blast away one square of low cover next to them, and strike everyone else beside it for 2, friend or foe" },
    cripplingShot: { name: "Crippling shot", ap: 3, cooldown: 2, effect: "slowed", description: "A shot that slows on a hit" },
    huntersMark: { name: "Hunter's mark", ap: 1, cooldown: 2, range: 12, effect: "marked", description: "Mark an enemy it can see within 12 squares: +15% to hit it, for every attacker" },
    purify: { name: "Purify", ap: 2, cooldown: 3, hp: 2, description: "Clear burning, stunned, slowed and marked from itself and each ally next to it, and give each 2 HP" },
} as const satisfies Record<AbilityId, Ability>;

export interface Character {
    name: string;
    role: string;
    /** Movement points each AP spent on moving buys (§13.2). */
    movement: number;
    /** How far one step can climb up or down, in quarters, where it climbs better than `DEFAULT_CLIMB` (§25.2). */
    climb?: number;
    hp: number;
    weapon: Weapon;
    abilities: readonly AbilityId[];
    points: number;
}

export const CHARACTERS: Readonly<Record<CharacterId, Character>> = {
    manAtArms: {
        name: "Man-at-arms", role: "Cheap front line", movement: 6, hp: 8,
        weapon: { name: "Sword", kind: "melee", damage: 4 }, abilities: ["cleave"], points: 15,
    },
    knight: {
        name: "Knight", role: "Slow and very tough", movement: 4, hp: 12,
        weapon: { name: "Mace", kind: "melee", damage: 4 }, abilities: ["shieldWall"], points: 25,
    },
    archer: {
        name: "Archer", role: "Long range; the overwatch specialist", movement: 6, hp: 6,
        weapon: { name: "Bow", kind: "ranged", damage: 3, accuracy: 80, range: 20 }, abilities: ["aimedShot"], points: 20,
    },
    scout: {
        name: "Scout", role: "Fastest and fragile; the flanker", movement: 8, climb: FULL_HEIGHT, hp: 6,
        weapon: { name: "Knives", kind: "melee", damage: 3 }, abilities: ["sneak"], points: 20,
    },
    mage: {
        name: "Mage", role: "Fragile; hits an area", movement: 6, hp: 5,
        weapon: { name: "Bolt", kind: "ranged", damage: 3, accuracy: 70, range: 10 }, abilities: ["fireball"], points: 30,
    },
    cleric: {
        name: "Cleric", role: "Support", movement: 6, hp: 7,
        weapon: { name: "Staff", kind: "melee", damage: 2 }, abilities: ["heal", "raise"], points: 25,
    },
};

export type OptionId = "shieldBash" | "demolish" | "cripplingShot" | "huntersMark" | "frostBolt" | "purify";

/**
 * A swap of one part of a character's kit for another, unlocked by mastery
 * and picked per figure at muster (§23.2): one ability for another, or the
 * weapon. A sidegrade that costs what the kit it replaces does, so a squad's
 * points don't change. A figure with no option is the starter character.
 */
export type CharacterOption = {
    character: CharacterId;
    /**
     * The rank with its character that unlocks it (§23.1). Once an option has
     * a rank it keeps it, so a replay checks an old muster as it was checked
     * (§23.3).
     */
    rank: 1 | 2 | 3;
} & ({ replaces: AbilityId; ability: AbilityId } | { replaces: "weapon"; weapon: Weapon });

/** The rank-1 options (§23.2). The rank-2 and rank-3 ones wait on a playtest. */
export const OPTIONS = {
    shieldBash: { character: "manAtArms", rank: 1, replaces: "cleave", ability: "shieldBash" },
    demolish: { character: "knight", rank: 1, replaces: "shieldWall", ability: "demolish" },
    cripplingShot: { character: "archer", rank: 1, replaces: "aimedShot", ability: "cripplingShot" },
    huntersMark: { character: "scout", rank: 1, replaces: "sneak", ability: "huntersMark" },
    frostBolt: { character: "mage", rank: 1, replaces: "weapon", weapon: { name: "Frost bolt", kind: "ranged", damage: 2, accuracy: 70, range: 10, effect: "slowed" } },
    purify: { character: "cleric", rank: 1, replaces: "raise", ability: "purify" },
} as const satisfies Record<OptionId, CharacterOption>;

export function isOptionId(value: unknown): value is OptionId {
    return typeof value === "string" && Object.hasOwn(OPTIONS, value);
}

/** An option's name: the ability or the weapon it swaps in. */
export function optionName(id: OptionId): string {
    const option: CharacterOption = OPTIONS[id];
    return "weapon" in option ? option.weapon.name : ABILITIES[option.ability].name;
}

/** What a character fights with, once its option — if it was mustered with one — has swapped its part in. */
export interface Kit {
    weapon: Weapon;
    abilities: readonly AbilityId[];
}

export function kitOf(character: CharacterId, option?: OptionId): Kit {
    const { weapon, abilities } = CHARACTERS[character];
    const swap: CharacterOption | undefined = option ? OPTIONS[option] : undefined;
    if (!swap || swap.character !== character) return { weapon, abilities };
    return "weapon" in swap
        ? { weapon: swap.weapon, abilities }
        : { weapon, abilities: abilities.map(id => id === swap.replaces ? swap.ability : id) };
}

export type ItemId = "fireFlask" | "thunderFlask" | "smokePot" | "healingDraught";

/** How far away, in squares, an item can be thrown (§21.1). */
export const THROW_RANGE = 6;

/**
 * Something a character carries into battle, bought at muster and used once
 * (§21.1). A thrown one is aimed at a square in range and in sight, as a
 * fireball is, and never rolls; the healing draught is handed to an ally next
 * to the carrier, as a heal is, or drunk by the carrier itself.
 */
export interface Item {
    name: string;
    /** What it adds to a squad's cost at muster. */
    points: number;
    ap: number;
    /** How far away, in squares, it can be thrown: absent for one that isn't thrown. */
    range?: number;
    /** Lands on the 3×3 around the square it's thrown at, rather than that square alone. */
    area?: true;
    /** What it does to each character it hits (the fire flask). */
    damage?: number;
    /** What it leaves on each character it hits, friend or foe. */
    effect?: Affliction;
    /** Blasts away the low cover on and next to the square it lands on, after its damage (the fire flask, §22). */
    blasts?: true;
    /**
     * Taken off every shot at a character standing in the smoke pot's cloud,
     * until the thrower's next turn — and overwatch can't fire at all at a
     * mover stepping into it. The rules name the smoke pot for its cloud.
     */
    hitPenalty?: number;
    /** HP it restores (the healing draught), clearing what a Cleric's Heal does too. */
    hp?: number;
    description: string;
}

export const ITEMS = {
    fireFlask: { name: "Fire flask", points: 5, ap: 2, range: THROW_RANGE, damage: 2, effect: "burning", blasts: true, description: "Thrown at one square: 2 damage to whoever is there, sets them burning, and blasts away the low cover on and next to it" },
    thunderFlask: { name: "Thunder flask", points: 5, ap: 2, range: THROW_RANGE, area: true, effect: "stunned", description: "Thrown at a 3×3 area: stuns everyone in it, friend or foe" },
    smokePot: { name: "Smoke pot", points: 5, ap: 1, range: THROW_RANGE, area: true, hitPenalty: 20, description: "Thrown at a 3×3 area: until the thrower's next turn, −20% to hit anyone in it, and no overwatch at anyone stepping into it" },
    healingDraught: { name: "Healing draught", points: 5, ap: 1, hp: 3, description: "Restore 3 HP to the carrier or an ally next to them, and clear burning, slowed and stunned" },
} as const satisfies Record<ItemId, Item>;

/** Every item, in the order the muster offers them. */
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

export function isItemId(value: unknown): value is ItemId {
    return typeof value === "string" && Object.hasOwn(ITEMS, value);
}

export type PlayerCount = 2 | 3 | 4;

/** Each player's points to muster with, which shrinks as players are added (§13.6). */
export const POINTS_BUDGET: Record<PlayerCount, number> = { 2: 100, 3: 80, 4: 70 };

/** No squad takes more than this many of any one character (§13.6). */
export const MAX_OF_EACH = 2;

export function isCharacterId(value: unknown): value is CharacterId {
    return typeof value === "string" && Object.hasOwn(CHARACTERS, value);
}

/** What a squad costs to muster. */
export function squadPoints(squad: readonly CharacterId[]): number {
    return squad.reduce((total, character) => total + CHARACTERS[character].points, 0);
}

export interface Faction {
    name: string;
    /** The squad a muster that runs out of time gets, by player count — spending the whole budget, within `MAX_OF_EACH` (§17.2). */
    readyMade: Readonly<Record<PlayerCount, readonly CharacterId[]>>;
}

/** The human kingdom both games are named for, and the first faction (§13.6). */
export const REALM: Faction = {
    name: "The Realm",
    readyMade: {
        2: ["knight", "manAtArms", "manAtArms", "archer", "cleric"],
        3: ["knight", "manAtArms", "archer", "scout"],
        4: ["manAtArms", "manAtArms", "archer", "scout"],
    },
};
