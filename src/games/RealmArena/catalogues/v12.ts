// Rules version 12 (realm-arena.md §39): the Swarm's new kit and the changes
// that answer it. Released (§39.9) as `CURRENT_RULESET_VERSION`: every
// battle created now is under it, so it is shipped and never edited; see ../rulesets.ts.
import type { Ability, AbilityId, Character, CharacterId, Faction, FactionId } from "../characters";
import { catalogueV11 } from "./v11";

const ABILITIES = {
    ...catalogueV11.ABILITIES,
    // §39.2: Taunt braces the allies near the Knight, as Blessing blesses them.
    taunt: { ...catalogueV11.ABILITIES.taunt, radius: 3, description: "Allies within 3 squares, itself included, gain 1 armour until their owner's next turn" },
    // §39.5: the elites' abilities. Hatch is aimed at nothing (the rules pick the square),
    // Carapace is a passive the armour on its character stands for, and Bile is Ice Ball's
    // kind of blast, in sight within 10.
    hatch: { name: "Hatch", ap: 2, cooldown: 2, hatches: "skitterling", cap: 3, description: "A Skitterling stands on a free square next to it, nearest an enemy in sight. It acts from its owner's next turn; at most 3 of its hatchlings stand at once" },
    carapace: { name: "Carapace", ap: 0, cooldown: 0, passive: true, description: "Passive: takes 1 less from every blow, never less than 1. Burning and poison aren't blows" },
    bile: { name: "Bile", ap: 3, cooldown: 2, range: 10, damage: 2, effect: "corroded", description: "Deal 2 and corrode every character in a 3×3 in sight within 10 squares, friend or foe. No roll" },
} satisfies Partial<Record<AbilityId, Ability>>;

const CHARACTERS = {
    ...catalogueV11.CHARACTERS,
    // §40.1: the Realm's figures pick two abilities at muster beside the one they always have. The
    // pool is the character's other abilities and its ability options (§40.2); `defaults` are
    // *Proposed*, a starting point for the balance harness (§40.5).
    manAtArms: { ...catalogueV11.CHARACTERS.manAtArms, loadout: { fixed: [], picks: 2, defaults: ["cleave", "leap"] } },
    knight: { ...catalogueV11.CHARACTERS.knight, loadout: { fixed: ["bulwark"], picks: 2, defaults: ["taunt", "shove"] } },
    archer: { ...catalogueV11.CHARACTERS.archer, loadout: { fixed: [], picks: 2, defaults: ["aimedShot", "poisonArrow"] } },
    mage: { ...catalogueV11.CHARACTERS.mage, loadout: { fixed: [], picks: 2, defaults: ["fireball", "thunder"] } },
    cleric: { ...catalogueV11.CHARACTERS.cleric, loadout: { fixed: ["heal"], picks: 2, defaults: ["raise", "blessing"] } },
    // §39.3: a Bloater downed by anything but its own Burst bursts where it falls.
    bloater: { ...catalogueV11.CHARACTERS.bloater, burstsWhenDowned: true },
    // §39.5: the Swarm's elites, the computer's alone (`FACTIONS.swarm.elites`).
    broodQueen: {
        name: "Brood Queen", plural: "Brood Queens", role: "Lays the brood where the enemy stands", movement: 4, sight: 25, hp: 20,
        weapon: { name: "Talons", kind: "melee", damage: 3 }, abilities: ["hatch"], points: 60,
    },
    carapaceBrute: {
        name: "Carapace Brute", plural: "Carapace Brutes", role: "Armoured slab; shrugs off small hits", movement: 4, hp: 22, armour: 1,
        weapon: { name: "Crushing claws", kind: "melee", damage: 5 }, abilities: ["carapace"], points: 50,
    },
    bileLobber: {
        name: "Bile Lobber", plural: "Bile Lobbers", role: "Lobs acid over the heads of its own", movement: 4, hp: 12,
        weapon: { name: "Acid spit", kind: "ranged", damage: 2, accuracy: 70, range: 12, effect: "corroded" }, abilities: ["bile"], points: 40,
    },
    // §39.7: the Swarm's nest, which the warbands stand on the map's nest squares. Nothing to
    // fight with and nowhere to go: it is 10 HP to destroy, worth a 20-point knock-out.
    nest: {
        name: "Nest", plural: "Nests", role: "Where the brood spawns; destroy it to thin the next wave", movement: 0, hp: 10,
        weapon: { name: "None", kind: "melee", damage: 0 }, abilities: [], points: 20, structure: true,
    },
} satisfies Partial<Record<CharacterId, Character>>;

const FACTIONS = {
    ...catalogueV11.FACTIONS,
    // §39.5: elites stand beside the roster, never in it, so no muster accepts one.
    swarm: {
        ...catalogueV11.FACTIONS.swarm,
        elites: ["broodQueen", "carapaceBrute", "bileLobber"],
        // §39.7: two nests a warband stand from the first muster, beside no roster.
        nest: "nest",
        // §39.6: its four waves, landing in rounds 4, 7, 10 and 13, each bought with points.
        waves: [
            { name: "The Rush", buys: ["skitterling", "skitterling", "ravager"] },
            { name: "The Bile", elite: "bileLobber", buys: ["spitter", "bloater", "spitter"] },
            { name: "The Brutes", elite: "carapaceBrute", buys: ["ravager", "skitterling", "bloater"] },
            { name: "The Queen", elite: "broodQueen", buys: ["ravager", "spitter", "skitterling", "bloater"] },
        ],
    },
} satisfies Partial<Record<FactionId, Faction>>;

// §39.4: the rally is each player's choice, not a heal the wave hands out.
// §39.6: a themed wave's budget grows 25 points a wave, and a wave never takes a warband past 12.
// §39.7: each nest destroyed since a warband's last wave takes 15 points off the next one's budget.
const RULES = { ...catalogueV11.RULES, RALLY_CHOICE: true, WAVE_GROWTH_POINTS: 25, WAVE_CAP: 12, NEST_POINTS: 15 };

export const catalogueV12 = {
    ...catalogueV11,
    RULES,
    CHARACTERS,
    ABILITIES,
    FACTIONS,
};
