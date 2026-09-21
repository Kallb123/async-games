/**
 * Kingdom Builder's prototype advances on its world tick rather than through
 * the shared turn-command engine. This module is still the rules-layer entry
 * point exported by GameLogic, so later milestones can add commands without
 * introducing a second registration path.
 */
export const KINGDOM_BUILDER_GAME_TYPE = "KingdomBuilder";
