// Realm Arena's characters and factions as data (docs/games/realm-arena.md
// §13.6, §29.3): every character a squad is bought from, their weapons and
// abilities, the options mastery unlocks for them (§23.2), the items they can
// carry (§21), the points budget, and each faction's roster and the
// ready-made squad a timed-out muster gets (§17.2).
// Released definitions live in catalogues/. Select them through rulesets.ts;
// never edit an old catalogue to tune a new release.
//
// Pure data, with no server-only imports, so the muster screen and the board
// read the same table the commands do.

import type { Cover } from "@/utils/games/battlefield/terrain";
import { currentRuleset, rulesetOf, type RulesContext } from "./rulesets";

// These aliases are for setup, profiles and tools without a game. Gameplay
// must select the game's catalogue with rulesetFor(game.rulesVersion).
export const { CHARACTERS, ABILITIES, OPTIONS, ITEMS, EFFECTS, FACTIONS } = currentRuleset;

export type CharacterId =
    | "manAtArms" | "knight" | "archer" | "scout" | "mage" | "cleric"
    // The Swarm's (§31).
    | "skitterling" | "ravager" | "spitter" | "bloater" | "broodmother"
    // The Miners' (§33).
    | "miner" | "stonewarden" | "prospector" | "sapper" | "runepriest";

export type AbilityId =
    | "cleave" | "shieldWall" | "aimedShot" | "sneak" | "fireball" | "heal" | "raise"
    // The abilities an option swaps in (§23.2).
    | "shieldBash" | "demolish" | "cripplingShot" | "huntersMark" | "purify"
    // The Swarm's (§31).
    | "rend" | "regrowth" | "burst"
    // The Miners' (§33).
    | "dynamite"
    | "leap" | "slashAndDash" | "bulwark" | "taunt" | "shove"
    | "poisonArrow" | "bouncingArrow" | "splittingArrow" | "shootDodge"
    | "iceBall" | "thunder" | "focus" | "beckon" | "blessing" | "ward" | "runeRaise";

/**
 * Something that happens to a character for a few of its owner's turns
 * (§20.1): the five conditions, and the two stances a character takes itself.
 */
export type EffectId = "burning" | "stunned" | "slowed" | "marked" | "corroded" | "hunkered" | "shieldWall"
    | "poisoned" | "braced" | "blessed" | "focused" | "warded";

