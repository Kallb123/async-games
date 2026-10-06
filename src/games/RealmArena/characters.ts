// Realm Arena's characters and factions as data (docs/games/realm-arena.md
// §13.6, §29.3): every character a squad is bought from, their weapons and
// abilities, the options mastery unlocks for them (§23.2), the items they can
// carry (§21), the points budget, and each faction's roster and the
// ready-made squad a timed-out muster gets (§17.2).
// The numbers are §13's first guesses for playtesting, not balance — tuning
// one is an edit here, and `rules.ts` reads them rather than repeating them.
//
// Pure data, with no server-only imports, so the muster screen and the board
// read the same table the commands do.

import { FULL_HEIGHT } from "@/utils/games/battlefield/terrain";

export type CharacterId =
    | "manAtArms" | "knight" | "archer" | "scout" | "mage" | "cleric"
    // The Swarm's (§31).
    | "skitterling" | "ravager" | "spitter" | "bloater" | "broodmother";

export type AbilityId =
    | "cleave" | "shieldWall" | "aimedShot" | "sneak" | "fireball" | "heal" | "raise"
    // The abilities an option swaps in (§23.2).
    | "shieldBash" | "demolish" | "cripplingShot" | "huntersMark" | "purify"
    // The Swarm's (§31).
    | "rend" | "regrowth" | "burst";

/**
 * Something that happens to a character for a few of its owner's turns
 * (§20.1): the five conditions, and the two stances a character takes itself.
 */
export type EffectId = "burning" | "stunned" | "slowed" | "marked" | "corroded" | "hunkered" | "shieldWall";

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
    /** Added to every shot at it, reactions included (Marked, Corroded). */
    hitBonus?: number;
    /** Whether a Cleric's Heal clears it (§20.2). */
    healed?: true;
}

export const EFFECTS = {
    burning: { name: "Burning", state: "burning", count: 2, damage: 1, healed: true },
    stunned: { name: "Stunned", state: "stunned", count: 1, ap: 2, healed: true },
    slowed: { name: "Slowed", state: "slowed", count: 2, healed: true },
    marked: { name: "Marked", state: "marked", count: 2, hitBonus: 15 },
    // The Swarm's acid, eating through armour (§31.2): easier to hit, and a heal washes it off.
    corroded: { name: "Corroded", state: "corroded", count: 2, hitBonus: 10, healed: true },
    hunkered: { name: "Hunkered down", state: "hunkered down", count: 1 },
    shieldWall: { name: "Shield wall", state: "holding a shield wall", count: 1 },
} as const satisfies Record<EffectId, Effect>;

/** Every effect, in the order a character's are listed. */
export const EFFECT_IDS = Object.keys(EFFECTS) as EffectId[];

/** The effects a character takes up itself. */
const STANCES = ["hunkered", "shieldWall"] as const satisfies readonly EffectId[];

/** The effects something else puts on a character, rather than stances it takes up itself. */
export type Affliction = Exclude<EffectId, typeof STANCES[number]>;

/** Every affliction, in `EFFECT_IDS` order: what Purify clears (§23.2). */
export const AFFLICTIONS = EFFECT_IDS.filter((effect): effect is Affliction => !(STANCES as readonly EffectId[]).includes(effect));

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
    /** How far away, in squares, it can be aimed (Fireball, Hunter's mark, Heal, Regrowth). */
    range?: number;
    /** What it does to each character it hits, in place of the weapon's (Fireball, Shield bash, Demolish, Rend, Burst). */
    damage?: number;
    /** HP it restores (Heal, Purify, Regrowth). */
    hp?: number;
    /** What it leaves on everyone it hits: Fireball's burning, and the options' (§23.2). A shot leaves it only on a hit (§20.2). */
    effect?: Affliction;
    /**
     * Blasts away low cover after its damage (§22): every square of it in the
     * 3×3 round where it lands (`area`, Fireball), or the one square it's aimed
     * at (`target`, Demolish).
     */
    blasts?: "area" | "target";
    description: string;
}

