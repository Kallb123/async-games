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
import { HOLD_OUT_MAPS, type CoopMap } from "./maps/holdOut";
import { currentRuleset, rulesetOf, type RulesContext } from "./rulesets";

// These aliases are for setup, profiles and tools without a game. Gameplay
// must select the game's catalogue with rulesetFor(game.rulesVersion).
export const { CHARACTERS, ABILITIES, OPTIONS, ITEMS, EFFECTS, FACTIONS } = currentRuleset;

export type CharacterId =
    | "manAtArms" | "knight" | "archer" | "scout" | "mage" | "cleric"
    // The Swarm's (§31).
    | "skitterling" | "ravager" | "spitter" | "bloater" | "broodmother"
    // The Miners' (§33).
    | "miner" | "stonewarden" | "prospector" | "sapper" | "runepriest"
    // The Swarm's elites (§39.5): the computer's alone, in rules version 12.
    | "broodQueen" | "carapaceBrute" | "bileLobber"
    // The Swarm's nest (§39.7): a structure, not a character anyone fields.
    | "nest"
    // The Brood's (realm-arena-hold-out.md §4): the computer's own Swarm, in rules version 13.
    | "broodSkitterling" | "broodSpitter" | "broodBloater" | "broodRavager" | "broodBroodmother"
    // The team's Shrine (realm-arena-hold-out.md §5.2): a structure Hold Out's team defends, in rules version 13.
    | "shrine";

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
    | "iceBall" | "thunder" | "focus" | "beckon" | "blessing" | "ward" | "runeRaise"
    // The Swarm's elites' (§39.5).
    | "hatch" | "carapace" | "bile";

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
    /**
     * The character it stands up on a free square next to its user (Hatch, §39.5),
     * a new fighter of its user's owner that can't act until that owner's next turn.
     */
    hatches?: CharacterId;
    /** How many of what it hatches its user may have standing at once (Hatch). */
    cap?: number;
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
    /**
     * Goes off as its Burst does when anything else downs it, where it falls
     * (the Bloater from rules version 12, §39.3). Absent, it falls quietly.
     */
    burstsWhenDowned?: true;
    /**
     * Taken off every blow it takes, with any other armour (Braced's), never
     * leaving less than 1 (the Carapace Brute from rules version 12, §39.5).
     * Burning and poison ticks aren't blows, so it doesn't reduce them.
     */
    armour?: number;
    /**
     * A thing to destroy rather than someone fighting (the Swarm's nest, rules
     * version 12, §39.7): it stands on the field as any character does, and is
     * hurt as one, but never moves, acts or reacts, takes no effect but those
     * that do damage over time (burning and poison), is shoved without being
     * pushed, and doesn't count as someone standing (`isCombatant`) — so a side
     * with only structures standing is wiped out. Absent, a character.
     */
    structure?: true;
    /**
     * The character's pool of abilities to pick from at muster (rules version 12,
     * §40.3): `fixed` are always its own, `picks` more are taken from the rest of
     * its `abilities` and the abilities its options add (`loadoutPoolOf`), and
     * `defaults` is the pick a figure musters with unless its player picks another
     * (ready-made squads, warbands, waves). Absent, it has no pool and fights with
     * its whole kit, as every character does before version 12.
     */
    loadout?: { fixed: readonly AbilityId[]; picks: number; defaults: readonly AbilityId[] };
    /**
     * One of a horde rather than a character (the Brood's from rules version 13,
     * realm-arena-hold-out.md §4.3): 1 HP and no armour, so anything that does
     * it damage downs it, whatever else the blow would have done; no heal
     * reaches it; the board draws no HP bar over it; and it takes the swarm
     * step rather than the planner's search (`swarmAction`). Absent, a character.
     */
    minion?: true;
    /**
     * What producing it costs a horde (realm-arena-hold-out.md §4.2), in steps of
     * 1, apart from the `points` its knock-out scores and the planner values it at,
     * so a retune of either leaves the other alone. Only a horde faction's
     * characters (`Faction.horde`) and the elites it fields have one.
     */
    threat?: number;
    /**
     * The character whose art and model it is drawn with (realm-arena-hold-out.md
     * §4.3): the Brood's are drawn as the Swarm's, so they add no row to the
     * sheets. Absent, its own.
     */
    drawnAs?: CharacterId;
    /**
     * What each HP of it is worth to the planner, in points, in place of a
     * share of its `points` (the Shrine, realm-arena-hold-out.md §5.2), whose
     * HP is set by the battle rather than the catalogue. Absent, a share.
     */
    hpWorth?: number;
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

