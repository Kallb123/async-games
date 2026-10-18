// Realm troop overhaul (§34). V7 and v8 remain immutable for live games and replays.
import { FULL_HEIGHT } from "@/utils/games/battlefield/terrain";
import type { Ability, AbilityId, Character, CharacterId, Effect, EffectId, Faction } from "../characters";
import { catalogueV7 } from "./v7";
import { catalogueV8 } from "./v8";

const ABILITIES = {
    ...catalogueV8.ABILITIES,
    cleave: { ...catalogueV8.ABILITIES.cleave, countsAsAttack: false },
    aimedShot: { ...catalogueV8.ABILITIES.aimedShot, countsAsAttack: false },
    fireball: { ...catalogueV8.ABILITIES.fireball, countsAsAttack: false },
    shieldBash: { ...catalogueV8.ABILITIES.shieldBash, countsAsAttack: false },
    demolish: { ...catalogueV8.ABILITIES.demolish, countsAsAttack: false },
    cripplingShot: { ...catalogueV8.ABILITIES.cripplingShot, countsAsAttack: false },
    rend: { ...catalogueV8.ABILITIES.rend, countsAsAttack: false },
    burst: { ...catalogueV8.ABILITIES.burst, countsAsAttack: false },
    dynamite: { ...catalogueV8.ABILITIES.dynamite, countsAsAttack: false },
    shieldWall: catalogueV7.ABILITIES.shieldWall,
    runeRaise: { ...catalogueV7.ABILITIES.raise, name: "Raise" },
    leap: { name: "Leap", ap: 3, cooldown: 2, range: 4, maxRise: FULL_HEIGHT, damage: 2, movesWithoutReactions: true, description: "Jump to a clear square in sight within 4 squares, at most one height up. Deal 2 to every enemy next to the landing; nobody reacts" },
    slashAndDash: { name: "Slash and Dash", ap: 0, cooldown: 3, bonusAp: 2, description: "Gain 2 AP this turn. At most two weapon attacks a turn; bank at most 4 AP" },
    bulwark: { name: "Bulwark", ap: 0, cooldown: 0, passive: true, cover: "half", coverFor: "everyone", description: "Passive: any character next to them, friend or foe, counts as in half cover" },
    taunt: { name: "Taunt", ap: 1, cooldown: 2, effect: "braced", description: "Every standing ally, itself included, gains 1 armour until its owner's next turn" },
    shove: { name: "Shove", ap: 2, cooldown: 2, damage: 2, push: 2, collisionDamage: 1, movesWithoutReactions: true, description: "Strike for 2 and push the enemy up to 2 squares away. A collision deals 1 to it and any character it hits" },
    poisonArrow: { name: "Poison Arrow", ap: 3, cooldown: 2, damage: 3, effect: "poisoned", description: "A shot for 3; a hit poisons for 1 damage on each of its next two turns. Healing clears poison" },
    bouncingArrow: { name: "Bouncing Arrow", ap: 3, cooldown: 3, damage: 3, bounceRange: 4, bounceDamage: 2, description: "A shot for 3. A hit bounces to a random other enemy within 4 squares for 2, without sight or a roll" },
    splittingArrow: { name: "Splitting Arrow", ap: 3, cooldown: 3, damage: 2, description: "Shoot two different enemies in bow range, rolling each shot for 2" },
    shootDodge: { name: "Shoot + Dodge", ap: 3, cooldown: 2, damage: 3, dodge: 3, movesWithoutReactions: true, description: "Shoot for 3, then dodge up to 3 movement points, hit or miss. Nobody reacts; staying put is allowed" },
    iceBall: { name: "Ice Ball", ap: 3, cooldown: 3, range: 12, damage: 1, effect: "slowed", description: "Deal 1 and slow every character in a 3×3 in sight within 12 squares, friend or foe. No roll" },
    thunder: { name: "Thunder", ap: 3, cooldown: 3, damage: 2, effect: "stunned", description: "A shot at Mage Bolt's odds for 2; a hit stuns, losing banked AP and starting its next turn with 2 AP" },
    focus: { name: "Focus", ap: 2, cooldown: 3, effect: "focused", description: "Add 1 to every hit of its abilities until the end of its next turn, including friendly fire; Mage Bolt is unchanged" },
    beckon: { name: "Beckon", ap: 2, cooldown: 2, range: 8, pull: 4, movesWithoutReactions: true, description: "Pull another ally in sight within 8 squares up to 4 squares along the cheapest path towards the Cleric. Nobody reacts" },
    blessing: { name: "Blessing", ap: 2, cooldown: 3, radius: 3, effect: "blessed", description: "Allies within 3 squares, itself included, deal 1 extra per hit until the end of their owner's next turn" },
    ward: { name: "Ward", ap: 2, cooldown: 4, range: 6, effect: "warded", description: "Itself or an ally in sight within 6 squares gains full cover from every side until the start of its owner's turn after next" },
    heal: { ...catalogueV8.ABILITIES.heal, description: "Restore 4 HP to itself or an ally in sight within 12 squares; clear burning, poison, slowed, stunned and corroded. Once a turn" },
} satisfies Partial<Record<AbilityId, Ability>>;

