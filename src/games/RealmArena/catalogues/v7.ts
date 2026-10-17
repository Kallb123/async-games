// Released catalogue through rules version 7. Never edit shipped definitions.
// New releases derive a new catalogue from this one; see ../rulesets.ts.
import { FULL_HEIGHT } from "@/utils/games/battlefield/terrain";
import type { Ability, AbilityId, Character, CharacterId, CharacterOption, Effect, EffectId, Faction, FactionId, Item, ItemId, OptionId } from "../characters";
const THROW_RANGE = 6;

const EFFECTS = {
    burning: { name: "Burning", state: "burning", count: 2, damage: 1, healed: true },
    stunned: { name: "Stunned", state: "stunned", count: 1, ap: 2, healed: true },
    slowed: { name: "Slowed", state: "slowed", count: 2, healed: true },
    marked: { name: "Marked", state: "marked", count: 2, hitBonus: 15 },
    // The Swarm's acid, eating through armour (§31.2): easier to hit, and a heal washes it off.
    corroded: { name: "Corroded", state: "corroded", count: 2, hitBonus: 10, healed: true },
    hunkered: { name: "Hunkered down", state: "hunkered down", count: 1 },
    shieldWall: { name: "Shield wall", state: "holding a shield wall", count: 1 },
} as const satisfies Partial<Record<EffectId, Effect>>;

const ABILITIES = {
    cleave: { name: "Cleave", ap: 2, cooldown: 3, description: "Strike two enemies next to them" },
    shieldWall: { name: "Shield wall", ap: 2, cooldown: 3, description: "Allies next to them count as in half cover until its next turn" },
    aimedShot: { name: "Aimed shot", ap: 3, cooldown: 2, hitBonus: 20, description: "A shot at +20% to hit" },
    sneak: { name: "Sneak", ap: 2, cooldown: 0, description: "Move without setting off overwatch or guard" },
    fireball: { name: "Fireball", ap: 3, cooldown: 3, range: 12, damage: 3, effect: "burning", blasts: "area", description: "Hits every character in a 3×3 area, friend or foe, sets them burning, and blasts away the low cover there" },
    heal: { name: "Heal", ap: 2, cooldown: 0, oncePerTurn: true, range: 12, hp: 4, description: "Restore 4 HP to itself or an ally it can see within 12 squares, and clear burning, slowed, stunned and corroded. Once a turn" },
    raise: { name: "Raise", ap: 3, cooldown: 4, description: "Bring a downed ally next to them back at half HP" },
    shieldBash: { name: "Shield bash", ap: 2, cooldown: 3, damage: 2, effect: "stunned", description: "Strike one enemy next to them for 2, and stun it" },
    demolish: { name: "Demolish", ap: 2, cooldown: 2, damage: 2, blasts: "target", description: "Blast away one square of low cover next to them, and strike everyone else beside it for 2, friend or foe" },
    cripplingShot: { name: "Crippling shot", ap: 3, cooldown: 2, effect: "slowed", description: "A shot that slows on a hit" },
    huntersMark: { name: "Hunter's mark", ap: 1, cooldown: 2, range: 12, effect: "marked", description: "Mark an enemy it can see within 12 squares: +15% to hit it, for every attacker" },
    purify: { name: "Purify", ap: 2, cooldown: 3, hp: 2, description: "Clear burning, stunned, slowed, marked and corroded from itself and each ally next to it, and give each 2 HP" },
    rend: { name: "Rend", ap: 3, cooldown: 3, damage: 6, description: "Tear into one enemy next to them for 6" },
    regrowth: { name: "Regrowth", ap: 2, cooldown: 2, range: 8, hp: 3, description: "Restore 3 HP to itself or an ally it can see within 8 squares, and clear burning, slowed, stunned and corroded" },
    burst: { name: "Burst", ap: 1, cooldown: 0, oncePerBattle: true, damage: 3, effect: "corroded", description: "Burst, splashing acid on everyone next to it for 3, friend or foe, and corroding them. The Bloater is downed" },
    dynamite: { name: "Dynamite", ap: 3, cooldown: 3, range: 8, damage: 4, blasts: "area", description: "Thrown at a 3×3 area within 8 squares: 4 damage to every character in it, friend or foe, and it blasts away the low cover there" },
} as const satisfies Partial<Record<AbilityId, Ability>>;

