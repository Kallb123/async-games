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
import { DEFAULT_CLIMB, pathCost, pathTo, reachFrom, stepCost, type MoveRules, type Reach } from "@/utils/games/battlefield/pathfinding";
import { coordsOf, distance, facingTowards, FULL_HEIGHT, isNeighbour, riseOf, squareAt, type Area, type Battlefield, type Cover, type Facing, type Square } from "@/utils/games/battlefield/terrain";
import {
    afflictionsOf, factionOf, isCharacterId, isItemId, isOptionId, kitOf, LINE_COOP_MAX, squadPoints,
    type Ability, type AbilityId, type Affliction, type CharacterId, type Effect, type EffectId, type Faction, type FactionId, type Item, type ItemId, type OptionId, type PlayerCount, type Weapon,
} from "./characters";
import { currentRuleset, ruleValuesOf, rulesetOf, type RulesContext } from "./rulesets";
import { addTally, NO_TALLY, type Ranks, type Tally } from "./mastery";

// ─── Numbers (§13) ──────────────────────────────────────────────────────────

/** Every character starts each of its owner's turns with this many AP (§13.2). */
export const ACTION_POINTS = currentRuleset.RULES.ACTION_POINTS;
export const ATTACK_AP = currentRuleset.RULES.ATTACK_AP;
export const HUNKER_AP = currentRuleset.RULES.HUNKER_AP;
/** AP a reaction takes from the bank, so 4 banked buy two and 2 or 3 buy one (§13.4). */
export const REACTION_COST = currentRuleset.RULES.REACTION_COST;
export const OVERWATCH_PENALTY = currentRuleset.RULES.OVERWATCH_PENALTY;
export const HIGH_GROUND_BONUS = currentRuleset.RULES.HIGH_GROUND_BONUS;
/** How far above its target, in quarters, an attacker has to stand to have the high ground: half a height (§25.2). */
export const HIGH_GROUND_RISE = currentRuleset.RULES.HIGH_GROUND_RISE;
/** What a target's cover takes off a shot's chance to hit. Hunkering down doubles it (§13.2, §13.3). */
export const COVER_PENALTY = currentRuleset.RULES.COVER_PENALTY;
/** A shot that misses by this much or less grazes, for half damage (§13.3). */
export const GRAZE_BAND = currentRuleset.RULES.GRAZE_BAND;
/** A shot at a flanked target does this much more damage, instead of a critical hit (§13.3). */
export const FLANK_BONUS = currentRuleset.RULES.FLANK_BONUS;
export const ROLL_SIDES = 100;

/**
 * The ruleset release whose rules this file's balance changes are: a melee
 * strike rolls to hit (`MELEE_ACCURACY`), cover counts double against a
 * far shot (`FAR_SHOT_DISTANCE`), a Cleric's Heal is once a turn and its Raise on a
 * cooldown (`abilityRules`), and in Hold Out the team has more HP
 * (`TEAM_HP_FACTOR`) against smaller warbands (`HOLD_OUT_ENEMY_STEPS`). A
 * battle is stamped with the version it was created under
 * (`IRealmArenaSpecificGameState.rulesVersion`), so one begun before it keeps
 * the rules it began with, on a replay too. Never moves once shipped.
 */
export const BALANCE_VERSION = 7;

/** Whether a battle created under this rules version plays by `BALANCE_VERSION`'s rules: one with no stamp, from before them, doesn't. */
export const isBalanced = (rulesVersion: number | undefined): boolean => (rulesVersion ?? 0) >= BALANCE_VERSION;

/** A melee strike's chance to hit, before what's on its target (`strikeChance`): it hits four times in five (§13.3). */
export const MELEE_ACCURACY = currentRuleset.RULES.MELEE_ACCURACY;
/**
 * A ranged shot from further than this many squares away (measured as the
 * range is) is a far shot: the target's cover counts double against it
 * (§13.3), so those in cover are much safer at a distance and those in the
 * open no safer at all.
 */
export const FAR_SHOT_DISTANCE = currentRuleset.RULES.FAR_SHOT_DISTANCE;
/** Hold Out's team characters have this many times their table HP, rounded up (`teamHp`). */
export const TEAM_HP_FACTOR = currentRuleset.RULES.TEAM_HP_FACTOR;
/** What the Realm's hits take off a hit on Hold Out's team, never leaving less than 1 (`armourOf`, `BattleState.armoured`). */
export const ARMOUR = currentRuleset.RULES.ARMOUR;

/** The mission's scoring area, by the id a map gives its objective (§13.7). */
export const CENTRE = "centre";
export const CENTRE_POINTS = currentRuleset.RULES.CENTRE_POINTS;
/** The centre scores from this battle round, so neither side can reach it before the other has moved (§15.3). */
export const CENTRE_SCORES_FROM_ROUND = currentRuleset.RULES.CENTRE_SCORES_FROM_ROUND;
/** A knock-out scores the fallen character's points cost divided by this (§13.7). */
export const KNOCKOUT_DIVISOR = currentRuleset.RULES.KNOCKOUT_DIVISOR;
/** An assist scores the knock-out's points divided by this, rounded up (§13.7). */
export const ASSIST_DIVISOR = currentRuleset.RULES.ASSIST_DIVISOR;

/**
 * How far most characters see, in squares, wherever nothing blocks their
 * sight — what fog of war leaves their owner able to see (§27). An Archer or a
 * Scout sees further and a Knight less far (`sightOf`). Every character sees
 * at least as far as anything it can use reaches, so anything it could shoot
 * at, aim at or throw at, it can see: fog takes nothing away from what can be
 * done, only from what's known.
 */
export const SIGHT_RANGE = currentRuleset.RULES.SIGHT_RANGE;

/** How many battle rounds a battle lasts, by player count (§13.8). */
export const BATTLE_ROUNDS = currentRuleset.RULES.BATTLE_ROUNDS;

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
    /**
     * The most HP it can have, where that isn't its character's (`teamHp`:
     * Hold Out's team): set as it is mustered, absent otherwise. Read only
     * through `maxHpOf`.
     */
    maxHp?: number;
    /** Derived for the response: base turn AP, including catalogue bonuses. */
    maxAp?: number;
    /** AP left to spend this turn. */
    ap: number;
    /** Own attack actions this turn, present only in a catalogue with a limit. */
    attacksThisTurn?: number;
    /** Private sources of damaging effects other than legacy burning. */
    effectSources?: Partial<Record<EffectId, number>>;
    /** AP banked on overwatch or guard, spent 2 a reaction until its owner's next turn (§13.4). */
    banked: number;
    /**
     * The effects on it and their counts, the stances it holds among them:
     * each counted down as a cooldown is, and absent once spent (§20.1).
     */
    effects: Partial<Record<EffectId, number>>;
    /** The character that set it burning, whose owner a knock-out by the burning scores for (§20.2). Only while it burns. */
    burnedBy?: number;
    /**
     * The enemies who have taken HP off it since it last stood up, in the
     * order they first did, each of whom but the one who downs it scores an
     * assist when it's downed (§13.7). Absent until one of them hurts it;
     * gone once it's down.
     */
    woundedBy?: string[];
    /** Turns until each ability on cooldown can be used again; absent means ready. */
    cooldowns: Partial<Record<AbilityId, number>>;
    /** Once-per-battle abilities it has used. */
    spent: AbilityId[];
    /** Once-per-turn abilities it has used this turn, wiped as its owner's next turn begins; absent while there are none. */
    usedThisTurn?: AbilityId[];
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

/** The deliberately small, stale picture of an enemy remembered in fog. */
export type FogGhost = Pick<Fighter, "id" | "owner" | "character" | "square" | "facing">;

/** A fighter, or a sighting read back from a Mixed path, cut to a sighting: nothing mutable or secret about it. */
export const fogGhost = ({ id, owner, character, square, facing }: FogGhost): FogGhost => ({ id, owner, character, square, ...(facing === undefined ? {} : { facing }) });

/** What every rule reads: the ground, and everyone on it. */
export interface BattleState extends RulesContext {
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
    /**
     * Whether the team's characters wear `ARMOUR` against the warbands: Hold
     * Out under `BALANCE_VERSION` against the Realm (`armouredTeam`). Never
     * stored or sent; `battleFrom` builds it from the battle's mission and
     * enemy, which a view of the battle leaves out while a random enemy is
     * unseen — so nothing a board shows of the armour can name the faction.
     */
    armoured?: true;
}

/** What a `BattleState` is built from: the persisted state on the server, the response on the board and in the recap. */
export interface BattleSource {
    fighters: readonly Fighter[];
    fog?: boolean;
    clouds?: readonly Square[];
    /** The players in seat order, and whether they fight together against the computer's warbands (§29): what the sides are read from. */
    seats?: readonly string[];
    coop?: boolean;
    /** The rules version the battle was created under; absent for one from before `BALANCE_VERSION`. */
    rulesVersion?: number;
    /**
     * Whether the team is armoured (`armouredTeam`), which the caller works out
     * from the mission and the enemy it knows: the board's, a faction the
     * response left off until seen, is never one.
     */
    armoured?: boolean;
}

/**
 * The owner of the computer's `k`th warband in co-op, counting from 0 (§29.6):
 * `ai:0`, `ai:1`, …, which no Clerk id can ever be. Warband `k` deploys
 * opposite player `k`.
 */
export const warbandOwner = (k: number): string => `${WARBAND_PREFIX}${k}`;
const WARBAND_PREFIX = "ai:";

/** The computer's warbands in co-op, one opposite each player (§29.1), in the order they deploy. */
export const warbandsFor = (seats: readonly string[]): string[] => seats.map((_, k) => warbandOwner(k));

/** Whether an owner is one of the computer's warbands rather than a player. */
export const isWarband = (owner: string): boolean => owner.startsWith(WARBAND_PREFIX);

/** The two sides of a co-op battle (§29.6): the players, and the computer's warbands. */
export const TEAM_SIDE = "team";
export const ENEMY_SIDE = "enemy";

/**
 * The one way a `BattleState` is built (§29.6), so the board's previews and
 * the recap read a battle exactly as the server does. A free-for-all — every
 * battle so far — has no `sides`. Co-op has two: the players, and a warband
 * for each of them (§29.1).
 */