export interface Effect {
    /** A positive condition, preserved by Purify. */
    beneficial?: true;
    /** Damage ticks and expiry happen at this turn boundary; old effects use start. */
    tick?: "start" | "end";
    decayAt?: "start" | "end";
    movementFactor?: number;
    apModifier?: number;
    preventsReactions?: boolean;
    /** Cover on the affected fighter (e.g. Ward), lasting as long as the effect. */
    cover?: Cover;
    /** Taken off every blow it takes, with any other armour, never leaving less than 1 (Braced, §34.2). */
    armour?: number;
    /** Added to every blow it deals: weapon, ability or item (Blessed, §34.2). */
    damageBonus?: number;
    /** Added to every blow of its abilities alone (Focused, §34.2). */
    abilityDamageBonus?: number;
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



/** Every effect, in the order a character's are listed. */
export const EFFECT_IDS = Object.keys(EFFECTS) as EffectId[];

/** The effects a character takes up itself. */
const STANCES = ["hunkered", "shieldWall"] as const satisfies readonly EffectId[];

/** The effects something else puts on a character, rather than stances it takes up itself. */
export type Affliction = Exclude<EffectId, typeof STANCES[number]>;

/** Harmful effects in catalogue order: what Purify clears (§23.2). */
export function afflictionsOf(context?: RulesContext): Affliction[] {
    const { EFFECTS } = rulesetOf(context);
    return (Object.keys(EFFECTS) as EffectId[]).filter((effect): effect is Affliction =>
        !(STANCES as readonly EffectId[]).includes(effect) && !EFFECTS[effect]!.beneficial);
}

/**
 * A melee weapon needs its target next to it and rolls a flat 80% to hit
 * (`MELEE_ACCURACY`, §13.3) — it either lands or it doesn't, with no graze; a
 * ranged one rolls against its own accuracy, and may leave an effect on
 * whoever it hits — only on a hit, not a graze (§20.2), and on overwatch as
 * much as on the owner's turn.
 */
export type Weapon =
    | { name: string; kind: "melee"; damage: number }
    | { name: string; kind: "ranged"; damage: number; accuracy: number; range: number; effect?: Affliction };

export interface Ability {
    /** Movement and secondary-hit values, selected by the match catalogue. */
    maxRise?: number;
    push?: number;
    collisionDamage?: number;
    bounceRange?: number;
    bounceDamage?: number;
    dodge?: number;
    pull?: number;
    radius?: number;
    passive?: boolean;
    apOnRaise?: number;
    bonusAp?: number;
    movesWithoutReactions?: boolean;
    countsAsAttack?: boolean;
    /** A passive aura, or cover while its stance is active. */
    cover?: Cover;
    /** Whom an aura's cover reaches beside its holder: its allies (the default, a shield wall), or every character, enemies too (Bulwark, §34.5). */
    coverFor?: "allies" | "everyone";
    coverAffectsSelf?: boolean;
    stance?: EffectId;
    name: string;
    /** AP to use it. Sneak's is per movement allowance, as a move's 1 AP is (§13.2). */
    ap: number;
    /** Turns before it can be used again: set on use, and counted down at the start of each of its owner's turns (§13.5). */
    cooldown: number;
    /** Usable once per battle at most, whatever the cooldown (the Bloater's Burst). */
    oncePerBattle?: true;
    /**
     * Usable once per turn of its owner's at most, whatever the cooldown (the
     * Cleric's Heal): the use is written on the fighter and wiped as its
     * owner's next turn begins (`Fighter.usedThisTurn`).
     */
    oncePerTurn?: true;
    /** Added to a shot's chance to hit (Aimed shot). */
    hitBonus?: number;
    /** How far away, in squares, it can be aimed (Fireball, Dynamite, Hunter's mark, Heal, Regrowth). */
    range?: number;
    /** What it does to each character it hits, in place of the weapon's (Fireball, Dynamite, Shield bash, Demolish, Rend, Burst). */
    damage?: number;
    /** HP it restores (Heal, Purify, Regrowth). */
    hp?: number;
    /** What it leaves on everyone it hits: Fireball's burning, and the options' (§23.2). A shot leaves it only on a hit (§20.2). */
    effect?: Affliction;
    /**
     * Blasts away low cover after its damage (§22): every square of it in the
     * 3×3 round where it lands (`area`, Fireball, Dynamite), or the one square it's aimed
     * at (`target`, Demolish).
     */
    blasts?: "area" | "target";
    description: string;
}



/**
 * The abilities that strike one enemy (or, a Cleave, two) with the character's
 * own weapon reach, and so roll to hit as a melee weapon's strike does: the one
 * list the rules' `rollsToHit` and the stats sheet both read.
 */
export const STRIKING_ABILITIES: ReadonlySet<string> = new Set<AbilityId>(["cleave", "shieldBash", "rend", "shove"]);

export interface Character {
    /** Extra AP at the start of its turns. */
    bonusAp?: number;
    name: string;
    /** The name for several: "Men-at-arms", which no "s" makes of "Man-at-arms". */
    plural: string;
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


export function isOptionId(value: unknown, context?: RulesContext): value is OptionId {
    return typeof value === "string" && Object.hasOwn(rulesetOf(context).OPTIONS, value);
}

/** What a character fights with, once its option — if it was mustered with one — has swapped its part in. */
export interface Kit {
    weapon: Weapon;
    abilities: readonly AbilityId[];
}

/** Kits are reused, starter and swapped alike: the planner reads them thousands of times a turn. */
const STARTER_KITS = new WeakMap<Character, Kit>();
const SWAPPED_KITS = new WeakMap<Character, WeakMap<CharacterOption, Kit>>();
export function kitOf(character: CharacterId, option?: OptionId, context?: RulesContext): Kit {
    const { CHARACTERS, OPTIONS } = rulesetOf(context);
    const starter = CHARACTERS[character];
    const { weapon, abilities } = starter;
    const swap: CharacterOption | undefined = option ? OPTIONS[option] : undefined;
    if (!swap || swap.character !== character) {
        let kit = STARTER_KITS.get(starter);
        if (!kit) {
            kit = Object.freeze({ weapon, abilities });
            STARTER_KITS.set(starter, kit);
        }
        return kit;
    }
    // A shared option may outlive a starter definition: cache both catalogue objects.
    let swaps = SWAPPED_KITS.get(starter);
    if (!swaps) SWAPPED_KITS.set(starter, swaps = new WeakMap());
    let kit = swaps.get(swap);
    if (!kit) {
        kit = Object.freeze("weapon" in swap
            ? { weapon: swap.weapon, abilities }
            : { weapon, abilities: Object.freeze(abilities.map(id => id === swap.replaces ? swap.ability : id)) });
        swaps.set(swap, kit);
    }
    return kit;
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



/** Every item, in the order the muster offers them. */
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

export function isItemId(value: unknown, context?: RulesContext): value is ItemId {
    return typeof value === "string" && Object.hasOwn(rulesetOf(context).ITEMS, value);
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
/** Every difficulty, easiest first. */
export const DIFFICULTY_IDS = Object.keys(DIFFICULTY_NAMES) as Difficulty[];

/** Each player's points to muster with in a normal-sized battle, which shrinks as players are added (§13.6). */
const NORMAL_BUDGET: Readonly<Record<PlayerCount, Budget>> = { 2: 100, 3: 80, 4: 70 };

/** How many rungs of `BUDGETS` a battle's size moves every squad in it from a normal battle's. */
const SIZE_RUNGS: Readonly<Record<BattleSize, number>> = { small: -2, normal: 0, large: 2 };

/** How many rungs of `BUDGETS` a warband stands from the players' budget, by difficulty (§30.5). */
const DIFFICULTY_RUNGS: Readonly<Record<Difficulty, number>> = { easy: -1, normal: 0, hard: 2 };

/**
 * How many rungs further down the ladder Hold Out's warbands muster, and their
 * waves refill to, once the team is tougher (`BALANCE_VERSION`): one step
 * smaller than the difficulty alone puts them.
 */
export const HOLD_OUT_ENEMY_STEPS = currentRuleset.RULES.HOLD_OUT_ENEMY_STEPS;

/** The budget `steps` rungs of `BUDGETS` from this one, stopping at the ladder's bottom and top. */
const rung = (budget: Budget, steps: number): Budget => BUDGETS[Math.min(BUDGETS.length - 1, Math.max(0, BUDGETS.indexOf(budget) + steps))];

/** Each player's points to muster with (§13.6, §30.5): the party's normal budget, moved by the battle's size. */
export function musterBudget(playerCount: number, coop: boolean, size: BattleSize = "normal"): Budget {
    return rung(NORMAL_BUDGET[musterSize(playerCount, coop)], SIZE_RUNGS[size]);
}

/**
 * Each co-op warband's points (§30.5): the players' budget, moved by the
 * difficulty, and by `steps` more rungs where the battle asks (Hold Out's
 * `HOLD_OUT_ENEMY_STEPS`). A warband always musters its faction's ready-made
 * squad for it.
 */
export function warbandBudget(playerCount: number, size: BattleSize = "normal", difficulty: Difficulty = "normal", steps = 0): Budget {
    return rung(musterBudget(playerCount, true, size), DIFFICULTY_RUNGS[difficulty] + steps);
}

/** A faction's ready-made squad for a budget: none for one off the ladder, which only a client could hold. */
export function readyMadeSquad(faction: Faction, budget: number): readonly CharacterId[] {
    return faction.readyMade[budget as Budget] ?? [];
}

export function isCharacterId(value: unknown, context?: RulesContext): value is CharacterId {
    return typeof value === "string" && Object.hasOwn(rulesetOf(context).CHARACTERS, value);
}

/** What a squad costs to muster. */
export function squadPoints(squad: readonly CharacterId[], context?: RulesContext): number {
    return squad.reduce((total, character) => total + rulesetOf(context).CHARACTERS[character].points, 0);
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

export type FactionId = "realm" | "swarm" | "miners";

/**
 * Every faction, by the id a battle stores. An id, once used, is never
 * renamed, as a map's isn't (§19.1).
 */


/** The faction a character is mustered from: each is in one roster alone (§29.3). */
export function factionOf(character: CharacterId, context?: RulesContext): FactionId {
    const { FACTIONS } = rulesetOf(context);
    return FACTION_IDS.find(id => FACTIONS[id].characters.includes(character))!;
}

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
export function factionById(id: unknown, context?: RulesContext): Faction {
    const { FACTIONS } = rulesetOf(context);
    return isFactionId(id) ? FACTIONS[id] : FACTIONS.realm;
}

/** What the team calls an enemy it hasn't seen yet: a random one, until one of its characters is (§29.3). */
export const UNKNOWN_ENEMY = "the enemy";

/**
 * What the enemy is called (§29.3): its faction's `enemyName` — "the
 * Renegades" — once the team knows it, and "the enemy" while it doesn't. The
 * log, the board and the result all name it through this.
 */
export function enemyNameOf(enemy: FactionId | undefined, context?: RulesContext): string {
    return enemy === undefined ? UNKNOWN_ENEMY : factionById(enemy, context).enemyName;
}

/** What the host picks to fight an enemy drawn at random as the battle is created, rather than a faction (§29.3). */
export const RANDOM_ENEMY = "random";

/**
 * How many players a co-op team can be (§29.1): one battlefield for each
 * (§29.2). A team of one is solo (§30.6), on the Ruined Fort, which skips the
 * invite flow; a team the host invites is two or three.
 */
export const COOP_PLAYERS = { min: 1, max: 3 } as const;

/** The rematch link's flag for a solo battle (§30.6), so "play again" comes back to Solo. */
export const RA_SOLO_PARAM = "solo";

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
