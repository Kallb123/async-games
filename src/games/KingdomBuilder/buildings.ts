// Pure, so the settlement screen can read the same list and timings the
// server checks against without pulling Mongoose into the client bundle.

export const KINGDOM_BUILDER_PROTOTYPE_BUILDINGS = ["lumber-camp", "quarry", "mine", "barracks"] as const;
export type KingdomBuilderPrototypeBuilding = typeof KINGDOM_BUILDER_PROTOTYPE_BUILDINGS[number];
export const KINGDOM_BUILDER_PROTOTYPE_BUILD_TICKS = 2;

/** Ticks to raise a building to a level: the first costs the prototype's two, each level after it two more. */
export function buildTicksFor(targetLevel: number): number {
    return KINGDOM_BUILDER_PROTOTYPE_BUILD_TICKS * targetLevel;
}