export function battleFrom(field: Battlefield, { fighters, fog, clouds, seats = [], coop, rulesVersion, armoured }: BattleSource): BattleState {
    const sides = coop ? Object.fromEntries([...seats.map(player => [player, TEAM_SIDE]), ...warbandsFor(seats).map(warband => [warband, ENEMY_SIDE])]) : undefined;
    return {
        field, fighters, ...(rulesVersion !== undefined ? { rulesVersion } : {}), ...(fog ? { fog: true } : {}), ...(clouds && clouds.length > 0 ? { clouds } : {}), ...(sides ? { sides } : {}),
        ...(coop && armoured ? { armoured: true as const } : {}),
    };
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
    | { kind: "attack" | "aimedShot" | "heal" | "raise" | "draught" | "shieldBash" | "cripplingShot" | "huntersMark" | "rend" | "regrowth" | "shove" | "poisonArrow" | "bouncingArrow" | "thunder" | "beckon" | "ward" | "runeRaise"; fighter: number; target: number }
    | { kind: "hunker" | "watch" | "shieldWall" | "purify" | "burst" | "slashAndDash" | "bulwark" | "taunt" | "focus" | "blessing"; fighter: number }
    | { kind: "cleave" | "splittingArrow"; fighter: number; targets: number[] }
    | { kind: "shootDodge"; fighter: number; target: number; path: Square[] }
    /** A demolish is aimed at the square of low cover it blasts. */
    | { kind: "fireball" | "dynamite" | "throw" | "demolish" | "leap" | "iceBall"; fighter: number; at: Square };

export type ShotResult = "hit" | "graze" | "miss";

/** One thing that happened, in the order it happened: what the board shows coming back, and what a recap tells. */
export type BattleEvent =
    | { kind: "moved"; fighter: number; path: Square[]; sneaking: boolean; via?: AbilityId }
    | { kind: "ability"; fighter: number; ability: AbilityId }
    /** `via` names the ability a shot was, for those that name it (`NAMED_SHOTS`). */
    | { kind: "shot"; fighter: number; target: number; chance: number; roll: number; result: ShotResult; damage: number; reaction: boolean; via?: AbilityId }
    /**
     * A melee strike. In a battle under `BALANCE_VERSION` it rolled (`chance`
     * and `roll`) and may have `missed`, doing no damage; before it, it always
     * hit and carries neither. A Demolish's splash is a `demolished` event, not
     * this, and never rolls. `via` names the ability a blow that never rolls
     * came from, other than a strike's: a Leap landing beside the target, a
     * Shove's collision, a Bouncing Arrow's bounce (§34).
     */
    | { kind: "struck"; fighter: number; target: number; damage: number; reaction: boolean; chance?: number; roll?: number; missed?: true; via?: AbilityId }
    | { kind: "fireball" | "iceBall"; fighter: number; at: Square; targets: number[]; damage: number; damages?: Record<number, number> }
    /** A Sapper's Dynamite, landing as a fireball does but leaving nothing alight (§33.2). Its `blasted` follows. */
    | { kind: "dynamite"; fighter: number; at: Square; targets: number[]; damage: number; damages?: Record<number, number> }
    | { kind: "downed"; fighter: number; by: number }
    /**
     * A Cleric's Heal; or, by `via`, a healing draught given by `fighter` — to
     * itself, when `target` is `fighter` — or one ally a Purify reached, the
     * Cleric among them (§23.2).
     */
    | { kind: "healed"; fighter: number; target: number; hp: number; via?: "draught" | "purify" }
    /** A thrown item landing: `targets` is everyone it hit, which a smoke pot never does — its cloud is the thrower's `smoke`. */
    | { kind: "thrown"; fighter: number; item: ItemId; at: Square; targets: number[]; damage: number; damages?: Record<number, number> }
    /** Low cover blasted away to scorched ground by `fighter`'s fireball, fire flask or Demolish, after its damage (§22). */
    | { kind: "blasted"; fighter: number; squares: Square[] }
    /** A Knight's Demolish at the cover on `at`: `targets` is everyone beside it that it struck (§23.2). Its `blasted` follows. */
    | { kind: "demolished"; fighter: number; at: Square; targets: number[]; damage: number; damages?: Record<number, number> }
    /** A Bloater's Burst: `targets` is everyone next to it that the acid hit (§31.2). Its own `downed` follows theirs. */
    | { kind: "burst"; fighter: number; targets: number[]; damage: number; damages?: Record<number, number> }
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
    | { kind: "burned"; fighter: number; damage: number; effect?: EffectId }
    | { kind: "scored"; player: string; points: number; reason: "centre" | "knockout" | "assist" };

/** Actual damage of an area hit; historical events carry one amount for everyone. */
export const areaDamage = (event: { damage: number; damages?: Readonly<Record<number, number>> }, target: number): number => event.damages?.[target] ?? event.damage;

/** What a player scored for, as the log and the board say it (§13.7). */
export const SCORED_FOR: Readonly<Record<Extract<BattleEvent, { kind: "scored" }>["reason"], string>> = {
    centre: "holding the centre",
    knockout: "the knock-out",
    assist: "the assist",
};

/**
 * An event as a review sends it to every player (§26.2): a shot or a strike
 * without the roll that decided it, which the log never tells.
 */
export type ToldEvent = Exclude<BattleEvent, { kind: "shot" | "struck" }>
    | Omit<Extract<BattleEvent, { kind: "shot" }>, "roll"> | Omit<Extract<BattleEvent, { kind: "struck" }>, "roll">;

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

export const hasEffect = (fighter: Pick<Fighter, "effects">, effect: EffectId): boolean => (fighter.effects[effect] ?? 0) > 0;

/** The item a character carries, if any (§21.1). */
export const itemOf = (fighter: Pick<Fighter, "item">, context?: RulesContext): Item | undefined => fighter.item ? rulesetOf(context).ITEMS[fighter.item] : undefined;

/** What an item adds to a muster's cost: nothing for none. */
export const itemPoints = (item: ItemId | null | undefined, context?: RulesContext): number => item ? rulesetOf(context).ITEMS[item].points : 0;

/** What a set of items costs at muster, a missing one nothing. */
export const itemsPoints = (items: readonly (ItemId | null | undefined)[], context?: RulesContext): number => items.reduce((total, item) => total + itemPoints(item, context), 0);

/** A standing character can still act with a ready free AP ability, even at zero AP. */
export function canAct(fighter: Fighter, context?: RulesContext): boolean {
    if (!isStanding(fighter)) return false;
    if (fighter.ap > 0) return true;
    const { ABILITIES } = rulesetOf(context);
    return abilitiesOf(fighter, context).some(id => ABILITIES[id]?.ap === 0 && (ABILITIES[id]?.bonusAp ?? 0) > 0 && !abilityRefusal(fighter, id, context));
}

/** What a character's kit says it fights with: its character's weapon, or the one its option swaps in (§23.2). Read only through `weaponOf`, which knows the battle's rules. */
const kitWeapon = (fighter: Pick<Fighter, "character" | "option">, context?: RulesContext): Weapon => kitOf(fighter.character, fighter.option, context).weapon;

/** The weapon this character's selected catalogue and mastery option give it. */
export function weaponOf(state: Pick<BattleState, "rulesVersion">, fighter: Pick<Fighter, "character" | "option">): Weapon {
    return kitWeapon(fighter, state);
}

/** Whether a character shoots rather than strikes under the selected catalogue. */
export const shoots = (fighter: Pick<Fighter, "character" | "option">, context?: RulesContext): boolean => kitWeapon(fighter, context).kind === "ranged";

/** The abilities a character has: its character's, with the one its option swaps out swapped for its own (§23.2). */
export const abilitiesOf = (fighter: Pick<Fighter, "character" | "option">, context?: RulesContext): readonly AbilityId[] => kitOf(fighter.character, fighter.option, context).abilities;

/**
 * The most HP a character can have: its character's, or — for Hold Out's team
 * under `BALANCE_VERSION` — the more it was mustered with (`teamHp`). Every
 * full HP the rules, the computer and the board read comes through here: heals
 * and the rally cap at it, a raise gives back half of it, a HP bar fills to it.
 */
export const maxHpOf = (fighter: Pick<Fighter, "character" | "maxHp">, context?: RulesContext): number => fighter.maxHp ?? rulesetOf(context).CHARACTERS[fighter.character].hp;

/** A squad's remaining and full HP, including fallen fighters and each fighter's mustered maximum. Shared by the live scoreboard and battle record. */
export function squadHp(fighters: readonly Fighter[], context?: RulesContext): { remaining: number; total: number } {
    let remaining = 0, total = 0;
    for (const fighter of fighters) {
        remaining += fighter.hp;
        total += maxHpOf(fighter, context);
    }
    return { remaining, total };
}

/**
 * Whether a battle's team is the tougher one `BALANCE_VERSION` gives Hold Out
 * (`teamHp`, and warbands a rung smaller): the mission, created under the
 * balance rules. The one test the server, the muster sheet and the tests all use.
 */
export const stoutTeam = (mission: string | undefined, rulesVersion: number | undefined): boolean => mission === "holdOut" && ruleValuesOf({ rulesVersion }).TEAM_HP_FACTOR > 1;

/** How many rungs a co-op battle's warbands muster from the difficulty's (`warbandBudget`): `HOLD_OUT_ENEMY_STEPS` against a stout team, else none. */
export const warbandSteps = (mission: string | undefined, rulesVersion: number | undefined): number => mission === "holdOut" ? ruleValuesOf({ rulesVersion }).HOLD_OUT_ENEMY_STEPS : 0;

/** Whether Hold Out's team wears armour against its enemy: the stout team (`stoutTeam`), against the Realm's warbands alone. */
export const armouredTeam = (mission: string | undefined, rulesVersion: number | undefined, enemy: FactionId | undefined): boolean => mission === "holdOut" && ruleValuesOf({ rulesVersion }).ARMOUR > 0 && enemy !== undefined && ruleValuesOf({ rulesVersion }).ARMOURED_ENEMIES.includes(enemy);

/**
 * The armour one of the team's characters wears where the team is armoured
 * (`ARMOUR`), or 0: none for a warband's, and none for a Miner, which is tough
 * enough without it (§33.3).
 */
function teamArmour(state: Pick<BattleState, "armoured" | "rulesVersion">, fighter: Pick<Fighter, "owner" | "character">): number {
    const { ARMOUR } = ruleValuesOf(state);
    return state.armoured && !isWarband(fighter.owner) && !ruleValuesOf(state).ARMOUR_EXEMPT_FACTIONS.includes(factionOf(fighter.character, state)) ? ARMOUR : 0;
}

/** What a character wears: the team's armour against the warbands, and what its effects add against any blow (`Effect.armour`). */
export function armourOf(state: Pick<BattleState, "armoured" | "rulesVersion">, fighter: Pick<Fighter, "owner" | "character"> & Partial<Pick<Fighter, "effects">>): number {
    return teamArmour(state, fighter) + effectTotal(fighter, "armour", state);
}

/** What dealt a blow: an ability's own hits earn `Effect.abilityDamageBonus` as well as `damageBonus`. */
export type BlowSource = "weapon" | "ability" | "item";

/**
 * What a blow from `by` does to `target`: its own `blow` — by default its
 * weapon's damage — plus what `by`'s effects add (`Effect.damageBonus`, and
 * `abilityDamageBonus` for an ability's blow), less the armour `target`
 * wears, never under 1: its effects' against any blow, and the team's where a
 * warband's blow lands on one of the team's. Every hit, ability and
 * splash of the enemy's counts; burning, which isn't dealt by a blow, and the
 * team's own friendly fire don't. Nothing, for a blow that does nothing. The
 * one place armour is taken off, for the rules, the planner and the board.
 */
export function damageTo(state: Pick<BattleState, "armoured" | "rulesVersion">, by: Pick<Fighter, "owner" | "character" | "option"> & Partial<Pick<Fighter, "effects">>, target: Pick<Fighter, "owner" | "character"> & Partial<Pick<Fighter, "effects">>, blow = weaponOf(state, by).damage, via: BlowSource = "weapon"): number {
    if (blow <= 0) return blow;
    const dealt = blow + effectTotal(by, "damageBonus", state) + (via === "ability" ? effectTotal(by, "abilityDamageBonus", state) : 0);
    const armour = (isWarband(by.owner) ? teamArmour(state, target) : 0) + effectTotal(target, "armour", state);
    return armour > 0 ? Math.max(1, dealt - armour) : dealt;
}

/** What a character of Hold Out's team is mustered with: its table HP times `TEAM_HP_FACTOR`, rounded up. */
export const teamHp = (character: CharacterId, context?: RulesContext): number => Math.ceil(rulesetOf(context).CHARACTERS[character].hp * ruleValuesOf(context).TEAM_HP_FACTOR);

/** The HP a character is mustered with, which the muster sheet shows and `newFighter` gives: the team's bigger HP when `stout`, else its character's. */
export const musterHp = (character: CharacterId, stout: boolean, context?: RulesContext): number => stout ? teamHp(character, context) : rulesetOf(context).CHARACTERS[character].hp;

/** The limits on how often an ability can be used. */
export type AbilityLimits = Pick<Ability, "cooldown" | "oncePerBattle" | "oncePerTurn">;

/** How often this game's catalogue lets an ability be used. */
export function abilityRules(state: Pick<BattleState, "rulesVersion">, id: AbilityId): AbilityLimits {
    const { cooldown, oncePerBattle, oncePerTurn } = rulesetOf(state).ABILITIES[id]!;
    return { cooldown, ...(oncePerBattle ? { oncePerBattle } : {}), ...(oncePerTurn ? { oncePerTurn } : {}) };
}

/** Movement points each AP spent on moving buys it: its character's, halved and rounded up while it's slowed (§20.1). */
export function movementOf(fighter: Fighter, context?: RulesContext): number {
    const { CHARACTERS } = rulesetOf(context);
    const { movement } = CHARACTERS[fighter.character];
    return Math.ceil(activeEffects(fighter, context).reduce((value, [, effect]) => value * (effect.movementFactor ?? 1), movement));
}

export function fighterById(state: BattleState, id: unknown): Fighter | undefined {
    return state.fighters.find(fighter => fighter.id === id);
}

/** Whether two characters touch, and nothing stands between them at the corner they share. A healing draught, raising and the shield wall need it; melee needs `inMeleeReach` too. */
export function nextTo(field: Battlefield, a: Square, b: Square): boolean {
    return isNeighbour(field, a, b) && canSee(field, a, b);
}

/** How far apart in height, in quarters, two characters can be and still fight hand to hand (§25.2). */
export const MELEE_RISE = currentRuleset.RULES.MELEE_RISE;

/** Whether a melee weapon reaches from one square to another: next to it, and no more than a quarter above or below it. */
export function inMeleeReach(field: Battlefield, a: Square, b: Square, context?: RulesContext): boolean {
    const { MELEE_RISE } = ruleValuesOf(context);
    return nextTo(field, a, b) && Math.abs(riseOf(field, a, b)) <= MELEE_RISE;
}

/** Whether one square is within `range` squares of another and can be seen from it: a ranged weapon's reach, and a fireball's or a heal's (§13.3). */
export function inRange(field: Battlefield, from: Square, to: Square, range: number): boolean {
    return distance(field, from, to) <= range && canSee(field, from, to);
}

/** Whether a character's weapon could hit someone on a square from where it stands: in melee reach for a melee weapon, in range and in sight for a ranged one. */
export function weaponReaches(state: BattleState, fighter: Fighter, square: Square): boolean {
    const weapon = weaponOf(state, fighter);
    return weapon.kind === "ranged" ? inRange(state.field, fighter.square, square, weapon.range) : inMeleeReach(state.field, fighter.square, square, state);
}

/** What a move by one character may cross and stop on, and how far it can climb: enemies block, allies may be crossed but not stopped on. The fallen do neither. */
export function moveRules(state: BattleState, mover: Fighter): Required<MoveRules> {
    const { CHARACTERS } = rulesetOf(state);
    const blocked = new Set<Square>(), occupied = new Set<Square>();
    for (const other of state.fighters) {
        if (other.id === mover.id || !isStanding(other)) continue;
        (allied(state, other.owner, mover.owner) ? occupied : blocked).add(other.square);
    }
    return { blocked, occupied, climb: CHARACTERS[mover.character].climb ?? DEFAULT_CLIMB };
}

/** The AP a move of this many movement points costs: whole AP, each buying the character's allowance; a sneak pays double (§13.2). */
export function moveAp(fighter: Fighter, cost: number, sneaking = false, context?: RulesContext): number {
    const { ABILITIES } = rulesetOf(context);
    return Math.ceil(cost / movementOf(fighter, context)) * (sneaking ? ABILITIES.sneak.ap : 1);
}

/**
 * Everywhere a character could move to with the AP it has left, for the
 * board's shading: `moveAp` of a square's cost is the band it's shaded in.
 * Kept out of the squares it's `avoiding`, as out of an enemy's: the
 * computer's way round the overwatch (`watchedSquares`).
 */
export function reachOf(state: BattleState, fighter: Fighter, sneaking = false, avoiding: ReadonlySet<Square> = new Set()): Reach {
    const { ABILITIES } = rulesetOf(state);
    const allowances = sneaking ? Math.floor(fighter.ap / ABILITIES.sneak.ap) : fighter.ap;
    const rules = moveRules(state, fighter);
    const blocked = new Set(rules.blocked);
    for (const square of avoiding) if (square !== fighter.square) blocked.add(square);
    return reachFrom(state.field, fighter.square, allowances * movementOf(fighter, state), { ...rules, blocked });
}

export interface ShotOdds {
    /** Percent to hit, 0–100. */
    chance: number;
    /** Whether the shot is a far one (`FAR_SHOT_DISTANCE`) whose target's cover it doubled: false at close range, with no cover, and when a hunkered target's cover was doubled already. */
    farCover: boolean;
    /** Percent to graze, on top of the chance to hit. */
    grazeChance: number;
    damage: number;
    grazeDamage: number;
    /** The cover the target has against this shot, a shield wall's included. */
    cover: Cover;
    flanked: boolean;
}

/** Active effects, read from the match's catalogue rather than today's ids. */
export function activeEffects(fighter: Pick<Fighter, "effects">, context?: RulesContext): [EffectId, Effect][] {
    const effects = rulesetOf(context).EFFECTS;
    return (Object.keys(fighter.effects) as EffectId[]).filter(id => hasEffect(fighter, id) && effects[id]).map(id => [id, effects[id]!]);
}

type EffectBonus = "armour" | "damageBonus" | "abilityDamageBonus";
/** Per catalogue, whether any of its effects carries each bonus, or cover: most never do, and `damageTo` and `temporaryCover` are on the planner's hot path. */
const EFFECT_BONUSES = new WeakMap<object, ReadonlySet<EffectBonus | "cover">>();

function effectsCarrying(context?: RulesContext): ReadonlySet<EffectBonus | "cover"> {
    const { EFFECTS } = rulesetOf(context);
    let carried = EFFECT_BONUSES.get(EFFECTS);
    if (!carried) {
        carried = new Set((["armour", "damageBonus", "abilityDamageBonus", "cover"] as const).filter(bonus => Object.values(EFFECTS).some(effect => effect?.[bonus])));
        EFFECT_BONUSES.set(EFFECTS, carried);
    }
    return carried;
}

/** One numeric field of a character's active effects added up: Braced's armour, Blessed's damage. */
function effectTotal(fighter: Partial<Pick<Fighter, "effects">>, field: EffectBonus, context?: RulesContext): number {
    if (!fighter.effects) return 0;
    return effectsCarrying(context).has(field) ? activeEffects({ effects: fighter.effects }, context).reduce((sum, [, effect]) => sum + (effect[field] ?? 0), 0) : 0;
}

export function reactionsBlocked(fighter: Fighter, context?: RulesContext): boolean {
    return activeEffects(fighter, context).some(([, effect]) => effect.preventsReactions);
}

/** A turn's base AP, plus catalogue-wide, character and passive bonuses. */
export function actionPointsOf(fighter: Pick<Fighter, "character" | "option">, context?: RulesContext): number {
    const { RULES, CHARACTERS, ABILITIES } = rulesetOf(context);
    const passive = abilitiesOf(fighter, context).reduce((sum, id) => sum + (ABILITIES[id]!.passive ? ABILITIES[id]!.bonusAp ?? 0 : 0), 0);
    return Math.max(0, RULES.ACTION_POINTS + RULES.BONUS_AP + (CHARACTERS[fighter.character].bonusAp ?? 0) + passive);
}

export function bankedAp(ap: number, context?: RulesContext): number {
    const cap = ruleValuesOf(context).BANK_CAP;
    return Math.max(0, cap === null ? ap : Math.min(ap, cap));
}

/** Reactions don't consume an owner's own-turn attack quota. */
export function countsAsAttack(kind: string, context?: RulesContext): boolean {
    return kind === "attack" || rulesetOf(context).ABILITIES[kind as AbilityId]?.countsAsAttack === true;
}

/** Strongest temporary cover: a passive/active aura, or an effect such as Ward. */
const COVER_ABILITIES = new WeakMap<object, { auras: [AbilityId, Ability][]; reachesEnemies: boolean }>();

function temporaryProtection(state: BattleState, target: Fighter): { cover: Cover; ability?: AbilityId } {
    const rank = { none: 0, half: 1, full: 2 };
    let cover: Cover = "none";
    let abilityId: AbilityId | undefined;
    const offer = (next: Cover | undefined, source?: AbilityId) => {
        if (next && rank[next] > rank[cover]) { cover = next; abilityId = source; }
    };
    const catalogue = rulesetOf(state);
    let known = COVER_ABILITIES.get(catalogue);
    if (!known) {
        const auras = (Object.entries(catalogue.ABILITIES) as [AbilityId, Ability][]).filter(([, ability]) => ability.cover);
        known = { auras, reachesEnemies: auras.some(([, ability]) => ability.coverFor === "everyone") };
        COVER_ABILITIES.set(catalogue, known);
    }
    const { auras, reachesEnemies } = known;
    // Most catalogues have no effect that covers: every shot's odds ask.
    if (effectsCarrying(state).has("cover")) for (const [, effect] of activeEffects(target, state)) offer(effect.cover);
    if (rank[cover] === 2) return { cover, ability: abilityId };
    for (const giver of state.fighters) {
        // Only the target and those next to it can give it cover. Every shot's
        // odds ask, so the cheap test goes first: an aura reaching enemies
        // would otherwise weigh every character on the field (§29.7).
        const self = giver.id === target.id;
        if (!isStanding(giver) || (!self && !isNeighbour(state.field, giver.square, target.square))) continue;
        const friendly = allied(state, giver.owner, target.owner);
        if (!friendly && !reachesEnemies) continue;
        for (const [id, ability] of auras) {
            if (!ability.cover || (!friendly && ability.coverFor !== "everyone")) continue;
            if (!ability.passive && !(ability.stance && hasEffect(giver, ability.stance))) continue;
            if (!abilitiesOf(giver, state).includes(id)) continue;
            if (self ? ability.coverAffectsSelf : canSee(state.field, giver.square, target.square)) offer(ability.cover, id);
            if (rank[cover] === 2) return { cover, ability: abilityId };
        }
    }
    return { cover, ability: abilityId };
}

/** The strongest temporary cover, from an aura or effect. */
export function temporaryCover(state: BattleState, target: Fighter): Cover {
    return temporaryProtection(state, target).cover;
}

/**
 * The squares under a smoke cloud: the 3×3 around where each smoke pot
 * landed, while it lasts (§21.2). A thrower who is downed loses its `smoke`.
 */
export function smokeSquares(state: BattleState): ReadonlySet<Square> {
    // Usually there's none, and every shot's odds ask.
    if (!state.clouds?.length && !state.fighters.some(fighter => fighter.smoke !== undefined)) return new Set();
    return new Set([...landedSmoke(state.fighters), ...state.clouds ?? []].flatMap(at => areaAround(state.field, at)));
}

/** Where each of these characters' smoke pots landed, while its cloud lasts (§21.2). */
export function landedSmoke(throwers: readonly Fighter[]): Square[] {
    return throwers.flatMap(thrower => thrower.smoke !== undefined ? [thrower.smoke] : []);
}

/** The kinds of shot: an attack, an aimed shot, a crippling shot — at an attack's odds — and one on overwatch. */
export type ShotKind = "attack" | "aimedShot" | "cripplingShot" | "poisonArrow" | "bouncingArrow" | "splittingArrow" | "shootDodge" | "thunder" | "overwatch";

/** The shots whose event names the ability (`via`), so the board can draw it: the Realm's (§34). Older shots' events stay as they were. */
const NAMED_SHOTS: ReadonlySet<ShotKind> = new Set<ShotKind>(["poisonArrow", "bouncingArrow", "splittingArrow", "shootDodge", "thunder"]);

/**
 * What a shot leaves on a hit, and only then (§20.2): a crippling shot's
 * slow, or else whatever the weapon leaves — a Frost bolt's, on overwatch
 * too (§23.2).
 */
export function shotEffect(shooter: Fighter, kind: ShotKind, context?: RulesContext): Affliction | undefined {
    const { ABILITIES } = rulesetOf(context);
    const effect = kind !== "attack" && kind !== "overwatch" ? ABILITIES[kind]?.effect : undefined;
    const weapon = kitWeapon(shooter, context);
    return effect ?? (weapon.kind === "ranged" ? weapon.effect : undefined);
}

/**
 * One thing that moves a chance to hit from its base: the amount it adds (or,
 * below zero, takes off) and what it is, so a screen can say why without
 * redoing the sum. The words are the UI's (`oddsLines` in ui.ts).
 */
export type OddsFactor =
    | { kind: "cover"; amount: number; cover: Cover; /** What doubled it, when something did. */ doubled?: "hunkered" | "far"; /** Whether temporary cover improves the terrain. */ shield: boolean; /** The ability supplying temporary cover. */ ability?: AbilityId }
    | { kind: "highGround" | "smoke" | "aimedShot" | "overwatch"; amount: number }
    | { kind: "effect"; amount: number; effect: EffectId };

/** A chance to hit worked out once: where it starts, what moved it and where it came to. */
export interface OddsBreakdown {
    /** The weapon's accuracy, or a strike's `MELEE_ACCURACY`. */
    base: number;
    /** Everything that moved it, in the order they apply. Zero amounts are left out. */
    factors: OddsFactor[];
    /** `base` plus every factor's amount, before it's held to 0–100. */
    raw: number;
    /** Percent to hit, 0–100: `raw`, held there. */
    chance: number;
    /** Percent to graze on top of the chance to hit: a shot's only, a strike has no graze. */
    grazeChance?: number;
}

const clampPercent = (percent: number) => Math.min(ROLL_SIDES, Math.max(0, percent));

/** Sums a chance's base and factors into its breakdown. */
function breakdownOf(base: number, factors: OddsFactor[]): OddsBreakdown {
    const raw = factors.reduce((total, factor) => total + factor.amount, base);
    return { base, factors, raw, chance: clampPercent(raw) };
}

/** What each effect on a character adds to every shot at it, one factor per effect: Marked's, Corroded's (§23.2, §31.2). */
function effectFactors(target: Fighter, context?: RulesContext): OddsFactor[] {
    const { EFFECTS } = rulesetOf(context);
    // Per catalogue, the few effects that move the odds at all: every shot and strike asks.
    let moving = HIT_BONUS_EFFECTS.get(EFFECTS);
    if (!moving) {
        moving = (Object.keys(EFFECTS) as EffectId[]).flatMap((effect): [EffectId, number][] => {
            const { hitBonus } = EFFECTS[effect]! as Effect;
            return hitBonus !== undefined ? [[effect, hitBonus]] : [];
        });
        HIT_BONUS_EFFECTS.set(EFFECTS, moving);
    }
    return moving.flatMap(([effect, amount]): OddsFactor[] => hasEffect(target, effect) ? [{ kind: "effect", amount, effect }] : []);
}
const HIT_BONUS_EFFECTS = new WeakMap<object, readonly [EffectId, number][]>();

/**
 * What a melee strike's chance to hit is (§13.3): `MELEE_ACCURACY` plus what
 * the effects on the target add to every attack at it (Marked, Corroded), and
 * always when the battle predates `BALANCE_VERSION`. Cover, height and smoke
 * are a ranged shot's: whoever is next to the target is past them.
 */
export function strikeBreakdown(state: Pick<BattleState, "rulesVersion">, target: Fighter): OddsBreakdown {
    const { MELEE_ACCURACY } = ruleValuesOf(state);
    return ruleValuesOf(state).MELEE_ROLLS ? breakdownOf(MELEE_ACCURACY, effectFactors(target, state)) : breakdownOf(ROLL_SIDES, []);
}

/** A strike's chance to hit, 0–100 (`strikeBreakdown`). */
export function strikeChance(state: Pick<BattleState, "rulesVersion">, target: Fighter): number {
    return strikeBreakdown(state, target).chance;
}

/** A shot's chance worked out once: its breakdown, the graze band above it, and the cover it was read against. */
interface ShotBreakdown extends OddsBreakdown {
    grazeChance: number;
    cover: Cover;
    far: boolean;
    hunkered: boolean;
}

function shotBreakdown(state: BattleState, attacker: Fighter, target: Fighter, weapon: Extract<Weapon, { kind: "ranged" }>, kind: ShotKind): ShotBreakdown {
    const { FAR_SHOT_DISTANCE, COVER_PENALTY, HIGH_GROUND_RISE, HIGH_GROUND_BONUS, OVERWATCH_PENALTY, GRAZE_BAND } = ruleValuesOf(state);
    const { ABILITIES, ITEMS } = rulesetOf(state);
    const { field } = state;
    // Measured as the range is. A hunkered target's cover is doubled already, and the two don't stack.
    const far = FAR_SHOT_DISTANCE !== null && distance(field, attacker.square, target.square) > FAR_SHOT_DISTANCE;

    const sideCover = coverAgainst(field, target.square, attacker.square);
    const temporary = sideCover === "full" ? { cover: "none" as const } : temporaryProtection(state, target);
    const rank = { none: 0, half: 1, full: 2 };
    const shield = rank[temporary.cover] > rank[sideCover];
    const cover = shield ? temporary.cover : sideCover;
    const hunkered = hasEffect(target, "hunkered");
    const doubled = hunkered ? "hunkered" : far ? "far" : undefined;
    const factors: OddsFactor[] = [
        { kind: "cover", amount: -COVER_PENALTY[cover] * (doubled ? 2 : 1), cover, doubled, shield, ...(shield && temporary.ability ? { ability: temporary.ability } : {}) },
        { kind: "highGround", amount: riseOf(field, attacker.square, target.square) >= HIGH_GROUND_RISE ? HIGH_GROUND_BONUS : 0 },
        ...effectFactors(target, state),
        { kind: "smoke", amount: smokeSquares(state).has(target.square) ? -ITEMS.smokePot.hitPenalty : 0 },
        { kind: "aimedShot", amount: kind === "aimedShot" ? ABILITIES.aimedShot.hitBonus : 0 },
        { kind: "overwatch", amount: kind === "overwatch" ? -OVERWATCH_PENALTY : 0 },
    ];
    const breakdown = breakdownOf(weapon.accuracy, factors.filter(factor => factor.amount !== 0));
    // Grazes are the rolls that miss by `GRAZE_BAND` or less, counted from the
    // raw chance: a shot at −10% can't so much as graze.
    return { ...breakdown, grazeChance: clampPercent(breakdown.raw + GRAZE_BAND) - breakdown.chance, cover, far, hunkered };
}

/**
 * How a character's chance to hit an enemy comes to what it is — a shot's
 * (`shotOdds`), or, with a melee weapon, a strike's (`strikeBreakdown`): the
 * one sum the turn sheet's "why" reads, so it can't drift from the chance shown.
 * Mirrors `hitChance` in tactics.ts.
 */
export function oddsBreakdown(state: BattleState, attacker: Fighter, target: Fighter, kind: ShotKind = "attack"): OddsBreakdown {
    const weapon = weaponOf(state, attacker);
    if (weapon.kind === "ranged" && inRange(state.field, attacker.square, target.square, weapon.range)) return shotBreakdown(state, attacker, target, weapon, kind);
    return strikeBreakdown(state, target);
}

/**
 * The odds of a shot from where the attacker stands, or undefined when it
 * can't take one: it fights in melee, the target is out of range, or it can't
 * see the target (§13.3).
 */
export function shotOdds(state: BattleState, attacker: Fighter, target: Fighter, kind: ShotKind = "attack"): ShotOdds | undefined {
    const { FLANK_BONUS } = ruleValuesOf(state);
    const weapon = weaponOf(state, attacker);
    if (weapon.kind !== "ranged") return undefined;
    if (!inRange(state.field, attacker.square, target.square, weapon.range)) return undefined;
    const { chance, grazeChance, cover, far, hunkered } = shotBreakdown(state, attacker, target, weapon, kind);
    const flanked = cover === "none";
    const ability = kind === "attack" || kind === "overwatch" ? undefined : rulesetOf(state).ABILITIES[kind]!;
    const struck = (ability?.damage ?? weapon.damage) + (flanked ? FLANK_BONUS : 0);
    const via = ability ? "ability" : "weapon";
    // What lands, armour taken off where the team wears it: a graze is half of the blow before it.
    const damage = damageTo(state, attacker, target, struck, via);
    return { chance, farCover: far && !hunkered && cover !== "none", grazeChance, damage, grazeDamage: damageTo(state, attacker, target, Math.ceil(struck / 2), via), cover, flanked };
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
    return !shoots(watcher, state) || !smoke.has(square);
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
    return state.fighters.filter(watcher => isStanding(watcher) && !allied(state, watcher.owner, player) && watcher.banked >= ruleValuesOf(state).REACTION_COST && !reactionsBlocked(watcher, state));
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
            seen = eyes.some(eye => inRange(state.field, eye.square, square, sightOf(eye, state)));
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
        ...(state.rulesVersion !== undefined ? { rulesVersion: state.rulesVersion } : {}),
        fog: true,
        ...(clouds.length > 0 ? { clouds } : {}),
        ...(state.sides ? { sides: state.sides } : {}),
        ...(state.armoured ? { armoured: true as const } : {}),
    };
}

