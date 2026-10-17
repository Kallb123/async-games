import { rulesetOf, type RulesContext } from "./rulesets";
// Realm Arena's characters and items as stat sheets (docs/games/realm-arena.md
// §13.6, §21.2, §23.2): the numbers the muster's info card and the admin
// balance screen print, every one read from characters.ts and the rules'
// constants rather than restated, so tuning a number there retunes both.
// What the data can't say — that a Cleave swings the character's own weapon,
// that a Raise reaches only the square next door — is the rules' code, and
// `ABILITY_USE` writes it down once here.

import { DEFAULT_CLIMB } from "@/utils/games/battlefield/pathfinding";
import { FULL_HEIGHT } from "@/utils/games/battlefield/terrain";
import { pluralize } from "@/utils/ui/text";
import { kitOf, ITEM_IDS, STRIKING_ABILITIES, type Ability, type AbilityId, type Affliction, type CharacterId, type Item, type ItemId, type OptionId, type Weapon } from "./characters";
import { CHARACTER_IDS, optionsFor } from "./roster";
import { ACTION_POINTS, ARMOUR, ATTACK_AP, isBalanced, FLANK_BONUS, GRAZE_BAND, FAR_SHOT_DISTANCE, MELEE_ACCURACY, ROLL_SIDES, sightOf, TEAM_HP_FACTOR } from "./rules";

/** One thing a character can do, or an item it can use, as a row of the stats table. */
export interface ActionStats {
    /** Unique within one unit's rows. */
    key: string;
    name: string;
    /** What it is: "Weapon", "Ability", "Thrown", "Item", or the option it is ("Rank 1 · in place of Cleave"). */
    kind: string;
    ap: string;
    damage: string;
    range: string;
    hit: string;
    cooldown: string;
    /** What else it does: its area, what it leaves, what it heals. */
    extras: string[];
    description?: string;
}

/** A character's or an item's headline numbers, as `Stat` tiles. */
export interface StatTile {
    label: string;
    value: string;
}

/** Everything the info card shows about one character or item. */
export interface UnitStats {
    name: string;
    /** A character's role, or an item's description. */
    summary: string;
    tiles: StatTile[];
    actions: ActionStats[];
    /** The options mastery can swap in (§23.2): none for an item. */
    options: ActionStats[];
}

/** A character or an item, as the muster lists them. */
export type UnitRef = { kind: "character"; id: CharacterId } | { kind: "item"; id: ItemId };

/**
 * How an ability reaches, which the rules spell out in code: off the
 * character's weapon, swung or shot at its odds and for its damage
 * (`weapon`); on the square next door (`next`); on the character itself
 * (`self`); at a square up to its `range` away (`aimed`); or as a way of
 * moving (`move`). `note` is who it lands on, where that's more than one.
 */
interface AbilityUse {
    reach: "weapon" | "next" | "self" | "aimed" | "move";
    note?: string;
}

/** Who something landing on the 3×3 round a square hits: a fireball, a thunder flask. A smoke pot's cloud hurts nobody, so it's only the 3×3. */
const AREA = "3×3, friend or foe";

const ABILITY_USE: Readonly<Record<AbilityId, AbilityUse>> = {
    cleave: { reach: "weapon", note: "Two enemies next to it" },
    shieldWall: { reach: "self", note: "Allies next to it with no cover count as in half cover, until its next turn" },
    aimedShot: { reach: "weapon" },
    sneak: { reach: "move" },
    fireball: { reach: "aimed", note: AREA },
    dynamite: { reach: "aimed", note: AREA },
    heal: { reach: "aimed" },
    raise: { reach: "next" },
    shieldBash: { reach: "next" },
    demolish: { reach: "next", note: "Everyone beside the cover but itself, friend or foe" },
    cripplingShot: { reach: "weapon" },
    huntersMark: { reach: "aimed" },
    purify: { reach: "self", note: "Itself and allies next to it" },
    rend: { reach: "next" },
    regrowth: { reach: "aimed" },
    burst: { reach: "self", note: "Everyone next to it, friend or foe; then the Bloater is down" },
};

const NONE = "—";
const ALWAYS = "Always";
const NEXT_TO = "Next to";
/** The cooldown of something used once a battle: Burst, and every item. */
const ONCE = "Once";
/** The cooldown of something used once a turn, whatever else: the Cleric's Heal. */
const PER_TURN = "1/turn";