export const ABILITIES = {
    cleave: { name: "Cleave", ap: 2, cooldown: 3, description: "Strike two enemies next to them" },
    shieldWall: { name: "Shield wall", ap: 2, cooldown: 3, description: "Allies next to the Knight count as in half cover until its next turn" },
    aimedShot: { name: "Aimed shot", ap: 3, cooldown: 2, hitBonus: 20, description: "A shot at +20% to hit" },
    sneak: { name: "Sneak", ap: 2, cooldown: 0, description: "Move without setting off overwatch or guard" },
    fireball: { name: "Fireball", ap: 3, cooldown: 3, range: 12, damage: 3, effect: "burning", blasts: "area", description: "Hits every character in a 3×3 area, friend or foe, sets them burning, and blasts away the low cover there" },
    heal: { name: "Heal", ap: 2, cooldown: 2, range: 12, hp: 4, description: "Restore 4 HP to an ally it can see within 12 squares, and clear burning, slowed, stunned and corroded" },
    raise: { name: "Raise", ap: 3, cooldown: 0, oncePerBattle: true, description: "Bring a downed ally next to them back at half HP, once per battle" },
    shieldBash: { name: "Shield bash", ap: 2, cooldown: 3, damage: 2, effect: "stunned", description: "Strike one enemy next to them for 2, and stun it" },
    demolish: { name: "Demolish", ap: 2, cooldown: 2, damage: 2, blasts: "target", description: "Blast away one square of low cover next to them, and strike everyone else beside it for 2, friend or foe" },
    cripplingShot: { name: "Crippling shot", ap: 3, cooldown: 2, effect: "slowed", description: "A shot that slows on a hit" },
    huntersMark: { name: "Hunter's mark", ap: 1, cooldown: 2, range: 12, effect: "marked", description: "Mark an enemy it can see within 12 squares: +15% to hit it, for every attacker" },
    purify: { name: "Purify", ap: 2, cooldown: 3, hp: 2, description: "Clear burning, stunned, slowed, marked and corroded from itself and each ally next to it, and give each 2 HP" },
    rend: { name: "Rend", ap: 3, cooldown: 3, damage: 6, description: "Tear into one enemy next to them for 6" },
    regrowth: { name: "Regrowth", ap: 2, cooldown: 2, range: 8, hp: 3, description: "Restore 3 HP to an ally it can see within 8 squares, and clear burning, slowed, stunned and corroded" },
    burst: { name: "Burst", ap: 1, cooldown: 0, oncePerBattle: true, damage: 3, effect: "corroded", description: "Burst, splashing acid on everyone next to it for 3, friend or foe, and corroding them. The Bloater is downed" },
} as const satisfies Record<AbilityId, Ability>;

