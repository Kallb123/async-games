// Rules version 12 (realm-arena.md §39): the Swarm's new kit and the changes
// that answer it. NOT yet released: `CURRENT_RULESET_VERSION` stays 11, so no
// battle is created under it and each PR of §39 may still edit this file, until
// §39.9 releases it. Then it is shipped and never edited; see ../rulesets.ts.
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
} satisfies Partial<Record<CharacterId, Character>>;

const FACTIONS = {
    ...catalogueV11.FACTIONS,
    // §39.5: elites stand beside the roster, never in it, so no muster accepts one.
    swarm: { ...catalogueV11.FACTIONS.swarm, elites: ["broodQueen", "carapaceBrute", "bileLobber"] },
} satisfies Partial<Record<FactionId, Faction>>;

// §39.4: the rally is each player's choice, not a heal the wave hands out.
const RULES = { ...catalogueV11.RULES, RALLY_CHOICE: true };

export const catalogueV12 = {
    ...catalogueV11,
    RULES,
    CHARACTERS,
    ABILITIES,
    FACTIONS,
};