/** What an effect does, in a line: "Burning: 1 damage a turn, 2 turns". */
function effectLine(effect: Affliction, context?: RulesContext): string {
    const { EFFECTS } = rulesetOf(context);
    const { name, count, ...rest } = EFFECTS[effect];
    const what = effect === "slowed" ? "half movement"
        : "damage" in rest ? `${rest.damage} damage a turn`
        : "ap" in rest ? `${rest.ap} AP next turn`
        : "hitBonus" in rest ? `+${rest.hitBonus}% to hit it`
        : undefined;
    return `${name}${what ? `: ${what}` : ""}, ${pluralize(count, "turn")}`;
}

/**
 * What else an ability or an item does: `lead` (who it lands on), then what
 * it heals, the effect it leaves — "On a hit" for a shot's, which a miss
 * doesn't leave — and the cover it blasts, then `tail`.
 */
function extrasOf(context: RulesContext | undefined, thing: Pick<Ability, "hp" | "effect" | "blasts">, onAHit: boolean, lead: string | undefined, ...tail: (string | undefined)[]): string[] {
    return [
        lead,
        thing.hp !== undefined ? `Heals ${thing.hp} HP` : undefined,
        thing.effect ? `${onAHit ? "On a hit: " : ""}${effectLine(thing.effect, context)}` : undefined,
        thing.blasts ? "Blasts away low cover" : undefined,
        ...tail,
    ].filter((line): line is string => line !== undefined);
}

/** A weapon's reach and odds: "Next to" and the melee 80% for a melee one, its range and accuracy for a ranged one. */
function weaponReach(weapon: Weapon, hitBonus = 0, context?: RulesContext): Pick<ActionStats, "range" | "hit"> {
    return weapon.kind === "melee"
        ? { range: NEXT_TO, hit: `${context && !isBalanced(context.rulesVersion) ? 100 : MELEE_ACCURACY}%` }
        : { range: `${weapon.range}`, hit: `${Math.min(ROLL_SIDES, weapon.accuracy + hitBonus)}%` };
}

function weaponStats(weapon: Weapon, kind: string, key: string, context?: RulesContext): ActionStats {
    const extras = weapon.kind === "ranged" ? extrasOf(context, weapon, true, undefined) : [];
    return { key, name: weapon.name, kind, ap: `${ATTACK_AP}`, damage: `${weapon.damage}`, ...weaponReach(weapon, 0, context), cooldown: NONE, extras };
}

function abilityStats(id: AbilityId, weapon: Weapon, kind: string, key: string = id, context?: RulesContext): ActionStats {
    const { ABILITIES } = rulesetOf(context);
    const ability: Ability = ABILITIES[id];
    const { reach, note } = ABILITY_USE[id];
    const strikes = reach === "weapon";
    const range = strikes ? weaponReach(weapon, 0, context).range
        : reach === "next" ? NEXT_TO
        : reach === "aimed" ? `${ability.range}`
        : reach === "move" ? "A move"
        : "Self";
    // A strike or a shot is at the weapon's odds; anything else that lands on
    // someone — a fireball, a mark — never rolls.
    const hit = strikes || STRIKING_ABILITIES.has(id) ? weaponReach(weapon, ability.hitBonus, context).hit
        : ability.damage !== undefined || ability.effect ? ALWAYS : NONE;
    return {
        key, name: ability.name, kind, ap: `${ability.ap}`,
        damage: `${ability.damage ?? (strikes ? weapon.damage : NONE)}`,
        range, hit,
        cooldown: ability.oncePerBattle ? ONCE : ability.oncePerTurn ? PER_TURN : ability.cooldown > 0 ? `${ability.cooldown}` : NONE,
        extras: extrasOf(context, ability, strikes && weapon.kind === "ranged", note,
            reach === "move" ? `${ability.ap} AP for each AP a move would cost` : undefined),
        description: ability.description,
    };
}

function optionStats(id: OptionId, context?: RulesContext): ActionStats {
    const { OPTIONS, CHARACTERS, ABILITIES } = rulesetOf(context);
    const option = OPTIONS[id];
    const { character, rank, replaces } = option;
    const replaced = replaces === "weapon" ? CHARACTERS[character].weapon.name : ABILITIES[replaces].name;
    const kind = `Rank ${rank} · in place of ${replaced}`;
    return "weapon" in option
        ? weaponStats(option.weapon, kind, id, context)
        : abilityStats(option.ability, CHARACTERS[character].weapon, kind, id, context);
}