export interface Character {
    name: string;
    role: string;
    /** Movement points each AP spent on moving buys (§13.2). */
    movement: number;
    /** How far one step can climb up or down, in quarters, where it climbs better than `DEFAULT_CLIMB` (§25.2). */
    climb?: number;
    /** How far it sees in fog of war, in squares, where it sees further or less far than most (`SIGHT_RANGE`, §27). */
    sight?: number;
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
        name: "Knight", role: "Slow and very tough", movement: 4, sight: 15, hp: 12,
        weapon: { name: "Mace", kind: "melee", damage: 4 }, abilities: ["shieldWall"], points: 25,
    },
    archer: {
        name: "Archer", role: "Long range; the overwatch specialist", movement: 6, sight: 25, hp: 6,
        weapon: { name: "Bow", kind: "ranged", damage: 3, accuracy: 80, range: 20 }, abilities: ["aimedShot"], points: 20,
    },
    scout: {
        name: "Scout", role: "Fastest and fragile; the flanker", movement: 8, climb: FULL_HEIGHT, sight: 25, hp: 6,
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
    // The Swarm (§31): cheaper and weaker, one for one, than the Realm's.
    skitterling: {
        name: "Skitterling", role: "Fast and frail; strikes in numbers", movement: 8, climb: FULL_HEIGHT, hp: 4,
        weapon: { name: "Claws", kind: "melee", damage: 2 }, abilities: [], points: 10,
    },
    ravager: {
        name: "Ravager", role: "Bulky brawler; hits hard", movement: 5, hp: 9,
        weapon: { name: "Scything talons", kind: "melee", damage: 4 }, abilities: ["rend"], points: 20,
    },
    spitter: {
        name: "Spitter", role: "Spits acid from its raised tail", movement: 5, hp: 5,
        weapon: { name: "Acid spit", kind: "ranged", damage: 2, accuracy: 70, range: 12, effect: "corroded" }, abilities: [], points: 15,
    },
    bloater: {
        name: "Bloater", role: "Slow sac of acid; bursts among the enemy", movement: 4, hp: 6,
        weapon: { name: "Barbs", kind: "melee", damage: 1 }, abilities: ["burst"], points: 10,
    },
    broodmother: {
        name: "Broodmother", role: "Leads the brood; mends it", movement: 5, sight: 25, hp: 8,
        weapon: { name: "Talons", kind: "melee", damage: 3 }, abilities: ["regrowth"], points: 20,
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

/** What a character fights with, once its option — if it was mustered with one — has swapped its part in. */
export interface Kit {
    weapon: Weapon;
    abilities: readonly AbilityId[];
}

/** Each character's kit with no option, made once: the computer asks for a weapon many thousand times a turn. */
const STARTER_KITS = Object.fromEntries(Object.entries(CHARACTERS).map(([id, { weapon, abilities }]) => [id, Object.freeze({ weapon, abilities })])) as Record<CharacterId, Kit>;

export function kitOf(character: CharacterId, option?: OptionId): Kit {
    const { weapon, abilities } = CHARACTERS[character];
    const swap: CharacterOption | undefined = option ? OPTIONS[option] : undefined;
    if (!swap || swap.character !== character) return STARTER_KITS[character];
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
 * to the carrier, or drunk by the carrier itself.
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
    blasts?: "area";
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
    fireFlask: { name: "Fire flask", points: 5, ap: 2, range: THROW_RANGE, damage: 2, effect: "burning", blasts: "area", description: "Thrown at one square: 2 damage to whoever is there, sets them burning, and blasts away the low cover on and next to it" },
    thunderFlask: { name: "Thunder flask", points: 5, ap: 2, range: THROW_RANGE, area: true, effect: "stunned", description: "Thrown at a 3×3 area: stuns everyone in it, friend or foe" },
    smokePot: { name: "Smoke pot", points: 5, ap: 1, range: THROW_RANGE, area: true, hitPenalty: 20, description: "Thrown at a 3×3 area: until the thrower's next turn, −20% to hit anyone in it, and no overwatch at anyone stepping into it" },
    healingDraught: { name: "Healing draught", points: 5, ap: 1, hp: 3, description: "Restore 3 HP to the carrier or an ally next to them, and clear burning, slowed, stunned and corroded" },
} as const satisfies Record<ItemId, Item>;

/** Every item, in the order the muster offers them. */
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

export function isItemId(value: unknown): value is ItemId {
    return typeof value === "string" && Object.hasOwn(ITEMS, value);
}

export type PlayerCount = 2 | 3 | 4;

/**
 * Every budget a squad can be mustered with, smallest first (§30.5): each
 * faction has a ready-made squad for each. A battle's size and a co-op
 * battle's difficulty each move a squad up or down this ladder.
 */
export const BUDGETS = [50, 60, 70, 80, 90, 100, 110, 120] as const;
export type Budget = (typeof BUDGETS)[number];

/** How big a battle is, as the host chose it (§30.5): what every squad in it musters. */
export type BattleSize = "small" | "normal" | "large";
/** How strong the computer's warbands are in co-op, as the host chose it (§30.5). */
export type Difficulty = "easy" | "normal" | "hard";

export const BATTLE_SIZE_NAMES: Readonly<Record<BattleSize, string>> = { small: "Small", normal: "Normal", large: "Large" };
export const DIFFICULTY_NAMES: Readonly<Record<Difficulty, string>> = { easy: "Easy", normal: "Normal", hard: "Hard" };

/** Each player's points to muster with in a normal-sized battle, which shrinks as players are added (§13.6). */
const NORMAL_BUDGET: Readonly<Record<PlayerCount, Budget>> = { 2: 100, 3: 80, 4: 70 };

/** How many rungs of `BUDGETS` a battle's size moves every squad in it from a normal battle's. */
const SIZE_RUNGS: Readonly<Record<BattleSize, number>> = { small: -2, normal: 0, large: 2 };

/** How many rungs of `BUDGETS` a warband stands from the players' budget, by difficulty (§30.5). */
const DIFFICULTY_RUNGS: Readonly<Record<Difficulty, number>> = { easy: -1, normal: 0, hard: 2 };

const rung = (budget: Budget, steps: number): Budget => BUDGETS[BUDGETS.indexOf(budget) + steps];

/** Each player's points to muster with (§13.6, §30.5): the party's normal budget, moved by the battle's size. */
export function musterBudget(playerCount: number, coop: boolean, size: BattleSize = "normal"): Budget {
    return rung(NORMAL_BUDGET[musterSize(playerCount, coop)], SIZE_RUNGS[size]);
}

/**
 * Each co-op warband's points (§30.5): the players' budget, moved by the
 * difficulty. A warband always musters its faction's ready-made squad for it.
 */
export function warbandBudget(playerCount: number, size: BattleSize = "normal", difficulty: Difficulty = "normal"): Budget {
    return rung(musterBudget(playerCount, true, size), DIFFICULTY_RUNGS[difficulty]);
}

/** A faction's ready-made squad for a budget: none for one off the ladder, which only a client could hold. */
export function readyMadeSquad(faction: Faction, budget: number): readonly CharacterId[] {
    return faction.readyMade[budget as Budget] ?? [];
}

export function isCharacterId(value: unknown): value is CharacterId {
    return typeof value === "string" && Object.hasOwn(CHARACTERS, value);
}

/** What a squad costs to muster. */
export function squadPoints(squad: readonly CharacterId[]): number {
    return squad.reduce((total, character) => total + CHARACTERS[character].points, 0);
}

/**
 * A side's army (docs/games/realm-arena.md §29.3): the characters it can
 * muster, its ready-made squads, and what it's called as the enemy in co-op.
 * Character ids are unique across every faction, so a fighter needs only its
 * `character` to be known, and every rule reads `CHARACTERS` whoever it's for.
 */
export interface Faction {
    name: string;
    /** The characters it musters from, in the order the muster lists them; each in no other faction's roster. */
    characters: readonly CharacterId[];
    /**
     * The squad a muster that runs out of time gets, and every warband
     * musters, by budget — each spending the whole of it (§17.2, §30.5). The
     * 70-, 80- and 100-point squads are what every battle before battle sizes
     * mustered, so they never change: a replay musters them again.
     */
    readyMade: Readonly<Record<Budget, readonly CharacterId[]>>;
    /**
     * What its characters are called when the computer fields them in co-op
     * (§29.3), as the log and the board name an owner: "the Renegades'
     * Archer". Its own name, unless the players could be fighting as it too.
     */
    enemyName: string;
}

export type FactionId = "realm" | "swarm";

/**
 * Every faction, by the id a battle stores. An id, once used, is never
 * renamed, as a map's isn't (§19.1).
 */
export const FACTIONS: Readonly<Record<FactionId, Faction>> = {
    // The human kingdom both games are named for, and the first faction (§13.6).
    // The players fight as it, so as the enemy it's a band of deserters.
    realm: {
        name: "The Realm",
        characters: ["manAtArms", "knight", "archer", "scout", "mage", "cleric"],
        readyMade: {
            50: ["manAtArms", "manAtArms", "archer"],
            60: ["knight", "manAtArms", "archer"],
            70: ["manAtArms", "manAtArms", "archer", "scout"],
            80: ["knight", "manAtArms", "archer", "scout"],
            90: ["knight", "manAtArms", "archer", "mage"],
            100: ["knight", "manAtArms", "manAtArms", "archer", "cleric"],
            110: ["knight", "manAtArms", "archer", "scout", "mage"],
            120: ["knight", "archer", "scout", "mage", "cleric"],
        },
        enemyName: "the Renegades",
    },
    // A brood of chitinous beasts out of the deep places (§31): more of them,
    // each cheaper and weaker than the Realm's, spending its budget on bodies.
    swarm: {
        name: "The Swarm",
        characters: ["skitterling", "ravager", "spitter", "bloater", "broodmother"],
        readyMade: {
            50: ["skitterling", "skitterling", "spitter", "spitter"],
            60: ["ravager", "skitterling", "spitter", "spitter"],
            70: ["ravager", "skitterling", "skitterling", "spitter", "spitter"],
            80: ["ravager", "skitterling", "skitterling", "spitter", "spitter", "bloater"],
            90: ["ravager", "broodmother", "skitterling", "skitterling", "spitter", "spitter"],
            100: ["ravager", "broodmother", "skitterling", "skitterling", "spitter", "spitter", "bloater"],
            110: ["ravager", "ravager", "broodmother", "skitterling", "skitterling", "spitter", "spitter"],
            120: ["ravager", "ravager", "broodmother", "skitterling", "skitterling", "spitter", "spitter", "bloater"],
        },
        enemyName: "the Swarm",
    },
};

/** The Realm: the first faction, and the one every player fought as before a squad could choose its own (B6). */
export const REALM = FACTIONS.realm;

/** Every faction's id: what Random is drawn from (§29.3), and what the host can let the players muster from (B6). */
export const FACTION_IDS = Object.keys(FACTIONS) as FactionId[];

export function isFactionId(value: unknown): value is FactionId {
    return typeof value === "string" && Object.hasOwn(FACTIONS, value);
}

/** The factions a battle that predates the host's choice lets its players muster from: the Realm alone. */
export const REALM_ONLY: readonly FactionId[] = ["realm"];

/**
 * The factions the host let the players muster from (B6), or undefined for
 * anything else a request could send: a list of known factions, at least one,
 * read back each once in `FACTION_IDS` order. What the setup route checks and
 * the invitation stores.
 */
export function playableFactionsOf(value: unknown): FactionId[] | undefined {
    if (!Array.isArray(value) || !value.every(isFactionId)) return undefined;
    const chosen = FACTION_IDS.filter(id => value.includes(id));
    return chosen.length > 0 ? chosen : undefined;
}

/** The faction a stored id names: the Realm for an id no release knows, as an unknown map reads as the Ruined Fort (§29.3). */
export function factionById(id: unknown): Faction {
    return isFactionId(id) ? FACTIONS[id] : REALM;
}

/** What the team calls an enemy it hasn't seen yet: a random one, until one of its characters is (§29.3). */
export const UNKNOWN_ENEMY = "the enemy";

/**
 * What the enemy is called (§29.3): its faction's `enemyName` — "the
 * Renegades" — once the team knows it, and "the enemy" while it doesn't. The
 * log, the board and the result all name it through this.
 */
export function enemyNameOf(enemy: FactionId | undefined): string {
    return enemy === undefined ? UNKNOWN_ENEMY : factionById(enemy).enemyName;
}

/** What the host picks to fight an enemy drawn at random as the battle is created, rather than a faction (§29.3). */
export const RANDOM_ENEMY = "random";

/** How many players a co-op team can be (§29.1): one battlefield for each (§29.2). */
export const COOP_PLAYERS = { min: 2, max: 3 } as const;

/** Whether a party of this size can play co-op: a team its battlefields are built for. */
export const fitsCoop = (players: number): boolean => players >= COOP_PLAYERS.min && players <= COOP_PLAYERS.max;

/**
 * The party size a squad is mustered for (§13.6): the battle's own, or in
 * co-op always three — every player's squad musters the three-player budget,
 * whatever the size of the team (§29.1).
 */
function musterSize(playerCount: number, coop: boolean): PlayerCount {
    return coop ? 3 : playerCount as PlayerCount;
}