const CHARACTERS = {
    manAtArms: {
        name: "Man-at-arms", plural: "Men-at-arms", role: "Cheap front line", movement: 6, hp: 8,
        weapon: { name: "Sword", kind: "melee", damage: 4 }, abilities: ["cleave"], points: 15,
    },
    knight: {
        name: "Knight", plural: "Knights", role: "Slow and very tough", movement: 4, sight: 15, hp: 12,
        weapon: { name: "Mace", kind: "melee", damage: 4 }, abilities: ["shieldWall"], points: 25,
    },
    archer: {
        name: "Archer", plural: "Archers", role: "Long range; the overwatch specialist", movement: 6, sight: 25, hp: 6,
        weapon: { name: "Bow", kind: "ranged", damage: 3, accuracy: 80, range: 20 }, abilities: ["aimedShot"], points: 20,
    },
    scout: {
        name: "Scout", plural: "Scouts", role: "Fastest and fragile; the flanker", movement: 8, climb: FULL_HEIGHT, sight: 25, hp: 6,
        weapon: { name: "Knives", kind: "melee", damage: 3 }, abilities: ["sneak"], points: 20,
    },
    mage: {
        name: "Mage", plural: "Mages", role: "Fragile; hits an area", movement: 6, hp: 5,
        weapon: { name: "Mage Bolt", kind: "ranged", damage: 3, accuracy: 80, range: 12 }, abilities: ["fireball"], points: 30,
    },
    cleric: {
        name: "Cleric", plural: "Clerics", role: "Support", movement: 6, hp: 7,
        weapon: { name: "Staff", kind: "melee", damage: 2 }, abilities: ["heal", "raise"], points: 25,
    },
    // The Swarm (§31): cheaper and weaker, one for one, than the Realm's.
    skitterling: {
        name: "Skitterling", plural: "Skitterlings", role: "Fast and frail; strikes in numbers", movement: 8, climb: FULL_HEIGHT, hp: 4,
        weapon: { name: "Claws", kind: "melee", damage: 2 }, abilities: [], points: 10,
    },
    ravager: {
        name: "Ravager", plural: "Ravagers", role: "Bulky brawler; hits hard", movement: 5, hp: 9,
        weapon: { name: "Scything talons", kind: "melee", damage: 4 }, abilities: ["rend"], points: 20,
    },
    spitter: {
        name: "Spitter", plural: "Spitters", role: "Spits acid from its raised tail", movement: 5, hp: 5,
        weapon: { name: "Acid spit", kind: "ranged", damage: 2, accuracy: 70, range: 12, effect: "corroded" }, abilities: [], points: 15,
    },
    bloater: {
        name: "Bloater", plural: "Bloaters", role: "Slow sac of acid; bursts among the enemy", movement: 4, hp: 6,
        weapon: { name: "Barbs", kind: "melee", damage: 1 }, abilities: ["burst"], points: 10,
    },
    broodmother: {
        name: "Broodmother", plural: "Broodmothers", role: "Leads the brood; mends it", movement: 5, sight: 25, hp: 8,
        weapon: { name: "Talons", kind: "melee", damage: 3 }, abilities: ["regrowth"], points: 20,
    },
    // The Miners (§33): each one tougher than the Realm's character it
    // stands in for, hitting as hard and no harder, and dearer for its HP.
    miner: {
        name: "Miner", plural: "Miners", role: "Sturdy front line; digs through cover", movement: 5, hp: 11,
        weapon: { name: "Pickaxe", kind: "melee", damage: 4 }, abilities: ["demolish"], points: 20,
    },
    stonewarden: {
        name: "Stonewarden", plural: "Stonewardens", role: "Slow and very tough; holds the line", movement: 4, sight: 15, hp: 15,
        weapon: { name: "War pick", kind: "melee", damage: 4 }, abilities: ["shieldWall"], points: 30,
    },
    prospector: {
        name: "Prospector", plural: "Prospectors", role: "Crossbow; steady at range", movement: 5, sight: 25, hp: 10,
        weapon: { name: "Crossbow", kind: "ranged", damage: 3, accuracy: 80, range: 16 }, abilities: ["aimedShot"], points: 30,
    },
    sapper: {
        name: "Sapper", plural: "Sappers", role: "Lights dynamite; blasts an area", movement: 5, hp: 9,
        weapon: { name: "Throwing picks", kind: "ranged", damage: 3, accuracy: 70, range: 8 }, abilities: ["dynamite"], points: 40,
    },
    runepriest: {
        name: "Runepriest", plural: "Runepriests", role: "Support; tough enough for the front", movement: 5, hp: 10,
        weapon: { name: "Rune hammer", kind: "melee", damage: 2 }, abilities: ["heal", "raise"], points: 30,
    },
} satisfies Partial<Record<CharacterId, Character>>;

