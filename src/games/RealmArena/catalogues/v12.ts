// Rules version 12 (realm-arena.md §39): the Swarm's new kit and the changes
// that answer it. NOT yet released: `CURRENT_RULESET_VERSION` stays 11, so no
// battle is created under it and each PR of §39 may still edit this file, until
// §39.9 releases it. Then it is shipped and never edited; see ../rulesets.ts.
import type { Ability, AbilityId, Character, CharacterId } from "../characters";
import { catalogueV11 } from "./v11";

const ABILITIES = {
    ...catalogueV11.ABILITIES,
    // §39.2: Taunt braces the allies near the Knight, as Blessing blesses them.
    taunt: { ...catalogueV11.ABILITIES.taunt, radius: 3, description: "Allies within 3 squares, itself included, gain 1 armour until their owner's next turn" },
} satisfies Partial<Record<AbilityId, Ability>>;

const CHARACTERS = {
    ...catalogueV11.CHARACTERS,
    // §39.3: a Bloater downed by anything but its own Burst bursts where it falls.
    bloater: { ...catalogueV11.CHARACTERS.bloater, burstsWhenDowned: true },
} satisfies Partial<Record<CharacterId, Character>>;

// §39.4: the rally is each player's choice, not a heal the wave hands out.
const RULES = { ...catalogueV11.RULES, RALLY_CHOICE: true };

export const catalogueV12 = {
    ...catalogueV11,
    RULES,
    CHARACTERS,
    ABILITIES,
};
