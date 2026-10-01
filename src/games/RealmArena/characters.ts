// Realm Arena's first faction as data (docs/games/realm-arena.md §13.6): the
// six characters a squad is bought from, their weapons and abilities, the
// points budget, and the ready-made squad a timed-out muster gets (§17.2).
// The numbers are §13's first guesses for playtesting, not balance — tuning
// one is an edit here, and `rules.ts` reads them rather than repeating them.
//
// Pure data, with no server-only imports, so the muster screen and the board
// read the same table the commands do.

export type CharacterId = "manAtArms" | "knight" | "archer" | "scout" | "mage" | "cleric";

export type AbilityId = "cleave" | "shieldWall" | "aimedShot" | "sneak" | "fireball" | "heal" | "raise";

/** A melee weapon needs its target next to it and always hits; a ranged one rolls (§13.3). */
export type Weapon =
    | { name: string; kind: "melee"; damage: number }
    | { name: string; kind: "ranged"; damage: number; accuracy: number; range: number };

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
    /** How far away, in squares, it can be aimed (Fireball). */
    range?: number;
    /** What it does to each character it hits (Fireball). */
    damage?: number;
    /** HP it restores (Heal). */
    hp?: number;
    description: string;
}

export const ABILITIES = {
    cleave: { name: "Cleave", ap: 2, cooldown: 3, description: "Strike two enemies next to them" },
    shieldWall: { name: "Shield wall", ap: 2, cooldown: 3, description: "Allies next to the Knight count as in half cover until its next turn" },
    aimedShot: { name: "Aimed shot", ap: 3, cooldown: 2, hitBonus: 20, description: "A shot at +20% to hit" },
    sneak: { name: "Sneak", ap: 2, cooldown: 0, description: "Move without setting off overwatch or guard" },
    fireball: { name: "Fireball", ap: 3, cooldown: 3, range: 12, damage: 3, description: "Hits every character in a 3×3 area, friend or foe" },
    heal: { name: "Heal", ap: 2, cooldown: 2, hp: 4, description: "Restore 4 HP to an ally next to them" },
    raise: { name: "Raise", ap: 3, cooldown: 0, oncePerBattle: true, description: "Bring a downed ally next to them back at half HP, once per battle" },
} as const satisfies Record<AbilityId, Ability>;

export interface Character {
    name: string;
    role: string;
    /** Movement points each AP spent on moving buys (§13.2). */
    movement: number;
    hp: number;
    weapon: Weapon;
    abilities: readonly AbilityId[];
    points: number;
}

export const CHARACTERS = {
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
        name: "Scout", role: "Fastest and fragile; the flanker", movement: 8, hp: 6,
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
} as const satisfies Record<CharacterId, Character>;

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
    characters: readonly CharacterId[];
    /** The squad a muster that runs out of time gets, by player count — spending the whole budget, within `MAX_OF_EACH` (§17.2). */
    readyMade: Readonly<Record<PlayerCount, readonly CharacterId[]>>;
}

/** The human kingdom both games are named for, and the first faction (§13.6). */
export const REALM: Faction = {
    name: "The Realm",
    characters: ["manAtArms", "knight", "archer", "scout", "mage", "cleric"],
    readyMade: {
        2: ["knight", "manAtArms", "manAtArms", "archer", "cleric"],
        3: ["knight", "manAtArms", "archer", "scout"],
        4: ["manAtArms", "manAtArms", "archer", "scout"],
    },
};
