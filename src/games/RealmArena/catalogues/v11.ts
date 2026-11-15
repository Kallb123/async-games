// Released catalogue for rules version 11: every Archer shot costs 2 AP
// (realm-arena.md §38). Never edit shipped definitions; see ../rulesets.ts.
import type { Ability, AbilityId } from "../characters";
import { catalogueV10 } from "./v10";

const ABILITIES = {
    ...catalogueV10.ABILITIES,
    // The Archer's shots, and Crippling shot, its mastery swap for Aimed shot.
    // Cooldowns are unchanged: they set how often each is used.
    aimedShot: { ...catalogueV10.ABILITIES.aimedShot, ap: 2 },
    cripplingShot: { ...catalogueV10.ABILITIES.cripplingShot, ap: 2 },
    poisonArrow: { ...catalogueV10.ABILITIES.poisonArrow, ap: 2 },
    bouncingArrow: { ...catalogueV10.ABILITIES.bouncingArrow, ap: 2 },
    splittingArrow: { ...catalogueV10.ABILITIES.splittingArrow, ap: 2 },
    shootDodge: { ...catalogueV10.ABILITIES.shootDodge, ap: 2 },
} satisfies Partial<Record<AbilityId, Ability>>;

export const catalogueV11 = {
    ...catalogueV10,
    ABILITIES,
};