/** One ability a character with a pool (§40.3) can pick, and the mastery rank that unlocks it: 0 for its own kit's. */
export interface LoadoutEntry { ability: AbilityId; rank: 0 | 1 | 2 | 3 }

/** A character's whole pool (§40.3): what it always carries, how many it picks, what it takes by default, and everything it can pick. */
export interface LoadoutPool {
    fixed: readonly AbilityId[];
    picks: number;
    defaults: readonly AbilityId[];
    entries: readonly LoadoutEntry[];
}

/** Pools are read by the muster check, `kitOf` and undo: built once per catalogue's options and character. */
const POOLS = new WeakMap<object, Map<CharacterId, LoadoutPool>>();

/**
 * Whether an option is one of its character's pool entries (§40.2) rather than
 * a swap: an ability option of a character that has a pool. A weapon option is
 * always a swap.
 */
export function isPoolEntry(option: OptionId, context?: RulesContext): boolean {
    const { CHARACTERS, OPTIONS } = rulesetOf(context);
    const entry = OPTIONS[option];
    return "ability" in entry && CHARACTERS[entry.character]?.loadout !== undefined;
}

/**
 * A character's pool (§40.3): its `abilities` but the `fixed`, at rank 0 and in
 * their order, then each ability option it has (a weapon option isn't a pick,
 * §40.2) at the option's rank. Undefined for a character with no pool, which
 * fights with its whole kit.
 */
export function loadoutPoolOf(character: CharacterId, context?: RulesContext): LoadoutPool | undefined {
    const { CHARACTERS, OPTIONS } = rulesetOf(context);
    const loadout = CHARACTERS[character]?.loadout;
    if (!loadout) return undefined;
    let pools = POOLS.get(OPTIONS);
    if (!pools) POOLS.set(OPTIONS, pools = new Map());
    let pool = pools.get(character);
    if (!pool) {
        pool = Object.freeze({
            ...loadout,
            entries: Object.freeze([
                ...CHARACTERS[character].abilities.filter(id => !loadout.fixed.includes(id)).map((ability): LoadoutEntry => ({ ability, rank: 0 })),
                ...(Object.keys(OPTIONS) as OptionId[]).filter(id => OPTIONS[id].character === character && isPoolEntry(id, context))
                    .map((id): LoadoutEntry => ({ ability: (OPTIONS[id] as { ability: AbilityId }).ability, rank: OPTIONS[id].rank })),
            ]),
        });
        pools.set(character, pool);
    }
    return pool;
}

/**
 * The abilities a figure with a pool carries besides its fixed ones (§40.3), in
 * its pool's order: the loadout it was mustered with, or its character's
 * defaults. Undefined for a character with no pool, which fights with its
 * whole kit.
 */
export function loadoutOf(subject: { character: CharacterId; loadout?: readonly AbilityId[] }, context?: RulesContext): readonly AbilityId[] | undefined {
    const pool = loadoutPoolOf(subject.character, context);
    if (!pool) return undefined;
    const picked = Array.isArray(subject.loadout) ? subject.loadout : pool.defaults;
    return pool.entries.map(entry => entry.ability).filter(id => picked.includes(id));
}

