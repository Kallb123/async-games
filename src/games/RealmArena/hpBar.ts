// Whether a fighter gets an HP bar over its figure (docs/games/realm-arena-hold-out.md §4.3).
// A minion has one HP and falls to any damage, so a bar over it says nothing:
// neither board draws one. Read through the battle's own catalogue, so the
// same character is a minion on one rules version and not on another. Pure, so
// the isometric board and the 3D one share the answer.

import { isMinion, type Fighter } from "./rules";
import type { RulesContext } from "./rulesets";

/** True for a fighter whose figure carries an HP bar: everyone but a minion. */
export const hasHpBar = (fighter: Pick<Fighter, "character">, context?: RulesContext): boolean => !isMinion(fighter, context);