/** How far a character sees in fog of war, in squares (§27): its character's own sight, or `SIGHT_RANGE`. */
export function sightOf(fighter: Pick<Fighter, "character">, context?: RulesContext): number {
    const { SIGHT_RANGE } = ruleValuesOf(context);
    const { CHARACTERS } = rulesetOf(context);
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
 * A dodge supplies its fixed movement-point budget instead of buying reach
 * with AP; it follows the same discovery and rerouting rule.
 */
function routed(state: BattleState, mover: Fighter, sent: readonly Square[], sneaking: boolean, movementPoints?: number): { path: Square[]; found: Fighter[]; ap?: number } {
    const known = new Set(viewOf(state, mover.owner).fighters.map(fighter => fighter.id));
    const unknownOn = (square: Square) => state.fighters.find(other => !allied(state, other.owner, mover.owner) && isStanding(other) && other.square === square && !known.has(other.id));
    const goal = sent[sent.length - 1];
    const found: Fighter[] = [];
    let path = [...sent];
    let ap: number | undefined;
    for (let enemy = path.slice(1).map(unknownOn).find(Boolean); enemy; enemy = path.slice(1).map(unknownOn).find(Boolean)) {
        found.push(enemy);
        known.add(enemy.id);
        const knownState = { ...state, fighters: state.fighters.filter(one => known.has(one.id) || allied(state, one.owner, mover.owner)) };
        const reach = movementPoints === undefined ? reachOf(knownState, mover, sneaking)
            : reachFrom(state.field, mover.square, movementPoints, moveRules(knownState, mover));
        const to = reach.costs[goal] !== Infinity ? goal : nearestTo(state.field, reach, goal, moveRules(state, mover).climb);
        path = pathTo(reach, to)?.squares ?? [mover.square];
        ap = moveAp(mover, reach.costs[to], sneaking, state);
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

export function knockoutPoints(character: CharacterId, context?: RulesContext): number {
    const { KNOCKOUT_DIVISOR } = ruleValuesOf(context);
    const { CHARACTERS } = rulesetOf(context);
    return CHARACTERS[character].points / KNOCKOUT_DIVISOR;
}

/** What an assist on knocking out this character scores: half the knock-out, rounded up (§13.7). */
export function assistPoints(character: CharacterId, context?: RulesContext): number {
    const { ASSIST_DIVISOR } = ruleValuesOf(context);
    return Math.ceil(knockoutPoints(character, context) / ASSIST_DIVISOR);
}

/** A Leap's legal landing; intervening terrain and movement costs do not matter. */
export function leapLanding(state: BattleState, actor: Fighter, at: unknown): at is Square {
    const ability = rulesetOf(state).ABILITIES.leap;
    return !!ability && isSquare(state.field, at) && at !== actor.square
        && inRange(state.field, actor.square, at, ability.range!)
        && riseOf(state.field, at, actor.square) <= ability.maxRise!
        && state.field.tiles[at].terrain.standable
        && !state.fighters.some(one => isStanding(one) && one.square === at);
}

export function leapTargets(state: BattleState, actor: Fighter, at: Square): Fighter[] {
    return state.fighters.filter(one => isStanding(one) && !allied(state, one.owner, actor.owner) && nextTo(state.field, at, one.square));
}

/** Trim an ability's walking route to a square a character can finish on. */
function standingPath(field: Battlefield, path: Square[]): Square[] {
    let end = path.length;
    while (end > 1 && !field.tiles[path[end - 1]].terrain.standable) end--;
    return path.slice(0, end);
}

/** The push's path and any character it collides with. A drop is allowed. */
export function shovePath(state: BattleState, actor: Fighter, target: Fighter): { path: Square[]; collision: boolean; hit?: Fighter } {
    const ability = rulesetOf(state).ABILITIES.shove;
    const a = coordsOf(state.field, actor.square), b = coordsOf(state.field, target.square);
    const dc = Math.sign(b.col - a.col), dr = Math.sign(b.row - a.row);
    const path = [target.square];
    for (let step = 0; step < (ability?.push ?? 0); step++) {
        const from = path[path.length - 1], at = coordsOf(state.field, from);
        const to = squareAt(state.field, at.col + dc, at.row + dr);
        const hit = state.fighters.find(one => one.id !== target.id && isStanding(one) && one.square === to);
        if (to === undefined || hit
            || (riseOf(state.field, to, from) >= FULL_HEIGHT)
            || stepCost(state.field, from, to, Math.max(DEFAULT_CLIMB, riseOf(state.field, from, to))) === undefined) {
            return { path: standingPath(state.field, path), collision: true, ...(hit ? { hit } : {}) };
        }
        path.push(to);
    }
    if (!state.field.tiles[path[path.length - 1]].terrain.standable) {
        return { path: standingPath(state.field, path), collision: true };
    }
    return { path, collision: false };
}

/** Cheapest walking route towards the Cleric, stopped before anybody's square. */
export function beckonPath(state: BattleState, cleric: Fighter, target: Fighter): Square[] {
    const rules = moveRules(state, target);
    const route = pathTo(reachFrom(state.field, target.square, Infinity, { ...rules, occupied: new Set() }), cleric.square)?.squares;
    const path = [target.square];
    for (const square of route?.slice(1, 1 + (rulesetOf(state).ABILITIES.beckon?.pull ?? 0)) ?? []) {
        if (nextTo(state.field, path[path.length - 1], cleric.square)
            || state.fighters.some(one => one.id !== target.id && isStanding(one) && one.square === square)) break;
        path.push(square);
    }
    return standingPath(state.field, path);
}

/** Dodge reach uses terrain and climbing, without reactions or AP spending. */
export function dodgeReach(state: BattleState, fighter: Fighter): Reach {
    return reachFrom(state.field, fighter.square, rulesetOf(state).ABILITIES.shootDodge?.dodge ?? 0, moveRules(state, fighter));
}

export function bounceTargets(state: BattleState, actor: Fighter, target: Fighter): Fighter[] {
    const range = rulesetOf(state).ABILITIES.bouncingArrow?.bounceRange ?? 0;
    return state.fighters.filter(one => one.id !== target.id && isStanding(one) && !allied(state, one.owner, actor.owner)
        && distance(state.field, target.square, one.square) <= range).sort((a, b) => a.id - b.id);
}

// ─── Checking an action ─────────────────────────────────────────────────────

const isSquare = (field: Battlefield, value: unknown): value is Square =>
    Number.isInteger(value) && (value as number) >= 0 && (value as number) < field.tiles.length;

/** Why a character can't use an ability now, or undefined when it can. */
export function abilityRefusal(fighter: Fighter, ability: AbilityId, context?: RulesContext): string | undefined {
    const { CHARACTERS, ABILITIES } = rulesetOf(context);
    if (ABILITIES[ability]?.passive) return `${ABILITIES[ability]!.name} is passive`;
    if (!ABILITIES[ability]! || !abilitiesOf(fighter, context).includes(ability)) return `This ${CHARACTERS[fighter.character].name} can't use ${ABILITIES[ability]?.name ?? ability}`;
    if (ABILITIES[ability]!.bonusAp && (hasEffect(fighter, "hunkered") || fighter.banked > 0)) return "Their turn has ended";
    if (fighter.spent.includes(ability)) return `${ABILITIES[ability]!.name} has been used this battle`;
    if (fighter.usedThisTurn?.includes(ability)) return `${ABILITIES[ability]!.name} has been used this turn`;
    if ((fighter.cooldowns[ability] ?? 0) > 0) return `${ABILITIES[ability]!.name} isn't ready yet`;
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
    if (weaponOf(state, actor).kind === "melee") {
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
    const { ATTACK_AP, HUNKER_AP, REACTION_COST } = ruleValuesOf(battle);
    const { ABILITIES, ITEMS } = rulesetOf(battle);
    // Under fog, what the player can see (§27): an enemy out of sight is
    // neither in the way nor there to be aimed at.
    const state = viewOf(battle, player);
    const refused = (reason: string): Check => ({ refused: reason });
    if (typeof action !== "object" || action === null) return refused("That isn't an action");
    const { kind, fighter: id, target: targetId, targets, path, at } = action as Record<string, unknown>;
    const actor = fighterById(state, id);
    if (!actor || actor.owner !== player) return refused("That isn't one of your characters");
    if (!isStanding(actor)) return refused("That character is down");
    const limit = ruleValuesOf(state).MAX_ATTACKS_PER_TURN;
    if (limit !== null && countsAsAttack(String(kind), state) && (actor.attacksThisTurn ?? 0) >= limit) return refused(`At most ${limit} attacks per turn`);
    const target = fighterById(state, targetId);
    const afford = (ap: number): Check => ap <= actor.ap ? { ap } : refused("Not enough AP");
    const ability = (abilityId: AbilityId, then: () => string | undefined): Check => {
        const reason = abilityRefusal(actor, abilityId, battle) ?? then();
        return reason ? refused(reason) : afford(ABILITIES[abilityId]!.ap);
    };

    switch (kind) {
        case "move":
        case "sneak": {
            if (kind === "sneak") {
                const reason = abilityRefusal(actor, "sneak", battle);
                if (reason) return refused(reason);
            }
            const cost = pathRefusal(state, actor, path);
            return typeof cost === "string" ? refused(cost) : afford(moveAp(actor, cost, kind === "sneak", battle));
        }
        case "attack": {
            const reason = attackRefusal(state, actor, target, "attack");
            return reason ? refused(reason) : afford(ATTACK_AP);
        }
        case "shove":
        case "poisonArrow":
        case "bouncingArrow":
        case "thunder":
            return ability(kind, () => attackRefusal(state, actor, target, kind === "shove" ? "attack" : kind));
        case "shootDodge":
            return ability(kind, () => {
                const reason = attackRefusal(state, actor, target, kind);
                if (reason) return reason;
                if (Array.isArray(path) && path.length === 1 && path[0] === actor.square) return undefined;
                const cost = pathRefusal(state, actor, path);
                return typeof cost === "string" ? cost : cost > ABILITIES.shootDodge!.dodge! ? "Too far to dodge" : undefined;
            });
        case "splittingArrow":
            return ability(kind, () => {
                if (!Array.isArray(targets) || targets.length !== 2 || targets[0] === targets[1]) return "Pick two different enemies";
                return targets.map(id => attackRefusal(state, actor, fighterById(state, id), kind)).find(Boolean);
            });
        case "leap":
            return ability(kind, () => leapLanding(state, actor, at) ? undefined : "Pick a clear landing in sight within 4 squares, at most one height up");
        case "beckon":
        case "ward":
            return ability(kind, () => {
                if (!target || !isStanding(target) || !allied(state, actor.owner, target.owner) || (kind === "beckon" && target.id === actor.id)) return "Pick an ally";
                const reason = aimRefusal(state, actor, target.square, ABILITIES[kind]!.range!);
                return reason ?? (kind === "beckon" && beckonPath(state, actor, target).length < 2 ? "That ally cannot be pulled closer" : undefined);
            });
        case "slashAndDash":
        case "bulwark":
        case "taunt":
        case "focus":
        case "blessing":
            return ability(kind, () => undefined);
        case "aimedShot":
            return ability("aimedShot", () => attackRefusal(state, actor, target, "aimedShot"));
        // An attack with the character's own weapon, at its usual odds, that
        // leaves an effect: Shield bash strikes, Crippling shot shoots (§23.2).
        case "shieldBash":
            return ability("shieldBash", () => attackRefusal(state, actor, target, "attack"));
        // A strike with the character's own reach, for the ability's damage (§31.2).
        case "rend":
            return ability("rend", () => attackRefusal(state, actor, target, "attack"));
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
            if (reactionsBlocked(actor, state)) return refused("A stunned character can't go on watch");
            return actor.ap >= REACTION_COST ? { ap: actor.ap } : refused(`Going on watch needs at least ${REACTION_COST} AP`);
        case "cleave":
            return ability("cleave", () => {
                if (!Array.isArray(targets) || targets.length !== 2 || targets[0] === targets[1]) return "Pick two enemies";
                const enemies = targets.map(one => fighterById(state, one));
                if (!enemies.every((one): one is Fighter => isEnemy(state, actor, one))) return "Pick two enemies";
                return enemies.every(one => inMeleeReach(state.field, actor.square, one.square, state)) ? undefined : "Both enemies must be next to them, within a quarter of their height";
            });
        case "shieldWall":
            return ability("shieldWall", () => undefined);
        case "demolish":
            return ability("demolish", () => isSquare(state.field, at) && coverNextTo(state.field, actor.square, at) ? undefined : "Pick low cover next to them");
        case "purify":
            return ability("purify", () => purified(state, actor).length > 0 ? undefined : "Nobody beside them needs it");
        case "fireball":
        case "dynamite":
        case "iceBall":
            return ability(kind, () => aimRefusal(state, actor, at, ABILITIES[kind]!.range!));
        case "heal":
        case "regrowth":
            return ability(kind, () => healRefusal(state, actor, target, false, ABILITIES[kind]!.range));
        case "burst":
            return ability("burst", () => state.fighters.some(one => isEnemy(state, actor, one) && burstArea(state.field, actor.square).includes(one.square))
                ? undefined : "No enemy next to them");
        case "raise":
        case "runeRaise":
            return ability(kind, () => {
                if (!target || !allied(state, target.owner, actor.owner) || isStanding(target)) return "Pick a downed ally";
                if (!nextTo(state.field, actor.square, target.square)) return "Too far away to raise";
                const clear = state.field.tiles[target.square].terrain.standable
                    && !state.fighters.some(other => isStanding(other) && other.square === target.square);
                return clear ? undefined : "There's no room to stand there";
            });
        case "throw": {
            const item = itemOf(actor, battle);
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
 * is hurt or has something a heal clears (§20.2, §21.2), or itself — one it
 * can see in the ability's `range` (Heal, Regrowth), or, for a healing
 * draught (`draught`), one next to it.
 */
function healRefusal(state: BattleState, healer: Fighter, target: Fighter | undefined, draught: boolean, range = 0): string | undefined {
    if (!target || !allied(state, target.owner, healer.owner) || !isStanding(target)) return "Pick an ally to heal";
    const far = draught ? undefined : aimRefusal(state, healer, target.square, range);
    if (far) return far;
    if (draught && target.id !== healer.id && !nextTo(state.field, healer.square, target.square)) return "Too far away to heal";
    return target.hp < maxHpOf(target, state) || healedEffects(target, state).length > 0 ? undefined : "Already at full health";
}

/** Whether a square is low cover next to one standing on `from`: what a Knight's Demolish can be aimed at (§23.2). */
export function coverNextTo(field: Battlefield, from: Square, square: Square): boolean {
    return !!field.tiles[square].terrain.destructible && nextTo(field, from, square);
}

/** Who a Demolish at the cover on `at` strikes: everyone beside it but the Knight that swung it, friend or foe (§23.2). */
export function demolishArea(field: Battlefield, knight: Square, at: Square): Square[] {
    return areaAround(field, at).filter(square => square !== knight);
}

/** Who a Bloater's Burst splashes: everyone next to it, friend or foe, but itself (§31.2) — a Demolish at its own square. */
export const burstArea = (field: Battlefield, bloater: Square): Square[] => demolishArea(field, bloater, bloater);

/** The afflictions on a character, which Purify clears: every one, Marked among them (§23.2). */
export function afflictionsOn(fighter: Fighter, context?: RulesContext): Affliction[] {
    return afflictionsOf(context).filter(effect => hasEffect(fighter, effect));
}

/**
 * Who a Cleric's Purify would reach (§23.2): itself and every standing ally
 * next to it, as a healing draught reaches, that is hurt or afflicted — the
 * ones it would do anything for. Ids in battle order.
 */
export function purified(state: BattleState, cleric: Fighter): Fighter[] {
    return state.fighters.filter(ally => allied(state, ally.owner, cleric.owner) && isStanding(ally)
        && (ally.id === cleric.id || nextTo(state.field, cleric.square, ally.square))
        && (ally.hp < maxHpOf(ally, state) || afflictionsOn(ally, state).length > 0));
}

// ─── Taking an action ───────────────────────────────────────────────────────

/**
 * A character with an effect put on it by the character `by`, or put on
 * again: effects don't stack, so the longer count stands (§20.2). Burning
 * remembers who set it last; stunning loses whatever was banked, so it can't
 * react until its owner's next turn. Undefined for a character that's down,
 * which keeps no effects.
 */
export function afflicted(target: Fighter, effect: Affliction, by: number, context?: RulesContext): { fighter: Fighter; event: BattleEvent } | undefined {
    const { EFFECTS } = rulesetOf(context);
    if (!isStanding(target)) return undefined;
    const was = target.effects[effect] ?? 0;
    const fighter: Fighter = { ...target, effects: { ...target.effects, [effect]: Math.max(was, EFFECTS[effect]!.count) } };
    if (effect === "burning") fighter.burnedBy = by;
    if (EFFECTS[effect]!.damage && effect !== "burning") fighter.effectSources = { ...fighter.effectSources, [effect]: by };
    if (EFFECTS[effect]!.preventsReactions) fighter.banked = 0;
    return { fighter, event: { kind: "effect", fighter: target.id, effect, change: was > 0 ? "refreshed" : "applied" } };
}

/** The effects on a character that a heal clears (§20.2). */
export function healedEffects(fighter: Fighter, context?: RulesContext): EffectId[] {
    const { EFFECTS } = rulesetOf(context);
    return (Object.keys(EFFECTS) as EffectId[]).filter(effect => "healed" in EFFECTS[effect]! && hasEffect(fighter, effect));
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

/**
 * A deep copy of plain data — a battle's fighters, which are nothing but
 * numbers, strings, arrays and plain objects — that a rule can change without
 * touching what it was handed. What `structuredClone` makes, many times
 * quicker, since the computer copies the fighters for every action it weighs.
 */
function copyOf<T>(value: T): T {
    if (Array.isArray(value)) return value.map(copyOf) as T;
    if (value === null || typeof value !== "object") return value;
    const copy: Record<string, unknown> = {};
    for (const key of Object.keys(value)) copy[key] = copyOf((value as Record<string, unknown>)[key]);
    return copy as T;
}

/** A working copy of the battle that an action changes as it resolves, writing down what happens. */
function resolver(state: BattleState, roll: Roll) {
    const fighters = copyOf(state.fighters) as Fighter[];
    const battle: BattleState = { ...state, fighters };
    const events: BattleEvent[] = [];
    const get = (id: number): Fighter => {
        const fighter = fighterById(battle, id);
        if (!fighter) throw new Error(`No fighter ${id}`);
        return fighter;
    };

    /**
     * Takes HP off a character; at 0 it's down, losing every effect, and an
     * enemy who downed it scores (§13.5, §13.7, §20.2). So does every other
     * enemy who hurt it since it last stood up — all but the downer's own
     * side, which the knock-out already scores for.
     * An assist is only ever beside a knock-out: a character downed by its own
     * side, or by a fire whose setter has left, scores nobody anything. In a
     * duel or in co-op, only the downer's side can have hurt it, so assists
     * come only in a free-for-all.
     */
    const wound = (by: Pick<Fighter, "id" | "owner">, target: Fighter, damage: number) => {
        const enemy = !allied(battle, by.owner, target.owner);
        if (enemy && damage > 0 && !target.woundedBy?.includes(by.owner)) target.woundedBy = [...target.woundedBy ?? [], by.owner];
        target.hp = Math.max(0, target.hp - damage);
        if (isStanding(target)) return;
        const assists = enemy ? (target.woundedBy ?? []).filter(owner => !allied(battle, owner, by.owner)) : [];
        Object.assign(target, { ap: 0, banked: 0, effects: {} });
        delete target.burnedBy;
        delete target.effectSources;
        delete target.woundedBy;
        // Its smoke goes with it, as a downed Knight's shield wall does (§21.2).
        delete target.smoke;
        events.push({ kind: "downed", fighter: target.id, by: by.id });
        // Downing your own side's character — a fireball's, say — scores nobody anything.
        if (enemy) events.push({ kind: "scored", player: by.owner, points: knockoutPoints(target.character, state), reason: "knockout" });
        for (const player of assists) events.push({ kind: "scored", player, points: assistPoints(target.character, state), reason: "assist" });
    };

    const afflict = (by: Fighter, target: Fighter, effect: Affliction) => {
        const result = afflicted(target, effect, by.id, state);
        if (!result) return;
        const previous = target.effects[effect] ?? 0;
        Object.assign(target, result.fighter);
        // A buff on another owner's turn lasts through that owner's next
        // turn, rather than two full turns of theirs.
        if (rulesetOf(state).EFFECTS[effect]?.decayAt === "end" && target.owner !== by.owner) target.effects[effect] = Math.max(previous, rulesetOf(state).EFFECTS[effect]!.count - 1);
        events.push(result.event);
    };

    /** A shot, which leaves its `shotEffect` on a hit, and only then (§20.2). */
    const shoot = (by: Fighter, target: Fighter, kind: ShotKind) => {
        const effect = shotEffect(by, kind, state);
        const odds = shotOdds(battle, by, target, kind);
        if (!odds) throw new Error(`${by.id} can't shoot ${target.id}`);
        const rolled = roll();
        const result = shotResult(odds, rolled);
        const damage = result === "hit" ? odds.damage : result === "graze" ? odds.grazeDamage : 0;
        events.push({ kind: "shot", fighter: by.id, target: target.id, chance: odds.chance, roll: rolled, result, damage, reaction: kind === "overwatch", ...(NAMED_SHOTS.has(kind) ? { via: kind as AbilityId } : {}) });
        if (damage > 0) wound(by, target, damage);
        if (result === "hit" && effect) afflict(by, target, effect);
        return result;
    };

    /**
     * A melee strike (§13.3): for the weapon's damage, or an ability's own
     * (Shield bash, Rend). Under `BALANCE_VERSION` it rolls against
     * `strikeChance` — a hit or a miss, with no graze — and before it, it
     * always hit and rolled nothing. Says whether it landed.
     */
    const strike = (by: Fighter, target: Fighter, reaction = false, blow = weaponOf(battle, by).damage, via: BlowSource = "weapon"): boolean => {
        const damage = damageTo(battle, by, target, blow, via);
        if (!ruleValuesOf(battle).MELEE_ROLLS) {
            events.push({ kind: "struck", fighter: by.id, target: target.id, damage, reaction });
            wound(by, target, damage);
            return true;
        }
        const chance = strikeChance(battle, target);
        const rolled = roll();
        const missed = rolled > chance;
        events.push({ kind: "struck", fighter: by.id, target: target.id, damage: missed ? 0 : damage, reaction, chance, roll: rolled, ...(missed ? { missed: true as const } : {}) });
        if (!missed) wound(by, target, damage);
        return !missed;
    };

    /**
     * Something landing on some squares without a roll — a fireball, a thrown
     * flask — hitting everyone standing there, friend or foe: the event
     * `told` makes of who it hit, then its damage, then its effect on
     * whoever it didn't down (§13.6, §20.2).
     */
    const land = (by: Fighter, squares: readonly Square[], damage: number, effect: Affliction | undefined, told: (targets: number[]) => BattleEvent, via: BlowSource = "ability") => {
        const area = new Set(squares);
        const hit = fighters.filter(one => isStanding(one) && area.has(one.square));
        const damages = Object.fromEntries(hit.map(target => [target.id, damageTo(battle, by, target, damage, via)]));
        const event = told(hit.map(one => one.id));
        // Old events stay byte-for-byte the same. New bonus/armour effects
        // need actual amounts for each HP cue and the battle record.
        if ("targets" in event && "damage" in event && effectsCarrying(state).has("damageBonus")
            && hit.some(target => damages[target.id] !== damage)) event.damages = damages;
        events.push(event);
        if (damage > 0) for (const target of hit) wound(by, target, damages[target.id]);
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
        const restored = Math.min(hp, maxHpOf(target, state) - target.hp);
        target.hp += restored;
        events.push({ kind: "healed", fighter: by.id, target: target.id, hp: restored, ...(via ? { via } : {}) });
        for (const effect of via === "purify" ? afflictionsOn(target, state) : healedEffects(target, state)) {
            delete target.effects[effect];
            if (target.effectSources) delete target.effectSources[effect];
            events.push({ kind: "effect", fighter: target.id, effect, change: "cleared" });
        }
        delete target.burnedBy;
    };

    const hit = (by: Fighter, target: Fighter, blow: number, via: AbilityId) => {
        const damage = damageTo(battle, by, target, blow, "ability");
        events.push({ kind: "struck", fighter: by.id, target: target.id, damage, reaction: false, via });
        wound(by, target, damage);
    };
    const relocate = (mover: Fighter, path: Square[], via: AbilityId) => {
        if (path.length < 2) return;
        events.push({ kind: "moved", fighter: mover.id, path, sneaking: false, via });
        mover.facing = facingTowards(state.field, path[path.length - 2], path[path.length - 1]);
        mover.square = path[path.length - 1];
    };
    return { fighters, battle, events, get, shoot, strike, wound, afflict, land, blast, mend, hit, relocate };
}

/**
 * Walks a path, resolving each reaction as it comes (nearest watcher first),
 * and stops the mover where a reaction downs it (§17.2). The walk is told as
 * `moved` segments broken by the reactions, so a replay can play it in order.
 * The mover turns to face each step it takes, so it ends facing its last.
 */
function walk(state: BattleState, run: ReturnType<typeof resolver>, mover: Fighter, path: Square[], sneaking: boolean, withoutReactions: boolean) {
    const { REACTION_COST } = ruleValuesOf(state);
    const reactions = withoutReactions ? [] : reactionsTo(state, mover, path);
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
        if (shoots(watcher, state)) run.shoot(watcher, mover, "overwatch");
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
    const { ABILITIES, ITEMS, EFFECTS } = rulesetOf(state);
    const checked = check(state, player, action);
    if ("refused" in checked) throw new Error(checked.refused);

    const run = resolver(state, roll);
    const { events, get } = run;
    const actor = get(action.fighter);
    // A move's AP waits on where it goes (`routed`, §27).
    const moving = action.kind === "move" || action.kind === "sneak";
    if (!moving) actor.ap -= checked.ap;
    if (ruleValuesOf(state).MAX_ATTACKS_PER_TURN !== null && countsAsAttack(action.kind, state)) actor.attacksThisTurn = (actor.attacksThisTurn ?? 0) + 1;
    if (Object.hasOwn(ABILITIES, action.kind)) {
        const id = action.kind as AbilityId;
        const { cooldown, oncePerBattle, oncePerTurn } = abilityRules(state, id);
        if (cooldown > 0) actor.cooldowns[id] = cooldown;
        if (oncePerBattle) actor.spent.push(id);
        if (oncePerTurn) actor.usedThisTurn = [...actor.usedThisTurn ?? [], id];
    }

    switch (action.kind) {
        case "move":
        case "sneak": {
            // An enemy out of sight in the way is found and gone round (§27).
            const sneaking = action.kind === "sneak";
            const { path, found, ap } = routed(state, actor, action.path, sneaking);
            actor.ap -= ap ?? checked.ap;
            for (const enemy of found) events.push({ kind: "spotted", fighter: actor.id, by: enemy.id });
            walk(state, run, actor, path, sneaking, sneaking && ABILITIES.sneak.movesWithoutReactions === true);
            break;
        }
        case "attack":
        case "aimedShot": {
            const target = get(action.target);
            if (!shoots(actor, state)) run.strike(actor, target);
            else run.shoot(actor, target, action.kind);
            break;
        }
        case "leap":
            run.relocate(actor, [actor.square, action.at], action.kind);
            for (const target of leapTargets(run.battle, actor, action.at)) run.hit(actor, get(target.id), ABILITIES.leap!.damage!, action.kind);
            break;
        case "shove": {
            const target = get(action.target), ability = ABILITIES.shove!;
            const push = shovePath(run.battle, actor, target);
            if (run.strike(actor, target, false, ability.damage, "ability")) {
                run.relocate(target, push.path, action.kind);
                if (push.collision) {
                    if (isStanding(target)) run.hit(actor, target, ability.collisionDamage!, action.kind);
                    if (push.hit) run.hit(actor, get(push.hit.id), ability.collisionDamage!, action.kind);
                }
            }
            break;
        }
        case "beckon": {
            const target = get(action.target);
            run.relocate(target, beckonPath(run.battle, actor, target), action.kind);
            break;
        }
        case "poisonArrow":
        case "thunder":
            run.shoot(actor, get(action.target), action.kind);
            break;
        case "bouncingArrow": {
            const target = get(action.target);
            const choices = bounceTargets(run.battle, actor, target);
            if (run.shoot(actor, target, action.kind) === "hit" && choices.length) {
                // The command records this additional 1–100 draw with the hit rolls.
                const ceiling = Math.floor(ROLL_SIDES / choices.length) * choices.length;
                let drawn = roll();
                while (drawn > ceiling && drawn <= ROLL_SIDES) drawn = roll();
                const chosen = choices[(drawn - 1) % choices.length];
                run.hit(actor, get(chosen.id), ABILITIES.bouncingArrow!.bounceDamage!, action.kind);
            }
            break;
        }
        case "splittingArrow":
            for (const id of action.targets) run.shoot(actor, get(id), action.kind);
            break;
        case "shootDodge": {
            run.shoot(actor, get(action.target), action.kind);
            const { path, found } = routed(run.battle, actor, action.path, false, ABILITIES.shootDodge!.dodge!);
            for (const enemy of found) events.push({ kind: "spotted", fighter: actor.id, by: enemy.id });
            run.relocate(actor, path, action.kind);
            break;
        }
        case "slashAndDash":
            events.push({ kind: "ability", fighter: actor.id, ability: action.kind });
            break;
        case "taunt":
        case "blessing":
        case "focus":
        case "ward": {
            const ability = ABILITIES[action.kind]!;
            const allies = action.kind === "ward" ? [get(action.target)] : action.kind === "focus" ? [actor]
                : run.fighters.filter(one => isStanding(one) && allied(state, actor.owner, one.owner)
                    && (ability.radius === undefined || distance(state.field, actor.square, one.square) <= ability.radius));
            for (const ally of allies) run.afflict(actor, ally, ability.effect!);
            break;
        }
        case "bulwark": break; // Passive: check always refuses activating it.
        case "shieldBash":
            // For the ability's damage, not the sword's, and stunned if it stays up (§23.2).
            // A miss stuns nobody, as a shot leaves its effect only on a hit.
            if (run.strike(actor, get(action.target), false, ABILITIES.shieldBash.damage, "ability")) run.afflict(actor, get(action.target), ABILITIES.shieldBash.effect);
            break;
        case "rend":
            // For the ability's damage, not the talons' (§31.2).
            run.strike(actor, get(action.target), false, ABILITIES.rend.damage, "ability");
            break;
        case "burst": {
            // Everyone next to it, friend or foe, hit and corroded; then the
            // Bloater itself is spent, downed by its own hand, which scores
            // nobody anything (§31.2).
            const { damage, effect } = ABILITIES.burst;
            run.land(actor, burstArea(state.field, actor.square), damage, effect,
                targets => ({ kind: "burst", fighter: actor.id, targets, damage }));
            run.wound(actor, actor, actor.hp);
            break;
        }
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
            actor.banked = bankedAp(checked.ap, state);
            events.push({ kind: "watching", fighter: actor.id, banked: actor.banked });
            break;
        case "cleave":
            for (const id of action.targets) run.strike(actor, get(id), false, undefined, "ability");
            break;
        case "shieldWall":
            actor.effects[ABILITIES.shieldWall.stance ?? "shieldWall"] = EFFECTS[ABILITIES.shieldWall.stance ?? "shieldWall"]!.count;
            events.push({ kind: "shieldWall", fighter: actor.id });
            break;
        case "fireball":
        case "dynamite":
        case "iceBall": {
            // Every character in the area, friend or foe — the thrower too, if
            // it's that close — and no roll (§13.6). Whoever a fireball doesn't
            // down is left burning: it doesn't roll, so it always does (§20.2);
            // dynamite leaves nothing behind (§33.2). Then the low cover it
            // landed on is gone (§22).
            const kind = action.kind;
            const ability: Ability = ABILITIES[kind]!;
            const damage = ability.damage ?? 0;
            run.land(actor, areaAround(state.field, action.at), damage, ability.effect,
                targets => ({ kind, fighter: actor.id, at: action.at, targets, damage }));
            run.blast(actor, blastedBy(state.field, ability, action.at));
            break;
        }
        case "heal":
        case "regrowth":
            // The answer to effects: it puts out burning, and clears slowed, stunned and corroded (§20.2).
            run.mend(actor, get(action.target), ABILITIES[action.kind]!.hp);
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
                targets => ({ kind: "thrown", fighter: actor.id, item: id, at: action.at, targets, damage }), "item");
            run.blast(actor, blastedBy(state.field, item, action.at));
            break;
        }
        case "raise":
        case "runeRaise": {
            // Back on its feet at half HP, with the catalogue's AP to spend
            // if it's its owner's turn and nothing until their next turn if
            // not; the points for downing it stay scored (§13.5).
            const target = get(action.target);
            target.hp = Math.ceil(maxHpOf(target, state) / 2);
            target.ap = target.owner === player ? ABILITIES[action.kind]!.apOnRaise ?? 0 : 0;
            events.push({ kind: "raised", fighter: actor.id, target: target.id, hp: target.hp });
            break;
        }
    }
    if (isStanding(actor)) actor.ap += ABILITIES[action.kind as AbilityId]?.bonusAp ?? 0;
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
/** Apply damage and expiry at the boundary specified by each effect. */
function tickEffects(run: ReturnType<typeof resolver>, player: string, boundary: "start" | "end") {
    for (const fighter of run.fighters) {
        if (fighter.owner !== player || !isStanding(fighter)) continue;
        for (const [id, effect] of activeEffects(fighter, run.battle)) {
            if ((effect.tick ?? "start") === boundary && effect.damage) {
                const source = id === "burning" ? fighter.burnedBy : fighter.effectSources?.[id];
                const by = run.fighters.find(one => one.id === source) ?? { id: source ?? fighter.id, owner: fighter.owner };
                run.events.push({ kind: "burned", fighter: fighter.id, damage: effect.damage, ...(id === "burning" ? {} : { effect: id }) });
                run.wound(by, fighter, effect.damage);
            }
            if (!isStanding(fighter)) break;
            if ((effect.decayAt ?? effect.tick ?? "start") === boundary) {
                const left = (fighter.effects[id] ?? 0) - 1;
                if (left > 0) fighter.effects[id] = left;
                else {
                    delete fighter.effects[id];
                    if (fighter.effectSources) delete fighter.effectSources[id];
                }
            }
        }
        if (!hasEffect(fighter, "burning")) delete fighter.burnedBy;
    }
}

export function startTurn(state: BattleState, player: string): Outcome {
    const run = resolver(state, fixedRolls([]));
    for (const fighter of run.fighters) {
        if (fighter.owner !== player || !isStanding(fighter)) continue;
        let ap = actionPointsOf(fighter, state);
        const effects = activeEffects(fighter, state);
        for (const [, effect] of effects) if (effect.ap !== undefined) ap = Math.min(ap, effect.ap);
        fighter.ap = Math.max(0, effects.reduce((value, [, effect]) => value + (effect.apModifier ?? 0), ap));
        fighter.banked = 0;
        delete fighter.smoke;
        delete fighter.usedThisTurn;
        delete fighter.attacksThisTurn;
    }
    tickEffects(run, player, "start");
    for (const fighter of run.fighters) if (fighter.owner === player && isStanding(fighter)) fighter.cooldowns = countDown(fighter.cooldowns);
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
    const { CENTRE_SCORES_FROM_ROUND, CENTRE_POINTS } = ruleValuesOf(state);
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
    const { REACTION_COST } = ruleValuesOf(state);
    const still = Array.isArray(keepStill) ? keepStill : [];
    const run = resolver(state, fixedRolls([]));
    tickEffects(run, player, "end");
    const fighters = run.fighters.map(fighter => {
        if (fighter.owner !== player || !isStanding(fighter)) return fighter;
        const watching = fighter.ap >= REACTION_COST && !still.includes(fighter.id) && !reactionsBlocked(fighter, state);
        const banked = watching ? bankedAp(fighter.ap, state) : fighter.banked;
        if (watching) run.events.push({ kind: "watching", fighter: fighter.id, banked });
        return { ...fighter, ap: 0, banked };
    });
    const points = centrePoints({ ...state, fighters }, player, round);
    if (points > 0) run.events.push({ kind: "scored", player, points, reason: "centre" });
    return { fighters, events: run.events };
}

// ─── The end of the battle (§5.1) ───────────────────────────────────────────

/** How many rounds Hold Out lasts for two players once the team is stout (`BALANCE_VERSION`): the same 13 as three players have. */
export const HOLD_OUT_PAIR_ROUNDS = currentRuleset.RULES.HOLD_OUT_PAIR_ROUNDS;

/** What decides a battle's length besides its players: the co-op mission, and the rules version it was created under. */
export interface BattleKind {
    mission?: string;
    rulesVersion?: number;
}

/**
 * How many battle rounds a battle of `playerCount` players lasts (§13.8). Solo
 * (§30.6) lasts a duel's: its round is one player's turn and one warband's, as
 * a duel's is two players'. Hold Out for exactly two players, created under
 * `BALANCE_VERSION`, lasts `HOLD_OUT_PAIR_ROUNDS` instead — and not Solo's, nor
 * a duel's, nor Hold the Centre's. A team of four in Hold Out lasts a team of
 * three's, 13 rounds (§37), so its four waves land in rounds 4, 7, 10 and 13
 * as the others' do; a free-for-all of four keeps its 12. Everything that asks
 * when a battle ends, or when its waves land, asks here with the battle's
 * `kind`, so none can differ.
 */
export function battleRounds(playerCount: number, { mission, rulesVersion }: BattleKind = {}): number {
    const rules = ruleValuesOf({ rulesVersion });
    if (playerCount === 2 && mission === "holdOut") return rules.HOLD_OUT_PAIR_ROUNDS;
    const seats = playerCount === 1 ? 2 : mission === "holdOut" ? Math.min(playerCount, LINE_COOP_MAX) : playerCount;
    const rounds = rules.BATTLE_ROUNDS[seats as PlayerCount];
    if (rounds === undefined) throw new Error(`Realm Arena has no battle length for ${playerCount} players`);
    return rounds;
}

/** Hold Out's waves come every this many rounds, the first at the start of round 4 (§30.3). */
const WAVE_EVERY = 3;

/** Whether a fresh Hold Out wave arrives as `round` (counted from 1) begins, in a battle `rounds` long (§30.3). */
export function waveArrives(round: number, rounds: number): boolean {
    return round > 1 && round <= rounds && (round - 1) % WAVE_EVERY === 0;
}

/** How many Hold Out waves have landed by the start of `round` (counted from 1), the warbands' own muster not counted (§30.3). */
export function wavesLanded(round: number): number {
    return Math.max(0, Math.floor((round - 1) / WAVE_EVERY));
}

/** The round the next Hold Out wave arrives in after `round`, or undefined once the last has landed (§30.3). */
export function nextWaveRound(round: number, rounds: number): number | undefined {
    const next = round + WAVE_EVERY - (round - 1) % WAVE_EVERY;
    return next <= rounds ? next : undefined;
}

/** The round the last Hold Out wave arrives in, in a battle `rounds` long (§30.3). */
export function lastWaveRound(rounds: number): number {
    return rounds - (rounds - 1) % WAVE_EVERY;
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
export function isBattleOver(state: BattleState, players: readonly string[], roundsPlayed: number, kind: BattleKind = {}): boolean {
    return roundsPlayed >= battleRounds(players.length, kind) || sidesStanding(state).length <= 1;
}

/** The points' worth of a side still standing: the first tie-break. In a free-for-all, a player's squad (`sideOf`). */
export function standingPoints(state: BattleState, side: string): number {
    return squadPoints(state.fighters.filter(fighter => sideOf(state, fighter.owner) === side && isStanding(fighter)).map(fighter => fighter.character), state);
}

/** A side's score: its owners' added together (§29.6). In a free-for-all, a player's own. */
export function sideScore(state: Pick<BattleState, "sides">, scores: Readonly<Record<string, number>>, side: string): number {
    return Object.entries(scores).reduce((total, [owner, points]) => total + (sideOf(state, owner) === side ? points : 0), 0);
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
export function musterPoints(picks: readonly MusterPick[], context?: RulesContext): number {
    return squadPoints(picks.map(pick => pick.character), context) + itemsPoints(picks.map(pick => pick.item), context);
}

/**
 * Why a pick's option can't be mustered, or undefined when it can (§23.2):
 * none at all, or one of that character's that `ranks` — the player's own, as
 * the battle snapshotted them when it was created (§23.3) — has unlocked. The
 * client never claims an option; it only sends the pick.
 */
function optionRefusal(pick: Partial<MusterPick>, character: CharacterId, ranks: Ranks, context?: RulesContext): string | undefined {
    const { OPTIONS } = rulesetOf(context);
    if (pick.option == null) return undefined;
    if (!isOptionId(pick.option, context) || OPTIONS[pick.option].character !== character) return "That isn't an option for that character";
    return (ranks[character] ?? 0) >= OPTIONS[pick.option].rank ? undefined : "That option isn't unlocked yet";
}

/**
 * Why a squad can't muster, or undefined when it can: at least one
 * character, each from its faction's roster (§29.3), as many of any one as the budget buys, at most one item each,
 * at most one option each that `ranks` unlocks, within the budget with the
 * items, and each on its own square of the seat's deployment zone. Total,
 * like `check`.
 */
export function musterRefusal(field: Battlefield, seat: number, picks: unknown, budget: number, ranks: Ranks, faction: Faction, context?: RulesContext): string | undefined {
    if (!Array.isArray(picks) || picks.length === 0) return "Muster at least one character";
    const zone = new Set(Array.isArray(field.deployments[seat]) ? field.deployments[seat] : []);
    const squares = new Set<Square>();
    for (const pick of picks as Partial<MusterPick>[]) {
        if (!isCharacterId(pick?.character, context)) return "That isn't a character";
        if (!faction.characters.includes(pick.character)) return "That character isn't in your faction";
        // One slot, so an item is one id or nothing: never a list (§21.1).
        if (pick.item != null && !isItemId(pick.item, context)) return "That isn't an item";
        const option = optionRefusal(pick, pick.character, ranks, context);
        if (option) return option;
        if (!zone.has(pick.square as Square) || squares.has(pick.square as Square)) return "Each character needs its own square in your deployment zone";
        squares.add(pick.square as Square);
    }
    const points = musterPoints(picks as MusterPick[], context);
    return points <= budget ? undefined : `That squad costs ${points} points, and the budget is ${budget}`;
}

/**
 * A character as it first stands on the battlefield, at full HP with nothing
 * spent, carrying what it was mustered with. A `stout` one is of Hold Out's
 * team (`musterHp`) and carries its bigger `maxHp`.
 */
export function newFighter(id: number, owner: string, character: CharacterId, square: Square, item: ItemId | null = null, option?: OptionId, stout = false, context?: RulesContext): Fighter {
    return {
        id, owner, character, square, hp: musterHp(character, stout, context), ...(stout ? { maxHp: teamHp(character, context) } : {}),
        ap: 0, banked: 0, effects: {}, cooldowns: {}, spent: [], item, ...(option ? { option } : {}),
    };
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
        // Copied, so an undo snapshot never shares them with the live fighter.
        ...(fighter.tally ? { tally: addTally(fighter.tally, NO_TALLY) } : {}),
        ...(fighter.woundedBy ? { woundedBy: [...fighter.woundedBy] } : {}),
        ...(fighter.effectSources ? { effectSources: { ...fighter.effectSources } } : {}),
        ...(fighter.usedThisTurn ? { usedThisTurn: [...fighter.usedThisTurn] } : {}),
    };
}

/**
 * A squad dealt round a zone's areas like cards — the first character to the
 * first area, the next to the next — each area's share spread evenly along
 * the middle line of its long side.
 */
function dealtRound(field: Battlefield, areas: readonly Area[], squad: readonly CharacterId[]): MusterPick[] {
    return squad.map((character, i) => {
        const part = i % areas.length, place = Math.floor(i / areas.length);
        const { col, row, width, height } = areas[part];
        // How many characters this area gets: one for every round of the deal that reaches it.
        const share = Math.ceil((squad.length - part) / areas.length);
        const along = Math.floor(((place + 0.5) * Math.max(width, height)) / share);
        const square = width >= height
            ? (row + Math.floor((height - 1) / 2)) * field.width + col + along
            : (row + along) * field.width + col + Math.floor((width - 1) / 2);
        return { character, square };
    });
}

/**
 * Where a ready-made squad stands (§17.2): spread evenly along the middle row
 * of the seat's deployment zone, or across the whole zone when the row is too
 * narrow. A zone drawn as several areas — a warband closing in from every
 * edge (§30.9) — has the squad dealt round them in turn instead, each area's
 * share spread along the middle of its long side. Every square of a zone can
 * be stood on (`buildBattlefield` checks), so the picks always pass
 * `musterRefusal` — a timed-out muster runs on the server and mustn't fail.
 * It throws only for a zone with fewer squares than the squad, which is a map
 * that can't be played.
 */
export function readyMadeMuster(field: Battlefield, seat: number, squad: readonly CharacterId[]): MusterPick[] {
    const zone = (field.deployments[seat] ?? []).map(square => coordsOf(field, square));
    if (zone.length === 0) throw new Error(`${field.name} has no deployment zone for seat ${seat}`);
    const spread = (count: number) => squad.map((_, i) => Math.floor(((i + 0.5) * count) / squad.length));
    const areas = field.deploymentAreas[seat];
    if (areas.length === 1) {
        const cols = zone.map(({ col }) => col), rows = zone.map(({ row }) => row);
        const left = Math.min(...cols), width = Math.max(...cols) - left + 1;
        const row = Math.floor((Math.min(...rows) + Math.max(...rows)) / 2);
        if (squad.length <= width) return spread(width).map((col, i) => ({ character: squad[i], square: row * field.width + left + col }));
    } else {
        const dealt = dealtRound(field, areas, squad);
        // Only short of room when an area's share is longer than the area.
        if (new Set(dealt.map(pick => pick.square)).size === dealt.length) return dealt;
    }
    const squares = field.deployments[seat];
    if (squad.length > squares.length) throw new Error(`${field.name}'s deployment zone ${seat} is too small for ${squad.length} characters`);
    return spread(squares.length).map((index, i) => ({ character: squad[i], square: squares[index] }));
}
