// Released catalogue for rules version 8. Never edit shipped definitions.
// New releases derive a new catalogue from this one; see ../rulesets.ts.
import { catalogueV7 } from "./v7";

const ABILITIES = {
    ...catalogueV7.ABILITIES,
    // Always on rather than raised: whoever stands next to the Knight or
    // Stonewarden, friend or foe, counts as in half cover. Its stance is never
    // taken, since a passive can't be used.
    shieldWall: { ...catalogueV7.ABILITIES.shieldWall, ap: 0, cooldown: 0, passive: true, coverFor: "everyone", description: "Passive: any character next to them, friend or foe, counts as in half cover" },
    // Raised on its owner's own turn, a character has AP to spend at once.
    raise: { ...catalogueV7.ABILITIES.raise, apOnRaise: 2, description: "Bring a downed ally next to them back at half HP, with 2 AP to spend if it is their owner's turn" },
} as const;

export const catalogueV8 = { ...catalogueV7, ABILITIES };