const OPTIONS = {
    shieldBash: { character: "manAtArms", rank: 1, replaces: "cleave", ability: "shieldBash" },
    demolish: { character: "knight", rank: 1, replaces: "shieldWall", ability: "demolish" },
    cripplingShot: { character: "archer", rank: 1, replaces: "aimedShot", ability: "cripplingShot" },
    huntersMark: { character: "scout", rank: 1, replaces: "sneak", ability: "huntersMark" },
    frostBolt: { character: "mage", rank: 1, replaces: "weapon", weapon: { name: "Frost bolt", kind: "ranged", damage: 2, accuracy: 70, range: 10, effect: "slowed" } },
    purify: { character: "cleric", rank: 1, replaces: "raise", ability: "purify" },
} as const satisfies Partial<Record<OptionId, CharacterOption>>;

const ITEMS = {
    fireFlask: { name: "Fire flask", points: 5, ap: 2, range: THROW_RANGE, damage: 2, effect: "burning", blasts: "area", description: "Thrown at one square: 2 damage to whoever is there, sets them burning, and blasts away the low cover on and next to it" },
    thunderFlask: { name: "Thunder flask", points: 5, ap: 2, range: THROW_RANGE, area: true, effect: "stunned", description: "Thrown at a 3×3 area: stuns everyone in it, friend or foe" },
    smokePot: { name: "Smoke pot", points: 5, ap: 1, range: THROW_RANGE, area: true, hitPenalty: 20, description: "Thrown at a 3×3 area: until the thrower's next turn, −20% to hit anyone in it, and no overwatch at anyone stepping into it" },
    healingDraught: { name: "Healing draught", points: 5, ap: 1, hp: 3, description: "Restore 3 HP to the carrier or an ally next to them, and clear burning, slowed, stunned and corroded" },
} as const satisfies Partial<Record<ItemId, Item>>;

const FACTIONS = {
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
    // Dwarves out of the deep mines (§33): fewer of them, each tougher than
    // the Realm's and dearer for it, with pickaxes and dynamite.
    miners: {
        name: "The Miners",
        characters: ["miner", "stonewarden", "prospector", "sapper", "runepriest"],
        readyMade: {
            50: ["miner", "prospector"],
            60: ["stonewarden", "prospector"],
            70: ["miner", "miner", "prospector"],
            80: ["stonewarden", "miner", "prospector"],
            90: ["stonewarden", "miner", "sapper"],
            100: ["stonewarden", "miner", "miner", "prospector"],
            110: ["stonewarden", "miner", "prospector", "runepriest"],
            120: ["stonewarden", "miner", "prospector", "sapper"],
        },
        enemyName: "the Miners",
    },
} satisfies Partial<Record<FactionId, Faction>>;

export const catalogueV7 = { CHARACTERS, ABILITIES, OPTIONS, ITEMS, EFFECTS, FACTIONS };
