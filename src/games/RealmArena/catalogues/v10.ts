// Released catalogue for rules version 10: sight with angles (realm-arena.md
// §36). Never edit shipped definitions; see ../rulesets.ts.
import { catalogueV9 } from "./v9";

export const catalogueV10 = {
    ...catalogueV9,
    RULES: { ...catalogueV9.RULES, ANGLED_SIGHT: true },
};