/** Kits are reused, starter, swapped and picked alike: the planner reads them thousands of times a turn. The default kit per character, with nothing picked and no weapon swapped, is the hottest. */
const STARTER_KITS = new WeakMap<Character, Kit>();
const SWAPPED_KITS = new WeakMap<Character, WeakMap<CharacterOption, Kit>>();
/** A character with a pool: its kits by weapon option and the loadout as stored (a fighter's is in pool order, §40.3). */
const LOADOUT_KITS = new WeakMap<Character, Map<string, Kit>>();
/** A loadout array's kit, per character: a fighter keeps the one array it was mustered with (a planned copy of it shares that array), and asks for its kit thousands of times a turn. */
const PICKED_KITS = new WeakMap<readonly AbilityId[], WeakMap<Character, Kit>>();
export function kitOf(character: CharacterId, option?: OptionId, context?: RulesContext, loadout?: readonly AbilityId[]): Kit {
    const { CHARACTERS, OPTIONS } = rulesetOf(context);
    const starter = CHARACTERS[character];
    const { weapon, abilities } = starter;
    const swap: CharacterOption | undefined = option ? OPTIONS[option] : undefined;
    if (starter.loadout) {
        // Only a muster's checked list is ever stored; anything else reads as the defaults, never a throw.
        if (!Array.isArray(loadout)) loadout = undefined;
        // §40.2: an ability option isn't a swap here, it's a pool entry; only a weapon swaps.
        const weaponSwap = swap && swap.character === character && "weapon" in swap ? swap : undefined;
        if (!weaponSwap && !loadout) {
            const plain = STARTER_KITS.get(starter);
            if (plain) return plain;
        }
        // The same array again, which is what a fighter hands in every time: no key to build.
        const picked = !weaponSwap && loadout ? PICKED_KITS.get(loadout)?.get(starter) : undefined;
        if (picked) return picked;
        const key = `${weaponSwap ? option : ""}|${loadout ? loadout.join() : ""}`;
        let kits = LOADOUT_KITS.get(starter);
        if (!kits) LOADOUT_KITS.set(starter, kits = new Map());
        let kit = kits.get(key);
        if (!kit) {
            kit = Object.freeze({ weapon: weaponSwap ? weaponSwap.weapon : weapon, abilities: Object.freeze([...starter.loadout.fixed, ...loadoutOf({ character, loadout }, context)!]) });
            kits.set(key, kit);
        }
        if (!weaponSwap && !loadout) STARTER_KITS.set(starter, kit);
        if (!weaponSwap && loadout) {
            let byStarter = PICKED_KITS.get(loadout);
            if (!byStarter) PICKED_KITS.set(loadout, byStarter = new WeakMap());
            byStarter.set(starter, kit);
        }
        return kit;
    }
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
/** One Hold Out wave's theme (§39.6): its name, an elite it buys first if it can, and the order it buys the rest in, round and round. */
export interface WaveTheme {
    name: string;
    elite?: CharacterId;
    buys: readonly CharacterId[];
}

/**
 * An elite a horde's nests produce on a schedule (realm-arena-hold-out.md §5.1),
 * as `round` begins: `count` of them, or one for every `perWarbands` warbands
 * with a nest standing, rounded up — each from a warband with a nest standing,
 * those with the most nests first, ties to the lowest seat.
 */
export interface EliteArrival {
    round: number;
    elite: CharacterId;
    count: number | { perWarbands: number };
}

export interface Faction {
    name: string;
    /** The characters it musters from, in the order the muster lists them; each in no other faction's roster. */
    characters: readonly CharacterId[];
    /**
     * The characters only the computer fields, beyond the roster (§39.5): a
     * player never musters one, so `characters` stays what a muster is checked
     * against. Absent, the faction has none.
     */
    elites?: readonly CharacterId[];
    /**
     * The themes of its Hold Out waves (§39.6), the first wave's first: each wave
     * is bought with points (`wavePurchase`) rather than being the squad again.
     * Absent, the faction's waves are `waveStrength`'s.
     */
    waves?: readonly WaveTheme[];
    /**
     * The structure each of the faction's Hold Out warbands stands on its map's
     * nest squares from the first muster (§39.7): a character with `structure`,
     * in no roster or elite list, so no muster accepts it. Absent, the faction
     * has no nests.
     */
    nest?: CharacterId;
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
    /**
     * Fielded by the computer alone (the Brood, realm-arena-hold-out.md §4.1):
     * in no list a player picks a faction from, to muster or to fight, nor among
     * the factions Random draws from. Absent, anyone's.
     */
    computerOnly?: true;
    /**
     * Its warbands are bought rather than mustered (the Brood,
     * realm-arena-hold-out.md §4.2, §4.4): each muster and wave is spent in its
     * characters' `threat` on its themes (`hordePurchase`), never past
     * `HORDE_CAP` minions and `HORDE_REAL_CAP` others a warband, survivors
     * counted. Absent, its warbands muster `readyMade`, which a horde leaves
     * empty: nobody musters it.
     */
    horde?: true;
    /**
     * The elites its nests produce, by round (realm-arena-hold-out.md §5.1), where
     * the nests produce the enemy (`SPAWN_THREAT`). Absent, none arrive that way.
     */
    eliteSchedule?: readonly EliteArrival[];
}

export type FactionId = "realm" | "swarm" | "miners" | "brood";

/**
 * Every faction, by the id a battle stores. An id, once used, is never
 * renamed, as a map's isn't (§19.1).
 */


/** The faction a character is mustered from: each is in one roster alone (§29.3). */
export function factionOf(character: CharacterId, context?: RulesContext): FactionId {
    const { FACTIONS } = rulesetOf(context);
    // The catalogue's own factions, not today's: a computer-only one (the Brood) may be in no other.
    return (Object.keys(FACTIONS) as FactionId[]).find(id => FACTIONS[id].characters.includes(character) || FACTIONS[id].elites?.includes(character))!;
}

/** The Realm: the first faction, and the one every player fought as before a squad could choose its own (B6). */
export const REALM = FACTIONS.realm;

/**
 * Every faction a player can pick: what Random is drawn from (§29.3), and what
 * the host can let the players muster from (B6). A computer-only one (the
 * Brood, realm-arena-hold-out.md §4.1) is in none of them.
 */
export const FACTION_IDS = (Object.keys(FACTIONS) as FactionId[]).filter(id => !FACTIONS[id].computerOnly);

/** Whether a value names a faction a player can pick (`FACTION_IDS`). */
export function isFactionId(value: unknown): value is FactionId {
    return typeof value === "string" && (FACTION_IDS as readonly string[]).includes(value);
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
    // The battle's own catalogue decides, so a computer-only faction (the Brood) is found where it is fielded.
    return typeof id === "string" && Object.hasOwn(FACTIONS, id) ? FACTIONS[id as FactionId] : FACTIONS.realm;
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
 * How many players a co-op team can be at most (§29.1): one battlefield for
 * each (§29.2). A team of one is solo (§30.6), on the Ruined Fort, which skips
 * the invite flow; a team the host invites is two to four — though what a
 * setting seats is `coopTeamMax`: a team of four fits only Hold Out on a
 * battlefield of its own (§37).
 */
export const COOP_PLAYERS = { min: 1, max: 4 } as const;

/** The biggest team the line battles seat: the Three-Gate Fort's (§29.2), and so Hold the Centre's. */
export const LINE_COOP_MAX = 3;

/** What of a co-op setting decides how many it seats: its mission (§30.3) and, for Hold Out, the battlefield picked (§30.9). */
export interface CoopSeating {
    mission?: string;
    map?: CoopMap;
}

/**
 * The biggest team a co-op setting seats (§29.1): three, unless it's Hold Out
 * on a battlefield of its own built for more (§37) — the one place that says
 * which team sizes fit which setting, for the setup screen, the invitation and
 * the lobby alike.
 */
export function coopTeamMax({ mission, map }: CoopSeating): number {
    const own = mission === "holdOut" && map ? Object.keys(HOLD_OUT_MAPS[map]).map(Number) : [];
    return Math.max(LINE_COOP_MAX, ...own);
}

/** The rematch link's flag for a solo battle (§30.6), so "play again" comes back to Solo. */
export const RA_SOLO_PARAM = "solo";

/** Whether a party of this size can play this co-op setting: a team its battlefield is built for — or, with no setting given, any setting at all. */
export const fitsCoop = (players: number, coop: CoopSeating = {}): boolean => players >= COOP_PLAYERS.min && players <= coopTeamMax(coop);

/**
 * The party size a squad is mustered for (§13.6): the battle's own, or in
 * co-op always three — every player's squad musters the three-player budget,
 * whatever the size of the team (§29.1).
 */
function musterSize(playerCount: number, coop: boolean): PlayerCount {
    return coop ? 3 : playerCount as PlayerCount;
}