const CHARACTERS = {
    ...catalogueV8.CHARACTERS,
    manAtArms: { ...catalogueV8.CHARACTERS.manAtArms, abilities: ["cleave", "leap", "slashAndDash"] },
    knight: { ...catalogueV8.CHARACTERS.knight, abilities: ["bulwark", "taunt", "shove"] },
    archer: { ...catalogueV8.CHARACTERS.archer, abilities: ["aimedShot", "poisonArrow", "bouncingArrow", "splittingArrow", "shootDodge"] },
    mage: { ...catalogueV8.CHARACTERS.mage, abilities: ["fireball", "iceBall", "thunder", "focus"] },
    cleric: { ...catalogueV8.CHARACTERS.cleric, abilities: ["heal", "raise", "beckon", "blessing", "ward"] },
    runepriest: { ...catalogueV8.CHARACTERS.runepriest, abilities: ["heal", "runeRaise"] },
} satisfies Partial<Record<CharacterId, Character>>;

const EFFECTS = {
    ...catalogueV8.EFFECTS,
    poisoned: { name: "Poisoned", state: "poisoned", count: 2, damage: 1, healed: true },
    braced: { beneficial: true, name: "Braced", state: "braced", count: 1, armour: 1 },
    blessed: { beneficial: true, name: "Blessed", state: "blessed", count: 2, decayAt: "end", damageBonus: 1 },
    focused: { beneficial: true, name: "Focused", state: "focused", count: 2, decayAt: "end", abilityDamageBonus: 1 },
    warded: { beneficial: true, name: "Warded", state: "warded", count: 2, cover: "full" },
} satisfies Partial<Record<EffectId, Effect>>;

const realm: Faction = {
    ...catalogueV8.FACTIONS.realm,
    characters: catalogueV8.FACTIONS.realm.characters.filter(id => id !== "scout"),
    readyMade: Object.fromEntries(Object.entries(catalogueV8.FACTIONS.realm.readyMade).map(([budget, squad]) => [budget, squad.map(id => id === "scout" ? "archer" : id)])) as unknown as Faction["readyMade"],
};

export const catalogueV9 = {
    ...catalogueV8,
    RULES: { ...catalogueV8.RULES, MAX_ATTACKS_PER_TURN: 2, BANK_CAP: 4 },
    CHARACTERS, ABILITIES, EFFECTS,
    OPTIONS: { ...catalogueV8.OPTIONS, demolish: { ...catalogueV8.OPTIONS.demolish, replaces: "shove" as const } },
    FACTIONS: { ...catalogueV8.FACTIONS, realm },
};