/** A character's sheet: HP, movement, sight and cost, then its weapon, its abilities and its options. */
export function characterStats(id: CharacterId, context?: RulesContext): UnitStats {
    const { CHARACTERS } = rulesetOf(context);
    const character = CHARACTERS[id];
    const { weapon } = kitOf(id, undefined, context);
    const climb = character.climb ?? DEFAULT_CLIMB;
    return {
        name: character.name,
        summary: character.role,
        tiles: [
            { label: "HP", value: `${character.hp}` },
            { label: "Move/AP", value: `${character.movement}` },
            { label: "Sight", value: `${sightOf({ character: id }, context)}` },
            { label: "Points", value: `${character.points}` },
            ...(climb !== DEFAULT_CLIMB ? [{ label: "Climb", value: climb >= FULL_HEIGHT ? "Full height" : `${climb}/${FULL_HEIGHT}` }] : []),
        ],
        actions: [
            weaponStats(weapon, "Weapon", "weapon", context),
            ...character.abilities.map(ability => abilityStats(ability, weapon, "Ability", ability, context)),
        ],
        options: optionsFor(id, context).map(option => optionStats(option, context)),
    };
}

/** An item's sheet: its cost and AP, then what using it does — once, and never at a roll. */
export function itemStats(id: ItemId, context?: RulesContext): UnitStats {
    const { ITEMS } = rulesetOf(context);
    const item: Item = ITEMS[id];
    const thrown = item.range !== undefined;
    return {
        name: item.name,
        summary: "Carried into battle by one character, and used once.",
        tiles: [
            { label: "Points", value: `${item.points}` },
            { label: "AP", value: `${item.ap}` },
        ],
        actions: [{
            key: id, name: item.name, kind: thrown ? "Thrown" : "Item",
            ap: `${item.ap}`,
            damage: `${item.damage ?? NONE}`,
            range: thrown ? `${item.range}` : NEXT_TO,
            hit: item.damage !== undefined || item.effect ? ALWAYS : NONE,
            cooldown: ONCE,
            extras: extrasOf(context, item, false, item.area ? (item.damage !== undefined || item.effect ? AREA : "3×3") : thrown ? "One square" : "The carrier or an ally next to them",
                item.hitPenalty !== undefined ? `−${item.hitPenalty}% to hit anyone in it, and no overwatch into it, until the thrower's next turn` : undefined),
            description: item.description,
        }],
        options: [],
    };
}

export function unitStats(unit: UnitRef, context?: RulesContext): UnitStats {
    return unit.kind === "character" ? characterStats(unit.id, context) : itemStats(unit.id, context);
}

/** Every character's and every item's sheet, in the muster's order: the admin balance screen's. */
export const ALL_UNITS: readonly UnitRef[] = [
    ...CHARACTER_IDS.map(id => ({ kind: "character" as const, id })),
    ...ITEM_IDS.map(id => ({ kind: "item" as const, id })),
];

/** The fine print under a stats table: what the hit chances leave out, and what every shot shares. */
export function statsFootnote(context?: RulesContext): string {
    const balanced = context === undefined || isBalanced(context.rulesVersion);
    return `Each character has ${ACTION_POINTS} AP a turn. Hit chances are before cover, height, marks and smoke. `
        + `A shot that misses by ${GRAZE_BAND}% or less grazes for half damage, and one at a target with no cover does ${FLANK_BONUS} more. `
        + (balanced ? `A shot from further than ${FAR_SHOT_DISTANCE} squares counts the target's cover double (hunkering down doubles it too, but never twice over). A strike next to the target hits ${MELEE_ACCURACY}% of the time, with no graze. `
            + `In Hold Out, the team's characters have ${Math.round((TEAM_HP_FACTOR - 1) * 100)}% more HP than the table says, and against ${rulesetOf(context).FACTIONS.realm.enemyName} every hit on them does ${ARMOUR} less (never under 1), except on a Miner. `
            : "A strike next to the target always hits. ")
        + "Range is in squares. CD is the cooldown: used on one of the character's turns, it can be used again that many of its turns later. Once means once a battle, and 1/turn once a turn.";
}

export const STATS_FOOTNOTE = statsFootnote();
