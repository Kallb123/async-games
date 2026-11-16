// Rules version 12 (realm-arena.md §39): the Swarm's new kit and the changes
// that answer it. NOT yet released: `CURRENT_RULESET_VERSION` stays 11, so no
// battle is created under it and each PR of §39 may still edit this file, until
// §39.9 releases it. Then it is shipped and never edited; see ../rulesets.ts.
import type { Ability, AbilityId } from "../characters";
import { catalogueV11 } from "./v11";

const ABILITIES = {
    ...catalogueV11.ABILITIES,
    // §39.2: Taunt braces the allies near the Knight, as Blessing blesses them.
    taunt: { ...catalogueV11.ABILITIES.taunt, radius: 3, description: "Allies within 3 squares, itself included, gain 1 armour until their owner's next turn" },
} satisfies Partial<Record<AbilityId, Ability>>;

export const catalogueV12 = {
    ...catalogueV11,
    ABILITIES,
};
